const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const progressSource = fs.readFileSync(
  path.join(root, "progress.html"),
  "utf8",
);
const archieSource = fs.readFileSync(path.join(root, "js", "archie.js"), "utf8");
const styleSource = fs.readFileSync(path.join(root, "style.css"), "utf8");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
  return {
    competency: "discovery",
    label: "Discovery",
    observation:
      "You confirmed a recurring pattern across 3 reviewed interaction records: the evidence you reviewed is consistent with effective Discovery recurring across those interactions.",
    source: makeSource(),
    ...overrides,
  };
}

function makeOptions(options = [makeOption()]) {
  return {
    type: "development-focus-options",
    version: 1,
    domain: "camping.sales",
    options,
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

function createDom() {
  const nodes = new Map();
  const allNodes = [];

  function createNode(tag = "div") {
    let markup = "";
    let text = "";
    let className = "";
    const childNodes = [];
    const queried = new Map();
    const listeners = {};
    const attributes = {};
    function descendants() {
      const entries = [...childNodes, ...queried.values()];
      return entries.flatMap((entry) => [entry, ...entry._descendants()]);
    }
    const node = {
      tagName: tag.toUpperCase(),
      disabled: false,
      dataset: {},
      hidden: false,
      listeners,
      attributes,
      get className() {
        return className;
      },
      set className(value) {
        className = String(value);
      },
      get innerHTML() {
        return markup;
      },
      set innerHTML(value) {
        markup = String(value);
        childNodes.length = 0;
        queried.clear();
      },
      get textContent() {
        return text;
      },
      set textContent(value) {
        text = String(value);
      },
      get children() {
        return childNodes.flatMap((child) =>
          child._isFragment ? child.children : [child],
        );
      },
      appendChild(child) {
        childNodes.push(child);
      },
      querySelector(selector) {
        if (selector.startsWith(".")) {
          const className = selector.slice(1);
          const existing = descendants().find((entry) =>
            entry.className.split(/\s+/).includes(className),
          );
          if (existing) return existing;
        }
        if (!queried.has(selector)) {
          const tagName =
            selector.includes("choose") ||
            selector.includes("clear") ||
            selector.includes("preview")
              ? "button"
              : "div";
          const result = createNode(tagName);
          if (selector.startsWith(".")) {
            result.className = selector.slice(1);
          }
          queried.set(selector, result);
        }
        return queried.get(selector);
      },
      querySelectorAll(selector) {
        if (selector === "button") {
          return descendants().filter(
            (entry) => entry.tagName === "BUTTON",
          );
        }
        return [];
      },
      _descendants: descendants,
      addEventListener(type, listener) {
        listeners[type] = listener;
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
      },
      classList: {
        toggle(name, enabled) {
          const classes = new Set(className.split(/\s+/).filter(Boolean));
          if (enabled) classes.add(name);
          else classes.delete(name);
          className = Array.from(classes).join(" ");
        },
        add(name) {
          this.toggle(name, true);
        },
        remove(name) {
          this.toggle(name, false);
        },
      },
    };
    allNodes.push(node);
    return node;
  }

  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, createNode());
      return nodes.get(id);
    },
    createElement(tag) {
      return createNode(tag);
    },
    createDocumentFragment() {
      const fragment = createNode("fragment");
      fragment._isFragment = true;
      return fragment;
    },
    querySelectorAll(selector) {
      if (selector === ".development-focus-actions button") {
        return allNodes.filter((node) => node.tagName === "BUTTON");
      }
      return [];
    },
  };
  return { document, nodes, allNodes };
}

function loadUi(overrides = {}) {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    ...overrides,
  });
  vm.runInContext(
    `${archieSource}\n;globalThis.__ui = { ensureDevelopmentFocusSystems, setDevelopmentFocusFeedback, setDevelopmentFocusActionsDisabled, isDevelopmentFocusSupport, submitDevelopmentFocusChoice, submitDevelopmentFocusClear, renderSavedDevelopmentFocus, renderDevelopmentFocusOptions, updateDevelopmentFocusSurface };`,
    context,
  );
  return context.__ui;
}

