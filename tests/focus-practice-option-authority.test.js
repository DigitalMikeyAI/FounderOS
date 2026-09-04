const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const systemPath = path.join(root, "systems", "mission-intelligence.system.js");
const systemSource = fs.readFileSync(systemPath, "utf8");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function loadIntelligence(overrides = {}) {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    ...overrides,
  });
  vm.runInContext(`${systemSource}\n;globalThis.__api = MissionIntelligenceSystem;`, context, {
    filename: systemPath,
  });
  return context.__api;
}

function makeFocus(competency = "discovery") {
  return {
    type: "development-focus",
    version: 1,
    domain: "camping.sales",
    competency,
    label: competency,
    observation: `Historical ${competency} observation.`,
    chosenAt: "2026-09-03T12:00:00.000Z",
    source: {
      basis: "confirmed-recurring-pattern",
      evidenceTier: "E4",
      patternId: `historical_pattern_${competency}`,
      patternVersionIdentity: `historical_version_${competency}`,
      patternReviewId: `historical_review_${competency}`,
    },
  };
}

function focusMethodSource() {
  const start = systemSource.indexOf("  buildFocusPracticeOption(");
  const end = systemSource.indexOf("\n  identifyLearningSignal(", start);
  return systemSource.slice(start, end);
}

function practiceRecommendationSource() {
  const start = systemSource.indexOf("  buildPracticeCandidates(");
  const end = systemSource.indexOf("\n  buildCoachingSynthesis(", start);
  return systemSource.slice(start, end);
}

function expectedOption(competency = "discovery") {
  return {
    type: "focus-practice-option",
    version: 1,
    domain: "camping.sales",
    competency,
    label: "Practice Customer Discovery",
    missionIntent: "practice-customer-discovery",
    source: { basis: "commander-development-focus" },
  };
}

function withoutGeneratedAt(recommendation) {
  const { generatedAt, ...stableRecommendation } = recommendation;
  return stableRecommendation;
}

test("historical saved focus projects without any current support input", () => {
  const system = loadIntelligence();
  assert.deepEqual(clone(system.buildFocusPracticeOption(makeFocus())), expectedOption());
});

test("support states cannot alter a historical focus projection", () => {
  const system = loadIntelligence();
  const focus = makeFocus();
  const results = [
    { state: "exact-source-present" },
    { state: "exact-source-not-present" },
    { state: "unavailable" },
  ].map(() => clone(system.buildFocusPracticeOption(focus)));
  assert.deepEqual(results, [expectedOption(), expectedOption(), expectedOption()]);
});

test("focus projection never calls development-focus support", () => {
  const system = loadIntelligence();
  let calls = 0;
  system.buildDevelopmentFocusSupport = () => {
    calls += 1;
    throw new Error("support must not be consulted");
  };
  assert.deepEqual(clone(system.buildFocusPracticeOption(makeFocus())), expectedOption());
  assert.equal(calls, 0);
});

test("focus projection is isolated from Phase 7 recommendation collaborators", () => {
  const system = loadIntelligence();
  const prohibited = [
    "recommendPractice",
    "buildPracticeCandidates",
    "rotatePracticeCandidate",
  ];
  for (const name of prohibited) {
    system[name] = () => {
      throw new Error(`${name} must not be called`);
    };
  }
  assert.deepEqual(clone(system.buildFocusPracticeOption(makeFocus())), expectedOption());
});

test("focus projection is isolated from E3, E4, and synthesis collaborators", () => {
  const system = loadIntelligence();
  const prohibited = [
    "identifyBehavioralEvidence",
    "identifyRecurringBehavioralPatterns",
    "buildCoachingSynthesis",
    "buildDevelopmentFocusOptions",
  ];
  for (const name of prohibited) {
    system[name] = () => {
      throw new Error(`${name} must not be called`);
    };
  }
  assert.deepEqual(clone(system.buildFocusPracticeOption(makeFocus())), expectedOption());
});

test("focus projection has no raw Field Report or recommendation-history dependency", () => {
  const method = focusMethodSource();
  assert.doesNotMatch(
    method,
    /fieldReports|behavioralEvidenceReview|behavioralPatternReview|archivedMissions|practiceRecommendation|commandLog/i,
  );
});

test("mission history, archive state, XP, Profile, and daily next focus cannot change projection", () => {
  const founder = {
    archivedMissions: [{ title: "Practice a Trial Close", completedAt: "2099-01-01" }],
    missionStatus: "active",
    missionGoal: "An unrelated goal",
    xp: 999999,
    profile: { capabilities: ["trial-close"] },
    dailyCore: { nextFocus: "unrelated" },
  };
  const before = clone(founder);
  const system = loadIntelligence({ founder });
  const first = clone(system.buildFocusPracticeOption(makeFocus()));
  founder.archivedMissions.push({ title: "Practice Customer Discovery", completedAt: "2000-01-01" });
  founder.xp = 0;
  founder.profile.capabilities = [];
  founder.dailyCore.nextFocus = "changed";
  const second = clone(system.buildFocusPracticeOption(makeFocus()));
  assert.deepEqual(first, expectedOption());
  assert.deepEqual(second, expectedOption());
  assert.equal(before.missionStatus, founder.missionStatus);
});

