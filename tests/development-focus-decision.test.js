const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const intelligencePath = path.join(
  root,
  "systems",
  "mission-intelligence.system.js",
);
const corePath = path.join(root, "js", "core", "archie-core.js");
const intelligenceSource = fs.readFileSync(intelligencePath, "utf8");
const coreSource = fs.readFileSync(corePath, "utf8");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function loadIntelligence() {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(
    `${intelligenceSource}\n;globalThis.__api = MissionIntelligenceSystem;`,
    context,
    { filename: intelligencePath },
  );
  return context.__api;
}

function loadCore(DateImpl = Date) {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date: DateImpl,
    Math,
  });
  vm.runInContext(`${coreSource}\n;globalThis.__api = ArchieCore;`, context, {
    filename: corePath,
  });
  return context.__api;
}

function makeSource(overrides = {}) {
  return {
    basis: "confirmed-recurring-pattern",
    evidenceTier: "E4",
    patternId: "behavioral_pattern_discovery",
    patternVersionIdentity: "pattern_version_discovery_a",
    patternReviewId: "pattern_review_discovery_a",
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

function makeSelection(source = makeSource(), overrides = {}) {
  return {
    domain: "camping.sales",
    source: { ...source },
    ...overrides,
  };
}

function makeFocus(option = makeOption(), chosenAt = "2026-09-03T12:00:00.000Z") {
  return {
    type: "development-focus",
    version: 1,
    domain: "camping.sales",
    competency: option.competency,
    label: option.label,
    observation: option.observation,
    source: { ...option.source },
    chosenAt,
  };
}

function makeArtifact(focus = makeFocus(), overrides = {}) {
  return {
    type: "camping.developmentFocus",
    schemaVersion: "DEVELOPMENT_FOCUS_SCHEMA_v1",
    focus: focus === null ? null : clone(focus),
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    ...overrides,
  };
}

function createHarness({
  options = makeOptions(),
  focusArtifact,
  saveResult = true,
  DateImpl = Date,
} = {}) {
  const core = loadCore(DateImpl);
  const intelligence = loadIntelligence();
  const reports = [{ id: "report-current" }];
  const e3 = { reviews: [{ id: "e3-current" }] };
  const e4 = { reviews: [{ id: "e4-current" }] };
  const artifacts = {
    "camping.fieldReports": { reports },
    "camping.behavioralEvidenceReviews": e3,
    "camping.behavioralPatternReviews": e4,
  };
  if (focusArtifact !== undefined) {
    artifacts["camping.developmentFocus"] = clone(focusArtifact);
  }
  let currentOptions = clone(options);
  let saveCount = 0;
  let synthesisCalls = 0;
  let optionCalls = 0;
  core.systems = {
    memory: {
      getArtifact(type) {
        return artifacts[type] ?? null;
      },
      saveArtifact(artifact) {
        saveCount += 1;
        if (saveResult === "throw") throw new Error("save failed");
        if (!saveResult) return null;
        artifacts[artifact.type] = clone(artifact);
        return artifacts[artifact.type];
      },
    },
    missionIntelligence: {
      buildCoachingSynthesis(receivedReports, receivedE3, receivedE4) {
        synthesisCalls += 1;
        assert.equal(receivedReports, reports);
        assert.equal(receivedE3, e3);
        assert.equal(receivedE4, e4);
        return {
          type: "coaching-synthesis",
          version: 1,
          domain: "camping.sales",
          generatedAt: "2026-09-03T11:00:00.000Z",
          insights: [],
        };
      },
      buildDevelopmentFocusOptions() {
        optionCalls += 1;
        return clone(currentOptions);
      },
      findDevelopmentFocusOption: intelligence.findDevelopmentFocusOption.bind(
        intelligence,
      ),
    },
  };
  return {
    core,
    intelligence,
    artifacts,
    reports,
    e3,
    e4,
    setOptions(value) {
      currentOptions = clone(value);
    },
    getSaveCount() {
      return saveCount;
    },
    getSynthesisCalls() {
      return synthesisCalls;
    },
    getOptionCalls() {
      return optionCalls;
    },
  };
}

test("pure resolver returns a detached exact-source option", () => {
  const intelligence = loadIntelligence();
  const option = makeOption();
  const options = makeOptions([option]);
  const result = intelligence.findDevelopmentFocusOption(options, option.source);

  assert.deepEqual(clone(result), option);
  assert.notEqual(result, option);
  assert.notEqual(result.source, option.source);
  result.label = "Changed";
  result.source.patternId = "changed";
  assert.equal(option.label, "Discovery");
  assert.equal(option.source.patternId, "behavioral_pattern_discovery");
});

test("pure resolver requires the complete exact source tuple", () => {
  const intelligence = loadIntelligence();
  const options = makeOptions();
  for (const source of [
    { patternId: makeSource().patternId },
    makeSource({ patternVersionIdentity: "different" }),
    makeSource({ patternReviewId: "different" }),
    makeSource({ basis: "other" }),
    makeSource({ evidenceTier: "E3" }),
  ]) {
    assert.equal(intelligence.findDevelopmentFocusOption(options, source), null);
  }
});

test("competency label observation and array position are not selection authority", () => {
  const intelligence = loadIntelligence();
  const target = makeOption();
  const altered = makeOption({
    competency: "rapport",
    label: "Altered",
    observation: "Altered",
    source: makeSource({ patternReviewId: "different" }),
  });
  const result = intelligence.findDevelopmentFocusOption(
    makeOptions([altered, target]),
    target.source,
  );
  assert.deepEqual(clone(result), target);
  assert.equal(
    intelligence.findDevelopmentFocusOption(makeOptions([altered]), target.source),
    null,
  );
});

test("empty malformed and duplicate option sets resolve null", () => {
  const intelligence = loadIntelligence();
  const option = makeOption();
  const duplicateSource = makeOption({ competency: "rapport", source: option.source });
  const duplicateCompetency = makeOption({
    source: makeSource({ patternId: "other", patternReviewId: "other" }),
  });
  for (const options of [
    null,
    {},
    makeOptions([]),
    makeOptions([{}]),
    { ...makeOptions([option]), unexpected: true },
    makeOptions([{ ...option, unexpected: true }]),
    makeOptions([{ ...option, source: { ...option.source, unexpected: true } }]),
    makeOptions([option, duplicateSource]),
    makeOptions([option, duplicateCompetency]),
  ]) {
    assert.equal(
      intelligence.findDevelopmentFocusOption(options, option.source),
      null,
    );
  }
});

test("valid explicit choose creates and persists the exact v1 focus once", async () => {
  const harness = createHarness();
  const option = makeOption();
  const selection = makeSelection(option.source);
  const result = await harness.core.chooseDevelopmentFocus(selection);
  const artifact = harness.artifacts["camping.developmentFocus"];

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(harness.getSaveCount(), 1);
  assert.equal(harness.getSynthesisCalls(), 1);
  assert.equal(harness.getOptionCalls(), 1);
  assert.deepEqual(clone(result.focus), {
    type: "development-focus",
    version: 1,
    domain: "camping.sales",
    competency: option.competency,
    label: option.label,
    observation: option.observation,
    source: option.source,
    chosenAt: result.focus.chosenAt,
  });
  assert.equal(new Date(result.focus.chosenAt).toISOString(), result.focus.chosenAt);
  assert.equal(artifact.type, "camping.developmentFocus");
  assert.equal(artifact.schemaVersion, "DEVELOPMENT_FOCUS_SCHEMA_v1");
  assert.deepEqual(clone(artifact.focus), clone(result.focus));
});

test("persisted semantic fields come from the canonical option only", async () => {
  const harness = createHarness();
  const source = makeSource();
  const selection = {
    ...makeSelection(source),
    competency: "rapport",
    label: "Caller label",
    observation: "Caller observation",
  };
  const rejected = await harness.core.chooseDevelopmentFocus(selection);
  assert.equal(rejected.reason, "invalid-development-focus-selection");
  assert.equal(harness.getSaveCount(), 0);
});

test("null malformed and arbitrary option-shaped selections fail without derivation", async () => {
  for (const selection of [
    null,
    [],
    {},
    makeOption(),
    makeSelection(makeSource(), { extra: true }),
    { domain: "camping.sales", source: { ...makeSource(), extra: true } },
  ]) {
    const harness = createHarness();
    const result = await harness.core.chooseDevelopmentFocus(selection);
    assert.deepEqual(clone(result), {
      success: false,
      changed: false,
      reason: "invalid-development-focus-selection",
    });
    assert.equal(harness.getSynthesisCalls(), 0);
    assert.equal(harness.getSaveCount(), 0);
  }
});

test("no matching current option and empty options never select a default", async () => {
  for (const options of [makeOptions([]), makeOptions([makeOption()])]) {
    const harness = createHarness({ options });
    const missing = makeSource({
      patternId: "missing",
      patternVersionIdentity: "missing-version",
      patternReviewId: "missing-review",
    });
    const result = await harness.core.chooseDevelopmentFocus(
      makeSelection(missing),
    );
    assert.equal(result.reason, "development-focus-option-not-current");
    assert.equal(result.changed, false);
    assert.equal(harness.getSaveCount(), 0);
  }
});

test("missing systems and unavailable derivation return distinct failures", async () => {
  const core = loadCore();
  core.systems = {};
  assert.equal(
    (await core.chooseDevelopmentFocus(makeSelection())).reason,
    "development-focus-systems-unavailable",
  );

  const malformed = createHarness();
  malformed.core.systems.missionIntelligence.buildCoachingSynthesis = () => ({});
  assert.equal(
    (await malformed.core.chooseDevelopmentFocus(makeSelection())).reason,
    "development-focus-options-unavailable",
  );
  assert.equal(malformed.getSaveCount(), 0);

  const malformedOptions = createHarness({
    options: makeOptions([{ ...makeOption(), unexpected: true }]),
  });
  assert.equal(
    (await malformedOptions.core.chooseDevelopmentFocus(makeSelection())).reason,
    "development-focus-options-unavailable",
  );
  assert.equal(malformedOptions.getSaveCount(), 0);

  const malformedEmptyOptions = createHarness({
    options: { ...makeOptions([]), unexpected: true },
  });
  assert.equal(
    (
      await malformedEmptyOptions.core.chooseDevelopmentFocus(makeSelection())
    ).reason,
    "development-focus-options-unavailable",
  );
  assert.equal(malformedEmptyOptions.getSaveCount(), 0);

  const throwing = createHarness();
  throwing.core.systems.missionIntelligence.buildCoachingSynthesis = () => {
    throw new Error("unavailable");
  };
  assert.equal(
    (await throwing.core.chooseDevelopmentFocus(makeSelection())).reason,
    "development-focus-options-unavailable",
  );
});

test("different competency replaces the singleton without history", async () => {
  const first = makeOption();
  const second = makeOption({
    competency: "rapport",
    label: "Rapport",
    observation:
      "You confirmed a recurring pattern across 3 reviewed interaction records where you referenced customer-provided context during Rapport. This does not establish customer trust, comfort, sentiment, likability, or Rapport quality.",
    source: makeSource({
      patternId: "behavioral_pattern_rapport",
      patternVersionIdentity: "pattern_version_rapport",
      patternReviewId: "pattern_review_rapport",
    }),
  });
  const harness = createHarness({ options: makeOptions([first, second]) });
  await harness.core.chooseDevelopmentFocus(makeSelection(first.source));
  const result = await harness.core.chooseDevelopmentFocus(
    makeSelection(second.source),
  );
  const artifact = harness.artifacts["camping.developmentFocus"];
  assert.equal(result.changed, true);
  assert.equal(result.focus.competency, "rapport");
  assert.equal(harness.getSaveCount(), 2);
  assert.equal(Array.isArray(artifact.history), false);
  assert.deepEqual(clone(artifact.focus.source), second.source);
});

test("new pattern version or review ID is an explicit change", async () => {
  for (const sourceChange of [
    { patternVersionIdentity: "pattern_version_discovery_b" },
    { patternReviewId: "pattern_review_discovery_b" },
  ]) {
    const first = makeOption();
    const second = makeOption({ source: makeSource(sourceChange) });
    const harness = createHarness({ options: makeOptions([first]) });
    const initial = await harness.core.chooseDevelopmentFocus(
      makeSelection(first.source),
    );
    harness.setOptions(makeOptions([second]));
    const changed = await harness.core.chooseDevelopmentFocus(
      makeSelection(second.source),
    );
    assert.equal(changed.changed, true);
    assert.notDeepEqual(changed.focus.source, initial.focus.source);
    assert.equal(harness.getSaveCount(), 2);
  }
});

test("same exact source is idempotent and preserves the original snapshot", async () => {
  const original = makeOption();
  const existing = makeFocus(original, "2026-09-01T10:00:00.000Z");
  const current = makeOption({
    label: "Changed current label",
    observation: "Changed current observation",
  });
  const harness = createHarness({
    options: makeOptions([current]),
    focusArtifact: makeArtifact(existing),
  });
  const result = await harness.core.chooseDevelopmentFocus(
    makeSelection(current.source),
  );
  assert.equal(result.success, true);
  assert.equal(result.changed, false);
  assert.equal(harness.getSaveCount(), 0);
  assert.deepEqual(clone(result.focus), existing);
  assert.equal(result.focus.label, "Discovery");
  assert.equal(result.focus.chosenAt, "2026-09-01T10:00:00.000Z");
});

test("valid choose replaces malformed persisted state without salvaging it", async () => {
  const harness = createHarness({ focusArtifact: { malformed: true } });
  const result = await harness.core.chooseDevelopmentFocus(makeSelection());
  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(harness.getSaveCount(), 1);
  assert.equal(
    harness.artifacts["camping.developmentFocus"].schemaVersion,
    "DEVELOPMENT_FOCUS_SCHEMA_v1",
  );
  assert.equal(
    Object.hasOwn(harness.artifacts["camping.developmentFocus"], "malformed"),
    false,
  );
});

test("getter distinguishes missing null malformed and valid focus", () => {
  const missing = createHarness();
  assert.deepEqual(clone(missing.core.getDevelopmentFocus()), {
    success: true,
    focus: null,
  });

  const cleared = createHarness({ focusArtifact: makeArtifact(null) });
  assert.deepEqual(clone(cleared.core.getDevelopmentFocus()), {
    success: true,
    focus: null,
  });

  const malformed = createHarness({ focusArtifact: {} });
  assert.deepEqual(clone(malformed.core.getDevelopmentFocus()), {
    success: false,
    focus: null,
    reason: "invalid-development-focus-artifact",
  });

  const extraField = createHarness({
    focusArtifact: makeArtifact(makeFocus(), { forbidden: true }),
  });
  assert.equal(
    extraField.core.getDevelopmentFocus().reason,
    "invalid-development-focus-artifact",
  );

  const focus = makeFocus();
  const valid = createHarness({ focusArtifact: makeArtifact(focus) });
  assert.deepEqual(clone(valid.core.getDevelopmentFocus()), {
    success: true,
    focus,
  });
  assert.equal(valid.getSynthesisCalls(), 0);
  assert.equal(valid.getOptionCalls(), 0);
  assert.equal(valid.getSaveCount(), 0);
});

test("clear saves canonical null once and needs no evidence or options", async () => {
  const harness = createHarness({ focusArtifact: makeArtifact() });
  delete harness.artifacts["camping.fieldReports"];
  delete harness.artifacts["camping.behavioralEvidenceReviews"];
  delete harness.artifacts["camping.behavioralPatternReviews"];
  const result = await harness.core.clearDevelopmentFocus();
  assert.deepEqual(clone(result), {
    success: true,
    changed: true,
    focus: null,
  });
  assert.equal(harness.getSaveCount(), 1);
  assert.equal(harness.artifacts["camping.developmentFocus"].focus, null);
  assert.equal(harness.getSynthesisCalls(), 0);
  assert.equal(harness.getOptionCalls(), 0);
});

test("clear is idempotent for missing and canonical null state", async () => {
  for (const focusArtifact of [undefined, makeArtifact(null)]) {
    const harness = createHarness({ focusArtifact });
    const result = await harness.core.clearDevelopmentFocus();
    assert.deepEqual(clone(result), {
      success: true,
      changed: false,
      focus: null,
    });
    assert.equal(harness.getSaveCount(), 0);
  }
});

test("explicit clear replaces malformed state with canonical null", async () => {
  const harness = createHarness({ focusArtifact: { bad: true } });
  const result = await harness.core.clearDevelopmentFocus();
  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(harness.getSaveCount(), 1);
  assert.equal(harness.artifacts["camping.developmentFocus"].focus, null);
});

test("persistence failures remain distinct for choose and clear", async () => {
  for (const saveResult of [false, "throw"]) {
    const choose = createHarness({ saveResult });
    assert.equal(
      (await choose.core.chooseDevelopmentFocus(makeSelection())).reason,
      "development-focus-persistence-failed",
    );
    const clear = createHarness({
      saveResult,
      focusArtifact: makeArtifact(),
    });
    assert.equal(
      (await clear.core.clearDevelopmentFocus()).reason,
      "development-focus-persistence-failed",
    );
  }
});

test("request option persisted state and getter results remain detached", async () => {
  const option = makeOption();
  const options = makeOptions([option]);
  const selection = makeSelection(option.source);
  const harness = createHarness({ options });
  const result = await harness.core.chooseDevelopmentFocus(selection);
  const stored = harness.artifacts["camping.developmentFocus"];

  selection.source.patternId = "request-mutated";
  option.source.patternId = "option-mutated";
  result.focus.source.patternId = "result-mutated";
  result.focus.label = "result-mutated";
  assert.equal(stored.focus.source.patternId, "behavioral_pattern_discovery");
  assert.equal(stored.focus.label, "Discovery");

  const first = harness.core.getDevelopmentFocus();
  const second = harness.core.getDevelopmentFocus();
  assert.notEqual(first.focus, second.focus);
  assert.notEqual(first.focus.source, second.focus.source);
  first.focus.observation = "getter-mutated";
  assert.notEqual(second.focus.observation, "getter-mutated");
  assert.notEqual(stored.focus.observation, "getter-mutated");
});

test("evidence changes never rewrite or clear a saved focus during get", async () => {
  const harness = createHarness();
  const chosen = await harness.core.chooseDevelopmentFocus(makeSelection());
  const snapshot = clone(harness.artifacts["camping.developmentFocus"]);

  for (const options of [
    makeOptions([
      makeOption({
        source: makeSource({ patternVersionIdentity: "new-version" }),
      }),
    ]),
    makeOptions([
      makeOption({ source: makeSource({ patternReviewId: "new-review" }) }),
    ]),
    makeOptions([]),
    {},
  ]) {
    harness.setOptions(options);
    const result = harness.core.getDevelopmentFocus();
    assert.equal(result.success, true);
    assert.deepEqual(clone(result.focus), clone(chosen.focus));
    assert.deepEqual(
      harness.artifacts["camping.developmentFocus"],
      snapshot,
    );
  }
  assert.equal(harness.getSaveCount(), 1);
});

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
  };
}

