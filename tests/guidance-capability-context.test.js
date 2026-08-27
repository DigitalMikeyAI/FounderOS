const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const root = path.resolve(__dirname, "..");
const sources = {};
for (const relativePath of [
  "systems/domain-competency.contract.js",
  "systems/mission.system.js",
  "systems/guidance.system.js",
  "systems/workshop.system.js",
  "systems/mission-intelligence.system.js",
  "js/core/archie-core.js",
]) {
  sources[relativePath] = fs.readFileSync(path.join(root, relativePath), "utf8");
}

function loadApi() {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date,
    Math,
  });
  for (const [relativePath, source] of Object.entries(sources)) {
    vm.runInContext(source, context, { filename: path.join(root, relativePath) });
  }
  vm.runInContext(
    ";globalThis.__api = { GuidanceSystem, WorkshopSystem, MissionIntelligenceSystem, ArchieCore };",
    context,
  );
  return context.__api;
}

function buildGuidance(objectives = [structuredObjective()]) {
  return loadApi().GuidanceSystem.build({
    mission: {
      status: "active",
      title: "Discover Your Direction",
      objectives,
    },
  });
}

function structuredObjective(competency = "trial-close", domain = "camping.sales") {
  return {
    text: "Practice a structured sales objective",
    competencyRef: { domain, competency },
  };
}