test("mission state, completion, counts, and recency terms are absent from the projection path", () => {
  assert.doesNotMatch(
    focusMethodSource(),
    /missionStatus|missionGoal|completion|completed|archived|\bxp\b|Profile|profile|dailyCore|nextFocus|count|recency|\.sort\(/i,
  );
});

test("focus projection requires no MemorySystem reads or writes", () => {
  let reads = 0;
  let writes = 0;
  const system = loadIntelligence({
    MemorySystem: {
      getArtifact() { reads += 1; throw new Error("must not read memory"); },
      saveArtifact() { writes += 1; throw new Error("must not write memory"); },
    },
  });
  assert.deepEqual(clone(system.buildFocusPracticeOption(makeFocus())), expectedOption());
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test("focus projection never accesses browser persistence or saveFounder", () => {
  let saves = 0;
  const storage = new Proxy({}, { get() { throw new Error("must not access storage"); } });
  const system = loadIntelligence({
    localStorage: storage,
    sessionStorage: storage,
    saveFounder() { saves += 1; throw new Error("must not save founder"); },
  });
  assert.deepEqual(clone(system.buildFocusPracticeOption(makeFocus())), expectedOption());
  assert.equal(saves, 0);
});

test("repeated projections leave focus and founder mission authority untouched", () => {
  const focus = makeFocus();
  const founder = {
    pendingMissionRequest: { intent: "existing-request" },
    missionGoal: "Existing goal",
    missionStatus: "active",
  };
  const focusBefore = clone(focus);
  const founderBefore = clone(founder);
  const system = loadIntelligence({ founder });
  assert.deepEqual(clone(system.buildFocusPracticeOption(focus)), expectedOption());
  assert.deepEqual(clone(system.buildFocusPracticeOption(focus)), expectedOption());
  assert.deepEqual(focus, focusBefore);
  assert.deepEqual(founder, founderBefore);
});

test("projection output is the exact seven-field neutral contract", () => {
  const option = clone(loadIntelligence().buildFocusPracticeOption(makeFocus()));
  assert.deepEqual(Object.keys(option), [
    "type", "version", "domain", "competency", "label", "missionIntent", "source",
  ]);
  assert.deepEqual(option.source, { basis: "commander-development-focus" });
});

test("projection serialization contains no recommendation, evidence, or authority claims", () => {
  const serialized = JSON.stringify(loadIntelligence().buildFocusPracticeOption(makeFocus()));
  for (const key of [
    "recommendation", "recommended", "best", "need", "needed", "priority", "score",
    "rank", "confidence", "weakness", "mastery", "urgency", "support", "current",
    "evidence", "evidenceTier", "patternId", "patternVersionIdentity", "patternReviewId",
    "chosenAt", "generatedAt", "selected", "active", "pending", "missionStatus",
    "missionGoal", "history", "recency", "count",
  ]) {
    assert.equal(serialized.includes(`\"${key}\"`), false, `${key} must be absent`);
  }
});

test("projection only reads saved focus validity and the pre-authored practice definition", () => {
  assert.doesNotMatch(
    focusMethodSource(),
    /recommendPractice|buildPracticeCandidates|rotatePracticeCandidate|buildDevelopmentFocusSupport|identifyBehavioralEvidence|identifyRecurringBehavioralPatterns|buildCoachingSynthesis|buildDevelopmentFocusOptions/i,
  );
  assert.match(focusMethodSource(), /getCampingSalesPracticeDefinition/);
});

test("Phase 7 candidate, rotation, and recommendation paths do not depend on Development Focus", () => {
  assert.doesNotMatch(practiceRecommendationSource(), /developmentFocus|DevelopmentFocus/i);
});

test("Phase 7 recommendation output is unchanged by an unrelated saved focus object", () => {
  const system = loadIntelligence();
  const report = {
    id: "report-discovery",
    date: "2026-09-01",
    createdAt: "2026-09-01T09:00:00.000Z",
    customerInteractions: [{
      id: "interaction-discovery",
      createdAt: "2026-09-01T10:00:00.000Z",
      salesStepOutcomes: [{ id: "outcome-discovery", step: "discovery", performedBy: "commander", result: "customer-shared-needs-goals" }],
    }],
  };
  const evidence = system.identifyBehavioralEvidence([report])[0];
  const review = {
    id: "review-discovery", evidenceId: evidence.evidenceId, sourceRef: clone(evidence.sourceRef),
    outcomeEntryId: "outcome-discovery", sourceFingerprint: evidence.sourceFingerprint,
    status: "confirmed-as-recorded", correctedCompetency: null, note: null,
    reviewedAt: "2026-09-01T12:00:00.000Z",
  };
  const before = withoutGeneratedAt(
    clone(system.recommendPractice([report], { reviews: [review] })),
  );
  system.buildFocusPracticeOption(makeFocus("trial-close"));
  const after = withoutGeneratedAt(
    clone(system.recommendPractice([report], { reviews: [review] })),
  );
  assert.deepEqual(after, before);
});

test("focus projection cannot invoke mission selector, preview, generation, or activation hooks", () => {
  const system = loadIntelligence();
  for (const name of ["generateMission", "previewMission", "activateMission", "selectMission"]) {
    system[name] = () => { throw new Error(`${name} must not be called`); };
  }
  assert.deepEqual(clone(system.buildFocusPracticeOption(makeFocus())), expectedOption());
});

test("mission request and lifecycle authority terms are absent from the projection implementation", () => {
  assert.doesNotMatch(
    focusMethodSource(),
    /pendingMissionRequest|generateMission|preview|activate|select.*Mission|missionStatus|missionGoal/i,
  );
});

test("all six saved-focus competencies remain neutral projections, not ranked choices", () => {
  const system = loadIntelligence();
  const competencies = ["rapport", "discovery", "product-selection", "presentation", "objection-handling", "trial-close"];
  const options = competencies.map((competency) => clone(system.buildFocusPracticeOption(makeFocus(competency))));
  assert.deepEqual(options.map((option) => option.competency), competencies);
  for (const option of options) assert.equal(Object.hasOwn(option, "rank"), false);
});