function loadPersistenceHarness(localStorage, options = makeOptions()) {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    localStorage,
    sessionStorage: createStorage(),
    Date,
    Math,
  });
  for (const relative of [
    "js/storage.js",
    "systems/commander.system.js",
    "systems/memory.system.js",
    "js/core/archie-core.js",
  ]) {
    const file = path.join(root, relative);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  vm.runInContext(
    `globalThis.__api = { founder, loadFounder, MemorySystem, CommanderSystem, ArchieCore };`,
    context,
  );
  const api = context.__api;
  api.loadFounder();
  const intelligence = loadIntelligence();
  api.ArchieCore.systems = {
    memory: api.MemorySystem,
    commander: api.CommanderSystem,
    missionIntelligence: {
      buildCoachingSynthesis() {
        return {
          type: "coaching-synthesis",
          version: 1,
          domain: "camping.sales",
          insights: [],
        };
      },
      buildDevelopmentFocusOptions() {
        return clone(options);
      },
      findDevelopmentFocusOption: intelligence.findDevelopmentFocusOption.bind(
        intelligence,
      ),
    },
  };
  api.founder.memory.artifacts["camping.fieldReports"] = { reports: [{}] };
  api.founder.memory.artifacts["camping.behavioralEvidenceReviews"] = null;
  api.founder.memory.artifacts["camping.behavioralPatternReviews"] = null;
  return api;
}

