const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function quietConsole() {
  return {
    log() {},
    warn() {},
    error() {},
  };
}

function loadArchieCore({ surfacedIds = new Set() } = {}) {
  const sourcePath = path.resolve(__dirname, "..", "js", "core", "archie-core.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const markedIds = [];
  const context = vm.createContext({
    console: quietConsole(),
    hasSurfacedSessionSignal(type, signalId) {
      return surfacedIds.has(`${type}:${signalId}`);
    },
    markSessionSignalSurfaced(type, signalId) {
      if (
        type !== "learning" &&
        type !== "coaching" &&
        type !== "repeatedCoaching" &&
        type !== "behavioralEvidence"
      ) {
        return false;
      }
      surfacedIds.add(`${type}:${signalId}`);
      markedIds.push(signalId);
      return true;
    },
  });

  vm.runInContext(
    `${source}\n;globalThis.__archieCoreTestApi = ArchieCore;`,
    context,
    { filename: sourcePath },
  );

  return { core: context.__archieCoreTestApi, markedIds, surfacedIds };
}

function configureLearningFlow(core, {
  signalId = "learning_signal_a",
  receiptResult = true,
  legacySend = false,
} = {}) {
  let appendCount = 0;
  let receiptCalls = 0;
  let sendCalls = 0;
  const baseBriefing = { text: "Base briefing" };

  core.systems = {
    memory: {
      getArtifact() {
        return { reports: [{ id: "report_1" }] };
      },
    },
    missionIntelligence: {
      identifyLearningSignal() {
        return { signalId, text: "Learning insight" };
      },
    },
    briefing: {
      appendLearningSignal(briefing) {
        appendCount += 1;
        return { ...briefing, text: `${briefing.text}\nLearning insight` };
      },
    },
    communication: legacySend
      ? {
          send() {
            sendCalls += 1;
            return true;
          },
        }
      : {
          send() {
            sendCalls += 1;
            return true;
          },
          async sendWithReceipt() {
            receiptCalls += 1;
            return receiptResult;
          },
        },
  };
  core.pendingBriefing = baseBriefing;
  core.session.briefing = baseBriefing;

  return {
    baseBriefing,
    get appendCount() {
      return appendCount;
    },
    get receiptCalls() {
      return receiptCalls;
    },
    get sendCalls() {
      return sendCalls;
    },
  };
}

function configureActiveSignalFlow(core, {
  learningSignalId = "learning_signal_a",
  coachingSignalId = "coaching_strength_report_1_interaction_1_discovery",
  includeLearning = true,
  includeCoaching = true,
  includeRepeatedCoaching = false,
  repeatedOccurrenceSignalIds = [coachingSignalId],
  receiptResult = true,
} = {}) {
  let learningAppendCount = 0;
  let coachingAppendCount = 0;
  let repeatedCoachingAppendCount = 0;
  let receiptCalls = 0;
  const baseBriefing = { text: "Base briefing" };
  const coachingInsight =
    'User self-identified "Discovery" as a strength during this customer interaction.';
  const coachingFollowUpPrompt =
    "What happened in that interaction that made this feel like a strength to you?";
  const repeatedCoachingSummaryId = "repeated_self_assessment_discovery";
  const repeatedCoachingInsight =
    'You have self-identified "Discovery" as a strength in 2 recorded interactions.';
  const repeatedCoachingFollowUpPrompt =
    "What do you notice repeating across those interactions?";

  core.systems = {
    memory: {
      getArtifact() {
        return { reports: [{ id: "report_1" }] };
      },
    },
    missionIntelligence: {
      identifyLearningSignal() {
        return includeLearning
          ? { signalId: learningSignalId, insight: "Learning insight" }
          : null;
      },
      identifyCoachingSignal(_reports, _reviews, options = {}) {
        const excluded = new Set(options.excludeSignalIds || []);
        return includeCoaching && !excluded.has(coachingSignalId)
          ? {
              signalId: coachingSignalId,
              insight: coachingInsight,
              followUpPrompt: coachingFollowUpPrompt,
              source: "coachingSignal",
            }
          : null;
      },
      identifyActiveRepeatedSelfAssessment() {
        return includeRepeatedCoaching
          ? {
              type: "repeated-self-assessment",
              evidenceTier: "E2",
              summaryId: repeatedCoachingSummaryId,
              strength: "discovery",
              occurrences: repeatedOccurrenceSignalIds.map((signalId) => ({
                signalId,
              })),
              insight: repeatedCoachingInsight,
              followUpPrompt: repeatedCoachingFollowUpPrompt,
            }
          : null;
      },
    },
    briefing: {
      appendLearningSignal(briefing, signal) {
        learningAppendCount += 1;
        return { ...briefing, text: `${briefing.text} ${signal.insight}` };
      },
      appendCoachingSignal(briefing, signal) {
        coachingAppendCount += 1;
        return {
          ...briefing,
          text: `${briefing.text} ${signal.insight} ${signal.followUpPrompt}`,
        };
      },
      appendRepeatedSelfAssessment(briefing, summary) {
        repeatedCoachingAppendCount += 1;
        return {
          ...briefing,
          text: `${briefing.text} ${summary.insight} ${summary.followUpPrompt}`,
        };
      },
    },
    communication: {
      send() {
        return true;
      },
      async sendWithReceipt() {
        receiptCalls += 1;
        return receiptResult;
      },
    },
  };
  core.pendingBriefing = baseBriefing;
  core.session.briefing = baseBriefing;

  return {
    baseBriefing,
    coachingInsight,
    coachingFollowUpPrompt,
    repeatedCoachingSummaryId,
    repeatedCoachingInsight,
    repeatedCoachingFollowUpPrompt,
    get learningAppendCount() {
      return learningAppendCount;
    },
    get coachingAppendCount() {
      return coachingAppendCount;
    },
    get repeatedCoachingAppendCount() {
      return repeatedCoachingAppendCount;
    },
    get receiptCalls() {
      return receiptCalls;
    },
  };
}

function loadBriefingSystem() {
  const sourcePath = path.resolve(
    __dirname,
    "..",
    "systems",
    "briefing.system.js",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = vm.createContext({ console: quietConsole() });

  vm.runInContext(
    `${source}\n;globalThis.__briefingTestApi = BriefingSystem;`,
    context,
    { filename: sourcePath },
  );

  return context.__briefingTestApi;
}

function loadCommunicationSystem({ target = null, Archie } = {}) {
  const sourcePath = path.resolve(
    __dirname,
    "..",
    "systems",
    "communication.system.js",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = vm.createContext({
    console: quietConsole(),
    setTimeout,
    ...(Archie ? { Archie } : {}),
  });

  vm.runInContext(
    `${source}\n;globalThis.__communicationTestApi = CommunicationSystem;`,
    context,
    { filename: sourcePath },
  );

  const communication = context.__communicationTestApi;
  communication.targets.dashboardBrief = target;
  return communication;
}

function makeArchieDelivery({ target = null, throws = false } = {}) {
  return {
    targets: {
      briefing: null,
      dashboardGreeting: null,
      dashboardBrief: target,
      heroGreeting: null,
      heroBrief: null,
      notificationMessage: null,
      statusText: null,
    },
    async deliver(transmission) {
      if (throws) {
        throw new Error("Visible delivery failed");
      }

      if (transmission.target === "dashboard" && this.targets.dashboardBrief) {
        this.targets.dashboardBrief.textContent = transmission.text;
      }
    },
  };
}

function configureRefreshSignalFlow(core, communication, {
  activeSignal = "coaching",
} = {}) {
  let learningAppendCount = 0;
  let coachingAppendCount = 0;
  let repeatedCoachingAppendCount = 0;
  let repeatedInteractionCount = 2;
  let buildCount = 0;
  const learningSignalId = "learning_runtime_signal";
  const coachingSignalId =
    "coaching_strength_runtime_report_interaction_rapport";
  const coachingInsight =
    'User self-identified "Rapport" as a strength during this customer interaction.';
  const coachingFollowUpPrompt =
    "What happened in that interaction that made this feel like a strength to you?";
  const repeatedCoachingSummaryId = "repeated_self_assessment_discovery";
  const repeatedCoachingFollowUpPrompt =
    "What do you notice repeating across those interactions?";

  core.sessionStarted = true;
  core.session.commander = {
    memory: {},
    missionObjectives: [],
  };
  core.systems = {
    decision: {
      async analyze() {
        return null;
      },
    },
    memory: {
      getArtifact() {
        return { reports: [{ id: "runtime-report" }] };
      },
    },
    missionIntelligence: {
      identifyLearningSignal() {
        return activeSignal === "learning"
          ? { signalId: learningSignalId, insight: "Learning insight" }
          : null;
      },
      identifyCoachingSignal(_reports, _reviews, options = {}) {
        const excluded = new Set(options.excludeSignalIds || []);
        return (activeSignal === "coaching" || activeSignal === "repeatedWithE1") &&
          !excluded.has(coachingSignalId)
          ? {
              signalId: coachingSignalId,
              insight: coachingInsight,
              followUpPrompt: coachingFollowUpPrompt,
              source: "coachingSignal",
            }
          : null;
      },
      identifyActiveRepeatedSelfAssessment() {
        return activeSignal === "repeated" || activeSignal === "repeatedWithE1"
          ? {
              type: "repeated-self-assessment",
              evidenceTier: "E2",
              summaryId: repeatedCoachingSummaryId,
              strength: "discovery",
              occurrences: Array.from(
                { length: repeatedInteractionCount },
                (_, index) => ({
                  signalId: `coaching_strength_runtime_report_discovery_${index + 1}`,
                }),
              ),
              insight: `You have self-identified "Discovery" as a strength in ${repeatedInteractionCount} recorded interactions.`,
              followUpPrompt: repeatedCoachingFollowUpPrompt,
            }
          : null;
      },
    },
    briefing: {
      async build() {
        buildCount += 1;
        return { text: `Base briefing ${buildCount}` };
      },
      appendLearningSignal(briefing, signal) {
        learningAppendCount += 1;
        return { ...briefing, text: `${briefing.text} ${signal.insight}` };
      },
      appendCoachingSignal(briefing, signal) {
        coachingAppendCount += 1;
        return {
          ...briefing,
          text: `${briefing.text} ${signal.insight} ${signal.followUpPrompt}`,
        };
      },
      appendRepeatedSelfAssessment(briefing, summary) {
        repeatedCoachingAppendCount += 1;
        return {
          ...briefing,
          text: `${briefing.text} ${summary.insight} ${summary.followUpPrompt}`,
        };
      },
    },
    communication,
  };

  return {
    learningSignalId,
    coachingSignalId,
    coachingInsight,
    coachingFollowUpPrompt,
    repeatedCoachingSummaryId,
    repeatedCoachingFollowUpPrompt,
    setRepeatedInteractionCount(count) {
      repeatedInteractionCount = count;
    },
    get learningAppendCount() {
      return learningAppendCount;
    },
    get coachingAppendCount() {
      return coachingAppendCount;
    },
    get repeatedCoachingAppendCount() {
      return repeatedCoachingAppendCount;
    },
  };
}

function configureBehavioralEvidenceFlow(core, {
  active = true,
  activeIdentity = "behavioral_evidence_active_v1_e3alpha",
  competency = "objection-handling",
  repeatedStrength = null,
  e1SignalId = "coaching_strength_report_e3_interaction_e3_objection-handling",
  linkedE1SignalIds = [
    "coaching_strength_report_e3_interaction_e3_objection-handling",
  ],
  receiptResult = true,
} = {}) {
  const baseBriefing = { text: "Base briefing" };
  const insight =
    "In this recorded interaction, the customer's stated objection was resolved after the user recorded an objection-handling action.";
  const followUpPrompt =
    "What stands out to you about how that interaction unfolded?";
  const sourceRef = {
    artifactId: "report_e3",
    subType: "customerInteraction",
    subId: "interaction_e3",
  };
  let behavioralAppendCount = 0;
  let repeatedAppendCount = 0;
  let coachingAppendCount = 0;
  let lastExcludeSignalIds = [];
  let receiptCalls = 0;

  core.systems = {
    memory: {
      getArtifact(key) {
        if (key === "camping.fieldReports") {
          return { reports: [{ id: "report_e3" }] };
        }
        if (key === "camping.behavioralEvidenceReviews") {
          return { reviews: [{ id: "review_e3" }] };
        }
        return { reviews: [] };
      },
    },
    missionIntelligence: {
      identifyActiveBehavioralEvidence() {
        return active
          ? {
              type: "active-behavioral-evidence",
              evidenceTier: "E3",
              activeIdentity,
              competency,
              insight,
              followUpPrompt,
              sourceRef,
            }
          : null;
      },
      identifyActiveRepeatedSelfAssessment() {
        return repeatedStrength
          ? {
              summaryId: `repeated_self_assessment_${repeatedStrength}`,
              strength: repeatedStrength,
              occurrences: [],
              insight: `Repeated ${repeatedStrength} insight`,
              followUpPrompt: "Repeated prompt?",
            }
          : null;
      },
      identifyLinkedCoachingSignalIds() {
        return linkedE1SignalIds.slice();
      },
      identifyCoachingSignal(_reports, _reviews, options = {}) {
        lastExcludeSignalIds = Array.from(options.excludeSignalIds || []);
        return e1SignalId && !lastExcludeSignalIds.includes(e1SignalId)
          ? {
              signalId: e1SignalId,
              insight: "Independent E1 insight",
              followUpPrompt: "Independent E1 prompt?",
            }
          : null;
      },
    },
    briefing: {
      appendBehavioralEvidence(briefing, evidence) {
        behavioralAppendCount += 1;
        return {
          ...briefing,
          text: `${briefing.text} ${evidence.insight} ${evidence.followUpPrompt}`,
        };
      },
      appendRepeatedSelfAssessment(briefing, summary) {
        repeatedAppendCount += 1;
        return {
          ...briefing,
          text: `${briefing.text} ${summary.insight} ${summary.followUpPrompt}`,
        };
      },
      appendCoachingSignal(briefing, signal) {
        coachingAppendCount += 1;
        return {
          ...briefing,
          text: `${briefing.text} ${signal.insight} ${signal.followUpPrompt}`,
        };
      },
    },
    communication: {
      send() {
        return true;
      },
      async sendWithReceipt() {
        receiptCalls += 1;
        return receiptResult;
      },
    },
  };
  core.pendingBriefing = baseBriefing;
  core.session.briefing = baseBriefing;

  return {
    baseBriefing,
    activeIdentity,
    insight,
    followUpPrompt,
    sourceRef,
    get behavioralAppendCount() {
      return behavioralAppendCount;
    },
    get repeatedAppendCount() {
      return repeatedAppendCount;
    },
    get coachingAppendCount() {
      return coachingAppendCount;
    },
    get lastExcludeSignalIds() {
      return lastExcludeSignalIds;
    },
    get receiptCalls() {
      return receiptCalls;
    },
  };
}

test("deliver:false preparation appends but does not mark", async () => {
  const { core, markedIds } = loadArchieCore();
  const flow = configureLearningFlow(core);

  const briefing = await core.surfaceLearningSignals(flow.baseBriefing);

  assert.equal(flow.appendCount, 1);
  assert.match(briefing.text, /Learning insight/);
  assert.deepEqual(markedIds, []);
});

test("identification alone does not mark", () => {
  const { core, markedIds } = loadArchieCore();
  configureLearningFlow(core);

  const signal = core.systems.missionIntelligence.identifyLearningSignal([]);

  assert.equal(signal.signalId, "learning_signal_a");
  assert.deepEqual(markedIds, []);
});

test("previously surfaced signal is not appended and base briefing remains", async () => {
  const { core } = loadArchieCore({
    surfacedIds: new Set(["learning:learning_signal_a"]),
  });
  const flow = configureLearningFlow(core);

  const briefing = await core.surfaceLearningSignals(flow.baseBriefing);

  assert.equal(flow.appendCount, 0);
  assert.equal(briefing, flow.baseBriefing);
  assert.equal(briefing.text, "Base briefing");
});

test("confirmed successful delivery marks the pending signal ID", async () => {
  const { core, markedIds } = loadArchieCore();
  const flow = configureLearningFlow(core);
  await core.surfaceLearningSignals(flow.baseBriefing);

  const delivered = await core.deliverBriefing();

  assert.equal(delivered, true);
  assert.equal(flow.receiptCalls, 1);
  assert.deepEqual(markedIds, ["learning_signal_a"]);
});

test("legacy queue acceptance alone does not mark", async () => {
  const { core, markedIds } = loadArchieCore();
  const flow = configureLearningFlow(core, { legacySend: true });
  await core.surfaceLearningSignals(flow.baseBriefing);

  const accepted = await core.deliverBriefing();

  assert.equal(accepted, true);
  assert.equal(flow.sendCalls, 1);
  assert.deepEqual(markedIds, []);
});

test("failed delivery receipt does not mark", async () => {
  const { core, markedIds } = loadArchieCore();
  const flow = configureLearningFlow(core, { receiptResult: false });
  await core.surfaceLearningSignals(flow.baseBriefing);

  const delivered = await core.deliverBriefing();

  assert.equal(delivered, false);
  assert.deepEqual(markedIds, []);
});

test("console-only fallback reports failed delivery", async () => {
  const communication = loadCommunicationSystem();

  const delivered = await communication.sendWithReceipt({
    text: "Learning insight",
    target: "dashboard",
  });

  assert.equal(delivered, false);
});

test("Archie target delivery succeeds when Communication target is stale", async () => {
  const target = { textContent: "" };
  const Archie = makeArchieDelivery({ target });
  const communication = loadCommunicationSystem({ Archie });

  const delivered = await communication.sendWithReceipt({
    text: "Runtime coaching insight",
    target: "dashboard",
  });

  assert.equal(target.textContent, "Runtime coaching insight");
  assert.equal(delivered, true);
});

test("Archie path with no visual target reports failed delivery", async () => {
  const Archie = makeArchieDelivery();
  const communication = loadCommunicationSystem({ Archie });

  const delivered = await communication.sendWithReceipt({
    text: "Undeliverable insight",
    target: "dashboard",
  });

  assert.equal(delivered, false);
});

test("exception during Archie delivery reports failed delivery", async () => {
  const target = { textContent: "" };
  const Archie = makeArchieDelivery({ target, throws: true });
  const communication = loadCommunicationSystem({ Archie });

  const delivered = await communication.sendWithReceipt({
    text: "Failed insight",
    target: "dashboard",
  });

  assert.equal(delivered, false);
  assert.equal(target.textContent, "");
});

test("a real dashboard target reports successful delivery", async () => {
  const target = { textContent: "" };
  const communication = loadCommunicationSystem({ target });

  const delivered = await communication.sendWithReceipt({
    text: "Learning insight",
    target: "dashboard",
  });

  assert.equal(delivered, true);
  assert.equal(target.textContent, "Learning insight");
});

test("a different new learning ID remains eligible", async () => {
  const surfacedIds = new Set(["learning:learning_signal_a"]);
  const { core, markedIds } = loadArchieCore({ surfacedIds });
  const flow = configureLearningFlow(core, { signalId: "learning_signal_b" });

  await core.surfaceLearningSignals(flow.baseBriefing);
  await core.deliverBriefing();

  assert.equal(flow.appendCount, 1);
  assert.deepEqual(markedIds, ["learning_signal_b"]);
  assert.equal(surfacedIds.has("learning:learning_signal_a"), true);
  assert.equal(surfacedIds.has("learning:learning_signal_b"), true);
});

test("beginBriefing marks a pending eligible signal only after success", async () => {
  const { core, markedIds } = loadArchieCore();
  const flow = configureLearningFlow(core);
  await core.surfaceLearningSignals(flow.baseBriefing);

  assert.deepEqual(markedIds, []);
  await core.beginBriefing();

  assert.equal(flow.receiptCalls, 1);
  assert.deepEqual(markedIds, ["learning_signal_a"]);
});

test("a fresh coaching signal is eligible", async () => {
  const { core } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, { includeLearning: false });

  await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.equal(flow.coachingAppendCount, 1);
});

test("eligible coaching is appended after the base briefing", async () => {
  const { core } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, { includeLearning: false });

  const briefing = await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.equal(
    briefing.text,
    `Base briefing ${flow.coachingInsight} ${flow.coachingFollowUpPrompt}`,
  );
});

test("coaching preparation without delivery does not mark", async () => {
  const { core, markedIds } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, { includeLearning: false });

  await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.deepEqual(markedIds, []);
});

