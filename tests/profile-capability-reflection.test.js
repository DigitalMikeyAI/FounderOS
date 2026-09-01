const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const sources = {};
for (const relativePath of [
  "systems/reflection.system.js",
  "systems/workshop.system.js",
  "js/core/archie-core.js",
]) {
  sources[relativePath] = fs.readFileSync(
    path.resolve(__dirname, "..", relativePath),
    "utf8",
  );
}
const controllerSource = fs.readFileSync(
  path.resolve(__dirname, "..", "js", "controllers", "workshop.controller.js"),
  "utf8",
);

function makeContext(overrides = {}) {
  return {
    capabilityId: "profile_capability_objection-handling",
    competency: "objection-handling",
    label: "Objection Handling",
    type: "developing-capability",
    adoptedWording: "Developing capability: Objection Handling",
    evidenceSupportState: "current",
    adoptedAt: "2026-08-27T12:00:00.000Z",
    ...overrides,
  };
}

function makeGuidance() {
  return {
    mission: "Discover Your Direction",
    objective: "Identify strengths",
    mode: "guided-workshop",
    explanation: "Existing guidance explanation.",
    questions: ["What did you do well?"],
    artifact: { type: "strength-profile", status: "not-started" },
    completionCriteria: ["One answer"],
  };
}

function createHarness(capabilityContext = []) {
  const savedArtifacts = [];
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date,
    Math,
    MemorySystem: {
      saveArtifact(artifact) {
        savedArtifacts.push(clone(artifact));
        return artifact;
      },
    },
  });
  for (const [relativePath, source] of Object.entries(sources)) {
    vm.runInContext(source, context, {
      filename: path.resolve(__dirname, "..", relativePath),
    });
  }
  vm.runInContext(
    ";globalThis.__api = { ReflectionSystem, WorkshopSystem, ArchieCore };",
    context,
  );
  const { ReflectionSystem, WorkshopSystem, ArchieCore } = context.__api;
  let contextReads = 0;
  ArchieCore.systems = {
    reflection: ReflectionSystem,
    commander: {
      getProfilePersonalizationContext() {
        contextReads += 1;
        return clone(capabilityContext);
      },
    },
    guidance: {
      build() {
        return makeGuidance();
      },
    },
  };
  return {
    ReflectionSystem,
    WorkshopSystem,
    ArchieCore,
    savedArtifacts,
    getContextReads: () => contextReads,
  };
}

test("no safe capability leaves the existing workshop lifecycle unchanged", async () => {
  const harness = createHarness();
  const guidance = await harness.ArchieCore.buildGuidance();
  assert.equal(harness.getContextReads(), 1);
  assert.equal(Object.hasOwn(guidance, "contextualReflectionPrompt"), false);
  assert.deepEqual(guidance.questions, makeGuidance().questions);
  const workshop = harness.WorkshopSystem.begin(guidance);
  assert.equal(workshop.contextualReflectionPrompt, null);
});

test("each support state produces its exact approved prompt", () => {
  const cases = [
    [
      "current",
      "You've chosen to recognize Objection Handling as a developing capability. Did today's interactions reinforce, challenge, or complicate that choice?",
    ],
    [
      "support-changed",
      "You've chosen to recognize Objection Handling as a developing capability, and the reviewed evidence supporting that Profile choice has changed. Did today's interactions reinforce, challenge, or complicate that choice?",
    ],
    [
      "insufficient-current-support",
      "You've chosen to recognize Objection Handling as a developing capability, though there is not currently enough reviewed evidence to reproduce the original recommendation. Did today's interactions reinforce, challenge, or complicate that choice?",
    ],
  ];
  for (const [evidenceSupportState, question] of cases) {
    const { ReflectionSystem } = createHarness();
    assert.deepEqual(
      clone(
        ReflectionSystem.buildProfileCapabilityReflectionPrompt(
          makeContext({ evidenceSupportState }),
        ),
      ),
      { question, purpose: "profile-capability-reflection" },
    );
  }
});

test("malformed or unsupported context produces no prompt", () => {
  const { ReflectionSystem } = createHarness();
  for (const value of [
    null,
    {},
    makeContext({ type: "strength" }),
    makeContext({ label: "" }),
    makeContext({ evidenceSupportState: "unknown" }),
  ]) {
    assert.equal(
      ReflectionSystem.buildProfileCapabilityReflectionPrompt(value),
      null,
    );
  }
});

test("orchestration selects only the first canonical context item", async () => {
  const first = makeContext();
  const second = makeContext({
    capabilityId: "profile_capability_trial-close",
    competency: "trial-close",
    label: "Trial Close",
  });
  const harness = createHarness([first, second]);
  const guidance = await harness.ArchieCore.buildGuidance();
  assert.equal(harness.getContextReads(), 1);
  assert.match(guidance.contextualReflectionPrompt.question, /Objection Handling/);
  assert.doesNotMatch(guidance.contextualReflectionPrompt.question, /Trial Close/);
  assert.deepEqual(guidance.questions, makeGuidance().questions);
  assert.equal(Object.hasOwn(guidance.contextualReflectionPrompt, "score"), false);
  assert.equal(Object.hasOwn(guidance.contextualReflectionPrompt, "confidence"), false);
});

