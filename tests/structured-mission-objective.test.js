const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadContracts() {
  const context = vm.createContext({ console: { log() {}, warn() {} } });
  for (const relativePath of [
    "systems/domain-competency.contract.js",
    "systems/mission.system.js",
    "systems/guidance.system.js",
  ]) {
    const file = path.resolve(__dirname, "..", relativePath);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  vm.runInContext(
    ";globalThis.__api = { DomainCompetencyContract, MissionSystem, GuidanceSystem };",
    context,
  );
  return context.__api;
}

function buildGuidance(objectives) {
  const { GuidanceSystem } = loadContracts();
  return GuidanceSystem.build({
    mission: {
      status: "active",
      title: "Discover Your Direction",
      objectives,
    },
  });
}

const trialCloseRef = {
  domain: "camping.sales",
  competency: "trial-close",
};

test("legacy strings validate and normalize without changing their value", () => {
  const { MissionSystem } = loadContracts();
  const objective = "Identify your strengths";
  assert.deepEqual(clone(MissionSystem.validateMissionObjective(objective)), {
    valid: true,
    objective,
  });
  assert.deepEqual(clone(MissionSystem.normalizeMissionObjective(objective)), {
    text: objective,
    competencyRef: null,
  });
  assert.equal(typeof objective, "string");
});

test("structured text-only objectives remain valid without inferred competency", () => {
  const { MissionSystem } = loadContracts();
  const objective = { text: "Practice Trial Close" };
  assert.deepEqual(clone(MissionSystem.normalizeMissionObjective(objective)), {
    text: objective.text,
    competencyRef: null,
  });
  assert.equal(Object.hasOwn(objective, "competencyRef"), false);
});

test("valid explicit references are accepted and defensively copied", () => {
  const { MissionSystem } = loadContracts();
  const objective = {
    text: "Practice an approved sales objective",
    competencyRef: { ...trialCloseRef },
  };
  const before = clone(objective);
  const normalized = MissionSystem.normalizeMissionObjective(objective);
  assert.deepEqual(clone(normalized), {
    text: objective.text,
    competencyRef: trialCloseRef,
  });
  assert.notEqual(normalized.competencyRef, objective.competencyRef);
  normalized.competencyRef.competency = "changed";
  assert.deepEqual(objective, before);
});

test("malformed and noncanonical references fail closed", () => {
  const { MissionSystem } = loadContracts();
  for (const competencyRef of [
    { domain: "generic-career", competency: "discovery" },
    { domain: "camping.sales", competency: "Trial Close" },
    { domain: "camping.sales", competency: "closing" },
    { competency: "trial-close" },
    { domain: "camping.sales" },
    null,
  ]) {
    const objective = { text: "Practice Trial Close", competencyRef };
    assert.equal(MissionSystem.validateMissionObjective(objective).valid, false);
    assert.equal(MissionSystem.normalizeMissionObjective(objective), null);
  }
  assert.equal(MissionSystem.normalizeMissionObjective("  "), null);
  assert.equal(MissionSystem.normalizeMissionObjective({ text: "" }), null);
});

test("legacy Discover Your Direction behavior remains unchanged", () => {
  const guidance = buildGuidance([
    "Explore your interests",
    "Identify your strengths",
    "Choose your first direction",
  ]);
  assert.equal(guidance.objective, "Identify your strengths");
  assert.equal(guidance.competencyRef, null);
  assert.deepEqual(clone(guidance.questions), [
    "What do people regularly ask you for help with?",
    "What tasks feel easier to you than they seem to others?",
    "When have you felt especially capable or useful?",
  ]);
  assert.equal(guidance.steps.length, 5);
  assert.equal(guidance.completionCriteria.length, 3);
});

test("mixed selection uses text only and preserves existing priority", () => {
  const guidance = buildGuidance([
    {
      text: "Practice an approved sales objective",
      competencyRef: trialCloseRef,
    },
    "Identify your strengths",
  ]);
  assert.equal(guidance.objective, "Identify your strengths");
  assert.equal(guidance.competencyRef, null);
});

test("selected structured objective exposes text and its declared ref", () => {
  const objective = {
    text: "Practice an approved sales objective",
    competencyRef: { ...trialCloseRef },
  };
  const guidance = buildGuidance([objective]);
  assert.equal(guidance.objective, objective.text);
  assert.deepEqual(clone(guidance.competencyRef), trialCloseRef);
  assert.notEqual(guidance.competencyRef, objective.competencyRef);
});

test("competency metadata never changes which objective wins", () => {
  const withoutRef = buildGuidance([
    { text: "First objective" },
    { text: "Second objective" },
  ]);
  const withRef = buildGuidance([
    { text: "First objective", competencyRef: trialCloseRef },
    { text: "Second objective" },
  ]);
  assert.equal(withoutRef.objective, "First objective");
  assert.equal(withRef.objective, "First objective");
  assert.deepEqual(clone(withoutRef.questions), clone(withRef.questions));
  assert.deepEqual(clone(withoutRef.steps), clone(withRef.steps));
  assert.deepEqual(
    clone(withoutRef.completionCriteria),
    clone(withRef.completionCriteria),
  );
});

test("mixed objectives survive JSON persistence without migration", () => {
  const legacy = "Legacy objective";
  const structured = {
    text: "Structured objective",
    competencyRef: trialCloseRef,
  };
  const reloaded = JSON.parse(
    JSON.stringify({ missionObjectives: [legacy, structured] }),
  );
  assert.equal(reloaded.missionObjectives[0], legacy);
  assert.deepEqual(reloaded.missionObjectives[1], structured);
});

test("render and browser load order support both objective shapes", () => {
  const missionUiSource = fs.readFileSync(
    path.resolve(__dirname, "..", "js", "missions.js"),
    "utf8",
  );
  assert.match(missionUiSource, /normalizeMissionObjective\(objective\)/);
  assert.match(missionUiSource, /\$\{normalizedObjective\.text\}/);

  for (const page of ["index.html", "missions.html"]) {
    const html = fs.readFileSync(path.resolve(__dirname, "..", page), "utf8");
    const contractIndex = html.indexOf("systems/domain-competency.contract.js");
    const missionIndex = html.indexOf("systems/mission.system.js");
    const consumerIndex = html.indexOf("js/missions.js");
    assert.ok(contractIndex >= 0 && contractIndex < missionIndex);
    assert.ok(missionIndex < consumerIndex);
  }
});

test("support adds no personalization or evidence authority", () => {
  const production = [
    "systems/mission.system.js",
    "systems/guidance.system.js",
    "js/missions.js",
  ]
    .map((relativePath) =>
      fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8"),
    )
    .join("\n");
  assert.doesNotMatch(
    production,
    /getProfilePersonalizationContext|profile\.capabilities|coachingSignal|learningSignal|identifyActiveBehavioralEvidence|identifyRecurringBehavioralPatterns|score|confidence|NLP/i,
  );
});

test("Mission Intelligence ignores Guidance competency metadata", () => {
  const context = vm.createContext({ console: { log() {}, warn() {} } });
  const file = path.resolve(
    __dirname,
    "..",
    "systems",
    "mission-intelligence.system.js",
  );
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  vm.runInContext(
    ";globalThis.__mi = MissionIntelligenceSystem;",
    context,
  );
  const missionContext = {
    title: "Discover Your Direction",
    description: "Explore your strengths.",
    objectives: ["Identify your strengths"],
  };
  const guidance = buildGuidance(["Identify your strengths"]);
  const withRef = { ...guidance, competencyRef: { ...trialCloseRef } };
  assert.deepEqual(
    clone(context.__mi.buildActiveMissionRecommendation(missionContext, guidance)),
    clone(context.__mi.buildActiveMissionRecommendation(missionContext, withRef)),
  );
});

test("Workshop carries competency metadata without adding it to evidence inputs", () => {
  const context = vm.createContext({ console: { log() {}, warn() {} } });
  const file = path.resolve(
    __dirname,
    "..",
    "systems",
    "workshop.system.js",
  );
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  vm.runInContext(
    ";globalThis.__workshop = WorkshopSystem;",
    context,
  );
  const guidance = buildGuidance([
    { text: "Structured objective", competencyRef: trialCloseRef },
  ]);
  const workshop = context.__workshop.begin(guidance);
  assert.deepEqual(clone(workshop.guidance.competencyRef), trialCloseRef);
  assert.deepEqual(clone(workshop.questions), clone(guidance.questions));
  assert.deepEqual(clone(workshop.answers), []);
  assert.equal(Object.hasOwn(workshop.artifact, "competencyRef"), false);
  assert.equal(Object.hasOwn(workshop, "competencyRef"), false);
});