test("successful visual delivery marks the coaching ID", async () => {
  const { core, markedIds } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, { includeLearning: false });
  await core.surfaceCoachingSignal(flow.baseBriefing);

  const delivered = await core.deliverBriefing();

  assert.equal(delivered, true);
  assert.deepEqual(markedIds, [
    "coaching_strength_report_1_interaction_1_discovery",
  ]);
});

test("delivered coaching is suppressed afterward while the base briefing remains", async () => {
  const { core } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, { includeLearning: false });
  await core.surfaceCoachingSignal(flow.baseBriefing);
  await core.deliverBriefing();

  const nextBaseBriefing = { text: "Next base briefing" };
  core.pendingBriefing = nextBaseBriefing;
  core.session.briefing = nextBaseBriefing;

  const briefing = await core.surfaceCoachingSignal(nextBaseBriefing);

  assert.equal(flow.coachingAppendCount, 1);
  assert.equal(briefing, nextBaseBriefing);
  assert.equal(briefing.text, "Next base briefing");
});

test("learning and coaching session namespaces remain independent", async () => {
  const sharedId = "shared_signal_id";
  const { core } = loadArchieCore({
    surfacedIds: new Set([`learning:${sharedId}`]),
  });
  const flow = configureActiveSignalFlow(core, {
    includeLearning: false,
    coachingSignalId: sharedId,
  });

  await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.equal(flow.coachingAppendCount, 1);
});