test("chosen and cleared focus survive real save and reload", async () => {
  const localStorage = createStorage();
  const first = loadPersistenceHarness(localStorage);
  const chosen = await first.ArchieCore.chooseDevelopmentFocus(makeSelection());
  assert.equal(chosen.success, true);

  const reloaded = loadPersistenceHarness(localStorage);
  assert.deepEqual(clone(reloaded.ArchieCore.getDevelopmentFocus()), {
    success: true,
    focus: clone(chosen.focus),
  });
  const cleared = await reloaded.ArchieCore.clearDevelopmentFocus();
  assert.equal(cleared.success, true);
  assert.equal(cleared.changed, true);

  const afterClear = loadPersistenceHarness(localStorage);
  assert.deepEqual(clone(afterClear.ArchieCore.getDevelopmentFocus()), {
    success: true,
    focus: null,
  });
});

test("legacy missing and corrupted artifacts remain distinct without load migration", () => {
  const legacyStorage = createStorage({
    digitalMikeyFounder: JSON.stringify({ memory: { artifacts: {} } }),
  });
  const legacy = loadPersistenceHarness(legacyStorage);
  assert.deepEqual(clone(legacy.ArchieCore.getDevelopmentFocus()), {
    success: true,
    focus: null,
  });
  assert.equal(
    Object.hasOwn(
      JSON.parse(legacyStorage.getItem("digitalMikeyFounder")).memory.artifacts,
      "camping.developmentFocus",
    ),
    false,
  );

  const corruptedStorage = createStorage({
    digitalMikeyFounder: JSON.stringify({
      memory: {
        artifacts: { "camping.developmentFocus": { malformed: true } },
      },
    }),
  });
  const corrupted = loadPersistenceHarness(corruptedStorage);
  assert.equal(
    corrupted.ArchieCore.getDevelopmentFocus().reason,
    "invalid-development-focus-artifact",
  );
  assert.deepEqual(
    JSON.parse(corruptedStorage.getItem("digitalMikeyFounder")).memory.artifacts[
      "camping.developmentFocus"
    ],
    { malformed: true },
  );
});

