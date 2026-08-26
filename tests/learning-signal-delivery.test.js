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
      return type === "learning" && surfacedIds.has(signalId);
    },
    markSessionSignalSurfaced(type, signalId) {
      if (type !== "learning") {
        return false;
      }
      surfacedIds.add(signalId);
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
  const { core } = loadArchieCore({ surfacedIds: new Set(["learning_signal_a"]) });
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
  const surfacedIds = new Set(["learning_signal_a"]);
  const { core, markedIds } = loadArchieCore({ surfacedIds });
  const flow = configureLearningFlow(core, { signalId: "learning_signal_b" });

  await core.surfaceLearningSignals(flow.baseBriefing);
  await core.deliverBriefing();

  assert.equal(flow.appendCount, 1);
  assert.deepEqual(markedIds, ["learning_signal_b"]);
  assert.equal(surfacedIds.has("learning_signal_a"), true);
  assert.equal(surfacedIds.has("learning_signal_b"), true);
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
