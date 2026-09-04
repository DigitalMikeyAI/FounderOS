const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const systemPath = path.join(root, "systems", "mission-intelligence.system.js");
const systemSource = fs.readFileSync(systemPath, "utf8");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadIntelligence(overrides = {}) {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    ...overrides,
  });
  vm.runInContext(
    `${systemSource}\n;globalThis.__api = MissionIntelligenceSystem;`,
    context,
  );
  return context.__api;
}

function makeInsight(overrides = {}) {
  const base = {
    basis: "confirmed-recurring-pattern",
    competency: "discovery",
    label: "Discovery",
    observation:
      "You confirmed a recurring pattern across 3 reviewed interaction records: the evidence you reviewed is consistent with effective Discovery recurring across those interactions.",
    interactionCount: 3,
    reportCount: 3,
    provenance: {
      evidenceTier: "E4",
      patternId: "behavioral_pattern_discovery",
      patternVersionIdentity: "pattern_version_discovery",
      patternReviewId: "pattern_review_discovery",
    },
  };
  return {
    ...base,
    ...overrides,
    provenance: Object.prototype.hasOwnProperty.call(overrides, "provenance")
      ? overrides.provenance
      : { ...base.provenance },
  };
}

function makeSynthesis(insights = [makeInsight()], overrides = {}) {
  return {
    type: "coaching-synthesis",
    version: 1,
    domain: "camping.sales",
    generatedAt: "2026-09-01T15:00:00.000Z",
    insights,
    ...overrides,
  };
}

function emptyOptions() {
  return {
    type: "development-focus-options",
    version: 1,
    domain: "camping.sales",
    options: [],
  };
}

function project(synthesis = makeSynthesis()) {
  return clone(loadIntelligence().buildDevelopmentFocusOptions(synthesis));
}

function methodSource() {
  const start = systemSource.indexOf("  buildDevelopmentFocusOptions(");
  const end = systemSource.indexOf("\n  recommendPractice(", start);
  return systemSource.slice(start, end);
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
  } else if (competency === "objection-handling") {
    interaction.objections = ["price"];
    outcome.result = "customer-concern-resolved";
  }
  return {
    id: `report-${suffix}`,
    date: "2026-09-01",
    createdAt: "2026-09-01T09:00:00.000Z",
    customerInteractions: [interaction],
    learningSignals: [],
    coachingSignals: [],
  };
}

function makeEvidenceReview(system, report, reviewedAt) {
  const evidence = system.identifyBehavioralEvidence([report])[0];
  return {
    id: `review-${report.id}`,
    evidenceId: evidence.evidenceId,
    sourceRef: clone(evidence.sourceRef),
    outcomeEntryId: evidence.evidenceRefs.find(
      (reference) => reference.field === "salesStepOutcomes",
    ).entryId,
    sourceFingerprint: evidence.sourceFingerprint,
    status: "confirmed-as-recorded",
    correctedCompetency: null,
    note: null,
    reviewedAt,
  };
}

function makeCanonicalFixture(system, competency = "discovery") {
  const reports = [];
  const evidenceReviews = [];
  for (let index = 0; index < 3; index += 1) {
    const report = makeReport(competency, `${competency}-${index + 1}`);
    reports.push(report);
    evidenceReviews.push(
      makeEvidenceReview(
        system,
        report,
        `2026-09-01T1${index + 1}:00:00.000Z`,
      ),
    );
  }
  const pattern = system.identifyRecurringBehavioralPatterns(reports, {
    reviews: evidenceReviews,
  })[0];
  const patternReview = {
    id: `pattern-review-${competency}`,
    patternId: pattern.patternId,
    patternVersionIdentity: pattern.patternVersionIdentity,
    competency: pattern.competency,
    originalInsight: pattern.insight,
    contributorIdentities: pattern.contributors
      .map((contributor) => contributor.activeIdentity)
      .sort(),
    status: "confirmed-as-pattern",
    correctedInterpretation: null,
    note: null,
    reviewedAt: "2026-09-01T14:00:00.000Z",
    supersedesReviewId: null,
  };
  return { reports, evidenceReviews, pattern, patternReview };
}

