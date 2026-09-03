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

function loadUi(options = {}) {
  const { document, ...overrides } = options;
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    ...overrides,
  });
  vm.runInContext(
    `${archieSource}\n;globalThis.__ui = { renderCoachingSynthesis, updateCoachingSynthesis };`,
    context,
  );
  return context.__ui;
}

function makeSynthesisInsight(overrides = {}) {
  return {
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
      patternVersionIdentity: "version-identity",
      patternReviewId: "pattern-review-id",
    },
    ...overrides,
  };
}

function makeSynthesis(insights = []) {
  return {
    type: "coaching-synthesis",
    version: 1,
    domain: "camping.sales",
    generatedAt: "2026-09-01T15:00:00.000Z",
    insights,
  };
}

function createNode(tag = "div") {
  let markup = "";
  const childNodes = [];
  const queryResults = {};
  let text = "";
  let cls = "";

  return {
    tagName: tag,
    get className() {
      return cls;
    },
    set className(value) {
      cls = value;
    },
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = value;
    },
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = String(value);
    },
    get childNodes() {
      return childNodes;
    },
    get children() {
      const result = [];
      for (const child of childNodes) {
        if (child._isFragment) {
          result.push(...child.childNodes);
        } else {
          result.push(child);
        }
      }
      return result;
    },
    appendChild(child) {
      childNodes.push(child);
    },
    querySelector(selector) {
      if (!queryResults[selector]) {
        queryResults[selector] = createNode();
      }
      return queryResults[selector];
    },
    addEventListener() {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    cloneNode() {
      return createNode();
    },
  };
}

function createDocumentFragment() {
  const node = createNode("fragment");
  node._isFragment = true;
  return node;
}

function createDocument(container) {
  const nodes = {};
  return {
    getElementById(id) {
      if (id === "coaching-synthesis") return container;
      if (!nodes[id]) {
        nodes[id] = createNode();
      }
      return nodes[id];
    },
    createDocumentFragment() {
      return createDocumentFragment();
    },
        createElement(tag) {
      return createNode(tag);
    },
  };
}

test("confirmed synthesis renders one record with label and observation", () => {
  const container = createNode();
  const document = createDocument(container);
  const { renderCoachingSynthesis } = loadUi({ document });
  const insight = makeSynthesisInsight();
  renderCoachingSynthesis(container, makeSynthesis([insight]));
  const records = container.children;
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.className, "mission-record coaching-synthesis-record");
  assert.equal(
    record.querySelector(".coaching-synthesis-label").textContent,
    "Discovery",
  );
  assert.equal(
    record.querySelector(".coaching-synthesis-observation").textContent,
    "You confirmed a recurring pattern across 3 reviewed interaction records: the evidence you reviewed is consistent with effective Discovery recurring across those interactions.",
  );
});

test("multiple insights preserve supplied order", () => {
  const container = createNode();
  const document = createDocument(container);
  const { renderCoachingSynthesis } = loadUi({ document });
  const first = makeSynthesisInsight({
    competency: "discovery",
    label: "Discovery",
    observation: "First insight.",
  });
  const second = makeSynthesisInsight({
    competency: "trial-close",
    label: "Trial Close",
    observation: "Second insight.",
  });
  renderCoachingSynthesis(container, makeSynthesis([first, second]));
  const records = container.children;
  assert.equal(records.length, 2);
  assert.equal(
    records[0].querySelector(".coaching-synthesis-label").textContent,
    "Discovery",
  );
  assert.equal(
    records[0].querySelector(".coaching-synthesis-observation").textContent,
    "First insight.",
  );
  assert.equal(
    records[1].querySelector(".coaching-synthesis-label").textContent,
    "Trial Close",
  );
  assert.equal(
    records[1].querySelector(".coaching-synthesis-observation").textContent,
    "Second insight.",
  );
});

test("Rapport strict hedge displays verbatim", () => {
  const container = createNode();
  const document = createDocument(container);
  const { renderCoachingSynthesis } = loadUi({ document });
  const rapportObservation =
    "You confirmed a recurring pattern across 3 reviewed interaction records where you referenced customer-provided context during Rapport. This does not establish customer trust, comfort, sentiment, likability, or Rapport quality.";
  const rapport = makeSynthesisInsight({
    competency: "rapport",
    label: "Rapport",
    observation: rapportObservation,
  });
  renderCoachingSynthesis(container, makeSynthesis([rapport]));
  const records = container.children;
  assert.equal(records.length, 1);
  const observationText = records[0].querySelector(
    ".coaching-synthesis-observation",
  ).textContent;
  assert.equal(observationText, rapportObservation);
});