function createUpdateHarness({
  options = makeOptions(),
  focusResult = { success: true, focus: null },
  chooseResult = { success: true, changed: true, focus: makeFocus() },
  clearResult = { success: true, changed: true, focus: null },
  synthesisResult,
  practiceOption = {
    type: "focus-practice-option",
    version: 1,
    domain: "camping.sales",
    competency: "discovery",
    label: "Practice Customer Discovery",
    missionIntent: "practice-customer-discovery",
    source: { basis: "commander-development-focus" },
  },
  practiceOptionThrows = false,
} = {}) {
  const dom = createDom();
  let currentFocusResult = clone(focusResult);
  let currentOptions = clone(options);
  let chooseCalls = 0;
  let clearCalls = 0;
  let synthesisCalls = 0;
  let optionsCalls = 0;
  let supportCalls = 0;
  let practiceOptionCalls = 0;
  let chooseInput = null;
  let registerCalls = [];
  const MemorySystem = { name: "memory" };
  const MissionIntelligenceSystem = {
    buildCoachingSynthesis(reports, e3, e4) {
      synthesisCalls += 1;
      assert.equal(reports, founder.memory.artifacts["camping.fieldReports"].reports);
      assert.equal(e3, founder.memory.artifacts["camping.behavioralEvidenceReviews"]);
      assert.equal(e4, founder.memory.artifacts["camping.behavioralPatternReviews"]);
      return synthesisResult === undefined
        ? {
            type: "coaching-synthesis",
            version: 1,
            domain: "camping.sales",
            generatedAt: "2026-09-03T12:00:00.000Z",
            insights: [],
          }
        : synthesisResult;
    },
    buildDevelopmentFocusOptions() {
      optionsCalls += 1;
      return clone(currentOptions);
    },
    buildDevelopmentFocusSupport(focus, suppliedOptions) {
      supportCalls += 1;
      if (focus === null) {
        return {
          type: "development-focus-support",
          version: 1,
          domain: "camping.sales",
          state: "no-focus",
        };
      }
      if (!suppliedOptions || !Array.isArray(suppliedOptions.options)) {
        return {
          type: "development-focus-support",
          version: 1,
          domain: "camping.sales",
          state: "unavailable",
        };
      }
      const exact = suppliedOptions.options.some(
        (option) =>
          option.source.basis === focus.source.basis &&
          option.source.evidenceTier === focus.source.evidenceTier &&
          option.source.patternId === focus.source.patternId &&
          option.source.patternVersionIdentity ===
            focus.source.patternVersionIdentity &&
          option.source.patternReviewId === focus.source.patternReviewId,
      );
      return {
        type: "development-focus-support",
        version: 1,
        domain: "camping.sales",
        state: exact ? "exact-source-present" : "exact-source-not-present",
      };
    },
    buildFocusPracticeOption(focus) {
      practiceOptionCalls += 1;
      assert.deepEqual(clone(focus), currentFocusResult.focus);
      if (practiceOptionThrows) throw new Error("practice option unavailable");
      return clone(practiceOption);
    },
  };
  const ArchieCore = {
    registerSystem(name, system) {
      registerCalls.push([name, system]);
    },
    getDevelopmentFocus() {
      return clone(currentFocusResult);
    },
    async chooseDevelopmentFocus(input) {
      chooseCalls += 1;
      chooseInput = clone(input);
      if (chooseResult && chooseResult.success === true) {
        currentFocusResult = { success: true, focus: clone(chooseResult.focus) };
      }
      return clone(chooseResult);
    },
    async clearDevelopmentFocus() {
      clearCalls += 1;
      if (clearResult && clearResult.success === true) {
        currentFocusResult = { success: true, focus: null };
      }
      return clone(clearResult);
    },
  };
  const founder = {
    memory: {
      artifacts: {
        "camping.fieldReports": { reports: [{}] },
        "camping.behavioralEvidenceReviews": { reviews: [] },
        "camping.behavioralPatternReviews": { reviews: [] },
      },
    },
  };
  const ui = loadUi({
    document: dom.document,
    founder,
    MemorySystem,
    MissionIntelligenceSystem,
    ArchieCore,
  });
  return {
    ...dom,
    ui,
    ArchieCore,
    MissionIntelligenceSystem,
    MemorySystem,
    setOptions(value) {
      currentOptions = clone(value);
    },
    counts() {
      return {
        chooseCalls,
        clearCalls,
        synthesisCalls,
        optionsCalls,
        supportCalls,
        practiceOptionCalls,
      };
    },
    getChooseInput() {
      return chooseInput;
    },
    getRegisterCalls() {
      return registerCalls;
    },
  };
}