function capability(overrides = {}) {
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

const expectedCopy = {
  current:
    "You've chosen to recognize Trial Close as a developing capability, and this guidance relates to that same competency.",
  "support-changed":
    "You've chosen to recognize Trial Close as a developing capability. This guidance relates to that same competency, though the reviewed evidence supporting your Profile choice has changed since adoption.",
  "insufficient-current-support":
    "You've chosen to recognize Trial Close as a developing capability. This guidance relates to that same competency, though there is not currently enough reviewed evidence to reproduce the original recommendation.",
};

test("exact camping.sales competency match adds truthful copy for every support state", () => {
  for (const [evidenceSupportState, copy] of Object.entries(expectedCopy)) {
    const { GuidanceSystem } = loadApi();
    const selected = buildGuidance();
    const personalized = GuidanceSystem.appendProfileCapabilityContext(selected, [
      capability({ evidenceSupportState }),
    ]);
    assert.equal(personalized.profileCapabilityContext, copy);
    assert.deepEqual(
      clone({ ...personalized, profileCapabilityContext: null }),
      clone(selected),
    );
  }
});

test("selection finishes before personalization and base Guidance never changes", async () => {
  const { ArchieCore } = loadApi();
  const selected = buildGuidance();
  const before = clone(selected);
  let selectionFinished = false;
  let contextReads = 0;
  ArchieCore.session = { mission: {} };
  ArchieCore.systems = {
    guidance: {
      build() {
        selectionFinished = true;
        return selected;
      },
      appendProfileCapabilityContext:
        loadApi().GuidanceSystem.appendProfileCapabilityContext,
    },
    commander: {
      getProfilePersonalizationContext() {
        assert.equal(selectionFinished, true);
        contextReads += 1;
        return [capability()];
      },
    },
  };
  const result = await ArchieCore.buildGuidance();
  assert.equal(contextReads, 1);
  assert.deepEqual(clone(selected), before);
  for (const field of [
    "objective",
    "explanation",
    "steps",
    "questions",
    "artifact",
    "completionCriteria",
    "competencyRef",
  ]) {
    assert.deepEqual(clone(result[field]), clone(before[field]));
  }
});

test("only exact canonical metadata matches; prose, labels, IDs, and other objectives do not", () => {
  const { GuidanceSystem } = loadApi();
  const cases = [
    { selected: buildGuidance(["Practice Trial Close"]), context: [capability()] },
    { selected: buildGuidance([structuredObjective("rapport")]), context: [capability()] },
    { selected: { ...buildGuidance(), competencyRef: null }, context: [capability()] },
    {
      selected: { ...buildGuidance(), competencyRef: { domain: "other", competency: "trial-close" } },
      context: [capability()],
    },
    { selected: buildGuidance(), context: [capability({ competency: "rapport", label: "Trial Close" })] },
    { selected: buildGuidance(), context: [capability({ competency: "rapport", capabilityId: "trial-close" })] },
    { selected: buildGuidance(), context: [capability({ competency: "closing" })] },
  ];
  for (const item of cases) {
    assert.equal(
      GuidanceSystem.appendProfileCapabilityContext(item.selected, item.context)
        .profileCapabilityContext,
      null,
    );
  }

  const nonSelected = buildGuidance([
    "Identify your strengths",
    structuredObjective(),
  ]);
  assert.equal(nonSelected.competencyRef, null);
  assert.equal(
    GuidanceSystem.appendProfileCapabilityContext(nonSelected, [capability()])
      .profileCapabilityContext,
    null,
  );
});

test("multiple capabilities preserve safe projection order and produce at most one annotation", () => {
  const { GuidanceSystem } = loadApi();
  const selected = buildGuidance();
  const personalized = GuidanceSystem.appendProfileCapabilityContext(selected, [
    capability({ competency: "rapport", label: "Rapport" }),
    capability({ label: "First Trial Close", evidenceSupportState: "support-changed" }),
    capability({ label: "Second Trial Close", evidenceSupportState: "current" }),
  ]);
  assert.match(personalized.profileCapabilityContext, /First Trial Close/);
  assert.match(personalized.profileCapabilityContext, /supporting your Profile choice has changed/);
  assert.doesNotMatch(personalized.profileCapabilityContext, /Second Trial Close/);
  assert.equal(
    personalized.profileCapabilityContext.match(/You've chosen/g).length,
    1,
  );
});

test("malformed, withdrawn-only, and unsupported safe context cannot annotate", () => {
  const { GuidanceSystem } = loadApi();
  const selected = buildGuidance();
  for (const context of [
    [],
    null,
    [{}],
    [capability({ type: "withdrawn-capability" })],
    [capability({ evidenceSupportState: "unknown" })],
    [capability({ label: "" })],
  ]) {
    assert.equal(
      GuidanceSystem.appendProfileCapabilityContext(selected, context)
        .profileCapabilityContext,
      null,
    );
  }
  assert.doesNotMatch(
    sources["systems/guidance.system.js"] + sources["js/core/archie-core.js"],
    /founder\.profile\.capabilities/,
  );
});

test("Workshop carries annotation only as Guidance metadata", () => {
  const { GuidanceSystem, WorkshopSystem } = loadApi();
  const selected = buildGuidance();
  const personalized = GuidanceSystem.appendProfileCapabilityContext(selected, [
    capability(),
  ]);
  const workshop = WorkshopSystem.begin(personalized);
  assert.equal(
    workshop.guidance.profileCapabilityContext,
    expectedCopy.current,
  );
  assert.deepEqual(clone(workshop.questions), clone(selected.questions));
  assert.deepEqual(clone(workshop.answers), []);
  assert.deepEqual(clone(workshop.contextualReflections), []);
  assert.deepEqual(clone(workshop.artifact), clone(selected.artifact));
  assert.equal(Object.hasOwn(workshop, "profileCapabilityContext"), false);
  assert.equal(Object.hasOwn(workshop.artifact, "profileCapabilityContext"), false);
});

test("Mission Intelligence output is identical with and without annotation", () => {
  const { GuidanceSystem, MissionIntelligenceSystem } = loadApi();
  const selected = buildGuidance();
  const personalized = GuidanceSystem.appendProfileCapabilityContext(selected, [
    capability(),
  ]);
  const missionContext = {
    title: "Discover Your Direction",
    description: "Explore direction.",
    objectives: [structuredObjective()],
  };
  assert.deepEqual(
    clone(MissionIntelligenceSystem.buildActiveMissionRecommendation(missionContext, selected)),
    clone(MissionIntelligenceSystem.buildActiveMissionRecommendation(missionContext, personalized)),
  );
  const session = { mission: { status: "active", ...missionContext } };
  assert.deepEqual(
    clone(MissionIntelligenceSystem.recommendToday(session, null, selected)),
    clone(MissionIntelligenceSystem.recommendToday(session, null, personalized)),
  );
  assert.doesNotMatch(sources["systems/mission-intelligence.system.js"], /profileCapabilityContext/);
});

test("copy remains identity framing and never becomes performance evidence", () => {
  for (const copy of Object.values(expectedCopy)) {
    assert.match(copy, /^You've chosen to recognize/);
    assert.doesNotMatch(copy, /proven|verified|mastered|you're strong|you're good|demonstrated performance/i);
  }
  const combined = sources["systems/guidance.system.js"];
  assert.doesNotMatch(combined, /coachingSignals|learningSignals|behavioralEvidence|profileCandidates/);
});

test("current legacy mission stays unpersonalized and rendering is optional", () => {
  const { GuidanceSystem } = loadApi();
  const missionSource = fs.readFileSync(path.join(root, "js", "missions.js"), "utf8");
  assert.match(missionSource, /objectives\s*=\s*\[\s*"Explore your interests"/);
  const guidance = buildGuidance([
    "Explore your interests",
    "Identify your strengths",
    "Choose your first direction",
  ]);
  assert.equal(guidance.competencyRef, null);
  assert.equal(guidance.profileCapabilityContext, null);
  assert.equal(
    GuidanceSystem.appendProfileCapabilityContext(guidance, [
      capability({ competency: "discovery", label: "Discovery" }),
    ]).profileCapabilityContext,
    null,
  );
  const controller = fs.readFileSync(
    path.join(root, "js", "controllers", "workshop.controller.js"),
    "utf8",
  );
  assert.match(controller, /workshop\.guidance\?\.profileCapabilityContext/);
  assert.match(controller, /\? `\$\{explanation\} \$\{profileCapabilityContext\}`\s*: explanation/);
});