test("empty synthesis renders truthful empty state without deficit framing", () => {
  const container = createNode();
  const document = createDocument(container);
  const { renderCoachingSynthesis } = loadUi({ document });
  renderCoachingSynthesis(container, makeSynthesis([]));
  const html = container.innerHTML;
  assert.match(
    html,
    /No coaching synthesis yet\./,
  );
  assert.match(
    html,
    /Insights will appear here after you confirm a recurring behavioral pattern across reviewed interactions\./,
  );
  assert.doesNotMatch(html, /weakness/i);
  assert.doesNotMatch(html, /not enough/i);
  assert.doesNotMatch(html, /no strength/i);
});


test("runtime failure renders distinct unavailable state", () => {
  const ThrowingSystem = {
    buildCoachingSynthesis() {
      throw new Error("synthesis failure");
    },
  };
  const container = createNode();
  const document = createDocument(container);
  const { updateCoachingSynthesis } = loadUi({
    document,
    MissionIntelligenceSystem: ThrowingSystem,
    founder: {
      memory: {
        artifacts: {
          "camping.fieldReports": { reports: [] },
          "camping.behavioralEvidenceReviews": null,
          "camping.behavioralPatternReviews": null,
        },
      },
    },
  });
  updateCoachingSynthesis();
  const html = container.innerHTML;
  assert.match(html, /Coaching synthesis is temporarily unavailable\./);
  assert.doesNotMatch(html, /No coaching synthesis yet/);
});

test("missing authority renders unavailable state", () => {
  const container = createNode();
  const document = createDocument(container);
  const { updateCoachingSynthesis } = loadUi({
    document,
    MissionIntelligenceSystem: undefined,
    founder: {
      memory: {
        artifacts: {
          "camping.fieldReports": { reports: [] },
          "camping.behavioralEvidenceReviews": null,
          "camping.behavioralPatternReviews": null,
        },
      },
    },
  });
  updateCoachingSynthesis();
  assert.match(
    container.innerHTML,
    /Coaching synthesis is temporarily unavailable\./,
  );
});

test("no controls or action elements rendered", () => {
  const container = createNode();
  const document = createDocument(container);
  const { renderCoachingSynthesis } = loadUi({ document });
  renderCoachingSynthesis(
    container,
    makeSynthesis([makeSynthesisInsight(), makeSynthesisInsight()]),
  );
  const records = container.children;
  assert.equal(records.length, 2);
  for (const record of records) {
    const label = record.querySelector(".coaching-synthesis-label").textContent;
    const observation = record.querySelector(".coaching-synthesis-observation").textContent;
    assert.ok(label.length > 0);
    assert.ok(observation.length > 0);
    assert.doesNotMatch(label, /Confirm|Reject|Correct|Profile/);
    assert.doesNotMatch(observation, /Confirm|Reject|Correct|Profile/);
  }
});

test("synthesis UI path does not touch persistence or state", () => {
  const renderFn = archieSource.slice(
    archieSource.indexOf("function renderCoachingSynthesis("),
    archieSource.indexOf("\nfunction updateCoachingSynthesis("),
  );
  const fn = archieSource.slice(
    archieSource.indexOf("function updateCoachingSynthesis("),
  );
  for (const f of [renderFn, fn]) {
    assert.doesNotMatch(f, /MemorySystem/);
    assert.doesNotMatch(f, /saveArtifact/);
    assert.doesNotMatch(f, /saveFounder/);
    assert.doesNotMatch(f, /localStorage/);
    assert.doesNotMatch(f, /commandLog/);
    assert.doesNotMatch(f, /\bxp\b/);
    assert.doesNotMatch(f, /profile/i);
  }
});


test("updateCoachingSynthesis uses the canonical authority and exact artifact keys", () => {
  const fn = archieSource.slice(
    archieSource.indexOf("function updateCoachingSynthesis("),
  );
  assert.match(fn, /MissionIntelligenceSystem\.buildCoachingSynthesis/);
  assert.match(fn, /camping\.fieldReports/);
  assert.match(fn, /camping\.behavioralEvidenceReviews/);
  assert.match(fn, /camping\.behavioralPatternReviews/);
});

test("Recurring Behavioral Patterns renderer is unchanged", () => {
  assert.match(archieSource, /function renderRecurringBehavioralPatterns\(/);
  assert.match(archieSource, /function updateRecurringBehavioralPatterns\(/);
  assert.match(archieSource, /No recurring behavioral patterns yet\./);
});

test("progress.html wiring places card correctly and calls update", () => {
  assert.match(progressSource, /id="coaching-synthesis"/);
  const patternsIndex = progressSource.indexOf(
    ">Recurring Behavioral Patterns<",
  );
  const coachingIndex = progressSource.indexOf(">Coaching Synthesis<");
  const suggestionsIndex = progressSource.indexOf(
    ">Developing Capability Suggestions<",
  );
  assert.ok(coachingIndex > patternsIndex);
  assert.ok(suggestionsIndex > coachingIndex);
  assert.match(progressSource, /typeof updateCoachingSynthesis === "function"/);
  assert.match(progressSource, /updateCoachingSynthesis\(\)/);
});