test("card has exact copy, targets, accessibility, placement, and wiring", () => {
  assert.match(progressSource, />Choose a Development Focus</);
  assert.match(progressSource, />Your choice, not a recommendation\.</);
  assert.match(
    progressSource,
    /These options come from the recurring patterns you confirmed\. Choosing one records what you want to focus on; it does not score your ability, change your Profile, or start a mission\. Choosing none is valid\./,
  );
  assert.match(
    progressSource,
    /id="development-focus-feedback"[^>]*role="status"[^>]*aria-live="polite"/,
  );
  assert.match(progressSource, /id="saved-development-focus"/);
  assert.match(progressSource, /id="development-focus-options"/);
  const synthesis = progressSource.indexOf(">Coaching Synthesis<");
  const focus = progressSource.indexOf(">Choose a Development Focus<");
  const profile = progressSource.indexOf(">Developing Capability Suggestions<");
  assert.ok(focus > synthesis);
  assert.ok(profile > focus);
  assert.match(
    progressSource,
    /updateCoachingSynthesis\(\);[\s\S]*updateDevelopmentFocusSurface\(\);[\s\S]*updateProfileCapabilitySurface\(\);/,
  );
});

test("one option renders one uniform record with exact text and accessible action", () => {
  const { document } = createDom();
  const ui = loadUi({ document });
  const container = document.getElementById("development-focus-options");
  const option = makeOption();
  ui.renderDevelopmentFocusOptions(container, makeOptions([option]), () => {});
  assert.equal(container.children.length, 1);
  const record = container.children[0];
  assert.equal(record.className, "mission-record development-focus-option-record");
  assert.equal(record.querySelector(".development-focus-label").textContent, option.label);
  assert.equal(
    record.querySelector(".development-focus-observation").textContent,
    option.observation,
  );
  const action = record.querySelector(".development-focus-choose");
  assert.equal(action.attributes["aria-label"], "Choose Discovery as Development Focus");
  assert.match(record.innerHTML, /DEVELOPMENT FOCUS OPTION · E4/);
  assert.match(record.innerHTML, /Choose as Development Focus/);
});

test("multiple options preserve supplied order and exact Rapport wording", () => {
  const { document } = createDom();
  const ui = loadUi({ document });
  const container = document.getElementById("development-focus-options");
  const rapportObservation =
    "You confirmed a recurring pattern across 3 reviewed interaction records where you referenced customer-provided context during Rapport. This does not establish customer trust, comfort, sentiment, likability, or Rapport quality.";
  const rapport = makeOption({
    competency: "rapport",
    label: "Rapport",
    observation: rapportObservation,
    source: makeSource({
      patternId: "behavioral_pattern_rapport",
      patternVersionIdentity: "pattern_version_rapport",
      patternReviewId: "pattern_review_rapport",
    }),
  });
  const discovery = makeOption();
  ui.renderDevelopmentFocusOptions(
    container,
    makeOptions([discovery, rapport]),
    () => {},
  );
  assert.equal(container.children.length, 2);
  assert.equal(
    container.children[0].querySelector(".development-focus-label").textContent,
    "Discovery",
  );
  assert.equal(
    container.children[1].querySelector(".development-focus-label").textContent,
    "Rapport",
  );
  assert.equal(
    container.children[1].querySelector(".development-focus-observation").textContent,
    rapportObservation,
  );
});

test("options expose no default recommendation currentness counts or source IDs", () => {
  const { document } = createDom();
  const ui = loadUi({ document });
  const container = document.getElementById("development-focus-options");
  ui.renderDevelopmentFocusOptions(container, makeOptions(), () => {});
  const record = container.children[0];
  assert.doesNotMatch(
    record.innerHTML,
    /selected|current|recommended|priority|interactionCount|reportCount|patternId|patternVersionIdentity|patternReviewId/i,
  );
  assert.equal(record.querySelectorAll("button").length, 1);
});

test("saved focus renders independently from persisted getter snapshot", async () => {
  const focus = makeFocus();
  const harness = createUpdateHarness({
    focusResult: { success: true, focus },
    options: makeOptions([]),
  });
  await harness.ui.updateDevelopmentFocusSurface();
  const saved = harness.nodes.get("saved-development-focus");
  const options = harness.nodes.get("development-focus-options");
  assert.equal(saved.children.length, 1);
  const record = saved.children[0];
  assert.equal(record.querySelector(".development-focus-label").textContent, focus.label);
  assert.equal(
    record.querySelector(".development-focus-observation").textContent,
    focus.observation,
  );
  assert.match(record.innerHTML, /SAVED DEVELOPMENT FOCUS/);
  assert.match(record.innerHTML, /You previously chose this Development Focus\./);
  assert.match(record.innerHTML, /Clear Development Focus/);
  assert.match(
    options.innerHTML,
    /No Development Focus options are available from Coaching Synthesis\. Choosing none remains valid\./,
  );
});

