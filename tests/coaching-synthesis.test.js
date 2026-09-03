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

function makePatternFixture(system, competency, count = 3, startHour = 11) {
  const reports = [];
  const reviews = [];
  for (let index = 0; index < count; index += 1) {
    const report = makeReport(competency, `${competency}-${index + 1}`);
    reports.push(report);
    reviews.push(
      makeReview(
        system,
        report,
        `2026-09-01T${String(startHour).padStart(2, "0")}:0${index}:00.000Z`,
      ),
    );
  }
  return { reports, reviews };
}

function getPattern(system, reports, reviews, competency) {
  return system
    .identifyRecurringBehavioralPatterns(reports, { reviews })
    .find((pattern) => pattern.competency === competency);
}

function makePatternReviewRecord(pattern, status, overrides = {}) {
  return {
    id: `pattern-review-record-${pattern.competency}`,
    patternId: pattern.patternId,
    patternVersionIdentity: pattern.patternVersionIdentity,
    competency: pattern.competency,
    originalInsight: pattern.insight,
    contributorIdentities: pattern.contributors
      .map((contributor) => contributor.activeIdentity)
      .sort(),
    status,
    correctedInterpretation: null,
    note: null,
    supersedesReviewId: null,
    reviewedAt: "2026-09-01T14:00:00.000Z",
    ...overrides,
  };
}

function synthesize(system, reports, e3Reviews, e4Reviews) {
  return clone(
    system.buildCoachingSynthesis(
      reports,
      { reviews: e3Reviews },
      e4Reviews ? { reviews: e4Reviews } : null,
    ),
  );
}

function stripGenerated(synthesis) {
  if (!synthesis) return synthesis;
  const { generatedAt, ...rest } = synthesis;
  return rest;
}

const GENERIC_TEMPLATE =
  "You confirmed a recurring pattern across {n} reviewed interaction records: the evidence you reviewed is consistent with effective {label} recurring across those interactions.";
const RAPPORT_TEMPLATE =
  "You confirmed a recurring pattern across {n} reviewed interaction records where you referenced customer-provided context during Rapport. This does not establish customer trust, comfort, sentiment, likability, or Rapport quality.";


// =====================================================
// POSITIVE
// =====================================================

test("1. one confirmed-as-pattern E4 produces exactly one synthesis insight", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  assert.equal(result.insights.length, 1);
});

test("2. exact type/version/domain/basis", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  assert.equal(result.type, "coaching-synthesis");
  assert.equal(result.version, 1);
  assert.equal(result.domain, "camping.sales");
  assert.equal(result.insights[0].basis, "confirmed-recurring-pattern");
});

test("3. exact competency/label/counts/provenance mapping", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  const insight = result.insights[0];
  assert.equal(insight.competency, "discovery");
  assert.equal(insight.label, "Discovery");
  assert.equal(insight.interactionCount, 3);
  assert.equal(insight.reportCount, 3);
  assert.equal(insight.provenance.evidenceTier, "E4");
  assert.equal(insight.provenance.patternId, pattern.patternId);
  assert.equal(
    insight.provenance.patternVersionIdentity,
    pattern.patternVersionIdentity,
  );
});

test("4. provenance.patternReviewId maps from latestPatternReviewId", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  const insight = result.insights[0];
  assert.equal(insight.provenance.patternReviewId, e4Reviews[0].id);
  assert.equal(typeof insight.provenance.patternReviewId, "string");
  assert.ok(insight.provenance.patternReviewId.length > 0);
});

test("5. multiple confirmed patterns use canonical competency order only", () => {
  const system = loadIntelligence();
  const discovery = makePatternFixture(system, "discovery");
  const rapport = makePatternFixture(system, "rapport");
  const reports = [...discovery.reports, ...rapport.reports];
  const reviews = [...discovery.reviews, ...rapport.reviews];
  const discoveryPattern = getPattern(system, reports, reviews, "discovery");
  const rapportPattern = getPattern(system, reports, reviews, "rapport");
  const e4Reviews = [
    makePatternReviewRecord(discoveryPattern, "confirmed-as-pattern"),
    makePatternReviewRecord(rapportPattern, "confirmed-as-pattern"),
  ];
  const result = synthesize(system, reports, reviews, e4Reviews);
  assert.equal(result.insights.length, 2);
  assert.equal(result.insights[0].competency, "rapport");
  assert.equal(result.insights[1].competency, "discovery");
});