function stableSynthesis(synthesis) {
  const copy = clone(synthesis);
  delete copy.generatedAt;
  return copy;
}

function stableRecommendation(recommendation) {
  const copy = clone(recommendation);
  if (copy) delete copy.generatedAt;
  return copy;
}

test("1. one valid insight produces one exact option", () => {
  const insight = makeInsight();
  const result = project(makeSynthesis([insight]));
  assert.equal(result.options.length, 1);
  assert.deepEqual(result.options[0], {
    competency: "discovery",
    label: "Discovery",
    observation: insight.observation,
    source: {
      basis: "confirmed-recurring-pattern",
      evidenceTier: "E4",
      patternId: "behavioral_pattern_discovery",
      patternVersionIdentity: "pattern_version_discovery",
      patternReviewId: "pattern_review_discovery",
    },
  });
});

test("2. output uses the exact development-focus-options envelope", () => {
  const result = project(makeSynthesis([]));
  assert.deepEqual(result, emptyOptions());
});

test("3. option copies competency label and observation verbatim", () => {
  const insight = makeInsight({
    competency: "custom-verbatim",
    label: "  Exact Label  ",
    observation: "  Exact observation text.  ",
  });
  const option = project(makeSynthesis([insight])).options[0];
  assert.equal(option.competency, insight.competency);
  assert.equal(option.label, insight.label);
  assert.equal(option.observation, insight.observation);
});

test("4. source maps only exact canonical synthesis authority fields", () => {
  const insight = makeInsight();
  const source = project(makeSynthesis([insight])).options[0].source;
  assert.deepEqual(source, {
    basis: insight.basis,
    evidenceTier: insight.provenance.evidenceTier,
    patternId: insight.provenance.patternId,
    patternVersionIdentity: insight.provenance.patternVersionIdentity,
    patternReviewId: insight.provenance.patternReviewId,
  });
});

test("5. multiple options preserve the order supplied by canonical Coaching Synthesis", () => {
  const trialClose = makeInsight({
    competency: "trial-close",
    label: "Trial Close",
    observation: "Trial Close observation.",
    provenance: {
      evidenceTier: "E4",
      patternId: "pattern-trial-close",
      patternVersionIdentity: "version-trial-close",
      patternReviewId: "review-trial-close",
    },
  });
  const rapport = makeInsight({
    competency: "rapport",
    label: "Rapport",
    observation: "Rapport observation.",
    provenance: {
      evidenceTier: "E4",
      patternId: "pattern-rapport",
      patternVersionIdentity: "version-rapport",
      patternReviewId: "review-rapport",
    },
  });
  const result = project(makeSynthesis([trialClose, rapport]));
  assert.deepEqual(
    result.options.map((option) => option.competency),
    ["trial-close", "rapport"],
  );
});

test("6. Rapport observation is copied byte-for-byte", () => {
  const observation =
    "You confirmed a recurring pattern across 3 reviewed interaction records where you referenced customer-provided context during Rapport. This does not establish customer trust, comfort, sentiment, likability, or Rapport quality.";
  const insight = makeInsight({
    competency: "rapport",
    label: "Rapport",
    observation,
  });
  assert.equal(project(makeSynthesis([insight])).options[0].observation, observation);
});

test("7. non-Rapport observation is copied byte-for-byte", () => {
  const insight = makeInsight();
  assert.equal(
    project(makeSynthesis([insight])).options[0].observation,
    insight.observation,
  );
});

test("8. repeated calls with the same synthesis are fully deep-equal", () => {
  const system = loadIntelligence();
  const synthesis = makeSynthesis();
  assert.deepEqual(
    clone(system.buildDevelopmentFocusOptions(synthesis)),
    clone(system.buildDevelopmentFocusOptions(synthesis)),
  );
});