test("saved focus remains unchanged when its source is absent from current options", async () => {
  const focus = makeFocus();
  const other = makeOption({
    competency: "rapport",
    label: "Rapport",
    observation: "Other option.",
    source: makeSource({
      patternId: "other",
      patternVersionIdentity: "other-version",
      patternReviewId: "other-review",
    }),
  });
  const harness = createUpdateHarness({
    focusResult: { success: true, focus },
    options: makeOptions([other]),
  });
  await harness.ui.updateDevelopmentFocusSurface();
  const saved = harness.nodes.get("saved-development-focus").children[0];
  const option = harness.nodes.get("development-focus-options").children[0];
  assert.equal(saved.querySelector(".development-focus-label").textContent, "Discovery");
  assert.equal(option.querySelector(".development-focus-label").textContent, "Rapport");
  assert.equal(saved.querySelector(".development-focus-observation").textContent, focus.observation);
  assert.doesNotMatch(saved.innerHTML, /current|supported|unsupported|stale|expired|active|recommended/i);
});

test("exact source presence renders beneath the unchanged saved snapshot", async () => {
  const focus = makeFocus();
  const harness = createUpdateHarness({
    focusResult: { success: true, focus },
    options: makeOptions([makeOption()]),
  });
  await harness.ui.updateDevelopmentFocusSurface();
  const record = harness.nodes.get("saved-development-focus").children[0];
  assert.equal(
    record.querySelector(".development-focus-label").textContent,
    focus.label,
  );
  assert.equal(
    record.querySelector(".development-focus-observation").textContent,
    focus.observation,
  );
  assert.equal(
    record.querySelector(".development-focus-source-presence").textContent,
    "The exact supporting recurring pattern for this saved focus is part of the current Development Focus options.",
  );
});

test("changed pattern version or review renders exact absence without refreshing snapshot", async () => {
  for (const source of [
    makeSource({ patternVersionIdentity: "new-version" }),
    makeSource({ patternReviewId: "new-review" }),
  ]) {
    const focus = makeFocus();
    const harness = createUpdateHarness({
      focusResult: { success: true, focus },
      options: makeOptions([makeOption({ source })]),
    });
    await harness.ui.updateDevelopmentFocusSurface();
    const record = harness.nodes.get("saved-development-focus").children[0];
    assert.equal(
      record.querySelector(".development-focus-label").textContent,
      focus.label,
    );
    assert.equal(
      record.querySelector(".development-focus-observation").textContent,
      focus.observation,
    );
    assert.equal(
      record.querySelector(".development-focus-source-presence").textContent,
      "The exact supporting recurring pattern for this saved focus is not part of the current Development Focus options.",
    );
  }
});

test("empty and unavailable options retain saved focus with distinct support copy", async () => {
  const focus = makeFocus();
  const empty = createUpdateHarness({
    focusResult: { success: true, focus },
    options: makeOptions([]),
  });
  await empty.ui.updateDevelopmentFocusSurface();
  const emptyRecord = empty.nodes.get("saved-development-focus").children[0];
  assert.equal(
    emptyRecord.querySelector(".development-focus-source-presence").textContent,
    "The exact supporting recurring pattern for this saved focus is not part of the current Development Focus options.",
  );
  assert.match(
    empty.nodes.get("development-focus-options").innerHTML,
    /No Development Focus options are available from Coaching Synthesis/,
  );

  const unavailable = createUpdateHarness({
    focusResult: { success: true, focus },
    synthesisResult: {},
  });
  await unavailable.ui.updateDevelopmentFocusSurface();
  const unavailableRecord = unavailable.nodes.get("saved-development-focus").children[0];
  assert.equal(
    unavailableRecord.querySelector(".development-focus-source-presence").textContent,
    "The current Development Focus options could not be checked against this saved focus.",
  );
  assert.match(
    unavailable.nodes.get("development-focus-options").innerHTML,
    /Development Focus options are temporarily unavailable/,
  );
});

test("saved getter failure and no focus preserve existing presentation semantics", async () => {
  const failed = createUpdateHarness({
    focusResult: {
      success: false,
      focus: null,
      reason: "invalid-development-focus-artifact",
    },
  });
  await failed.ui.updateDevelopmentFocusSurface();
  assert.match(
    failed.nodes.get("saved-development-focus").innerHTML,
    /Saved Development Focus is temporarily unavailable/,
  );
  assert.equal(failed.counts().supportCalls, 0);

  const none = createUpdateHarness();
  await none.ui.updateDevelopmentFocusSurface();
  assert.match(
    none.nodes.get("saved-development-focus").innerHTML,
    /No Development Focus chosen\. Choosing none is valid\./,
  );
  assert.doesNotMatch(
    none.nodes.get("saved-development-focus").innerHTML,
    /supporting recurring pattern/,
  );
  assert.equal(none.counts().supportCalls, 1);
});