test("6. Rapport uses the strict hedge", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "rapport");
  const pattern = getPattern(system, reports, reviews, "rapport");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  const expected = RAPPORT_TEMPLATE.replace("{n}", "3");
  assert.equal(result.insights[0].observation, expected);
});

test("7. non-Rapport uses the generic approved template", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  const expected = GENERIC_TEMPLATE.replace("{n}", "3").replace(
    "{label}",
    "Discovery",
  );
  assert.equal(result.insights[0].observation, expected);
});

test("8. generatedAt is valid ISO", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  assert.match(
    result.generatedAt,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
  assert.equal(new Date(result.generatedAt).toISOString(), result.generatedAt);
});

test("9. repeated calls preserve identical insights apart from generatedAt", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const first = stripGenerated(synthesize(system, reports, reviews, e4Reviews));
  const second = stripGenerated(synthesize(system, reports, reviews, e4Reviews));
  assert.deepEqual(first, second);
});

test("10. returned objects are detached/fresh", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const first = synthesize(system, reports, reviews, e4Reviews);
  first.insights.push({ basis: "mutated" });
  first.insights[0].competency = "mutated";
  const second = synthesize(system, reports, reviews, e4Reviews);
  assert.equal(second.insights.length, 1);
  assert.equal(second.insights[0].competency, "discovery");
});


// =====================================================
// NEGATIVE / FIREWALLS
// =====================================================

test("11. unreviewed E4 -> empty", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const result = synthesize(system, reports, reviews, []);
  assert.deepEqual(result.insights, []);
  assert.equal(result.type, "coaching-synthesis");
});

test("12. rejected E4 -> empty", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "rejected")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  assert.deepEqual(result.insights, []);
});

test("13. corrected E4 -> empty", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [
    makePatternReviewRecord(pattern, "corrected", {
      correctedInterpretation: "Different wording.",
    }),
  ];
  const result = synthesize(system, reports, reviews, e4Reviews);
  assert.deepEqual(result.insights, []);
});

test("14. stale pattern review/version -> empty", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const mutatedReports = clone(reports);
  mutatedReports[0].customerInteractions[0].salesStepOutcomes[0].id =
    "outcome-changed";
  const result = synthesize(system, mutatedReports, reviews, e4Reviews);
  assert.deepEqual(result.insights, []);
});

test("15. below E4 threshold -> empty", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery", 2);
  const pattern = getPattern(system, reports, reviews, "discovery");
  assert.equal(pattern, undefined);
  const result = synthesize(system, reports, reviews, []);
  assert.deepEqual(result.insights, []);
});

test("16. confirmed E3 without confirmed E4 -> empty", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const result = synthesize(system, reports, reviews, []);
  assert.deepEqual(result.insights, []);
});

test("17. empty/null/malformed reports -> full object with insights:[]", () => {
  const system = loadIntelligence();
  const empty = {
    type: "coaching-synthesis",
    version: 1,
    domain: "camping.sales",
    insights: [],
  };
  const r1 = stripGenerated(synthesize(system, [], [], null));
  assert.deepEqual(r1, empty);
  const r2 = stripGenerated(synthesize(system, null, null, null));
  assert.deepEqual(r2, empty);
  const r3 = stripGenerated(synthesize(system, undefined, undefined, undefined));
  assert.deepEqual(r3, empty);
  const r4 = stripGenerated(synthesize(system, [{}], [], null));
  assert.deepEqual(r4, empty);
  const r5 = stripGenerated(synthesize(system, ["not-an-object"], [], null));
  assert.deepEqual(r5, empty);
});

test("18. no mutation of reports/E3 review container/E4 review container", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const beforeReports = clone(reports);
  const beforeE3 = clone({ reviews });
  const beforeE4 = clone({ reviews: e4Reviews });
  system.buildCoachingSynthesis(reports, { reviews }, { reviews: e4Reviews });
  assert.deepEqual(clone(reports), beforeReports);
  assert.deepEqual(clone({ reviews }), beforeE3);
  assert.deepEqual(clone({ reviews: e4Reviews }), beforeE4);
});