test("9. output omits generatedAt", () => {
  assert.equal(Object.hasOwn(project(), "generatedAt"), false);
});

test("10. options omit interactionCount and reportCount", () => {
  const option = project().options[0];
  assert.equal(Object.hasOwn(option, "interactionCount"), false);
  assert.equal(Object.hasOwn(option, "reportCount"), false);
});

test("11. null returns the full empty envelope", () => {
  assert.deepEqual(project(null), emptyOptions());
});

test("12. undefined returns the full empty envelope", () => {
  const system = loadIntelligence();
  assert.deepEqual(
    clone(system.buildDevelopmentFocusOptions(undefined)),
    emptyOptions(),
  );
});

test("13. primitive and array inputs return the full empty envelope", () => {
  for (const value of ["synthesis", 1, true, [], [makeInsight()]]) {
    assert.deepEqual(project(value), emptyOptions());
  }
});

test("14. empty object returns the full empty envelope", () => {
  assert.deepEqual(project({}), emptyOptions());
});

test("15. missing or non-array insights returns the full empty envelope", () => {
  const missing = makeSynthesis();
  delete missing.insights;
  for (const synthesis of [missing, makeSynthesis(null), makeSynthesis({})]) {
    assert.deepEqual(project(synthesis), emptyOptions());
  }
});

test("16. valid empty insights returns the full empty envelope", () => {
  assert.deepEqual(project(makeSynthesis([])), emptyOptions());
});

test("17. wrong synthesis type returns the full empty envelope", () => {
  assert.deepEqual(
    project(makeSynthesis([], { type: "practice-recommendation" })),
    emptyOptions(),
  );
});

test("18. wrong synthesis version returns the full empty envelope", () => {
  assert.deepEqual(project(makeSynthesis([], { version: 2 })), emptyOptions());
});

test("19. wrong synthesis domain returns the full empty envelope", () => {
  assert.deepEqual(
    project(makeSynthesis([], { domain: "another.domain" })),
    emptyOptions(),
  );
});

test("20. any malformed individual insight makes the whole projection empty", () => {
  const valid = makeInsight();
  const malformed = [
    null,
    [],
    {},
    makeInsight({ basis: "other" }),
    makeInsight({ competency: " " }),
    makeInsight({ label: "" }),
    makeInsight({ observation: "" }),
  ];
  for (const insight of malformed) {
    assert.deepEqual(project(makeSynthesis([valid, insight])), emptyOptions());
  }
});

test("21. malformed or missing provenance makes the whole projection empty", () => {
  const base = makeInsight().provenance;
  const malformed = [
    null,
    [],
    {},
    { ...base, evidenceTier: "E3" },
    { ...base, patternId: "" },
    { ...base, patternVersionIdentity: " " },
    { ...base, patternReviewId: null },
  ];
  for (const provenance of malformed) {
    assert.deepEqual(
      project(makeSynthesis([makeInsight({ provenance })])),
      emptyOptions(),
    );
  }
});

test("22. duplicate source identity makes the whole projection empty", () => {
  const first = makeInsight();
  const duplicate = makeInsight({
    competency: "rapport",
    label: "Rapport",
    observation: "Distinct observation.",
    provenance: { ...first.provenance },
  });
  assert.deepEqual(project(makeSynthesis([first, duplicate])), emptyOptions());
});

test("23. duplicate competency makes the whole projection empty", () => {
  const first = makeInsight();
  const duplicate = makeInsight({
    observation: "Distinct observation.",
    provenance: {
      evidenceTier: "E4",
      patternId: "different-pattern",
      patternVersionIdentity: "different-version",
      patternReviewId: "different-review",
    },
  });
  assert.deepEqual(project(makeSynthesis([first, duplicate])), emptyOptions());
});

