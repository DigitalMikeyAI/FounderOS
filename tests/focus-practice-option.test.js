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

function makeFocus(competency = "discovery", overrides = {}) {
  const source = Object.prototype.hasOwnProperty.call(overrides, "source")
    ? overrides.source
    : {
        basis: "confirmed-recurring-pattern",
        evidenceTier: "E4",
        patternId: `behavioral_pattern_${competency}`,
        patternVersionIdentity: `pattern_version_${competency}_historical`,
        patternReviewId: `pattern_review_${competency}_historical`,
      };
  return {
    type: "development-focus",
    version: 1,
    domain: "camping.sales",
    competency,
    label: competency,
    observation: `Persisted ${competency} observation.`,
    chosenAt: "2026-09-03T12:00:00.000Z",
    ...overrides,
    source,
  };
}

const definitions = {
  rapport: {
    label: "Practice Referencing Customer Context",
    missionIntent: "practice-rapport",
  },
  discovery: {
    label: "Practice Customer Discovery",
    missionIntent: "practice-customer-discovery",
  },
  "product-selection": {
    label: "Practice Product Selection",
    missionIntent: "practice-product-selection",
  },
  presentation: {
    label: "Practice a Customer-Need Presentation",
    missionIntent: "practice-presentation",
  },
  "objection-handling": {
    label: "Practice Objection Handling",
    missionIntent: "practice-objection-handling",
  },
  "trial-close": {
    label: "Practice a Trial Close",
    missionIntent: "practice-trial-close",
  },
};

test("all six valid focuses map to exact neutral practice actions", () => {
  const system = loadIntelligence();
  for (const [competency, expected] of Object.entries(definitions)) {
    assert.deepEqual(clone(system.buildFocusPracticeOption(makeFocus(competency))), {
      type: "focus-practice-option",
      version: 1,
      domain: "camping.sales",
      competency,
      label: expected.label,
      missionIntent: expected.missionIntent,
      source: {
        basis: "commander-development-focus",
      },
    });
  }
});

test("output contract is exact and contains only neutral action metadata", () => {
  const result = clone(
    loadIntelligence().buildFocusPracticeOption(makeFocus("discovery")),
  );
  assert.deepEqual(Object.keys(result), [
    "type",
    "version",
    "domain",
    "competency",
    "label",
    "missionIntent",
    "source",
  ]);
  assert.deepEqual(result.source, { basis: "commander-development-focus" });
});

test("null undefined primitives arrays and empty objects return null", () => {
  const system = loadIntelligence();
  for (const input of [null, undefined, false, 1, "discovery", [], {}]) {
    assert.equal(system.buildFocusPracticeOption(input), null);
  }
});

test("wrong type version and domain return null", () => {
  const system = loadIntelligence();
  for (const focus of [
    makeFocus("discovery", { type: "focus" }),
    makeFocus("discovery", { version: 2 }),
    makeFocus("discovery", { domain: "other.sales" }),
  ]) {
    assert.equal(system.buildFocusPracticeOption(focus), null);
  }
});

test("unknown or malformed competency returns null without prose inference", () => {
  const system = loadIntelligence();
  for (const competency of ["", "unknown", "Discovery", null]) {
    const focus = makeFocus("discovery", {
      competency,
      label: "Rapport",
      observation: "Practice a Trial Close",
    });
    assert.equal(system.buildFocusPracticeOption(focus), null);
  }
});

test("malformed source fails closed", () => {
  const system = loadIntelligence();
  for (const source of [
    null,
    [],
    {},
    {
      basis: "confirmed-recurring-pattern",
      evidenceTier: "E4",
      patternId: "pattern",
      patternVersionIdentity: "version",
    },
    {
      basis: "confirmed-recurring-pattern",
      evidenceTier: "E4",
      patternId: "",
      patternVersionIdentity: "version",
      patternReviewId: "review",
    },
  ]) {
    assert.equal(
      system.buildFocusPracticeOption(makeFocus("discovery", { source })),
      null,
    );
  }
});

test("E3 tier and wrong source basis are rejected", () => {
  const system = loadIntelligence();
  const source = makeFocus().source;
  assert.equal(
    system.buildFocusPracticeOption(
      makeFocus("discovery", {
        source: { ...source, evidenceTier: "E3" },
      }),
    ),
    null,
  );
  assert.equal(
    system.buildFocusPracticeOption(
      makeFocus("discovery", {
        source: { ...source, basis: "commander-development-focus" },
      }),
    ),
    null,
  );
});

test("missing malformed and noncanonical chosenAt values are rejected", () => {
  const system = loadIntelligence();
  for (const chosenAt of [undefined, "", "not-a-date", "2026-09-03T12:00:00Z"]) {
    const focus = makeFocus("discovery");
    if (chosenAt === undefined) {
      delete focus.chosenAt;
    } else {
      focus.chosenAt = chosenAt;
    }
    assert.equal(system.buildFocusPracticeOption(focus), null);
  }
});

