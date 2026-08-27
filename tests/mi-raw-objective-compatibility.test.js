const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSystems() {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
  });
  for (const relativePath of [
    "systems/domain-competency.contract.js",
    "systems/mission.system.js",
    "systems/mission-intelligence.system.js",
    "systems/briefing.system.js",
  ]) {
    const file = path.join(root, relativePath);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  vm.runInContext(
    ";globalThis.__api = { MissionSystem, MissionIntelligenceSystem, BriefingSystem };",
    context,
  );
  return context.__api;
}

function missionContext(objectives) {
  return {
    title: "Discover Your Direction",
    description: "Explore your strengths.",
    objectives,
  };
}

function recommendation(objectives, guidance = null) {
  const { MissionIntelligenceSystem } = loadSystems();
  return MissionIntelligenceSystem.buildActiveMissionRecommendation(
    missionContext(objectives),
    guidance,
  );
}

const trialCloseRef = {
  domain: "camping.sales",
  competency: "trial-close",
};

test("legacy string fallback remains value-equivalent", () => {
  const result = recommendation(["Identify your strengths"]);
  assert.equal(result.nextAction, "Identify your strengths");
  assert.deepEqual(clone(result.confidence), {
    level: "high",
    reason:
      "An active mission is confirmed and a meaningful next action is available.",
  });
  assert.match(result.whyThisActionMatters, /Understanding your strengths/);
  assert.equal(Object.hasOwn(result, "priority"), false);
});

test("structured text-only objective produces the same recommendation semantics", () => {
  const legacy = recommendation(["Identify your strengths"]);
  const structured = recommendation([{ text: "Identify your strengths" }]);
  assert.deepEqual(clone(structured), clone(legacy));
});

test("structured canonical objective exposes text only as nextAction", () => {
  const result = recommendation([
    {
      text: "Practice an approved sales objective",
      competencyRef: trialCloseRef,
    },
  ]);
  assert.equal(result.nextAction, "Practice an approved sales objective");
  assert.equal(typeof result.nextAction, "string");
  assert.doesNotMatch(JSON.stringify(result), /\[object Object\]/);
  assert.doesNotMatch(JSON.stringify(result), /trial-close|camping\.sales/);
});

test("invalid entries are skipped and first valid normalized text wins", () => {
  const invalidEntries = [
    null,
    {},
    { text: "" },
    {
      text: "Invalid casing",
      competencyRef: {
        domain: "camping.sales",
        competency: "Trial Close",
      },
    },
    {
      text: "Unknown domain",
      competencyRef: {
        domain: "unknown",
        competency: "trial-close",
      },
    },
  ];
  const result = recommendation([
    ...invalidEntries,
    { text: "Valid structured objective" },
  ]);
  assert.equal(result.nextAction, "Valid structured objective");
});

test("all invalid objectives retain safe low-confidence no-action fallback", () => {
  const result = recommendation([
    null,
    {},
    { text: "" },
    {
      text: "Invalid reference",
      competencyRef: { domain: "camping.sales", competency: "Trial Close" },
    },
  ]);
  assert.equal(result.nextAction, null);
  assert.equal(result.confidence.level, "low");
  assert.equal(result.whyThisActionMatters, null);
});

test("mixed valid objectives preserve source order without metadata ranking", () => {
  const result = recommendation([
    "Legacy objective",
    {
      text: "Structured objective",
      competencyRef: trialCloseRef,
    },
  ]);
  assert.equal(result.nextAction, "Legacy objective");
});

test("strength rule reads normalized text and ignores competency metadata", () => {
  const withoutRef = recommendation([{ text: "Identify your strengths" }]);
  const withRef = recommendation([
    { text: "Identify your strengths", competencyRef: trialCloseRef },
  ]);
  assert.equal(
    withRef.whyThisActionMatters,
    withoutRef.whyThisActionMatters,
  );
  assert.deepEqual(clone(withRef.confidence), clone(withoutRef.confidence));

  const metadataOnly = recommendation([
    {
      text: "Practice a sales objective",
      competencyRef: { domain: "camping.sales", competency: "trial-close" },
    },
  ]);
  assert.equal(metadataOnly.whyThisActionMatters, null);
});

test("equivalent text with different canonical references stays identical", () => {
  const rapport = recommendation([
    {
      text: "Practice the same objective",
      competencyRef: { domain: "camping.sales", competency: "rapport" },
    },
  ]);
  const trialClose = recommendation([
    {
      text: "Practice the same objective",
      competencyRef: trialCloseRef,
    },
  ]);
  assert.deepEqual(clone(rapport), clone(trialClose));
});

test("competency metadata leaves complete Mission Intelligence orchestration unchanged", () => {
  const { MissionIntelligenceSystem } = loadSystems();
  const sessionFor = (objective) => ({
    mission: {
      status: "active",
      title: "Discover Your Direction",
      description: "Explore your strengths.",
      objectives: [objective],
    },
  });
  const textOnly = MissionIntelligenceSystem.recommendToday(
    sessionFor({ text: "Practice the same objective" }),
    null,
    null,
  );
  const withRef = MissionIntelligenceSystem.recommendToday(
    sessionFor({
      text: "Practice the same objective",
      competencyRef: trialCloseRef,
    }),
    null,
    null,
  );
  assert.deepEqual(clone(withRef), clone(textOnly));
  assert.equal(withRef.blockerObservation, null);
  assert.equal(withRef.missionPlan, null);
  assert.equal(Object.hasOwn(withRef, "priority"), false);
});

test("Guidance-driven recommendation remains authoritative and unchanged", () => {
  const guidance = {
    mission: "Discover Your Direction",
    objective: "Guidance objective",
    steps: ["Existing Guidance step"],
  };
  const legacy = recommendation(["Legacy raw fallback"], guidance);
  const structured = recommendation([
    { text: "Structured raw fallback", competencyRef: trialCloseRef },
  ], guidance);
  assert.equal(legacy.nextAction, "Existing Guidance step");
  assert.equal(structured.nextAction, "Existing Guidance step");
  assert.deepEqual(clone(structured.confidence), clone(legacy.confidence));
});

test("Briefing appends the repaired structured fallback without code changes", () => {
  const { BriefingSystem } = loadSystems();
  const result = recommendation([
    {
      text: "Practice an approved sales objective",
      competencyRef: trialCloseRef,
    },
  ]);
  const briefing = { text: "Commander, your mission is active." };
  const appended = BriefingSystem.appendRecommendation(briefing, result);
  assert.equal(
    appended.text,
    "Commander, your mission is active. Your next step: Practice an approved sales objective.",
  );
  const briefingDiff = require("node:child_process").spawnSync(
    "git",
    ["diff", "--exit-code", "--", "systems/briefing.system.js"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(briefingDiff.status, 0);
});

test("normalization boundary consumes text only and adds no authority dependencies", () => {
  const source = fs.readFileSync(
    path.join(root, "systems", "mission-intelligence.system.js"),
    "utf8",
  );
  const start = source.indexOf("  buildActiveMissionRecommendation(");
  const end = source.indexOf("  // NO ACTIVE MISSION RECOMMENDATION", start);
  const boundary = source.slice(start, end);
  assert.match(boundary, /MissionSystem\.normalizeMissionObjective\(objective\)/);
  assert.match(boundary, /normalizedObjectives\[0\]\.text/);
  assert.doesNotMatch(boundary, /normalizedObjectives\[[^\]]+\]\.competencyRef/);
  assert.doesNotMatch(
    boundary,
    /Profile|coaching|learningSignal|behavioralEvidence|confidenceScore|NLP/i,
  );
});
