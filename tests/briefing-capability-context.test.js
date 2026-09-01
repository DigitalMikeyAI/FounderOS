const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const briefingPath = path.resolve(__dirname, "..", "systems", "briefing.system.js");
const corePath = path.resolve(__dirname, "..", "js", "core", "archie-core.js");
const briefingSource = fs.readFileSync(briefingPath, "utf8");
const coreSource = fs.readFileSync(corePath, "utf8");

function loadSystems() {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(briefingSource, context, { filename: briefingPath });
  vm.runInContext(coreSource, context, { filename: corePath });
  vm.runInContext(
    ";globalThis.__api = { BriefingSystem, ArchieCore };",
    context,
  );
  return context.__api;
}

function makeCapability(overrides = {}) {
  return {
    capabilityId: "profile_capability_trial-close",
    competency: "trial-close",
    label: "Trial Close",
    type: "developing-capability",
    adoptedWording: "Developing capability: Trial Close",
    evidenceSupportState: "current",
    adoptedAt: "2026-08-27T12:00:00.000Z",
    ...overrides,
  };
}

test("no capability or unrelated competency leaves briefing unchanged", () => {
  const { BriefingSystem } = loadSystems();
  const briefing = { text: "Selected Trial Close coaching." };
  assert.equal(
    BriefingSystem.appendProfileCapabilityContext(briefing, "trial-close", []),
    briefing,
  );
  assert.equal(
    BriefingSystem.appendProfileCapabilityContext(briefing, "trial-close", [
      makeCapability({
        capabilityId: "profile_capability_objection-handling",
        competency: "objection-handling",
        label: "Trial Close",
      }),
    ]),
    briefing,
  );
});

test("relevance uses exact competency only without label prose or ID inference", () => {
  const { BriefingSystem } = loadSystems();
  const briefing = {
    text: "The prose and signal coaching_strength_trial-close both mention Trial Close.",
  };
  const result = BriefingSystem.appendProfileCapabilityContext(
    briefing,
    "objection-handling",
    [makeCapability()],
  );
  assert.equal(result, briefing);
});

test("all support states append their exact subordinate sentence", () => {
  const { BriefingSystem } = loadSystems();
  const cases = [
    [
      "current",
      "You've chosen to recognize Trial Close as a developing capability, and the current reviewed evidence still supports the version you adopted.",
    ],
    [
      "support-changed",
      "You've chosen to recognize Trial Close as a developing capability. The reviewed evidence supporting that Profile choice has changed since adoption.",
    ],
    [
      "insufficient-current-support",
      "You've chosen to recognize Trial Close as a developing capability, though there is not currently enough reviewed evidence to reproduce the original recommendation.",
    ],
  ];
  for (const [evidenceSupportState, sentence] of cases) {
    const base = { text: "Selected coaching insight. Selected follow-up." };
    const result = BriefingSystem.appendProfileCapabilityContext(
      base,
      "trial-close",
      [makeCapability({ evidenceSupportState })],
    );
    assert.equal(result.text, `${base.text} ${sentence}`);
    assert.ok(result.text.indexOf(sentence) > result.text.indexOf("Selected follow-up."));
  }
});

