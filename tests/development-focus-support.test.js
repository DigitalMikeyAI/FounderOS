const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const systemPath = path.join(
  root,
  "systems",
  "mission-intelligence.system.js",
);
const systemSource = fs.readFileSync(systemPath, "utf8");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function loadIntelligence(overrides = {}) {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    ...overrides,
  });
  vm.runInContext(
    `${systemSource}\n;globalThis.__api = MissionIntelligenceSystem;`,
    context,
    { filename: systemPath },
  );
  return context.__api;
}

function makeSource(overrides = {}) {
  return {
    basis: "confirmed-recurring-pattern",
    evidenceTier: "E4",
    patternId: "behavioral_pattern_discovery",
    patternVersionIdentity: "pattern_version_discovery",
    patternReviewId: "pattern_review_discovery",
    ...overrides,
  };
}

function makeOption(overrides = {}) {
  const source = Object.prototype.hasOwnProperty.call(overrides, "source")
    ? overrides.source
    : makeSource();
  return {
    competency: "discovery",
    label: "Discovery",
    observation:
      "You confirmed a recurring pattern across 3 reviewed interaction records: the evidence you reviewed is consistent with effective Discovery recurring across those interactions.",
    ...overrides,
    source,
  };
}

function makeOptions(options = [makeOption()], overrides = {}) {
  return {
    type: "development-focus-options",
    version: 1,
    domain: "camping.sales",
    options,
    ...overrides,
  };
}

function makeFocus(overrides = {}) {
  const option = makeOption(overrides);
  return {
    type: "development-focus",
    version: 1,
    domain: "camping.sales",
    competency: option.competency,
    label: option.label,
    observation: option.observation,
    source: { ...option.source },
    chosenAt: "2026-09-03T12:00:00.000Z",
  };
}

function expected(state) {
  return {
    type: "development-focus-support",
    version: 1,
    domain: "camping.sales",
    state,
  };
}

function assess(focus = makeFocus(), options = makeOptions()) {
  return clone(
    loadIntelligence().buildDevelopmentFocusSupport(focus, options),
  );
}

function methodSource() {
  const start = systemSource.indexOf("  buildDevelopmentFocusSupport(");
  const end = systemSource.indexOf("\n  recommendPractice(", start);
  return systemSource.slice(start, end);
}

test("exact five-field source produces exact-source-present", () => {
  assert.deepEqual(assess(), expected("exact-source-present"));
});

test("null focus produces no-focus without requiring options", () => {
  for (const options of [null, undefined, {}, "malformed"]) {
    assert.deepEqual(assess(null, options), expected("no-focus"));
  }
});

test("canonical empty options with valid focus produces exact-source-not-present", () => {
  assert.deepEqual(
    assess(makeFocus(), makeOptions([])),
    expected("exact-source-not-present"),
  );
});

test("different competency and source produce exact-source-not-present", () => {
  const option = makeOption({
    competency: "rapport",
    label: "Rapport",
    observation: "Rapport observation.",
    source: makeSource({
      patternId: "behavioral_pattern_rapport",
      patternVersionIdentity: "pattern_version_rapport",
      patternReviewId: "pattern_review_rapport",
    }),
  });
  assert.deepEqual(
    assess(makeFocus(), makeOptions([option])),
    expected("exact-source-not-present"),
  );
});

test("new pattern version is not an exact source match", () => {
  const option = makeOption({
    source: makeSource({ patternVersionIdentity: "new-version" }),
  });
  assert.deepEqual(
    assess(makeFocus(), makeOptions([option])),
    expected("exact-source-not-present"),
  );
});

test("new pattern review is not an exact source match", () => {
  const option = makeOption({
    source: makeSource({ patternReviewId: "new-review" }),
  });
  assert.deepEqual(
    assess(makeFocus(), makeOptions([option])),
    expected("exact-source-not-present"),
  );
});

test("pattern ID alone and pattern ID plus version are insufficient", () => {
  for (const source of [
    makeSource({
      patternVersionIdentity: "different-version",
      patternReviewId: "different-review",
    }),
    makeSource({ patternReviewId: "different-review" }),
  ]) {
    assert.deepEqual(
      assess(makeFocus(), makeOptions([makeOption({ source })])),
      expected("exact-source-not-present"),
    );
  }
});

test("different basis or evidence tier is unavailable canonical input", () => {
  for (const source of [
    makeSource({ basis: "different-basis" }),
    makeSource({ evidenceTier: "E3" }),
  ]) {
    assert.deepEqual(
      assess(makeFocus(), makeOptions([makeOption({ source })])),
      expected("unavailable"),
    );
  }
});

test("malformed focus produces unavailable", () => {
  for (const focus of [
    {},
    [],
    "focus",
    { ...makeFocus(), type: "other" },
    { ...makeFocus(), chosenAt: "not-iso" },
    { ...makeFocus(), source: null },
    { ...makeFocus(), unexpected: true },
  ]) {
    assert.deepEqual(assess(focus), expected("unavailable"));
  }
});

test("malformed or missing options envelope produces unavailable", () => {
  assert.deepEqual(
    clone(
      loadIntelligence().buildDevelopmentFocusSupport(makeFocus(), undefined),
    ),
    expected("unavailable"),
  );
  for (const options of [
    null,
    {},
    [],
    "options",
    { ...makeOptions(), type: "other" },
    { ...makeOptions(), options: "not-array" },
    { ...makeOptions(), unexpected: true },
  ]) {
    assert.deepEqual(assess(makeFocus(), options), expected("unavailable"));
  }
});

test("malformed individual option produces unavailable", () => {
  for (const option of [
    null,
    {},
    { ...makeOption(), label: "" },
    { ...makeOption(), source: null },
    { ...makeOption(), unexpected: true },
  ]) {
    assert.deepEqual(
      assess(makeFocus(), makeOptions([option])),
      expected("unavailable"),
    );
  }
});