test("learning may be suppressed while coaching remains eligible", async () => {
  const { core } = loadArchieCore({
    surfacedIds: new Set(["learning:learning_signal_a"]),
  });
  const flow = configureActiveSignalFlow(core);

  let briefing = await core.surfaceLearningSignals(flow.baseBriefing);
  briefing = await core.surfaceCoachingSignal(briefing);

  assert.equal(flow.learningAppendCount, 0);
  assert.equal(flow.coachingAppendCount, 1);
  assert.match(briefing.text, /self-identified/);
});

test("coaching may be suppressed while learning remains eligible", async () => {
  const coachingId = "coaching_strength_report_1_interaction_1_discovery";
  const { core } = loadArchieCore({
    surfacedIds: new Set([`coaching:${coachingId}`]),
  });
  const flow = configureActiveSignalFlow(core);

  let briefing = await core.surfaceLearningSignals(flow.baseBriefing);
  briefing = await core.surfaceCoachingSignal(briefing);

  assert.equal(flow.learningAppendCount, 1);
  assert.equal(flow.coachingAppendCount, 0);
  assert.match(briefing.text, /Learning insight/);
});

test("a new coaching ID may surface once after an older ID", async () => {
  const surfacedIds = new Set([
    "coaching:coaching_strength_report_1_interaction_1_discovery",
  ]);
  const { core, markedIds } = loadArchieCore({ surfacedIds });
  const flow = configureActiveSignalFlow(core, {
    includeLearning: false,
    coachingSignalId: "coaching_strength_report_2_interaction_2_rapport",
  });

  await core.surfaceCoachingSignal(flow.baseBriefing);
  await core.deliverBriefing();

  assert.equal(flow.coachingAppendCount, 1);
  assert.deepEqual(markedIds, [
    "coaching_strength_report_2_interaction_2_rapport",
  ]);
});