test("annotation is deterministic, at most one, and exact-content deduped", () => {
  const { BriefingSystem } = loadSystems();
  const base = { text: "Selected coaching insight." };
  const capabilities = [
    makeCapability(),
    makeCapability({
      capabilityId: "profile_capability_trial-close-second",
      label: "Different Label",
    }),
  ];
  const first = BriefingSystem.appendProfileCapabilityContext(
    base,
    "trial-close",
    capabilities,
  );
  const second = BriefingSystem.appendProfileCapabilityContext(
    first,
    "trial-close",
    capabilities,
  );
  assert.equal(second.text, first.text);
  assert.equal(second.text.match(/You've chosen to recognize/g).length, 1);
  assert.doesNotMatch(second.text, /Different Label/);
});

test("malformed context and unsupported states fail closed", () => {
  const { BriefingSystem } = loadSystems();
  const briefing = { text: "Selected coaching insight." };
  for (const capabilities of [
    null,
    [{}],
    [makeCapability({ type: "strength" })],
    [makeCapability({ label: "" })],
    [makeCapability({ evidenceSupportState: "unknown" })],
  ]) {
    assert.equal(
      BriefingSystem.appendProfileCapabilityContext(
        briefing,
        "trial-close",
        capabilities,
      ),
      briefing,
    );
  }
});

function createCoachingHarness({ capabilityContext = [], tier = "e3" } = {}) {
  const { BriefingSystem, ArchieCore } = loadSystems();
  const reports = [{ id: "report-a" }];
  const selections = [];
  const e3 = {
    activeIdentity: "active-e3-trial-close",
    competency: "trial-close",
    insight: "Selected E3 insight.",
    followUpPrompt: "Selected E3 follow-up.",
    sourceRef: { artifactId: "report-a", subType: "customerInteraction", subId: "interaction-a" },
  };
  const e2 = {
    summaryId: "repeated_self_assessment_trial-close",
    strength: "trial-close",
    insight: "Selected E2 insight.",
    followUpPrompt: "Selected E2 follow-up.",
    interactionCount: 2,
    occurrences: [],
  };
  const e1 = {
    signalId: "coaching-e1",
    insight: "Selected E1 insight.",
    followUpPrompt: "Selected E1 follow-up.",
  };
  const missionIntelligence = {
    identifyActiveBehavioralEvidence() {
      selections.push("e3");
      return tier === "e3" ? clone(e3) : null;
    },
    identifyActiveRepeatedSelfAssessment() {
      selections.push("e2");
      return tier === "e2" ? clone(e2) : null;
    },
    identifyCoachingSignal() {
      selections.push("e1");
      return tier === "e1" ? clone(e1) : null;
    },
    identifyLinkedCoachingSignalIds() {
      return [];
    },
  };
  ArchieCore.systems = {
    briefing: BriefingSystem,
    commander: {
      getProfilePersonalizationContext() {
        return clone(capabilityContext);
      },
    },
    memory: {
      getArtifact(name) {
        if (name === "camping.fieldReports") return { reports };
        return { reviews: [] };
      },
    },
    missionIntelligence,
  };
  ArchieCore.session = { briefing: null };
  return { ArchieCore, selections };
}

test("capability annotates selected E3 only after E3 selection", async () => {
  const without = createCoachingHarness({ tier: "e3" });
  const base = { text: "Base briefing." };
  const withoutResult = await without.ArchieCore.surfaceCoachingSignal(base);
  const withCapability = createCoachingHarness({
    tier: "e3",
    capabilityContext: [makeCapability()],
  });
  const result = await withCapability.ArchieCore.surfaceCoachingSignal(base);
  assert.deepEqual(withCapability.selections, without.selections);
  assert.deepEqual(withCapability.selections, ["e3"]);
  assert.match(withoutResult.text, /Selected E3 insight.*Selected E3 follow-up/);
  assert.match(result.text, /Selected E3 insight.*Selected E3 follow-up.*You've chosen/);
});

test("capability annotates selected E2 without changing E3 to E2 to E1 priority", async () => {
  const harness = createCoachingHarness({
    tier: "e2",
    capabilityContext: [makeCapability()],
  });
  const result = await harness.ArchieCore.surfaceCoachingSignal({ text: "Base." });
  assert.deepEqual(harness.selections, ["e3", "e2"]);
  assert.match(result.text, /Selected E2 insight.*Selected E2 follow-up.*You've chosen/);
  assert.doesNotMatch(result.text, /Selected E1|Selected E3/);
});

test("E1 remains unchanged because its projection exposes no canonical competency", async () => {
  const harness = createCoachingHarness({
    tier: "e1",
    capabilityContext: [makeCapability()],
  });
  const result = await harness.ArchieCore.surfaceCoachingSignal({ text: "Base." });
  assert.deepEqual(harness.selections, ["e3", "e2", "e1"]);
  assert.match(result.text, /Selected E1 insight.*Selected E1 follow-up/);
  assert.doesNotMatch(result.text, /You've chosen/);
});

test("learning path remains unchanged and does not request capability context", async () => {
  const { BriefingSystem, ArchieCore } = loadSystems();
  let contextReads = 0;
  ArchieCore.systems = {
    briefing: BriefingSystem,
    commander: {
      getProfilePersonalizationContext() {
        contextReads += 1;
        return [makeCapability()];
      },
    },
    memory: {
      getArtifact() {
        return { reports: [{ id: "report-a" }] };
      },
    },
    missionIntelligence: {
      identifyLearningSignal() {
        return { signalId: "learning-a", insight: "Selected learning insight." };
      },
    },
  };
  ArchieCore.session = { briefing: null };
  const result = await ArchieCore.surfaceLearningSignals({ text: "Base." });
  assert.equal(result.text, "Base. Selected learning insight.");
  assert.equal(contextReads, 0);
});

test("briefing personalization is read-only and adds no downstream dependency", () => {
  const { BriefingSystem } = loadSystems();
  const capability = makeCapability();
  const before = clone(capability);
  BriefingSystem.appendProfileCapabilityContext(
    { text: "Selected coaching." },
    "trial-close",
    [capability],
  );
  assert.deepEqual(capability, before);

  const changedSource = `${briefingSource}\n${coreSource.slice(
    coreSource.indexOf("  appendSelectedProfileCapabilityContext("),
    coreSource.indexOf("  buildProfileCapabilityReflectionPrompt()"),
  )}`;
  assert.doesNotMatch(
    changedSource,
    /MissionIntelligenceSystem|CommunicationSystem|ReflectionSystem|GuidanceSystem|localStorage|sessionStorage|profileCapabilityDecisions/,
  );
});
