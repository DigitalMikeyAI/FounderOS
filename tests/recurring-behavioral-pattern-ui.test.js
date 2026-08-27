const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const progressSource = fs.readFileSync(
  path.resolve(__dirname, "..", "progress.html"),
  "utf8",
);
const archieSource = fs.readFileSync(
  path.resolve(__dirname, "..", "js", "archie.js"),
  "utf8",
);

function loadUi(overrides = {}) {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    ...overrides,
  });
  vm.runInContext(
    `${archieSource}\n;globalThis.__ui = { renderRecurringBehavioralPatterns, updateRecurringBehavioralPatterns };`,
    context,
  );
  return context.__ui;
}

function makePattern(overrides = {}) {
  return {
    type: "recurring-behavioral-pattern",
    evidenceTier: "E4",
    patternId: "behavioral_pattern_objection-handling",
    patternVersionIdentity: "internal-version-not-for-ui",
    competency: "objection-handling",
    label: "Objection Handling",
    interactionCount: 3,
    reportCount: 2,
    insight:
      "Across 3 Commander-reviewed interaction records, the available evidence is consistent with effective Objection Handling recurring across those interactions.",
    source: "confirmedBehavioralEvidenceAggregation",
    contributors: [],
    ...overrides,
  };
}

function createNode() {
  let markup = "";
  return {
    children: [],
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = value;
      this.children = [];
    },
    appendChild(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      if (!this.nodes) this.nodes = {};
      if (!this.nodes[selector]) this.nodes[selector] = { textContent: "" };
      return this.nodes[selector];
    },
  };
}

function createDocument(container) {
  return {
    getElementById(id) {
      return id === "recurring-behavioral-patterns" ? container : null;
    },
    createDocumentFragment() {
      return createNode();
    },
    createElement() {
      return createNode();
    },
  };
}

test("section uses exact passive E4 authority copy after Behavioral Evidence", () => {
  const evidenceIndex = progressSource.indexOf(">Behavioral Evidence<");
  const patternsIndex = progressSource.indexOf(
    ">Recurring Behavioral Patterns<",
  );
  assert.ok(evidenceIndex >= 0);
  assert.ok(patternsIndex > evidenceIndex);
  assert.match(
    progressSource,
    /Patterns derived from multiple reviewed interaction records/,
  );
  assert.match(
    progressSource,
    /These patterns combine multiple behavioral evidence records you previously confirmed as accurately recorded\. The combined pattern itself has not yet been separately reviewed and does not establish a verified skill\./,
  );
});

test("empty state explains the three-confirmed-record threshold", () => {
  assert.match(archieSource, /No recurring behavioral patterns yet\./);
  assert.match(
    archieSource,
    /Patterns will appear here after the same competency is supported by at least three confirmed behavioral evidence records from separate interactions\./,
  );
});

test("card renders projection wording and counts without internal identities", () => {
  const container = createNode();
  const document = createDocument(container);
  const { renderRecurringBehavioralPatterns } = loadUi({ document });
  const pattern = makePattern();
  renderRecurringBehavioralPatterns(container, [pattern]);
  const record = container.children[0].children[0];
  assert.equal(
    record.nodes[".recurring-behavioral-pattern-label"].textContent,
    pattern.label,
  );
  assert.equal(
    record.nodes[".recurring-behavioral-pattern-insight"].textContent,
    pattern.insight,
  );
  assert.equal(
    record.nodes[".recurring-behavioral-pattern-interactions"].textContent,
    "3 reviewed interaction records",
  );
  assert.equal(
    record.nodes[".recurring-behavioral-pattern-reports"].textContent,
    "2 Field Reports",
  );
  assert.match(record.innerHTML, /RECURRING BEHAVIORAL PATTERN · E4/);
  assert.match(
    record.innerHTML,
    /Source: Aggregated from Commander-reviewed Behavioral Evidence/,
  );
  assert.match(record.innerHTML, /Pattern review: Not yet reviewed/);
  assert.doesNotMatch(record.innerHTML, /patternVersionIdentity|activeIdentity/);
  assert.doesNotMatch(record.innerHTML, /<button/i);
});