test("failed delivery marks neither pending learning nor coaching", async () => {
  const { core, markedIds } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, { receiptResult: false });

  let briefing = await core.surfaceLearningSignals(flow.baseBriefing);
  briefing = await core.surfaceCoachingSignal(briefing);
  const delivered = await core.deliverBriefing(briefing);

  assert.equal(delivered, false);
  assert.deepEqual(markedIds, []);
});

test("successful combined delivery marks both pending typed IDs", async () => {
  const { core, markedIds, surfacedIds } = loadArchieCore();
  const flow = configureActiveSignalFlow(core);

  let briefing = await core.surfaceLearningSignals(flow.baseBriefing);
  briefing = await core.surfaceCoachingSignal(briefing);
  const delivered = await core.deliverBriefing(briefing);

  assert.equal(delivered, true);
  assert.deepEqual(markedIds, [
    "learning_signal_a",
    "coaching_strength_report_1_interaction_1_discovery",
  ]);
  assert.equal(surfacedIds.has("learning:learning_signal_a"), true);
  assert.equal(
    surfacedIds.has(
      "coaching:coaching_strength_report_1_interaction_1_discovery",
    ),
    true,
  );
});

test("user-created coaching never enters the active path", async () => {
  const { core } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, {
    includeLearning: false,
    includeCoaching: false,
  });

  const briefing = await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.equal(flow.coachingAppendCount, 0);
  assert.equal(briefing, flow.baseBriefing);
});

test("BriefingSystem preserves self-assessment wording and avoids duplicates", () => {
  const briefingSystem = loadBriefingSystem();
  const insight =
    'User self-identified "Discovery" as a strength during this customer interaction.';
  const followUpPrompt =
    "What happened in that interaction that made this feel like a strength to you?";
  const first = briefingSystem.appendCoachingSignal(
    { text: "Base briefing" },
    { insight, followUpPrompt },
  );
  const second = briefingSystem.appendCoachingSignal(first, {
    insight,
    followUpPrompt,
  });

  assert.equal(first.text, `Base briefing ${insight} ${followUpPrompt}`);
  assert.equal(second, first);
  assert.equal(first.text.split(followUpPrompt).length - 1, 1);
  assert.doesNotMatch(first.text, /demonstrated|verified|proven/i);
});

test("BriefingSystem tolerates a missing coaching follow-up prompt", () => {
  const briefingSystem = loadBriefingSystem();
  const insight =
    'User self-identified "Discovery" as a strength during this customer interaction.';

  const briefing = briefingSystem.appendCoachingSignal(
    { text: "Base briefing" },
    { insight },
  );

  assert.equal(briefing.text, `Base briefing ${insight}`);
});

