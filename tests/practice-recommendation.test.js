const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadIntelligence() {
  const source = fs.readFileSync(
    path.join(root, "systems/mission-intelligence.system.js"),
    "utf8",
  );
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(
    `${source}\n;globalThis.__api = MissionIntelligenceSystem;`,
    context,
  );
  return context.__api;
}

function makeReport(competency, suffix = competency) {
  const outcome = {
    id: `outcome-${suffix}`,
    step: competency,
    performedBy: "commander",
  };
  const interaction = {
    id: `interaction-${suffix}`,
    createdAt: "2026-09-01T10:00:00.000Z",
    salesStepOutcomes: [outcome],
  };

  if (competency === "rapport") {
    outcome.action = "referenced-back-to-customer-context";
    outcome.customerContextRef = {
      type: "customer-context-category",
      category: "destination",
    };
  } else if (competency === "discovery") {
    outcome.result = "customer-shared-needs-goals";
  } else if (competency === "product-selection") {
    interaction.keyNeeds = ["sleeping space"];
    outcome.result = "customer-considered-selected-unit";
    outcome.needRef = { field: "keyNeeds", index: 0 };
    outcome.selectedUnitRef = { type: "unit-reference", value: "Travel Trailer" };
  } else if (competency === "presentation") {
    interaction.keyNeeds = ["sleeping space"];
    outcome.result = "customer-requested-more-detail";
    outcome.needRef = { field: "keyNeeds", index: 0 };
    outcome.selectedUnitRef = { type: "unit-reference", value: "Travel Trailer" };
    outcome.presentationRef = {
      type: "feature-benefit-reference",
      value: "Bunkhouse layout",
    };
  } else if (competency === "objection-handling") {
    interaction.objections = ["price"];
    outcome.result = "customer-concern-resolved";
  } else if (competency === "trial-close") {
    outcome.result = "customer-expressed-readiness-to-proceed";
  }

  return {
    id: `report-${suffix}`,
    date: "2026-09-01",
    createdAt: "2026-09-01T09:00:00.000Z",
    customerInteractions: [interaction],
    learningSignals: [{ id: "learning-keep", learning: "keep" }],
    coachingSignals: [{ id: "coaching-keep", signal: "keep" }],
  };
}

function makeReview(system, report, reviewedAt, overrides = {}) {
  const evidence = system.identifyBehavioralEvidence([report])[0];
  const outcomeEntryId = evidence.evidenceRefs.find(
    (ref) => ref.field === "salesStepOutcomes",
  ).entryId;
  return {
    id: `review-${report.id}`,
    evidenceId: evidence.evidenceId,
    sourceRef: clone(evidence.sourceRef),
    outcomeEntryId,
    sourceFingerprint: evidence.sourceFingerprint,
    status: "confirmed-as-recorded",
    correctedCompetency: null,
    note: null,
    reviewedAt,
    ...overrides,
  };
}

function recommend(system, reports, reviews) {
  return clone(system.recommendPractice(reports, { reviews }));
}