test("duplicate competency produces unavailable", () => {
  const duplicate = makeOption({
    source: makeSource({
      patternId: "different-pattern",
      patternVersionIdentity: "different-version",
      patternReviewId: "different-review",
    }),
  });
  assert.deepEqual(
    assess(makeFocus(), makeOptions([makeOption(), duplicate])),
    expected("unavailable"),
  );
});

test("duplicate source identity produces unavailable", () => {
  const duplicate = makeOption({
    competency: "rapport",
    label: "Rapport",
    observation: "Rapport observation.",
  });
  assert.deepEqual(
    assess(makeFocus(), makeOptions([makeOption(), duplicate])),
    expected("unavailable"),
  );
});

test("unexpected resolver errors are not converted into source absence", () => {
  const system = loadIntelligence();
  system.findDevelopmentFocusOption = () => {
    throw new Error("programming failure");
  };
  assert.throws(
    () => system.buildDevelopmentFocusSupport(makeFocus(), makeOptions()),
    /programming failure/,
  );
});

test("output has exactly four fields and no duplicated focus or authority data", () => {
  const result = assess();
  assert.deepEqual(Object.keys(result), ["type", "version", "domain", "state"]);
  for (const field of [
    "focus",
    "matchedOption",
    "source",
    "generatedAt",
    "checkedAt",
    "current",
    "supported",
    "currentlySupported",
    "currentEvidence",
    "interactionCount",
    "reportCount",
    "score",
    "confidence",
    "recommendation",
  ]) {
    assert.equal(Object.hasOwn(result, field), false, field);
  }
  assert.doesNotMatch(
    JSON.stringify(result),
    /patternId|patternVersionIdentity|patternReviewId/,
  );
});

test("repeated calls are deep-equal and inputs remain unchanged", () => {
  const focus = makeFocus();
  const options = makeOptions();
  const before = clone({ focus, options });
  const first = assess(focus, options);
  const second = assess(focus, options);
  assert.deepEqual(first, second);
  assert.deepEqual({ focus, options }, before);
});

test("mutating the result cannot mutate either input", () => {
  const focus = makeFocus();
  const options = makeOptions();
  const before = clone({ focus, options });
  const result = loadIntelligence().buildDevelopmentFocusSupport(
    focus,
    options,
  );
  result.state = "changed-by-consumer";
  assert.deepEqual({ focus, options }, before);
});

test("support method uses only the saved focus canonical options and exact resolver", () => {
  const source = methodSource();
  assert.match(source, /developmentFocus/);
  assert.match(source, /developmentFocusOptions/);
  assert.match(source, /findDevelopmentFocusOption/);
  assert.doesNotMatch(source, /identifyRecurringBehavioralPatterns/);
  assert.doesNotMatch(source, /buildCoachingSynthesis/);
  assert.doesNotMatch(
    source,
    /fieldReports|behavioralEvidenceReview|behavioralPatternReview|MemorySystem|saveArtifact|saveFounder|localStorage|sessionStorage|founder|profile|missionIntent|pendingMissionRequest|recommendPractice|GuidanceSystem|BriefingSystem|ReflectionSystem|commandLog|\bxp\b|completion|interactionCount|reportCount|recency|\.sort\(|score|rank|confidence/i,
  );
});

test("support derivation leaves Phase 9.1 options and Phase 9.2 focus unchanged", () => {
  const system = loadIntelligence();
  const synthesis = {
    type: "coaching-synthesis",
    version: 1,
    domain: "camping.sales",
    generatedAt: "2026-09-03T12:00:00.000Z",
    insights: [
      {
        basis: "confirmed-recurring-pattern",
        competency: "discovery",
        label: "Discovery",
        observation: makeOption().observation,
        interactionCount: 3,
        reportCount: 3,
        provenance: {
          evidenceTier: "E4",
          patternId: makeSource().patternId,
          patternVersionIdentity: makeSource().patternVersionIdentity,
          patternReviewId: makeSource().patternReviewId,
        },
      },
    ],
  };
  const options = system.buildDevelopmentFocusOptions(synthesis);
  const focus = makeFocus();
  const before = clone({ synthesis, options, focus });
  system.buildDevelopmentFocusSupport(focus, options);
  assert.deepEqual(clone({ synthesis, options, focus }), before);
});

test("support derivation leaves Phase 8 synthesis and Phase 7 recommendation unchanged", () => {
  const system = loadIntelligence();
  const reports = [];
  const e3 = { reviews: [] };
  const e4 = { reviews: [] };
  const synthesisBefore = clone(system.buildCoachingSynthesis(reports, e3, e4));
  const recommendationBefore = clone(system.recommendPractice(reports, e3));
  system.buildDevelopmentFocusSupport(makeFocus(), makeOptions());
  const synthesisAfter = clone(system.buildCoachingSynthesis(reports, e3, e4));
  const recommendationAfter = clone(system.recommendPractice(reports, e3));
  delete synthesisBefore.generatedAt;
  delete synthesisAfter.generatedAt;
  assert.deepEqual(synthesisAfter, synthesisBefore);
  assert.deepEqual(recommendationAfter, recommendationBefore);
});

test("support derivation performs no persistence", () => {
  let calls = 0;
  const system = loadIntelligence({
    MemorySystem: { saveArtifact() { calls += 1; } },
    CommanderSystem: { save() { calls += 1; } },
    saveFounder() { calls += 1; },
    localStorage: { setItem() { calls += 1; } },
    sessionStorage: { setItem() { calls += 1; } },
  });
  system.buildDevelopmentFocusSupport(makeFocus(), makeOptions());
  assert.equal(calls, 0);
});