test("combined briefing order is base then learning then coaching", async () => {
  const { core } = loadArchieCore();
  const flow = configureActiveSignalFlow(core);

  let briefing = await core.surfaceLearningSignals(flow.baseBriefing);
  briefing = await core.surfaceCoachingSignal(briefing);

  assert.equal(
    briefing.text,
    `Base briefing Learning insight ${flow.coachingInsight} ${flow.coachingFollowUpPrompt}`,
  );
});

test("awaited runtime coaching refresh marks then suppresses the same ID", async () => {
  const target = { textContent: "" };
  const Archie = makeArchieDelivery({ target });
  const communication = loadCommunicationSystem({ Archie });
  const { core, surfacedIds } = loadArchieCore();
  const flow = configureRefreshSignalFlow(core, communication, {
    activeSignal: "coaching",
  });

  await core.refreshSession({ deliver: true });

  assert.match(target.textContent, /self-identified "Rapport"/);
  assert.equal(
    target.textContent,
    `Base briefing 1 ${flow.coachingInsight} ${flow.coachingFollowUpPrompt}`,
  );
  assert.equal(
    surfacedIds.has(`coaching:${flow.coachingSignalId}`),
    true,
  );

  await core.refreshSession({ deliver: true });

  assert.equal(flow.coachingAppendCount, 1);
  assert.equal(target.textContent, "Base briefing 2");
  assert.doesNotMatch(target.textContent, /What happened in that interaction/);
});

test("awaited runtime learning refresh marks then suppresses the same ID", async () => {
  const target = { textContent: "" };
  const Archie = makeArchieDelivery({ target });
  const communication = loadCommunicationSystem({ Archie });
  const { core, surfacedIds } = loadArchieCore();
  const flow = configureRefreshSignalFlow(core, communication, {
    activeSignal: "learning",
  });

  await core.refreshSession({ deliver: true });

  assert.match(target.textContent, /Learning insight/);
  assert.equal(surfacedIds.has(`learning:${flow.learningSignalId}`), true);

  await core.refreshSession({ deliver: true });

  assert.equal(flow.learningAppendCount, 1);
  assert.equal(target.textContent, "Base briefing 2");
});

test("overlapping delivered refreshes serialize before eligibility recheck", async () => {
  const deliveryResolvers = [];
  const communication = {
    send() {
      return true;
    },
    sendWithReceipt() {
      return new Promise((resolve) => {
        deliveryResolvers.push(resolve);
      });
    },
  };
  const { core, surfacedIds } = loadArchieCore();
  const flow = configureRefreshSignalFlow(core, communication, {
    activeSignal: "coaching",
  });

  const firstRefresh = core.refreshSession({ deliver: true });
  const secondRefresh = core.refreshSession({ deliver: true });

  await new Promise(setImmediate);

  assert.equal(deliveryResolvers.length, 1);
  assert.equal(flow.coachingAppendCount, 1);

  deliveryResolvers[0](true);
  await firstRefresh;
  await new Promise(setImmediate);

  assert.equal(deliveryResolvers.length, 2);
  assert.equal(flow.coachingAppendCount, 1);
  assert.equal(
    surfacedIds.has(`coaching:${flow.coachingSignalId}`),
    true,
  );

  deliveryResolvers[1](true);
  await secondRefresh;
});

test("BriefingSystem appends repeated self-assessment wording without mutation", () => {
  const briefingSystem = loadBriefingSystem();
  const briefing = { text: "Base briefing" };
  const summary = {
    insight:
      'You have self-identified "Discovery" as a strength in 2 recorded interactions.',
    followUpPrompt: "What do you notice repeating across those interactions?",
  };
  const before = JSON.parse(JSON.stringify({ briefing, summary }));
  const first = briefingSystem.appendRepeatedSelfAssessment(briefing, summary);
  const second = briefingSystem.appendRepeatedSelfAssessment(first, summary);

  assert.equal(
    first.text,
    `${briefing.text} ${summary.insight} ${summary.followUpPrompt}`,
  );
  assert.equal(second, first);
  assert.deepEqual(JSON.parse(JSON.stringify({ briefing, summary })), before);
});

test("BriefingSystem repeated self-assessment tolerates a missing prompt", () => {
  const briefingSystem = loadBriefingSystem();
  const insight =
    'You have self-identified "Rapport" as a strength in 2 recorded interactions.';
  const result = briefingSystem.appendRepeatedSelfAssessment(
    { text: "Base briefing" },
    { insight },
  );

  assert.equal(result.text, `Base briefing ${insight}`);
});

test("active E2 owns the single coaching slot over eligible E1", async () => {
  const { core } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, {
    includeLearning: false,
    includeRepeatedCoaching: true,
  });

  const briefing = await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.equal(flow.repeatedCoachingAppendCount, 1);
  assert.equal(flow.coachingAppendCount, 0);
  assert.equal(
    briefing.text,
    `Base briefing ${flow.repeatedCoachingInsight} ${flow.repeatedCoachingFollowUpPrompt}`,
  );
  assert.doesNotMatch(briefing.text, /during this customer interaction/);
});

test("learning remains before E2 in the briefing", async () => {
  const { core } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, {
    includeRepeatedCoaching: true,
  });

  let briefing = await core.surfaceLearningSignals(flow.baseBriefing);
  briefing = await core.surfaceCoachingSignal(briefing);

  assert.equal(
    briefing.text,
    `Base briefing Learning insight ${flow.repeatedCoachingInsight} ${flow.repeatedCoachingFollowUpPrompt}`,
  );
  assert.equal(flow.coachingAppendCount, 0);
});

test("E2 is marked only after a successful truthful delivery receipt", async () => {
  const { core, markedIds, surfacedIds } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, {
    includeLearning: false,
    includeRepeatedCoaching: true,
  });

  await core.surfaceCoachingSignal(flow.baseBriefing);
  assert.deepEqual(markedIds, []);

  const delivered = await core.deliverBriefing();

  assert.equal(delivered, true);
  assert.deepEqual(markedIds, [flow.repeatedCoachingSummaryId]);
  assert.equal(
    surfacedIds.has(
      `repeatedCoaching:${flow.repeatedCoachingSummaryId}`,
    ),
    true,
  );
});

test("failed or fallback E2 delivery writes no session marker", async () => {
  for (const mode of ["failed-receipt", "console-fallback"]) {
    const { core, markedIds } = loadArchieCore();
    const flow = configureActiveSignalFlow(core, {
      includeLearning: false,
      includeRepeatedCoaching: true,
      receiptResult: false,
    });
    await core.surfaceCoachingSignal(flow.baseBriefing);

    if (mode === "console-fallback") {
      core.systems.communication = null;
    }
    const delivered = await core.deliverBriefing();

    assert.equal(delivered, false);
    assert.deepEqual(markedIds, []);
  }
});