test("confirmed current E3 produces the bounded v1 recommendation", () => {
  const system = loadIntelligence();
  const report = makeReport("discovery");
  const review = makeReview(system, report, "2026-09-01T12:00:00.000Z");
  const result = recommend(system, [report], [review]);

  assert.equal(result.type, "practice-recommendation");
  assert.equal(result.version, 1);
  assert.equal(result.domain, "camping.sales");
  assert.equal(result.recommendedCompetency, "discovery");
  assert.equal(result.missionIntent, "practice-customer-discovery");
  assert.equal(result.reasonType, "recent-reviewed-interaction");
  assert.equal(result.status, "recommended");
  assert.match(result.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("unreviewed E3 and missing evidence return null", () => {
  const system = loadIntelligence();
  assert.equal(system.recommendPractice([makeReport("discovery")], { reviews: [] }), null);
  assert.equal(system.recommendPractice([], { reviews: [] }), null);
});

test("rejected and corrected E3 return null", () => {
  for (const status of ["rejected", "corrected"]) {
    const system = loadIntelligence();
    const report = makeReport("discovery", status);
    const review = makeReview(system, report, "2026-09-01T12:00:00.000Z", {
      status,
      correctedCompetency: status === "corrected" ? "rapport" : null,
      note: status === "corrected" ? "Correction" : null,
    });
    assert.equal(system.recommendPractice([report], { reviews: [review] }), null);
  }
});

test("stale review identity and fingerprint mismatch fail closed", () => {
  const system = loadIntelligence();
  const report = makeReport("discovery");
  const review = makeReview(system, report, "2026-09-01T12:00:00.000Z");
  const changed = clone(report);
  changed.customerInteractions[0].salesStepOutcomes[0].id = "changed-outcome";

  assert.equal(system.recommendPractice([changed], { reviews: [review] }), null);
  assert.equal(
    system.recommendPractice([report], {
      reviews: [{ ...review, sourceFingerprint: "mismatch" }],
    }),
    null,
  );
});

test("all six competencies use exact mission-intent mappings", () => {
  const system = loadIntelligence();
  const mappings = {
    rapport: "practice-rapport",
    discovery: "practice-customer-discovery",
    "product-selection": "practice-product-selection",
    presentation: "practice-presentation",
    "objection-handling": "practice-objection-handling",
    "trial-close": "practice-trial-close",
  };
  for (const [competency, missionIntent] of Object.entries(mappings)) {
    const report = makeReport(competency);
    const review = makeReview(system, report, "2026-09-01T12:00:00.000Z");
    assert.equal(recommend(system, [report], [review]).missionIntent, missionIntent);
  }
});

test("newest reviewed E3 wins and generatedAt does not participate", () => {
  const system = loadIntelligence();
  const rapport = makeReport("rapport");
  const discovery = makeReport("discovery");
  const reviews = [
    makeReview(system, rapport, "2026-09-01T11:00:00.000Z"),
    makeReview(system, discovery, "2026-09-01T12:00:00.000Z"),
  ];
  const first = recommend(system, [rapport, discovery], reviews);
  const second = recommend(system, [rapport, discovery], reviews);
  assert.equal(first.recommendedCompetency, "discovery");
  assert.equal(second.recommendedCompetency, "discovery");
});

test("equal review times use canonical competency order", () => {
  const system = loadIntelligence();
  const rapport = makeReport("rapport");
  const discovery = makeReport("discovery");
  const reviewedAt = "2026-09-01T12:00:00.000Z";
  const reviews = [
    makeReview(system, discovery, reviewedAt),
    makeReview(system, rapport, reviewedAt),
  ];
  assert.equal(
    recommend(system, [discovery, rapport], reviews).recommendedCompetency,
    "rapport",
  );
});

test("reason text is the fixed competency template with no quality inference", () => {
  const system = loadIntelligence();
  const report = makeReport("discovery");
  const review = makeReview(system, report, "2026-09-01T12:00:00.000Z");
  const result = recommend(system, [report], [review]);
  assert.equal(
    result.reasonText,
    "A recent interaction you reviewed involved Discovery. You may want to practice Discovery again.",
  );
  assert.doesNotMatch(result.reasonText, /weak|poor|deficient|master|score|rank/i);
});

test("recommendation has no score, rank, confidence, mastery, weakness, or priority weight", () => {
  const system = loadIntelligence();
  const report = makeReport("trial-close");
  const review = makeReview(system, report, "2026-09-01T12:00:00.000Z");
  const result = recommend(system, [report], [review]);
  for (const key of ["score", "rank", "confidence", "mastery", "weakness", "priorityWeight"]) {
    assert.equal(Object.hasOwn(result, key), false);
  }
});

test("evidenceRefs trace to the exact evidence, review, outcome, and source", () => {
  const system = loadIntelligence();
  const report = makeReport("presentation");
  const review = makeReview(system, report, "2026-09-01T12:00:00.000Z");
  const result = recommend(system, [report], [review]);
  assert.deepEqual(result.evidenceRefs, [{
    evidenceId: review.evidenceId,
    sourceFingerprint: review.sourceFingerprint,
    reviewId: review.id,
    outcomeEntryId: review.outcomeEntryId,
    sourceRef: review.sourceRef,
  }]);
});

test("recommendPractice is read-only across evidence, signals, Profile, history, and mission state", () => {
  const system = loadIntelligence();
  const report = makeReport("objection-handling");
  const reviews = [makeReview(system, report, "2026-09-01T12:00:00.000Z")];
  const founderState = {
    profile: { capabilities: [{ competency: "rapport" }] },
    commandLog: [{ mission: "Practice Customer Discovery" }],
    pendingMissionRequest: null,
    currentMission: "Existing Mission",
  };
  const beforeReports = clone([report]);
  const beforeReviews = clone(reviews);
  const beforeFounder = clone(founderState);

  system.recommendPractice([report], { reviews });

  assert.deepEqual(clone([report]), beforeReports);
  assert.deepEqual(clone(reviews), beforeReviews);
  assert.deepEqual(founderState, beforeFounder);
});

function loadUiHarness({ report = null, review = null, active = false } = {}) {
  const elements = new Map();
  function element() {
    return {
      hidden: false,
      textContent: "",
      innerHTML: "",
      style: {},
      handlers: {},
      appendChild() {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
    };
  }
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    document: {
      getElementById,
      querySelectorAll() { return []; },
      createElement() { return element(); },
    },
  });
  for (const relativePath of [
    "js/storage.js",
    "systems/mission.system.js",
    "systems/mission-intelligence.system.js",
    "js/missions.js",
    "js/practice-recommendation.js",
  ]) {
    vm.runInContext(
      fs.readFileSync(path.join(root, relativePath), "utf8"),
      context,
      { filename: relativePath },
    );
  }
  vm.runInContext(
    `founder.onboardingComplete = true;
     founder.missionStatus = ${JSON.stringify(active ? "active" : "inactive")};
     founder.currentMission = ${JSON.stringify(active ? "Existing Mission" : "")};
     founder.missionDescription = ${JSON.stringify(active ? "Keep it" : "")};
     founder.memory.artifacts = ${JSON.stringify(
       report
         ? {
             "camping.fieldReports": { reports: [report] },
             "camping.behavioralEvidenceReviews": { reviews: review ? [review] : [] },
           }
         : {},
     )};
     globalThis.__api = {
       founder,
       renderPracticeRecommendation,
       previewPracticeRecommendation
     };`,
    context,
  );
  return { api: context.__api, elements };
}

test("render hides no-evidence state and does not create a pending request", () => {
  const { api, elements } = loadUiHarness();
  assert.equal(api.renderPracticeRecommendation(), null);
  assert.equal(elements.get("practice-recommendation").hidden, true);
  assert.equal(api.founder.pendingMissionRequest, null);
});

test("render shows confirmed recommendation without mutating pending request", () => {
  const system = loadIntelligence();
  const report = makeReport("discovery");
  const review = makeReview(system, report, "2026-09-01T12:00:00.000Z");
  const { api, elements } = loadUiHarness({ report, review });
  const result = clone(api.renderPracticeRecommendation());

  assert.equal(result.recommendedCompetency, "discovery");
  assert.equal(elements.get("practice-recommendation").hidden, false);
  assert.equal(elements.get("practice-recommendation-competency").textContent, "Discovery");
  assert.equal(api.founder.pendingMissionRequest, null);
});

test("Preview Recommendation uses the existing exact selector and does not auto-accept", () => {
  const system = loadIntelligence();
  const report = makeReport("discovery");
  const review = makeReview(system, report, "2026-09-01T12:00:00.000Z");
  const { api } = loadUiHarness({ report, review });
  api.founder.onboardingComplete = false;
  api.renderPracticeRecommendation();
  const result = clone(api.previewPracticeRecommendation());

  assert.equal(result.success, true);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), {
    domain: "camping.sales",
    missionIntent: "practice-customer-discovery",
  });
  assert.equal(api.founder.missionStatus, "inactive");
});