test("focus shape contains no forbidden authority or evaluation fields", async () => {
  const harness = createHarness();
  const result = await harness.core.chooseDevelopmentFocus(makeSelection());
  const serialized = JSON.stringify(result.focus);
  for (const field of [
    "id",
    "decisionId",
    "versionIdentity",
    "optionId",
    "selected",
    "status",
    "active",
    "priority",
    "rank",
    "score",
    "confidence",
    "recommended",
    "recommendation",
    "recommendedCompetency",
    "missionIntent",
    "pendingMissionRequest",
    "action",
    "suggestion",
    "goal",
    "plan",
    "mastery",
    "weakness",
    "proficiency",
    "deficiency",
    "need",
    "urgency",
    "interactionCount",
    "reportCount",
    "currentlySupported",
    "currentEvidence",
    "chosenBy",
  ]) {
    assert.equal(Object.hasOwn(result.focus, field), false, field);
    assert.doesNotMatch(serialized, new RegExp(`"${field}"`));
  }
});

test("resolver has no ranking history counts or recommendation authority", () => {
  const start = intelligenceSource.indexOf("  findDevelopmentFocusOption(");
  const end = intelligenceSource.indexOf("\n  recommendPractice(", start);
  const source = intelligenceSource.slice(start, end);
  assert.match(source, /developmentFocusOptions/);
  assert.doesNotMatch(
    source,
    /\.sort\(|score|rank|priority|interactionCount|reportCount|recency|commandLog|recommendPractice|buildPracticeCandidates|rotatePracticeCandidate|identifyRecurringBehavioralPatterns|MemorySystem|saveArtifact|founder|profile/i,
  );
});

test("ArchieCore focus API excludes prohibited downstream authorities", () => {
  const start = coreSource.indexOf("  validateDevelopmentFocusArtifact(");
  const endMatch = coreSource
    .slice(start)
    .match(
      /\r?\n  \/\/ =====================================================\r?\n  \/\/ PROFILE CAPABILITY DECISION LEDGER/,
    );
  const end = endMatch ? start + endMatch.index : coreSource.length;
  const source = coreSource.slice(start, end);
  assert.match(source, /buildCoachingSynthesis/);
  assert.match(source, /buildDevelopmentFocusOptions/);
  assert.match(source, /findDevelopmentFocusOption/);
  assert.doesNotMatch(
    source,
    /missionIntent|pendingMissionRequest|GuidanceSystem|BriefingSystem|ReflectionSystem|CommanderSystem|profile\.capabilities|dailyCore|nextFocus|commandLog|\bxp\b|completion|recommendPractice|identifyProfileCapabilityCandidates/i,
  );
});

test("Phase 9.1 options remain unchanged by focus decisions", async () => {
  const intelligence = loadIntelligence();
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
        provenance: {
          evidenceTier: "E4",
          patternId: makeSource().patternId,
          patternVersionIdentity: makeSource().patternVersionIdentity,
          patternReviewId: makeSource().patternReviewId,
        },
      },
    ],
  };
  const before = clone(intelligence.buildDevelopmentFocusOptions(synthesis));
  const harness = createHarness({ options: before });
  await harness.core.chooseDevelopmentFocus(makeSelection());
  await harness.core.clearDevelopmentFocus();
  assert.deepEqual(
    clone(intelligence.buildDevelopmentFocusOptions(synthesis)),
    before,
  );
  assert.deepEqual(synthesis.insights[0].provenance, {
    evidenceTier: "E4",
    patternId: makeSource().patternId,
    patternVersionIdentity: makeSource().patternVersionIdentity,
    patternReviewId: makeSource().patternReviewId,
  });
});