test("missing visual target writes no E2 marker", async () => {
  const communication = loadCommunicationSystem();
  const { core, markedIds } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, {
    includeLearning: false,
    includeRepeatedCoaching: true,
  });
  core.systems.communication = communication;

  await core.surfaceCoachingSignal(flow.baseBriefing);
  const delivered = await core.deliverBriefing();

  assert.equal(delivered, false);
  assert.deepEqual(markedIds, []);
});

test("surfaced active E2 suppresses its exact supporting E1", async () => {
  const summaryId = "repeated_self_assessment_discovery";
  const { core } = loadArchieCore({
    surfacedIds: new Set([`repeatedCoaching:${summaryId}`]),
  });
  const flow = configureActiveSignalFlow(core, {
    includeLearning: false,
    includeRepeatedCoaching: true,
  });

  const briefing = await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.equal(flow.repeatedCoachingAppendCount, 0);
  assert.equal(flow.coachingAppendCount, 0);
  assert.equal(briefing.text, "Base briefing");
});

test("surfaced active E2 still allows an unrelated E1", async () => {
  const summaryId = "repeated_self_assessment_discovery";
  const { core } = loadArchieCore({
    surfacedIds: new Set([`repeatedCoaching:${summaryId}`]),
  });
  const flow = configureActiveSignalFlow(core, {
    includeLearning: false,
    includeRepeatedCoaching: true,
    repeatedOccurrenceSignalIds: [
      "coaching_strength_report_1_interaction_2_discovery",
    ],
  });

  const briefing = await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.equal(flow.repeatedCoachingAppendCount, 0);
  assert.equal(flow.coachingAppendCount, 1);
  assert.match(briefing.text, /during this customer interaction/);
});

test("count growth expands current E2 coverage to a new supporting E1", async () => {
  const summaryId = "repeated_self_assessment_discovery";
  const candidateId = "coaching_strength_report_1_interaction_3_discovery";
  const { core } = loadArchieCore({
    surfacedIds: new Set([`repeatedCoaching:${summaryId}`]),
  });
  const flow = configureActiveSignalFlow(core, {
    coachingSignalId: candidateId,
    includeLearning: false,
    includeRepeatedCoaching: true,
    repeatedOccurrenceSignalIds: [
      "coaching_strength_report_1_interaction_1_discovery",
      "coaching_strength_report_1_interaction_2_discovery",
    ],
  });

  await core.surfaceCoachingSignal(flow.baseBriefing);
  assert.equal(flow.coachingAppendCount, 1);

  core.systems.missionIntelligence.identifyActiveRepeatedSelfAssessment =
    () => ({
      summaryId,
      occurrences: [
        { signalId: "coaching_strength_report_1_interaction_1_discovery" },
        { signalId: "coaching_strength_report_1_interaction_2_discovery" },
        { signalId: candidateId },
      ],
      insight:
        'You have self-identified "Discovery" as a strength in 3 recorded interactions.',
      followUpPrompt: "What do you notice repeating across those interactions?",
    });
  const nextBriefing = { text: "Next base briefing" };
  core.pendingBriefing = nextBriefing;
  core.session.briefing = nextBriefing;

  const result = await core.surfaceCoachingSignal(nextBriefing);

  assert.equal(flow.coachingAppendCount, 1);
  assert.equal(result.text, "Next base briefing");
});

test("review removal of active E2 allows E1 fallback", async () => {
  const { core } = loadArchieCore();
  const flow = configureActiveSignalFlow(core, {
    includeLearning: false,
    includeRepeatedCoaching: true,
  });
  core.systems.missionIntelligence.identifyActiveRepeatedSelfAssessment =
    () => null;

  const briefing = await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.equal(flow.repeatedCoachingAppendCount, 0);
  assert.equal(flow.coachingAppendCount, 1);
  assert.match(briefing.text, /during this customer interaction/);
});

test("awaited E2 refresh marks then suppresses count changes in the same tab", async () => {
  const target = { textContent: "" };
  const communication = loadCommunicationSystem({
    Archie: makeArchieDelivery({ target }),
  });
  const { core, surfacedIds } = loadArchieCore();
  const flow = configureRefreshSignalFlow(core, communication, {
    activeSignal: "repeated",
  });

  await core.refreshSession({ deliver: true });

  assert.match(target.textContent, /2 recorded interactions/);
  assert.equal(
    surfacedIds.has(`repeatedCoaching:${flow.repeatedCoachingSummaryId}`),
    true,
  );

  flow.setRepeatedInteractionCount(3);
  await core.refreshSession({ deliver: true });

  assert.equal(flow.repeatedCoachingAppendCount, 1);
  assert.equal(target.textContent, "Base briefing 2");
});

test("a new tab may deliver the updated E2 count once", async () => {
  const firstTarget = { textContent: "" };
  const firstCommunication = loadCommunicationSystem({
    Archie: makeArchieDelivery({ target: firstTarget }),
  });
  const firstTab = loadArchieCore();
  const firstFlow = configureRefreshSignalFlow(
    firstTab.core,
    firstCommunication,
    { activeSignal: "repeated" },
  );
  await firstTab.core.refreshSession({ deliver: true });

  const secondTarget = { textContent: "" };
  const secondCommunication = loadCommunicationSystem({
    Archie: makeArchieDelivery({ target: secondTarget }),
  });
  const secondTab = loadArchieCore();
  const secondFlow = configureRefreshSignalFlow(
    secondTab.core,
    secondCommunication,
    { activeSignal: "repeated" },
  );
  secondFlow.setRepeatedInteractionCount(3);
  await secondTab.core.refreshSession({ deliver: true });

  assert.match(firstTarget.textContent, /2 recorded interactions/);
  assert.match(secondTarget.textContent, /3 recorded interactions/);
  assert.equal(secondFlow.repeatedCoachingAppendCount, 1);
});

test("overlapping E2 refreshes serialize before session eligibility recheck", async () => {
  const deliveryResolvers = [];
  const communication = {
    send() {
      return true;
    },
    sendWithReceipt() {
      return new Promise((resolve) => deliveryResolvers.push(resolve));
    },
  };
  const { core, surfacedIds } = loadArchieCore();
  const flow = configureRefreshSignalFlow(core, communication, {
    activeSignal: "repeatedWithE1",
  });

  const firstRefresh = core.refreshSession({ deliver: true });
  const secondRefresh = core.refreshSession({ deliver: true });
  await new Promise(setImmediate);

  assert.equal(deliveryResolvers.length, 1);
  assert.equal(flow.repeatedCoachingAppendCount, 1);
  assert.equal(flow.coachingAppendCount, 0);

  deliveryResolvers[0](true);
  await firstRefresh;
  await new Promise(setImmediate);

  assert.equal(deliveryResolvers.length, 2);
  assert.equal(flow.repeatedCoachingAppendCount, 1);
  assert.equal(flow.coachingAppendCount, 1);
  assert.equal(
    surfacedIds.has(`repeatedCoaching:${flow.repeatedCoachingSummaryId}`),
    true,
  );

  deliveryResolvers[1](true);
  await secondRefresh;
});