test("support rendering adds no action and leaves options independently visible", async () => {
  const harness = createUpdateHarness({
    focusResult: { success: true, focus: makeFocus() },
    options: makeOptions([makeOption()]),
  });
  await harness.ui.updateDevelopmentFocusSurface();
  const saved = harness.nodes.get("saved-development-focus").children[0];
  const option = harness.nodes.get("development-focus-options").children[0];
  assert.equal(saved.querySelectorAll("button").length, 2);
  assert.equal(option.querySelectorAll("button").length, 1);
  assert.match(saved.innerHTML, /Clear Development Focus/);
  assert.match(option.innerHTML, /Choose as Development Focus/);
  assert.equal(harness.counts().supportCalls, 1);
});

test("no saved focus does not render a Practice Action subsection", async () => {
  const harness = createUpdateHarness();
  await harness.ui.updateDevelopmentFocusSurface();
  const saved = harness.nodes.get("saved-development-focus");
  assert.doesNotMatch(saved.innerHTML, /PRACTICE ACTION/);
  assert.equal(harness.counts().practiceOptionCalls, 0);
});

test("saved focus renders the exact neutral Practice Action and accessible preview control", async () => {
  const focus = makeFocus();
  const harness = createUpdateHarness({
    focusResult: { success: true, focus },
  });
  await harness.ui.updateDevelopmentFocusSurface();
  const record = harness.nodes.get("saved-development-focus").children[0];
  const preview = record.querySelector(".focus-practice-action-preview");
  assert.equal(harness.counts().practiceOptionCalls, 1);
  assert.equal(
    record.querySelector(".focus-practice-action-label").textContent,
    "Practice Customer Discovery",
  );
  assert.equal(
    record.querySelector(".focus-practice-action-copy").textContent,
    "This practice action matches the Development Focus you chose. It is not a recommendation, and choosing to explore it does not start a mission.",
  );
  assert.match(record.innerHTML, /PRACTICE ACTION/);
  assert.equal(preview.textContent, "Preview Practice Mission");
  assert.equal(
    preview.attributes["aria-label"],
    "Preview Practice Customer Discovery mission",
  );
});

test("Practice Action remains neutral and is independent of support currentness", async () => {
  for (const [options, expectedSupport] of [
    [makeOptions([makeOption({ source: makeSource({ patternId: "different" }) })]), "not part of the current Development Focus options"],
    [{}, "could not be checked against this saved focus"],
  ]) {
    const harness = createUpdateHarness({
      focusResult: { success: true, focus: makeFocus() },
      options,
    });
    await harness.ui.updateDevelopmentFocusSurface();
    const record = harness.nodes.get("saved-development-focus").children[0];
    assert.match(
      record.querySelector(".development-focus-source-presence").textContent,
      new RegExp(expectedSupport),
    );
    assert.equal(
      record.querySelector(".focus-practice-action-label").textContent,
      "Practice Customer Discovery",
    );
    assert.equal(
      record.querySelector(".focus-practice-action-copy").textContent,
      "This practice action matches the Development Focus you chose. It is not a recommendation, and choosing to explore it does not start a mission.",
    );
  }
});

test("null Focus Practice Option preserves saved focus with exact unavailable-action copy", async () => {
  const focus = makeFocus();
  const harness = createUpdateHarness({
    focusResult: { success: true, focus },
    practiceOption: null,
  });
  await harness.ui.updateDevelopmentFocusSurface();
  const record = harness.nodes.get("saved-development-focus").children[0];
  assert.equal(record.querySelector(".development-focus-label").textContent, focus.label);
  assert.equal(
    record.querySelector(".focus-practice-action-copy").textContent,
    "No matching practice action is available for this saved Development Focus.",
  );
  assert.equal(record.querySelectorAll("button").length, 1);
});

test("Focus Practice Option failure is contained and does not block existing focus options", async () => {
  const harness = createUpdateHarness({
    focusResult: { success: true, focus: makeFocus() },
    practiceOptionThrows: true,
  });
  await harness.ui.updateDevelopmentFocusSurface();
  const record = harness.nodes.get("saved-development-focus").children[0];
  assert.equal(
    record.querySelector(".focus-practice-action-copy").textContent,
    "Practice action is temporarily unavailable.",
  );
  assert.equal(harness.nodes.get("development-focus-options").children.length, 1);
  assert.equal(harness.counts().practiceOptionCalls, 1);
});