test("24. envelope array option and source are fresh objects", () => {
  const system = loadIntelligence();
  const synthesis = makeSynthesis();
  const first = system.buildDevelopmentFocusOptions(synthesis);
  const second = system.buildDevelopmentFocusOptions(synthesis);
  assert.notEqual(first, second);
  assert.notEqual(first.options, synthesis.insights);
  assert.notEqual(first.options, second.options);
  assert.notEqual(first.options[0], synthesis.insights[0]);
  assert.notEqual(first.options[0], second.options[0]);
  assert.notEqual(first.options[0].source, synthesis.insights[0].provenance);
  assert.notEqual(first.options[0].source, second.options[0].source);
});

test("25. mutating output cannot mutate synthesis", () => {
  const synthesis = makeSynthesis();
  const before = clone(synthesis);
  const result = loadIntelligence().buildDevelopmentFocusOptions(synthesis);
  result.options[0].label = "Changed";
  result.options[0].source.patternId = "changed";
  assert.deepEqual(synthesis, before);
});

test("26. mutating synthesis after projection cannot mutate output", () => {
  const synthesis = makeSynthesis();
  const result = clone(loadIntelligence().buildDevelopmentFocusOptions(synthesis));
  const before = clone(result);
  synthesis.insights[0].observation = "Changed";
  synthesis.insights[0].provenance.patternReviewId = "changed";
  assert.deepEqual(result, before);
});

test("27. invocation does not mutate its input", () => {
  const synthesis = makeSynthesis();
  const before = clone(synthesis);
  loadIntelligence().buildDevelopmentFocusOptions(synthesis);
  assert.deepEqual(synthesis, before);
});

test("28. output contains no selection or default fields", () => {
  const result = project();
  const serialized = JSON.stringify(result);
  for (const field of ["selected", "isSelected", "status", "defaultSelection"]) {
    assert.equal(serialized.includes(`\"${field}\"`), false);
  }
});

test("29. output contains no recommendation or action fields", () => {
  const serialized = JSON.stringify(project());
  for (const field of [
    "recommended",
    "recommendation",
    "recommendedCompetency",
    "missionIntent",
    "action",
    "suggestion",
    "goal",
    "plan",
  ]) {
    assert.equal(serialized.includes(`\"${field}\"`), false);
  }
});

test("30. output contains no ranking or evaluation fields", () => {
  const serialized = JSON.stringify(project());
  for (const field of [
    "score",
    "rank",
    "priority",
    "priorityWeight",
    "confidence",
    "mastery",
    "weakness",
    "proficiency",
    "deficiency",
    "need",
    "urgency",
  ]) {
    assert.equal(serialized.includes(`\"${field}\"`), false);
  }
});

test("31. output contains no count fields", () => {
  const serialized = JSON.stringify(project());
  assert.equal(serialized.includes("interactionCount"), false);
  assert.equal(serialized.includes("reportCount"), false);
});

