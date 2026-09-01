const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadUiHelpers() {
  const sourcePath = path.resolve(__dirname, "..", "js", "archie.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
  });

  vm.runInContext(
    `${source}\n;globalThis.__repeatedUi = { renderRepeatedSelfAssessmentInsights, updateRepeatedSelfAssessmentInsights };`,
    context,
    { filename: sourcePath },
  );

  return { context, helpers: context.__repeatedUi, source };
}

function makeSummary(label, interactionCount = 2, reportCount = 2) {
  return {
    type: "repeated-self-assessment",
    evidenceTier: "E2",
    strength: label.toLowerCase(),
    label,
    interactionCount,
    reportCount,
    occurrences: [],
    insight: `You have self-identified "${label}" as a strength in ${interactionCount} recorded interactions.`,
    source: "fieldReportSelfAssessment",
  };
}

function makeDom() {
  const selectors = [
    ".repeated-self-assessment-label",
    ".repeated-self-assessment-insight",
    ".repeated-interaction-count",
    ".repeated-report-count",
  ];
  const container = {
    innerHTML: "",
    children: [],
    appendChild(fragment) {
      this.children.push(...fragment.children);
    },
  };
  const document = {
    getElementById(id) {
      return id === "repeated-self-assessment-insights" ? container : null;
    },
    createDocumentFragment() {
      return {
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
      };
    },
    createElement() {
      const fields = Object.fromEntries(
        selectors.map((selector) => [selector, { textContent: "" }]),
      );
      return {
        className: "",
        innerHTML: "",
        fields,
        querySelector(selector) {
          return fields[selector] || null;
        },
      };
    },
  };
  return { document, container };
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

test("zero summaries renders the truthful empty state and no pattern card", () => {
  const { context, helpers } = loadUiHelpers();
  const { document, container } = makeDom();
  context.document = document;
  helpers.renderRepeatedSelfAssessmentInsights(container, []);

  assert.match(container.innerHTML, /No repeated self-assessment patterns yet\./);
  assert.match(container.innerHTML, /same strength in multiple recorded interactions/);
  assert.equal(container.children.length, 0);
});

test("summary card preserves exact projection insight, counts, and safe badge", () => {
  const { context, helpers } = loadUiHelpers();
  const { document, container } = makeDom();
  context.document = document;
  const summary = makeSummary("Discovery", 3, 2);

  helpers.renderRepeatedSelfAssessmentInsights(container, [summary]);

  assert.equal(container.children.length, 1);
  const card = container.children[0];
  assert.equal(
    card.fields[".repeated-self-assessment-insight"].textContent,
    summary.insight,
  );
  assert.equal(
    card.fields[".repeated-interaction-count"].textContent,
    "3 recorded interactions",
  );
  assert.equal(card.fields[".repeated-report-count"].textContent, "2 Field Reports");
  assert.match(card.innerHTML, /REPEATED SELF-ASSESSMENT/);
  assert.doesNotMatch(card.innerHTML, /proven|demonstrated/i);
});

test("projection order is preserved without UI sorting", () => {
  const { context, helpers } = loadUiHelpers();
  const { document, container } = makeDom();
  context.document = document;

  helpers.renderRepeatedSelfAssessmentInsights(container, [
    makeSummary("Trial Close", 2, 2),
    makeSummary("Rapport", 4, 3),
  ]);

  assert.deepEqual(
    container.children.map(
      (card) => card.fields[".repeated-self-assessment-label"].textContent,
    ),
    ["Trial Close", "Rapport"],
  );
});

test("update consumes the Mission Intelligence projection with reports and reviews", () => {
  const { context, helpers } = loadUiHelpers();
  const { document, container } = makeDom();
  const reports = [{ id: "report-1" }];
  const reviews = { reviews: [] };
  const summary = makeSummary("Rapport");
  let received = null;
  context.document = document;
  context.founder = {
    memory: {
      artifacts: {
        "camping.fieldReports": { reports },
        "camping.coachingReviews": reviews,
      },
    },
  };
  context.MissionIntelligenceSystem = {
    identifyRepeatedSelfAssessments(receivedReports, receivedReviews) {
      received = { receivedReports, receivedReviews };
      return [summary];
    },
  };

  helpers.updateRepeatedSelfAssessmentInsights();

  assert.equal(received.receivedReports, reports);
  assert.equal(received.receivedReviews, reviews);
  assert.equal(container.children.length, 1);
});

test("review-state rerender can remove a rejected or corrected summary", () => {
  const { context, helpers } = loadUiHelpers();
  const { document, container } = makeDom();
  const reviews = { status: "unreviewed" };
  context.document = document;
  context.founder = {
    memory: {
      artifacts: {
        "camping.fieldReports": { reports: [{ id: "report-1" }] },
        "camping.coachingReviews": reviews,
      },
    },
  };
  context.MissionIntelligenceSystem = {
    identifyRepeatedSelfAssessments(_reports, currentReviews) {
      return ["rejected", "corrected"].includes(currentReviews.status)
        ? []
        : [makeSummary("Discovery")];
    },
  };

  helpers.updateRepeatedSelfAssessmentInsights();
  assert.equal(container.children.length, 1);
  reviews.status = "rejected";
  container.children = [];
  helpers.updateRepeatedSelfAssessmentInsights();
  assert.equal(container.children.length, 0);
  assert.match(container.innerHTML, /No repeated self-assessment patterns yet\./);
});

test("confirmed-as-recorded remains visible after rerender", () => {
  const { context, helpers } = loadUiHelpers();
  const { document, container } = makeDom();
  context.document = document;
  context.founder = {
    memory: {
      artifacts: {
        "camping.fieldReports": { reports: [] },
        "camping.coachingReviews": { status: "confirmed-as-recorded" },
      },
    },
  };
  context.MissionIntelligenceSystem = {
    identifyRepeatedSelfAssessments() {
      return [makeSummary("Presentation")];
    },
  };

  helpers.updateRepeatedSelfAssessmentInsights();
  assert.equal(container.children.length, 1);
});

test("rendering does not mutate Field Reports, Profile, Guidance, or Reflection", () => {
  const { context, helpers } = loadUiHelpers();
  const { document } = makeDom();
  const state = {
    reports: [{ id: "report-1", customerInteractions: [{ id: "interaction-1" }] }],
    profile: { strengths: ["Existing"] },
    guidance: { focus: "Existing" },
    reflection: { entries: ["Existing"] },
  };
  const before = snapshot(state);
  context.document = document;
  context.founder = {
    memory: {
      artifacts: { "camping.fieldReports": { reports: state.reports } },
      profile: state.profile,
    },
  };
  context.MissionIntelligenceSystem = {
    identifyRepeatedSelfAssessments() {
      return [makeSummary("Rapport")];
    },
  };

  helpers.updateRepeatedSelfAssessmentInsights();
  assert.deepEqual(snapshot(state), before);
});

test("UI delegates grouping to Mission Intelligence and does not count raw strengths", () => {
  const { source } = loadUiHelpers();
  const start = source.indexOf("function updateRepeatedSelfAssessmentInsights");
  const end = source.indexOf("// =====================================================", start);
  const updateSource = source.slice(start, end);

  assert.match(updateSource, /identifyRepeatedSelfAssessments/);
  assert.doesNotMatch(updateSource, /explicitStrengths|customerInteractions|coachingSignals/);
  assert.doesNotMatch(updateSource, /\.sort\(/);
});

test("successful review callback rerenders coaching history and repeated patterns", () => {
  const { source } = loadUiHelpers();
  assert.match(
    source,
    /closeCoachingReviewModal\(\);\s*updateCoachingHistory\(\);\s*updateRepeatedSelfAssessmentInsights\(\);/,
  );
});

test("Progress places authority-safe repeated patterns directly after Coaching History", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "progress.html"), "utf8");
  const coachingIndex = html.indexOf('id="coaching-signals-history"');
  const repeatedIndex = html.indexOf('id="repeated-self-assessment-insights"');

  assert.ok(coachingIndex >= 0 && repeatedIndex > coachingIndex);
  assert.match(html, /Patterns You've Reported/);
  assert.match(html, /not verified performance assessments/i);
  assert.doesNotMatch(html, /proven strength|demonstrated ability/i);
});