test("extra focus or source fields make the snapshot noncanonical", () => {
  const system = loadIntelligence();
  assert.equal(
    system.buildFocusPracticeOption(makeFocus("discovery", { status: "active" })),
    null,
  );
  const focus = makeFocus("discovery");
  focus.source.current = true;
  assert.equal(system.buildFocusPracticeOption(focus), null);
});

test("historical valid focus produces an option without current support input", () => {
  const system = loadIntelligence();
  const focus = makeFocus("rapport", {
    observation: "A historical persisted observation.",
    chosenAt: "2025-01-01T00:00:00.000Z",
  });
  const result = clone(system.buildFocusPracticeOption(focus));
  assert.equal(result.missionIntent, "practice-rapport");
  assert.equal(Object.hasOwn(result, "support"), false);
  assert.equal(Object.hasOwn(result, "current"), false);
});

test("output omits observation E4 provenance timestamp and authority fields", () => {
  const result = loadIntelligence().buildFocusPracticeOption(makeFocus());
  const serialized = JSON.stringify(result);
  for (const key of [
    "observation",
    "patternId",
    "patternVersionIdentity",
    "patternReviewId",
    "chosenAt",
    "generatedAt",
    "score",
    "rank",
    "confidence",
    "priority",
    "recommended",
    "recommendationReason",
    "reasonText",
    "interactionCount",
    "reportCount",
    "selected",
    "active",
    "pending",
  ]) {
    assert.equal(Object.hasOwn(result, key), false, key);
    assert.doesNotMatch(serialized, new RegExp(`"${key}"`));
  }
});

test("input is unchanged and output is fresh and detached", () => {
  const system = loadIntelligence();
  const focus = makeFocus("presentation");
  const before = clone(focus);
  const first = system.buildFocusPracticeOption(focus);
  const second = system.buildFocusPracticeOption(focus);
  assert.deepEqual(clone(focus), before);
  assert.notEqual(first, second);
  assert.notEqual(first.source, second.source);
  first.source.basis = "changed";
  first.label = "changed";
  assert.deepEqual(clone(focus), before);
  assert.equal(second.source.basis, "commander-development-focus");
  assert.equal(second.label, definitions.presentation.label);
});

test("repeated calls are deterministic", () => {
  const system = loadIntelligence();
  const focus = makeFocus("objection-handling");
  assert.deepEqual(
    clone(system.buildFocusPracticeOption(focus)),
    clone(system.buildFocusPracticeOption(focus)),
  );
});

test("Phase 7 candidates consume the shared canonical practice definition", () => {
  const start = systemSource.indexOf("  buildPracticeCandidates(");
  const end = systemSource.indexOf("\n  rotatePracticeCandidate(", start);
  const method = systemSource.slice(start, end);
  assert.match(method, /getCampingSalesPracticeDefinition/);
  assert.doesNotMatch(method, /missionIntentByCompetency|labelByCompetency/);
});

test("shared definitions preserve all six Phase 7 mission intents", () => {
  const system = loadIntelligence();
  for (const [competency, expected] of Object.entries(definitions)) {
    assert.deepEqual(clone(system.getCampingSalesPracticeDefinition(competency)), {
      competency,
      label: {
        rapport: "Rapport",
        discovery: "Discovery",
        "product-selection": "Product Selection",
        presentation: "Presentation",
        "objection-handling": "Objection Handling",
        "trial-close": "Trial Close",
      }[competency],
      missionIntent: expected.missionIntent,
      actionLabel: expected.label,
    });
  }
});

test("new focus path has no persistence mission runtime or authority transfer", () => {
  const start = systemSource.indexOf("  buildFocusPracticeOption(");
  const end = systemSource.indexOf("\n  identifyLearningSignal(", start);
  const method = systemSource.slice(start, end);
  assert.match(method, /developmentFocus/);
  assert.match(method, /getCampingSalesPracticeDefinition/);
  assert.doesNotMatch(
    method,
    /MemorySystem|saveArtifact|saveFounder|localStorage|sessionStorage|founder|pendingMissionRequest|missionGoal|missionStatus|generateMission|preview|select.*Mission|GuidanceSystem|Profile|profile|\bxp\b|completion|commandLog|dailyCore|nextFocus|recommendPractice|buildDevelopmentFocusSupport|exact-source|identifyBehavioralEvidence|identifyRecurringBehavioralPatterns|\.sort\(|score|rank|confidence|priority|weakness|mastery|need|urgency/i,
  );
});

test("focus projection causes no persistence or mission-state side effects", () => {
  let calls = 0;
  const founderState = {
    pendingMissionRequest: null,
    missionGoal: "Existing",
    missionStatus: "inactive",
    profile: { capabilities: [] },
    xp: 10,
  };
  const founderBefore = clone(founderState);
  const system = loadIntelligence({
    MemorySystem: { saveArtifact() { calls += 1; } },
    saveFounder() { calls += 1; },
    founder: founderState,
  });
  const before = clone(system.buildFocusPracticeOption(makeFocus("trial-close")));
  const after = clone(system.buildFocusPracticeOption(makeFocus("trial-close")));
  assert.equal(calls, 0);
  assert.deepEqual(founderState, founderBefore);
  assert.deepEqual(after, before);
});