test("32. source scan has no forbidden authority dependencies", () => {
  const source = methodSource();
  for (const forbidden of [
    /MemorySystem/,
    /saveArtifact/,
    /saveFounder/,
    /localStorage/,
    /sessionStorage/,
    /\bfounder\b/,
    /commandLog/,
    /\bxp\b/i,
    /missionIntent/,
    /pendingMissionRequest/,
    /GuidanceSystem/,
    /BriefingSystem/,
    /ReflectionSystem/,
    /CommanderSystem/,
    /\bprofile\b/i,
    /coachingSignals/,
    /learningSignals/,
    /recommendPractice/,
    /buildPracticeCandidates/,
    /rotatePracticeCandidate/,
    /identifyProfileCapabilityCandidates/,
    /nextFocus/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("33. source scan does not call identifyRecurringBehavioralPatterns", () => {
  assert.doesNotMatch(methodSource(), /identifyRecurringBehavioralPatterns/);
});

test("34. source scan does not sort supplied synthesis insights", () => {
  assert.doesNotMatch(methodSource(), /\.sort\s*\(/);
});

test("35. source scan consumes only the coachingSynthesis argument", () => {
  const source = methodSource();
  assert.match(
    source,
    /buildDevelopmentFocusOptions\(coachingSynthesis = null\)/,
  );
  assert.match(source, /coachingSynthesis\.insights/);
});

test("36. real canonical Coaching Synthesis maps exactly into focus options", () => {
  const system = loadIntelligence();
  const fixture = makeCanonicalFixture(system, "discovery");
  const synthesis = system.buildCoachingSynthesis(
    fixture.reports,
    { reviews: fixture.evidenceReviews },
    { reviews: [fixture.patternReview] },
  );
  const result = clone(system.buildDevelopmentFocusOptions(synthesis));
  assert.deepEqual(result.options, [
    {
      competency: synthesis.insights[0].competency,
      label: synthesis.insights[0].label,
      observation: synthesis.insights[0].observation,
      source: {
        basis: synthesis.insights[0].basis,
        evidenceTier: synthesis.insights[0].provenance.evidenceTier,
        patternId: synthesis.insights[0].provenance.patternId,
        patternVersionIdentity:
          synthesis.insights[0].provenance.patternVersionIdentity,
        patternReviewId: synthesis.insights[0].provenance.patternReviewId,
      },
    },
  ]);
});

test("37. focus projection leaves Phase 8 Coaching Synthesis output unchanged", () => {
  const system = loadIntelligence();
  const fixture = makeCanonicalFixture(system);
  const args = [
    fixture.reports,
    { reviews: fixture.evidenceReviews },
    { reviews: [fixture.patternReview] },
  ];
  const before = stableSynthesis(system.buildCoachingSynthesis(...args));
  system.buildDevelopmentFocusOptions(system.buildCoachingSynthesis(...args));
  const after = stableSynthesis(system.buildCoachingSynthesis(...args));
  assert.deepEqual(clone(after), clone(before));
});

test("38. focus projection leaves Phase 7 recommendPractice output unchanged", () => {
  const system = loadIntelligence();
  const fixture = makeCanonicalFixture(system);
  const before = stableRecommendation(
    system.recommendPractice(fixture.reports, {
      reviews: fixture.evidenceReviews,
    }),
  );
  const synthesis = system.buildCoachingSynthesis(
    fixture.reports,
    { reviews: fixture.evidenceReviews },
    { reviews: [fixture.patternReview] },
  );
  system.buildDevelopmentFocusOptions(synthesis);
  const after = stableRecommendation(
    system.recommendPractice(fixture.reports, {
      reviews: fixture.evidenceReviews,
    }),
  );
  assert.deepEqual(after, before);
});

test("39. focus projection leaves Profile Capability Candidate output unchanged", () => {
  const system = loadIntelligence();
  const fixture = makeCanonicalFixture(system, "objection-handling");
  const args = [
    fixture.reports,
    { reviews: fixture.evidenceReviews },
    { reviews: [fixture.patternReview] },
  ];
  const before = clone(system.identifyProfileCapabilityCandidates(...args));
  const synthesis = system.buildCoachingSynthesis(...args);
  system.buildDevelopmentFocusOptions(synthesis);
  const after = clone(system.identifyProfileCapabilityCandidates(...args));
  assert.deepEqual(after, before);
});

test("40. focus projection makes no persistence calls", () => {
  let calls = 0;
  const system = loadIntelligence({
    MemorySystem: {
      saveArtifact() {
        calls += 1;
      },
    },
    saveFounder() {
      calls += 1;
    },
    localStorage: {
      setItem() {
        calls += 1;
      },
    },
  });
  const synthesis = makeSynthesis();
  const before = clone(synthesis);
  system.buildDevelopmentFocusOptions(synthesis);
  assert.equal(calls, 0);
  assert.deepEqual(synthesis, before);
});