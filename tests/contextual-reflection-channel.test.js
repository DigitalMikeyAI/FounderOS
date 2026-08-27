const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const reflectionPath = path.resolve(__dirname, "..", "systems", "reflection.system.js");
const workshopPath = path.resolve(__dirname, "..", "systems", "workshop.system.js");
const controllerPath = path.resolve(
  __dirname,
  "..",
  "js",
  "controllers",
  "workshop.controller.js",
);
const reflectionSource = fs.readFileSync(reflectionPath, "utf8");
const workshopSource = fs.readFileSync(workshopPath, "utf8");
const controllerSource = fs.readFileSync(controllerPath, "utf8");

function createHarness() {
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
  vm.runInContext(reflectionSource, context, { filename: reflectionPath });
  vm.runInContext(workshopSource, context, { filename: workshopPath });
  vm.runInContext(
    ";globalThis.__api = { ReflectionSystem, WorkshopSystem };",
    context,
  );
  return { ...context.__api, savedArtifacts };
}

function makeGuidance() {
  return {
    mission: "Discover Your Direction",
    objective: "Identify strengths",
    mode: "guided-workshop",
    questions: ["What did you do well?"],
    artifact: { type: "strength-profile", status: "not-started" },
    completionCriteria: ["One answer"],
  };
}

const contextualPrompt = {
  question: "What context would you like to preserve?",
  purpose: "profile-capability-reflection",
};

test("ordinary workshops normalize the new channel to empty without changing answers", () => {
  const { WorkshopSystem } = createHarness();
  const workshop = WorkshopSystem.begin(makeGuidance());
  assert.deepEqual(clone(workshop.contextualReflections), []);
  assert.equal(workshop.contextualReflectionPrompt, null);
  WorkshopSystem.nextStage();
  WorkshopSystem.answerQuestion("Communication mattered today.");
  assert.equal(workshop.answers.length, 1);
  assert.deepEqual(clone(workshop.contextualReflections), []);

  delete workshop.contextualReflections;
  assert.deepEqual(clone(WorkshopSystem.getCurrentWorkshop().contextualReflections), []);
});

test("contextual write preserves its exact record and never enters ordinary answers", () => {
  const { WorkshopSystem } = createHarness();
  const workshop = WorkshopSystem.begin(makeGuidance(), contextualPrompt);
  WorkshopSystem.nextStage();
  WorkshopSystem.answerQuestion("An ordinary answer without matching terms.");
  WorkshopSystem.nextStage();
  const beforeAnswers = clone(workshop.answers);
  const record = WorkshopSystem.recordContextualReflection({
    ...contextualPrompt,
    answer: "I think communication and teaching were both important today.",
  });
  assert.match(record.id, /^contextual-reflection-\d+-[a-z0-9]+$/);
  assert.equal(record.question, contextualPrompt.question);
  assert.equal(record.answer, "I think communication and teaching were both important today.");
  assert.equal(record.purpose, contextualPrompt.purpose);
  assert.doesNotThrow(() => new Date(record.createdAt).toISOString());
  assert.deepEqual(clone(workshop.answers), beforeAnswers);
  assert.equal(workshop.contextualReflections.length, 1);
});

test("contextual reflection is bounded to one idempotent record", () => {
  const { WorkshopSystem } = createHarness();
  const workshop = WorkshopSystem.begin(makeGuidance(), contextualPrompt);
  WorkshopSystem.nextStage();
  WorkshopSystem.answerQuestion("Ordinary answer.");
  WorkshopSystem.nextStage();
  const first = WorkshopSystem.recordContextualReflection({
    ...contextualPrompt,
    answer: "First contextual answer.",
  });
  const repeated = WorkshopSystem.recordContextualReflection({
    ...contextualPrompt,
    answer: "Second contextual answer.",
  });
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.answer, first.answer);
  assert.equal(workshop.contextualReflections.length, 1);
});

test("malformed contextual input fails safely", () => {
  const { WorkshopSystem } = createHarness();
  const workshop = WorkshopSystem.begin(makeGuidance(), contextualPrompt);
  WorkshopSystem.nextStage();
  WorkshopSystem.answerQuestion("Ordinary answer.");
  WorkshopSystem.nextStage();
  for (const payload of [
    {},
    { ...contextualPrompt, answer: "" },
    { ...contextualPrompt, question: "Different", answer: "Answer" },
    { ...contextualPrompt, purpose: "inferred", answer: "Answer" },
  ]) {
    assert.equal(WorkshopSystem.recordContextualReflection(payload), null);
  }
  assert.deepEqual(clone(workshop.contextualReflections), []);
  assert.equal(workshop.answers.length, 1);
});