test("19. no persistence calls", () => {
  const source = fs.readFileSync(
    path.join(root, "systems/mission-intelligence.system.js"),
    "utf8",
  );
  const start = source.indexOf("  buildCoachingSynthesis(");
  const end = source.indexOf("\n  recommendPractice(", start);
  const method = source.slice(start, end);
  assert.doesNotMatch(method, /MemorySystem/);
  assert.doesNotMatch(method, /saveArtifact/);
  assert.doesNotMatch(method, /saveFounder/);
});

test("20. no forbidden fields", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  const forbidden = [
    "suggestion",
    "action",
    "missionIntent",
    "status",
    "recommendedCompetency",
    "score",
    "rank",
  ];
  for (const field of forbidden) {
    assert.equal(result[field], undefined, `result must not contain ${field}`);
  }
  const insight = result.insights[0];
  for (const field of forbidden) {
    assert.equal(insight[field], undefined, `insight must not contain ${field}`);
  }
  assert.ok(!("recommendation" in result));
  assert.ok(!("recommendation" in insight));
});

test("21. no forbidden inference language", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "discovery");
  const pattern = getPattern(system, reports, reviews, "discovery");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  const observation = result.insights[0].observation;
  assert.doesNotMatch(observation, /master/i);
  assert.doesNotMatch(observation, /weakness/i);
  assert.doesNotMatch(observation, /confidence/i);
  assert.doesNotMatch(observation, /proficiency/i);
  assert.doesNotMatch(observation, /deficiency/i);
  assert.doesNotMatch(observation, /better/i);
  assert.doesNotMatch(observation, /worse/i);
  assert.doesNotMatch(observation, /improv/i);
  assert.doesNotMatch(observation, /declin/i);
  assert.doesNotMatch(observation, /recent/i);
});

test("22. Rapport observation contains no positive claim of trust/comfort/sentiment/likability/quality", () => {
  const system = loadIntelligence();
  const { reports, reviews } = makePatternFixture(system, "rapport");
  const pattern = getPattern(system, reports, reviews, "rapport");
  const e4Reviews = [makePatternReviewRecord(pattern, "confirmed-as-pattern")];
  const result = synthesize(system, reports, reviews, e4Reviews);
  const observation = result.insights[0].observation;
  assert.match(observation, /does not establish/);
  assert.match(observation, /trust/);
  assert.match(observation, /comfort/);
  assert.match(observation, /sentiment/);
  assert.match(observation, /likability/);
  assert.match(observation, /Rapport quality/);
  assert.doesNotMatch(observation, /you built trust/i);
  assert.doesNotMatch(observation, /customer trusted you/i);
  assert.doesNotMatch(observation, /strong rapport/i);
  assert.doesNotMatch(observation, /effective rapport/i);
});

test("23. source-scan guard proves buildCoachingSynthesis calls identifyRecurringBehavioralPatterns and does not reference forbidden sources", () => {
  const source = fs.readFileSync(
    path.join(root, "systems/mission-intelligence.system.js"),
    "utf8",
  );
  const start = source.indexOf("  buildCoachingSynthesis(");
  const end = source.indexOf("\n  recommendPractice(", start);
  const method = source.slice(start, end);
  assert.match(method, /identifyRecurringBehavioralPatterns/);
  assert.doesNotMatch(method, /profile/i);
  assert.doesNotMatch(method, /commandLog/i);
  assert.doesNotMatch(method, /localStorage/i);
  assert.doesNotMatch(method, /\bxp\b/);
  assert.doesNotMatch(method, /coachingSignal/i);
  assert.doesNotMatch(method, /learningSignal/i);
  assert.doesNotMatch(method, /missionIntent/i);
  assert.doesNotMatch(method, /score/i);
  assert.doesNotMatch(method, /confidence/i);
  assert.doesNotMatch(method, /proficiency/i);
  assert.doesNotMatch(method, /deficiency/i);
});