test("generated prompt enters the existing generic contextual stage", async () => {
  const harness = createHarness([makeContext()]);
  const guidance = await harness.ArchieCore.buildGuidance();
  const workshop = harness.WorkshopSystem.begin(guidance);
  harness.WorkshopSystem.nextStage();
  harness.WorkshopSystem.answerQuestion("An ordinary answer.");
  harness.WorkshopSystem.nextStage();
  assert.equal(workshop.stage, "contextual-reflection");
  assert.deepEqual(
    clone(harness.WorkshopSystem.getCurrentContextualReflectionPrompt()),
    clone(guidance.contextualReflectionPrompt),
  );
});

test("dangerous keywords remain contextual and produce zero strength evidence", async () => {
  const harness = createHarness([makeContext()]);
  const profileBefore = clone(harness.ArchieCore.systems.commander);
  const guidance = await harness.ArchieCore.buildGuidance();
  const workshop = harness.WorkshopSystem.begin(guidance);
  harness.WorkshopSystem.nextStage();
  harness.WorkshopSystem.answerQuestion("An ordinary answer without matches.");
  harness.WorkshopSystem.nextStage();
  const answer =
    "Communication, teaching, learning, and building all felt important today.";
  const record = harness.WorkshopSystem.recordContextualReflection({
    ...guidance.contextualReflectionPrompt,
    answer,
  });
  assert.equal(record.answer, answer);
  assert.equal(record.question, guidance.contextualReflectionPrompt.question);
  assert.equal(record.purpose, "profile-capability-reflection");
  assert.equal(workshop.contextualReflections.length, 1);
  assert.equal(workshop.answers.length, 1);
  assert.doesNotMatch(JSON.stringify(workshop.answers), /Communication|teaching|learning|building/);

  harness.WorkshopSystem.nextStage();
  harness.WorkshopSystem.nextStage();
  harness.WorkshopSystem.nextStage();
  assert.equal(harness.savedArtifacts.length, 1);
  assert.deepEqual(harness.savedArtifacts[0].strengths, []);
  assert.deepEqual(harness.savedArtifacts[0].evidence, []);
  assert.doesNotMatch(JSON.stringify(harness.savedArtifacts[0]), /Communication|teaching|learning|building/);
  assert.deepEqual(clone(harness.ArchieCore.systems.commander), profileBefore);
});

test("the same keywords retain legacy evidence behavior in ordinary answers", () => {
  const { ReflectionSystem } = createHarness();
  const answer =
    "Communication, teaching, learning, and building all felt important today.";
  const artifact = ReflectionSystem.build({
    id: "ordinary-workshop",
    mission: "Mission",
    objective: "Objective",
    answers: [{ question: "What mattered?", answer }],
    contextualReflections: [],
  });
  assert.deepEqual(clone(artifact.strengths), [
    "Teaching",
    "Communication",
    "Building",
    "Learning Agility",
  ]);
});

test("one workshop accepts at most one capability reflection", async () => {
  const harness = createHarness([makeContext()]);
  const workshop = harness.WorkshopSystem.begin(
    await harness.ArchieCore.buildGuidance(),
  );
  harness.WorkshopSystem.nextStage();
  harness.WorkshopSystem.answerQuestion("Ordinary answer.");
  harness.WorkshopSystem.nextStage();
  const prompt = harness.WorkshopSystem.getCurrentContextualReflectionPrompt();
  const first = harness.WorkshopSystem.recordContextualReflection({
    ...prompt,
    answer: "First reflection.",
  });
  const repeated = harness.WorkshopSystem.recordContextualReflection({
    ...prompt,
    answer: "Second reflection.",
  });
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.answer, "First reflection.");
  assert.equal(workshop.contextualReflections.length, 1);
});

test("integration reads no raw Profile and adds no downstream dependency", () => {
  const integrationSource =
    sources["systems/reflection.system.js"] +
    sources["systems/workshop.system.js"] +
    sources["js/core/archie-core.js"].slice(
      sources["js/core/archie-core.js"].indexOf(
        "  buildProfileCapabilityReflectionPrompt() {",
      ),
      sources["js/core/archie-core.js"].indexOf(
        "getActionableProfileCapabilityCandidates()",
      ),
    );
  assert.doesNotMatch(integrationSource, /founder\.profile\.capabilities/);
  assert.doesNotMatch(
    integrationSource,
    /MissionIntelligenceSystem|BriefingSystem|CommunicationSystem|sessionStorage|localStorage/,
  );
  assert.doesNotMatch(
    controllerSource,
    /profile-capability|developing capability|getProfilePersonalizationContext/i,
  );
});