test("active mission is preserved while existing pending behavior is used", () => {
  const system = loadIntelligence();
  const report = makeReport("trial-close");
  const review = makeReview(system, report, "2026-09-01T12:00:00.000Z");
  const { api } = loadUiHarness({ report, review, active: true });
  const beforeProfile = clone(api.founder.profile);
  const beforeHistory = clone(api.founder.commandLog);
  api.renderPracticeRecommendation();
  api.previewPracticeRecommendation();

  assert.equal(api.founder.currentMission, "Existing Mission");
  assert.equal(api.founder.missionDescription, "Keep it");
  assert.equal(api.founder.missionStatus, "active");
  assert.equal(api.founder.pendingMissionRequest.missionIntent, "practice-trial-close");
  assert.deepEqual(clone(api.founder.profile), beforeProfile);
  assert.deepEqual(clone(api.founder.commandLog), beforeHistory);
});

test("Missions owns the recommendation control and Dashboard has no recommendation surface", () => {
  const missions = fs.readFileSync(path.join(root, "missions.html"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(missions, /id="practice-recommendation"/);
  assert.match(missions, /Preview Recommendation/);
  assert.doesNotMatch(missions, /Accept Recommendation|Auto Start|Auto Assign/);
  assert.doesNotMatch(dashboard, /practice-recommendation|Preview Recommendation/);
});

test("production recommendation path does not read E4, Profile, history, XP, completion, learning, or coaching", () => {
  const source = fs.readFileSync(
    path.join(root, "systems/mission-intelligence.system.js"),
    "utf8",
  );
  const start = source.indexOf("  recommendPractice(");
  const end = source.indexOf("\n  // =====================================================", start);
  const method = source.slice(start, end);
  assert.doesNotMatch(
    method,
    /identifyRecurringBehavioralPatterns|profile|commandLog|missionHistory|\bxp\b|missionObjectiveCompletion|learningSignal|coachingSignal/i,
  );
});