test("renderer preserves Mission Intelligence ordering and clears stale cards", () => {
  const container = createNode();
  const document = createDocument(container);
  const { renderRecurringBehavioralPatterns } = loadUi({ document });
  const patterns = [
    makePattern({ label: "Trial Close" }),
    makePattern({ label: "Objection Handling" }),
  ];
  renderRecurringBehavioralPatterns(container, patterns);
  assert.deepEqual(
    container.children[0].children.map(
      (record) =>
        record.nodes[".recurring-behavioral-pattern-label"].textContent,
    ),
    ["Trial Close", "Objection Handling"],
  );
  renderRecurringBehavioralPatterns(container, []);
  assert.match(container.innerHTML, /No recurring behavioral patterns yet\./);
  assert.equal(container.children.length, 0);
});

test("currentness refresh follows 3, 4, removed, restored, and invalidated projections", () => {
  const container = createNode();
  const reports = [{ id: "report-currentness" }];
  const reviews = { reviews: [{ id: "review-currentness" }] };
  const document = createDocument(container);
  const projectionStates = [
    [makePattern({ interactionCount: 3 })],
    [makePattern({ interactionCount: 4 })],
    [],
    [],
    [makePattern({ interactionCount: 3 })],
    [],
  ];
  const MissionIntelligenceSystem = {
    identifyRecurringBehavioralPatterns() {
      return projectionStates.shift();
    },
  };
  const founder = {
    memory: {
      artifacts: {
        "camping.fieldReports": { reports },
        "camping.behavioralEvidenceReviews": reviews,
      },
    },
  };
  const { updateRecurringBehavioralPatterns } = loadUi({
    document,
    founder,
    MissionIntelligenceSystem,
  });

  updateRecurringBehavioralPatterns();
  let record = container.children[0].children[0];
  assert.equal(
    record.nodes[".recurring-behavioral-pattern-interactions"].textContent,
    "3 reviewed interaction records",
  );
  updateRecurringBehavioralPatterns();
  record = container.children[0].children[0];
  assert.equal(
    record.nodes[".recurring-behavioral-pattern-label"].textContent,
    "Objection Handling",
  );
  assert.equal(
    record.nodes[".recurring-behavioral-pattern-interactions"].textContent,
    "4 reviewed interaction records",
  );
  updateRecurringBehavioralPatterns();
  assert.match(container.innerHTML, /No recurring behavioral patterns yet\./);
  updateRecurringBehavioralPatterns();
  assert.match(container.innerHTML, /No recurring behavioral patterns yet\./);
  updateRecurringBehavioralPatterns();
  assert.equal(container.children[0].children.length, 1);
  updateRecurringBehavioralPatterns();
  assert.match(container.innerHTML, /No recurring behavioral patterns yet\./);
});

test("update delegates reports and reviews to Mission Intelligence unchanged", () => {
  const container = createNode();
  const reports = [{ id: "report-one" }];
  const reviews = { reviews: [{ id: "review-one" }] };
  const before = JSON.stringify({ reports, reviews });
  const document = createDocument(container);
  let received = null;
  const MissionIntelligenceSystem = {
    identifyRecurringBehavioralPatterns(receivedReports, receivedReviews) {
      received = [receivedReports, receivedReviews];
      return [makePattern()];
    },
  };
  const founder = {
    memory: {
      artifacts: {
        "camping.fieldReports": { reports },
        "camping.behavioralEvidenceReviews": reviews,
      },
    },
  };
  const { updateRecurringBehavioralPatterns } = loadUi({
    document,
    founder,
    MissionIntelligenceSystem,
  });
  updateRecurringBehavioralPatterns();
  assert.equal(received[0], reports);
  assert.equal(received[1], reviews);
  assert.equal(JSON.stringify({ reports, reviews }), before);
  assert.equal(container.children[0].children.length, 1);
});

test("surface is refreshed at page load and after successful E3 review", () => {
  assert.match(
    progressSource,
    /typeof updateRecurringBehavioralPatterns === "function"/,
  );
  assert.match(
    archieSource,
    /closeBehavioralEvidenceReviewModal\(\);\s*updateBehavioralEvidence\(\);\s*updateRecurringBehavioralPatterns\(\);/,
  );
});

test("surface remains passive and introduces no review or delivery authority", () => {
  const start = archieSource.indexOf(
    "function renderRecurringBehavioralPatterns",
  );
  const end = archieSource.indexOf(
    "// =====================================================",
    start,
  );
  const surface = archieSource.slice(start, end);
  assert.doesNotMatch(
    surface,
    /addEventListener|persist|saveArtifact|deliver|coach/i,
  );
  assert.doesNotMatch(surface, /\.sort\(/);
  assert.doesNotMatch(surface, /profile|guidance|reflection/i);
});