test("contextual strength keywords create no strength-profile evidence", () => {
  const phrases = [
    "communication",
    "learning",
    "building",
    "teaching",
    "Communication, learning, building, and teaching all mattered.",
  ];
  for (const answer of phrases) {
    const { ReflectionSystem } = createHarness();
    const artifact = ReflectionSystem.build({
      id: "workshop-context-only",
      mission: "Mission",
      objective: "Objective",
      answers: [],
      contextualReflections: [{ ...contextualPrompt, id: "context-1", answer }],
    });
    assert.deepEqual(clone(artifact.strengths), []);
    assert.deepEqual(clone(artifact.evidence), []);
    assert.equal(artifact.analyzedAnswerCount, 0);
  }
});

test("identical wording in an ordinary answer preserves legacy strength behavior", () => {
  const { ReflectionSystem } = createHarness();
  const question = "What mattered?";
  const answer = "I think communication and teaching were both important today.";
  const artifact = ReflectionSystem.build({
    id: "workshop-ordinary",
    mission: "Mission",
    objective: "Objective",
    answers: [{ question, answer }],
    contextualReflections: [{ ...contextualPrompt, id: "context-1", answer }],
  });
  assert.deepEqual(clone(artifact.strengths), ["Teaching", "Communication"]);
  assert.equal(artifact.analyzedAnswerCount, 1);
  assert.equal(artifact.evidence.length, 2);
  for (const evidence of artifact.evidence) {
    assert.deepEqual(clone(evidence.matches), [{ question, answer }]);
  }
});

test("contextual stage completes without changing artifact persistence", () => {
  const { WorkshopSystem, savedArtifacts } = createHarness();
  const workshop = WorkshopSystem.begin(makeGuidance(), contextualPrompt);
  WorkshopSystem.nextStage();
  WorkshopSystem.answerQuestion("Communication mattered today.");
  WorkshopSystem.nextStage();
  WorkshopSystem.recordContextualReflection({
    ...contextualPrompt,
    answer: "Teaching and building also mattered.",
  });
  WorkshopSystem.nextStage();
  WorkshopSystem.nextStage();
  const completed = WorkshopSystem.nextStage();
  assert.equal(completed.completed, true);
  assert.equal(completed.contextualReflections.length, 1);
  assert.equal(savedArtifacts.length, 1);
  assert.deepEqual(savedArtifacts[0].strengths, ["Communication"]);
  assert.equal(savedArtifacts[0].analyzedAnswerCount, 1);
  assert.doesNotMatch(JSON.stringify(savedArtifacts[0]), /Teaching and building/);
});

test("zero-context workshop retains its original stage and completion flow", () => {
  const { WorkshopSystem, savedArtifacts } = createHarness();
  const workshop = WorkshopSystem.begin(makeGuidance());
  WorkshopSystem.nextStage();
  WorkshopSystem.answerQuestion("No legacy keyword here.");
  WorkshopSystem.nextStage();
  assert.equal(workshop.stage, "reflection");
  WorkshopSystem.nextStage();
  WorkshopSystem.nextStage();
  assert.equal(workshop.completed, true);
  assert.equal(savedArtifacts.length, 1);
});

test("controller supports only a generic distinct contextual stage", () => {
  assert.match(controllerSource, /stage === "contextual-reflection"/);
  assert.match(controllerSource, /recordContextualReflection\(\{/);
  assert.match(controllerSource, /getCurrentContextualReflectionPrompt\(\)/);
  assert.doesNotMatch(
    controllerSource,
    /profile-capability|developing capability|getProfilePersonalizationContext/i,
  );
  const contextualBranch = controllerSource.slice(
    controllerSource.indexOf('if (workshop.stage === "contextual-reflection")', 9000),
  );
  assert.doesNotMatch(contextualBranch.slice(0, 1300), /answerQuestion\(/);
});

test("channel introduces no downstream authority or persistence dependencies", () => {
  const changedProduction = `${workshopSource}\n${controllerSource}`;
  assert.doesNotMatch(
    changedProduction,
    /MissionIntelligenceSystem|BriefingSystem|GuidanceSystem|CommunicationSystem|getProfilePersonalizationContext|localStorage|sessionStorage/,
  );
  assert.doesNotMatch(
    workshopSource,
    /score|confidence|E3|E4|profileCapabilityDecisions|coachingSignal|learningSignal/,
  );
});