test("active unsurfaced E3 owns the single coaching slot over E2 and E1", async () => {
  const { core } = loadArchieCore();
  const flow = configureBehavioralEvidenceFlow(core, {
    repeatedStrength: "objection-handling",
  });

  const briefing = await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.equal(flow.behavioralAppendCount, 1);
  assert.equal(flow.repeatedAppendCount, 0);
  assert.equal(flow.coachingAppendCount, 0);
  assert.match(briefing.text, new RegExp(flow.insight));
  assert.match(briefing.text, new RegExp(flow.followUpPrompt.replace("?", "\\?")));
});

test("E3 marker is absent before delivery and written only after a true receipt", async () => {
  const { core, surfacedIds } = loadArchieCore();
  const flow = configureBehavioralEvidenceFlow(core);

  await core.surfaceCoachingSignal(flow.baseBriefing);
  assert.equal(
    surfacedIds.has(`behavioralEvidence:${flow.activeIdentity}`),
    false,
  );

  assert.equal(await core.deliverBriefing(), true);
  assert.equal(
    surfacedIds.has(`behavioralEvidence:${flow.activeIdentity}`),
    true,
  );
  assert.equal(core.pendingBehavioralEvidenceIdentity, null);
});

test("failed receipt, missing target, and console fallback do not mark E3", async () => {
  for (const mode of ["failed", "missing-target", "fallback"]) {
    const { core, surfacedIds } = loadArchieCore();
    const flow = configureBehavioralEvidenceFlow(core, {
      receiptResult: false,
    });
    await core.surfaceCoachingSignal(flow.baseBriefing);

    if (mode === "missing-target") {
      core.systems.communication = loadCommunicationSystem();
    } else if (mode === "fallback") {
      core.systems.communication = null;
    }

    assert.equal(await core.deliverBriefing(), false);
    assert.equal(
      surfacedIds.has(`behavioralEvidence:${flow.activeIdentity}`),
      false,
    );
  }
});

test("delivered E3 suppresses same-competency E2 but allows unrelated E2", async () => {
  const activeIdentity = "behavioral_evidence_active_v1_e3alpha";
  for (const [repeatedStrength, expectedCount] of [
    ["objection-handling", 0],
    ["rapport", 1],
  ]) {
    const { core } = loadArchieCore({
      surfacedIds: new Set([`behavioralEvidence:${activeIdentity}`]),
    });
    const flow = configureBehavioralEvidenceFlow(core, {
      activeIdentity,
      repeatedStrength,
      e1SignalId: null,
    });

    await core.surfaceCoachingSignal(flow.baseBriefing);
    assert.equal(flow.repeatedAppendCount, expectedCount);
  }
});

test("inactive E3 lifts E2 suppression and a changed identity can take priority", async () => {
  const oldIdentity = "behavioral_evidence_active_v1_old";
  const surfacedIds = new Set([`behavioralEvidence:${oldIdentity}`]);
  const inactiveTab = loadArchieCore({ surfacedIds });
  const inactiveFlow = configureBehavioralEvidenceFlow(inactiveTab.core, {
    active: false,
    repeatedStrength: "objection-handling",
  });

  await inactiveTab.core.surfaceCoachingSignal(inactiveFlow.baseBriefing);
  assert.equal(inactiveFlow.repeatedAppendCount, 1);

  const changedTab = loadArchieCore({ surfacedIds });
  const changedFlow = configureBehavioralEvidenceFlow(changedTab.core, {
    activeIdentity: "behavioral_evidence_active_v1_changed",
    repeatedStrength: "objection-handling",
  });
  await changedTab.core.surfaceCoachingSignal(changedFlow.baseBriefing);
  assert.equal(changedFlow.behavioralAppendCount, 1);
  assert.equal(changedFlow.repeatedAppendCount, 0);
});

test("delivered E3 excludes only the canonically linked E1", async () => {
  const activeIdentity = "behavioral_evidence_active_v1_e3alpha";
  const linkedId =
    "coaching_strength_report_e3_interaction_e3_objection-handling";
  for (const [candidateId, expectedE1Count] of [
    [linkedId, 0],
    ["coaching_strength_report_e3_other_interaction_objection-handling", 1],
    ["coaching_strength_report_e3_interaction_e3_rapport", 1],
  ]) {
    const { core } = loadArchieCore({
      surfacedIds: new Set([`behavioralEvidence:${activeIdentity}`]),
    });
    const flow = configureBehavioralEvidenceFlow(core, {
      activeIdentity,
      e1SignalId: candidateId,
      linkedE1SignalIds: [linkedId],
    });

    await core.surfaceCoachingSignal(flow.baseBriefing);
    assert.equal(flow.coachingAppendCount, expectedE1Count);
    assert.deepEqual(flow.lastExcludeSignalIds, [linkedId]);
  }
});

test("E3 and existing surfaced E2 exclusions combine deterministically", async () => {
  const activeIdentity = "behavioral_evidence_active_v1_e3alpha";
  const summaryId = "repeated_self_assessment_rapport";
  const { core } = loadArchieCore({
    surfacedIds: new Set([
      `behavioralEvidence:${activeIdentity}`,
      `repeatedCoaching:${summaryId}`,
    ]),
  });
  const flow = configureBehavioralEvidenceFlow(core, {
    activeIdentity,
    repeatedStrength: "rapport",
    e1SignalId: null,
  });
  core.systems.missionIntelligence.identifyActiveRepeatedSelfAssessment =
    () => ({
      summaryId,
      strength: "rapport",
      occurrences: [{ signalId: "e2_covered_e1" }],
      insight: "Repeated rapport insight",
      followUpPrompt: "Repeated prompt?",
    });

  await core.surfaceCoachingSignal(flow.baseBriefing);

  assert.deepEqual(flow.lastExcludeSignalIds, [
    "e2_covered_e1",
    "coaching_strength_report_e3_interaction_e3_objection-handling",
  ]);
});

test("failed E3 stays eligible and does not allow lower tiers on retry", async () => {
  const { core, surfacedIds } = loadArchieCore();
  const flow = configureBehavioralEvidenceFlow(core, {
    repeatedStrength: "rapport",
    receiptResult: false,
  });

  await core.surfaceCoachingSignal(flow.baseBriefing);
  assert.equal(await core.deliverBriefing(), false);
  const nextBriefing = { text: "Next base briefing" };
  core.pendingBriefing = nextBriefing;
  core.session.briefing = nextBriefing;
  await core.surfaceCoachingSignal(nextBriefing);

  assert.equal(flow.behavioralAppendCount, 2);
  assert.equal(flow.repeatedAppendCount, 0);
  assert.equal(flow.coachingAppendCount, 0);
  assert.equal(
    surfacedIds.has(`behavioralEvidence:${flow.activeIdentity}`),
    false,
  );
});

