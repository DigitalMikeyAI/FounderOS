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
        type !== "repeatedCoaching"
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
