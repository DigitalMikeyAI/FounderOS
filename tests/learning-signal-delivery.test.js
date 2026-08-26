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
      if (type !== "learning" && type !== "coaching") {
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
  receiptResult = true,
} = {}) {
  let learningAppendCount = 0;
  let coachingAppendCount = 0;
  let receiptCalls = 0;
  const baseBriefing = { text: "Base briefing" };
  const coachingInsight =
    'User self-identified "Discovery" as a strength during this customer interaction.';

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
      identifyCoachingSignal() {
        return includeCoaching
          ? {
              signalId: coachingSignalId,
              insight: coachingInsight,
              source: "coachingSignal",
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
        return { ...briefing, text: `${briefing.text} ${signal.insight}` };
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
    get learningAppendCount() {
      return learningAppendCount;
    },
    get coachingAppendCount() {
      return coachingAppendCount;
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
  let buildCount = 0;
  const learningSignalId = "learning_runtime_signal";
  const coachingSignalId =
    "coaching_strength_runtime_report_interaction_rapport";
  const coachingInsight =
    'User self-identified "Rapport" as a strength during this customer interaction.';

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
      identifyCoachingSignal() {
        return activeSignal === "coaching"
          ? {
              signalId: coachingSignalId,
              insight: coachingInsight,
              source: "coachingSignal",
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
        return { ...briefing, text: `${briefing.text} ${signal.insight}` };
      },
    },
    communication,
  };

  return {
    learningSignalId,
    coachingSignalId,
    coachingInsight,
    get learningAppendCount() {
      return learningAppendCount;
    },
    get coachingAppendCount() {
      return coachingAppendCount;
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

  assert.equal(briefing.text, `Base briefing ${flow.coachingInsight}`);
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
  const first = briefingSystem.appendCoachingSignal(
    { text: "Base briefing" },
    { insight },
  );
  const second = briefingSystem.appendCoachingSignal(first, { insight });

  assert.equal(first.text, `Base briefing ${insight}`);
  assert.equal(second, first);
  assert.doesNotMatch(first.text, /demonstrated|verified|proven/i);
});

test("combined briefing order is base then learning then coaching", async () => {
  const { core } = loadArchieCore();
  const flow = configureActiveSignalFlow(core);

  let briefing = await core.surfaceLearningSignals(flow.baseBriefing);
  briefing = await core.surfaceCoachingSignal(briefing);

  assert.equal(
    briefing.text,
    `Base briefing Learning insight ${flow.coachingInsight}`,
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
    surfacedIds.has(`coaching:${flow.coachingSignalId}`),
    true,
  );

  await core.refreshSession({ deliver: true });

  assert.equal(flow.coachingAppendCount, 1);
  assert.equal(target.textContent, "Base briefing 2");
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