test("Practice Action preview control re-enables after each successful synchronous handoff", async () => {
  const founder = {
    pendingMissionRequest: null,
    missionGoal: "Existing mission goal",
    missionStatus: "inactive",
  };
  const before = clone(founder);
  const routedIntents = [];
  let preview = null;
  const { document } = createDom();
  const ui = loadUi({
    document,
    founder,
    selectPracticeMissionRequestByIntent(intent) {
      assert.equal(preview.disabled, true);
      routedIntents.push(intent);
      return { success: true };
    },
  });
  const container = document.getElementById("saved-development-focus");
  ui.renderSavedDevelopmentFocus(
    container,
    { success: true, focus: makeFocus() },
    { type: "development-focus-support", version: 1, domain: "camping.sales", state: "unavailable" },
    () => {},
    {
      type: "focus-practice-option", version: 1, domain: "camping.sales",
      competency: "discovery", label: "Practice Customer Discovery",
      missionIntent: "practice-customer-discovery",
      source: { basis: "commander-development-focus" },
    },
  );
  const record = container.children[0];
  preview = record.querySelector(".focus-practice-action-preview");
  await preview.listeners.click();
  assert.equal(preview.disabled, false);
  await preview.listeners.click();
  assert.deepEqual(routedIntents, [
    "practice-customer-discovery",
    "practice-customer-discovery",
  ]);
  assert.equal(preview.disabled, false);
  assert.equal(record.querySelector(".focus-practice-action-feedback").textContent, "");
  assert.deepEqual(founder, before);
});

test("Practice Action handoff fails locally for an unavailable router or invalid intent", () => {
  const { document } = createDom();
  const container = document.getElementById("saved-development-focus");
  const option = {
    type: "focus-practice-option", version: 1, domain: "camping.sales",
    competency: "discovery", label: "Practice Customer Discovery",
    missionIntent: "not-a-practice-intent",
    source: { basis: "commander-development-focus" },
  };
  const missingRouter = loadUi({ document });
  missingRouter.renderSavedDevelopmentFocus(
    container, { success: true, focus: makeFocus() }, null, () => {}, option,
  );
  container.children[0].querySelector(".focus-practice-action-preview").listeners.click();
  assert.equal(
    container.children[0].querySelector(".focus-practice-action-feedback").textContent,
    "Practice mission could not be prepared from this Development Focus.",
  );

  const invalidRouter = loadUi({
    document,
    selectPracticeMissionRequestByIntent() {
      return { success: false, reason: "invalid-practice-mission-intent" };
    },
  });
  invalidRouter.renderSavedDevelopmentFocus(
    container, { success: true, focus: makeFocus() }, null, () => {}, option,
  );
  const preview = container.children[0].querySelector(".focus-practice-action-preview");
  preview.listeners.click();
  assert.equal(preview.disabled, false);
  assert.equal(
    container.children[0].querySelector(".focus-practice-action-feedback").textContent,
    "Practice mission could not be prepared from this Development Focus.",
  );
});

test("valid none and valid empty options use exact independent copy", () => {
  const { document } = createDom();
  const ui = loadUi({ document });
  const saved = document.getElementById("saved-development-focus");
  const options = document.getElementById("development-focus-options");
  ui.renderSavedDevelopmentFocus(
    saved,
    { success: true, focus: null },
    {
      type: "development-focus-support",
      version: 1,
      domain: "camping.sales",
      state: "no-focus",
    },
    () => {},
  );
  ui.renderDevelopmentFocusOptions(options, makeOptions([]), () => {});
  assert.match(
    saved.innerHTML,
    /No Development Focus chosen\. Choosing none is valid\./,
  );
  assert.match(
    options.innerHTML,
    /No Development Focus options are available from Coaching Synthesis\. Choosing none remains valid\./,
  );
  assert.equal(saved.children.length, 0);
  assert.equal(options.children.length, 0);
});

test("malformed saved state and malformed options use distinct unavailable copy", () => {
  const { document } = createDom();
  const ui = loadUi({ document });
  const saved = document.getElementById("saved-development-focus");
  const options = document.getElementById("development-focus-options");
  ui.renderSavedDevelopmentFocus(
    saved,
    { success: false, focus: null },
    null,
    () => {},
  );
  ui.renderDevelopmentFocusOptions(options, {}, () => {});
  assert.match(saved.innerHTML, /Saved Development Focus is temporarily unavailable\./);
  assert.doesNotMatch(saved.innerHTML, /No Development Focus chosen/);
  assert.match(options.innerHTML, /Development Focus options are temporarily unavailable\./);
  assert.doesNotMatch(options.innerHTML, /Choosing none remains valid/);
});