test("behavioral evidence append preserves exact wording without mutation", () => {
  const briefingSystem = loadBriefingSystem();
  const briefing = { text: "Base briefing" };
  const evidence = {
    insight: "Exact E3 insight.",
    followUpPrompt: "Exact E3 prompt?",
  };
  const before = JSON.stringify(evidence);
  const first = briefingSystem.appendBehavioralEvidence(briefing, evidence);
  const second = briefingSystem.appendBehavioralEvidence(first, evidence);
  const withoutPrompt = briefingSystem.appendBehavioralEvidence(
    briefing,
    { insight: evidence.insight },
  );

  assert.equal(first.text, "Base briefing Exact E3 insight. Exact E3 prompt?");
  assert.equal(second, first);
  assert.equal(withoutPrompt.text, "Base briefing Exact E3 insight.");
  assert.equal(JSON.stringify(evidence), before);
  assert.equal(briefing.text, "Base briefing");
});

test("runtime briefing order is base then learning then E3", async () => {
  const target = { textContent: "" };
  const communication = loadCommunicationSystem({
    Archie: makeArchieDelivery({ target }),
  });
  const { core, surfacedIds } = loadArchieCore();
  configureRefreshSignalFlow(core, communication, { activeSignal: "learning" });
  const activeIdentity = "behavioral_evidence_active_v1_runtime";
  const insight = "Exact runtime E3 insight.";
  const prompt = "What stands out to you about how that interaction unfolded?";
  core.systems.missionIntelligence.identifyActiveBehavioralEvidence = () => ({
    activeIdentity,
    competency: "objection-handling",
    insight,
    followUpPrompt: prompt,
    sourceRef: {
      artifactId: "runtime-report",
      subType: "customerInteraction",
      subId: "runtime-interaction",
    },
  });
  core.systems.briefing.appendBehavioralEvidence = (briefing, evidence) => ({
    ...briefing,
    text: `${briefing.text} ${evidence.insight} ${evidence.followUpPrompt}`,
  });

  await core.refreshSession({ deliver: true });

  assert.equal(
    target.textContent,
    `Base briefing 1 Learning insight ${insight} ${prompt}`,
  );
  assert.equal(
    surfacedIds.has(`behavioralEvidence:${activeIdentity}`),
    true,
  );
});

test("overlapping E3 refreshes wait for receipt and do not double-deliver", async () => {
  const deliveryResolvers = [];
  const communication = {
    send() {
      return true;
    },
    sendWithReceipt() {
      return new Promise((resolve) => deliveryResolvers.push(resolve));
    },
  };
  const { core, surfacedIds } = loadArchieCore();
  configureRefreshSignalFlow(core, communication, { activeSignal: "none" });
  const activeIdentity = "behavioral_evidence_active_v1_overlap";
  let appendCount = 0;
  core.systems.missionIntelligence.identifyActiveBehavioralEvidence = () => ({
    activeIdentity,
    competency: "objection-handling",
    insight: "Overlapping E3 insight.",
    followUpPrompt: "What stands out to you about how that interaction unfolded?",
    sourceRef: {
      artifactId: "runtime-report",
      subType: "customerInteraction",
      subId: "runtime-interaction",
    },
  });
  core.systems.briefing.appendBehavioralEvidence = (briefing, evidence) => {
    appendCount += 1;
    return {
      ...briefing,
      text: `${briefing.text} ${evidence.insight} ${evidence.followUpPrompt}`,
    };
  };

  const firstRefresh = core.refreshSession({ deliver: true });
  const secondRefresh = core.refreshSession({ deliver: true });
  await new Promise(setImmediate);

  assert.equal(deliveryResolvers.length, 1);
  assert.equal(appendCount, 1);

  deliveryResolvers[0](true);
  await firstRefresh;
  await new Promise(setImmediate);

  assert.equal(deliveryResolvers.length, 2);
  assert.equal(appendCount, 1);
  assert.equal(
    surfacedIds.has(`behavioralEvidence:${activeIdentity}`),
    true,
  );

  deliveryResolvers[1](true);
  await secondRefresh;
});

test("Trial Close reuses E3 delivery, marker, and cross-tier suppression", async () => {
  const activeIdentity = "behavioral_evidence_active_v1_trialclose";
  const linkedId =
    "coaching_strength_report_e3_interaction_e3_trial-close";
  const { core, surfacedIds } = loadArchieCore();
  const flow = configureBehavioralEvidenceFlow(core, {
    activeIdentity,
    competency: "trial-close",
    repeatedStrength: "trial-close",
    e1SignalId: linkedId,
    linkedE1SignalIds: [linkedId],
  });

  await core.surfaceCoachingSignal(flow.baseBriefing);
  assert.equal(flow.behavioralAppendCount, 1);
  assert.equal(flow.repeatedAppendCount, 0);
  assert.equal(flow.coachingAppendCount, 0);
  assert.equal(await core.deliverBriefing(), true);
  assert.equal(
    surfacedIds.has(`behavioralEvidence:${activeIdentity}`),
    true,
  );

  const nextBriefing = { text: "Next briefing" };
  core.pendingBriefing = nextBriefing;
  core.session.briefing = nextBriefing;
  await core.surfaceCoachingSignal(nextBriefing);

  assert.equal(flow.behavioralAppendCount, 1);
  assert.equal(flow.repeatedAppendCount, 0);
  assert.equal(flow.coachingAppendCount, 0);
});

test("failed Trial Close E3 delivery retries without marking", async () => {
  const { core, surfacedIds } = loadArchieCore();
  const flow = configureBehavioralEvidenceFlow(core, {
    activeIdentity: "behavioral_evidence_active_v1_trialretry",
    competency: "trial-close",
    repeatedStrength: "rapport",
    receiptResult: false,
  });

  await core.surfaceCoachingSignal(flow.baseBriefing);
  assert.equal(await core.deliverBriefing(), false);
  const nextBriefing = { text: "Next briefing" };
  core.pendingBriefing = nextBriefing;
  core.session.briefing = nextBriefing;
  await core.surfaceCoachingSignal(nextBriefing);

  assert.equal(flow.behavioralAppendCount, 2);
  assert.equal(flow.repeatedAppendCount, 0);
  assert.equal(
    surfacedIds.has(`behavioralEvidence:${flow.activeIdentity}`),
    false,
  );
});