test("extra fields duplicate options and malformed saved timestamps are unavailable", () => {
  const { document } = createDom();
  const ui = loadUi({ document });
  const saved = document.getElementById("saved-development-focus");
  const options = document.getElementById("development-focus-options");
  ui.renderSavedDevelopmentFocus(
    saved,
    {
      success: true,
      focus: { ...makeFocus(), chosenAt: "not-an-iso-timestamp" },
    },
    null,
    () => {},
  );
  ui.renderDevelopmentFocusOptions(
    options,
    makeOptions([makeOption(), makeOption()]),
    () => {},
  );
  assert.match(saved.innerHTML, /Saved Development Focus is temporarily unavailable\./);
  assert.match(options.innerHTML, /Development Focus options are temporarily unavailable\./);

  ui.renderDevelopmentFocusOptions(
    options,
    { ...makeOptions(), unexpected: true },
    () => {},
  );
  assert.match(options.innerHTML, /Development Focus options are temporarily unavailable\./);
});

test("options failure does not suppress a valid saved focus", async () => {
  const harness = createUpdateHarness({
    focusResult: { success: true, focus: makeFocus() },
    synthesisResult: {},
  });
  await harness.ui.updateDevelopmentFocusSurface();
  assert.equal(harness.nodes.get("saved-development-focus").children.length, 1);
  assert.match(
    harness.nodes.get("development-focus-options").innerHTML,
    /Development Focus options are temporarily unavailable\./,
  );
});

test("saved-state failure does not suppress valid options", async () => {
  const harness = createUpdateHarness({
    focusResult: {
      success: false,
      focus: null,
      reason: "invalid-development-focus-artifact",
    },
  });
  await harness.ui.updateDevelopmentFocusSurface();
  assert.match(
    harness.nodes.get("saved-development-focus").innerHTML,
    /Saved Development Focus is temporarily unavailable\./,
  );
  assert.equal(harness.nodes.get("development-focus-options").children.length, 1);
});

test("choose sends only domain and exact source and is called once", async () => {
  const harness = createUpdateHarness();
  await harness.ui.updateDevelopmentFocusSurface();
  const action = harness.nodes
    .get("development-focus-options")
    .children[0].querySelector(".development-focus-choose");
  await action.listeners.click();
  assert.equal(harness.counts().chooseCalls, 1);
  assert.deepEqual(harness.getChooseInput(), {
    domain: "camping.sales",
    source: makeSource(),
  });
  for (const key of ["competency", "label", "observation", "index", "interactionCount", "reportCount"]) {
    assert.equal(Object.hasOwn(harness.getChooseInput(), key), false);
  }
});

test("choose disables controls while pending and success rerenders once", async () => {
  const harness = createUpdateHarness();
  let resolveChoose;
  harness.ArchieCore.chooseDevelopmentFocus = () =>
    new Promise((resolve) => {
      resolveChoose = resolve;
    });
  await harness.ui.updateDevelopmentFocusSurface();
  const before = harness.counts().synthesisCalls;
  const action = harness.nodes
    .get("development-focus-options")
    .children[0].querySelector(".development-focus-choose");
  const pending = action.listeners.click();
  assert.equal(action.disabled, true);
  resolveChoose({ success: true, changed: true, focus: makeFocus() });
  await pending;
  assert.equal(harness.counts().synthesisCalls, before + 1);
  assert.equal(
    harness.nodes.get("development-focus-feedback").textContent,
    "Development Focus saved.",
  );
});

test("failed and stale choose preserve records re-enable controls and never fallback", async () => {
  for (const [reason, message] of [
    [
      "development-focus-option-not-current",
      "That Development Focus could not be chosen from the current options.",
    ],
    [
      "development-focus-persistence-failed",
      "FounderOS couldn’t confirm that Development Focus was saved.",
    ],
    ["other", "Development Focus could not be saved right now."],
  ]) {
    const harness = createUpdateHarness({
      chooseResult: { success: false, changed: false, reason },
    });
    await harness.ui.updateDevelopmentFocusSurface();
    const container = harness.nodes.get("development-focus-options");
    const record = container.children[0];
    const action = record.querySelector(".development-focus-choose");
    await action.listeners.click();
    assert.equal(container.children[0], record);
    assert.equal(action.disabled, false);
    assert.equal(harness.counts().chooseCalls, 1);
    assert.equal(harness.nodes.get("development-focus-feedback").textContent, message);
  }
});

test("clear calls only ArchieCore clear and succeeds without current options", async () => {
  const harness = createUpdateHarness({
    focusResult: { success: true, focus: makeFocus() },
    options: makeOptions([]),
  });
  await harness.ui.updateDevelopmentFocusSurface();
  const clear = harness.nodes
    .get("saved-development-focus")
    .children[0].querySelector(".development-focus-clear");
  await clear.listeners.click();
  assert.equal(harness.counts().clearCalls, 1);
  assert.match(
    harness.nodes.get("saved-development-focus").innerHTML,
    /No Development Focus chosen\. Choosing none is valid\./,
  );
  assert.equal(
    harness.nodes.get("development-focus-feedback").textContent,
    "Development Focus cleared.",
  );
});

test("failed clear preserves saved display and re-enables controls", async () => {
  const harness = createUpdateHarness({
    focusResult: { success: true, focus: makeFocus() },
    clearResult: {
      success: false,
      changed: false,
      focus: null,
      reason: "development-focus-persistence-failed",
    },
  });
  await harness.ui.updateDevelopmentFocusSurface();
  const saved = harness.nodes.get("saved-development-focus");
  const record = saved.children[0];
  const clear = record.querySelector(".development-focus-clear");
  await clear.listeners.click();
  assert.equal(saved.children[0], record);
  assert.equal(clear.disabled, false);
  assert.equal(
    harness.nodes.get("development-focus-feedback").textContent,
    "FounderOS couldn’t confirm that Development Focus was cleared.",
  );
});

test("update uses exact canonical option path getter and required registration only", async () => {
  const harness = createUpdateHarness();
  await harness.ui.updateDevelopmentFocusSurface();
  assert.equal(harness.counts().synthesisCalls, 1);
  assert.equal(harness.counts().optionsCalls, 1);
  assert.deepEqual(harness.getRegisterCalls(), [
    ["memory", harness.MemorySystem],
    ["missionIntelligence", harness.MissionIntelligenceSystem],
  ]);
});

test("Development Focus UI has no forbidden authority or currentness dependencies", () => {
  const start = archieSource.indexOf("// DEVELOPMENT FOCUS UI (Phase 9.3, v1)");
  const surface = archieSource.slice(start);
  assert.match(surface, /buildCoachingSynthesis/);
  assert.match(surface, /buildDevelopmentFocusOptions/);
  assert.match(surface, /getDevelopmentFocus/);
  assert.match(surface, /chooseDevelopmentFocus/);
  assert.match(surface, /clearDevelopmentFocus/);
  assert.match(surface, /buildDevelopmentFocusSupport/);
  assert.match(surface, /buildFocusPracticeOption/);
  assert.doesNotMatch(surface, /findDevelopmentFocusOption/);
  assert.doesNotMatch(
    surface,
    /saveArtifact|saveFounder|localStorage|sessionStorage|nextFocus|missionGoal|missionStatus|pendingMissionRequest|setPendingMissionRequest|presentPendingMissionRequestForPreview|select(?:TrialClose|CustomerDiscovery|ProductSelection|Presentation|ObjectionHandling|Rapport)MissionRequest|generateMission|recommendPractice|Practice Recommendation|GuidanceSystem|BriefingSystem|ReflectionSystem|profile\.capabilities|profileCapabilityDecisions|commandLog|\bxp\b|completion|\.sort\(/i,
  );
});

test("renderers use textContent and never compare saved source with options", () => {
  const start = archieSource.indexOf("// DEVELOPMENT FOCUS UI (Phase 9.3, v1)");
  const surface = archieSource.slice(start);
  assert.match(surface, /\.textContent = focus\.label/);
  assert.match(surface, /focus\.observation/);
  assert.match(surface, /\.textContent = option\.label/);
  assert.match(surface, /option\.observation/);
  assert.match(surface, /development-focus-source-presence/);
  assert.doesNotMatch(
    surface,
    /focus\.source\.patternId\s*===|focus\.source\.patternVersionIdentity\s*===|focus\.source\.patternReviewId\s*===/,
  );
});

test("minimal CSS uses Development Focus hooks without Profile action reuse", () => {
  assert.match(styleSource, /#saved-development-focus/);
  assert.match(styleSource, /#development-focus-options/);
  assert.match(styleSource, /\.development-focus-actions/);
  assert.match(styleSource, /\.development-focus-feedback/);
  const start = styleSource.indexOf("#saved-development-focus");
  const end = styleSource.indexOf(".profile-capability-intro", start);
  assert.doesNotMatch(styleSource.slice(start, end), /profile-capability-actions/);
});

test("existing Coaching Synthesis and Profile capability surfaces remain intact", () => {
  assert.match(archieSource, /function renderCoachingSynthesis\(/);
  assert.match(archieSource, /function updateCoachingSynthesis\(/);
  assert.match(archieSource, /function renderProfileCapabilitySuggestions\(/);
  assert.match(archieSource, /function updateProfileCapabilitySurface\(/);
  assert.match(progressSource, /id="coaching-synthesis"/);
  assert.match(progressSource, /id="profile-capability-suggestions"/);
});