const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeInput(value = "", checked = false) {
  return { value, checked };
}

function makeInteraction({
  objections = "",
  performed = false,
  result = "",
  trialClosePerformed = false,
  trialCloseResult = "",
  strengths = [],
  notableMoment = "",
} = {}) {
  const fields = {
    ".fr-buyerContext": makeInput("First-time buyer"),
    ".fr-customerGoal": makeInput("Find the right RV"),
    ".fr-keyNeeds": makeInput("sleeping capacity"),
    ".fr-hotButtons": makeInput("outdoor kitchen"),
    ".fr-objections": makeInput(objections),
    ".fr-notableMoment": makeInput(notableMoment),
    ".fr-objection-handling-performed": makeInput("", performed),
    ".fr-objection-handling-result": makeInput(result),
    ".fr-trial-close-performed": makeInput("", trialClosePerformed),
    ".fr-trial-close-result": makeInput(trialCloseResult),
  };

  return {
    querySelector(selector) {
      return fields[selector] || null;
    },
    querySelectorAll(selector) {
      return selector === ".fr-explicit-strength:checked"
        ? strengths.map((value) => ({ value }))
        : [];
    },
  };
}

function loadBuilder(interactions = []) {
  const sourcePath = path.resolve(
    __dirname,
    "..",
    "js",
    "widgets",
    "field-report.widget.js",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const values = {
    "fr-date": makeInput("2026-08-27"),
    "fr-dailyWin": makeInput("Daily win"),
    "fr-keyLearning": makeInput("Key learning"),
    "fr-biggestChallenge": makeInput("Challenge"),
    "fr-nextFocus": makeInput("Next focus"),
    "fr-notes": makeInput("Notes"),
    "fr-capturebay": makeInput(""),
  };
  const document = {
    readyState: "loading",
    addEventListener() {},
    getElementById(id) {
      return values[id] || null;
    },
    querySelectorAll(selector) {
      return selector === ".fr-interaction-block" ? interactions : [];
    },
  };
  const window = {};
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    window,
    Date,
    Math,
    Set,
  });
  const exposed = source.replace(
    /\}\)\(\);\s*$/,
    "window.__fieldReportTestApi = { buildReport }; })();",
  );

  vm.runInContext(exposed, context, { filename: sourcePath });
  return context.window.__fieldReportTestApi.buildReport;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("existing interaction capture is unchanged when no outcome is entered", () => {
  const report = loadBuilder([
    makeInteraction({ objections: "payment", strengths: ["rapport"] }),
  ])();
  const interaction = report.customerInteractions[0];

  assert.deepEqual(clone(interaction.objections), ["payment"]);
  assert.deepEqual(clone(interaction.explicitStrengths), ["rapport"]);
  assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
});

test("objection, performed action, or result alone creates no event", () => {
  const fixtures = [
    { objections: "payment" },
    { objections: "payment", performed: true },
    { objections: "payment", result: "customer-concern-resolved" },
    { performed: true, result: "customer-concern-resolved" },
  ];

  for (const fixture of fixtures) {
    const interaction = loadBuilder([makeInteraction(fixture)])()
      .customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("each canonical result creates the exact bounded event", () => {
  const results = [
    "customer-concern-resolved",
    "customer-concern-partially-resolved",
    "customer-concern-unresolved",
    "unknown",
  ];

  for (const result of results) {
    const interaction = loadBuilder([
      makeInteraction({ objections: "payment", performed: true, result }),
    ])().customerInteractions[0];
    const event = interaction.salesStepOutcomes[0];

    assert.match(event.id, /^sales_step_outcome_\d+_\d+$/);
    assert.equal(event.step, "objection-handling");
    assert.equal(event.performedBy, "commander");
    assert.equal(event.result, result);
  }
});

test("non-canonical and free-text results cannot persist", () => {
  for (const result of [
    "success",
    "I handled it well",
    "Customer seemed happier",
    "customer-concern-resolved ",
  ]) {
    const interaction = loadBuilder([
      makeInteraction({ objections: "payment", performed: true, result }),
    ])().customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("event identity survives serialization and reload unchanged", () => {
  const interaction = loadBuilder([
    makeInteraction({
      objections: "payment",
      performed: true,
      result: "customer-concern-resolved",
    }),
  ])().customerInteractions[0];
  const savedAndReloaded = clone(interaction);

  assert.equal(
    savedAndReloaded.salesStepOutcomes[0].id,
    interaction.salesStepOutcomes[0].id,
  );
});

test("structured outcomes remain owned by their individual interactions", () => {
  const report = loadBuilder([
    makeInteraction({
      objections: "payment",
      performed: true,
      result: "customer-concern-partially-resolved",
    }),
    makeInteraction({ objections: "towing", strengths: ["discovery"] }),
  ])();

  assert.equal(report.customerInteractions[0].salesStepOutcomes.length, 1);
  assert.equal(
    Object.hasOwn(report.customerInteractions[1], "salesStepOutcomes"),
    false,
  );
  assert.deepEqual(clone(report.customerInteractions[1].objections), ["towing"]);
  assert.deepEqual(
    clone(report.customerInteractions[1].explicitStrengths),
    ["discovery"],
  );
});

test("capture creates raw data without E3 or coaching derivation", () => {
  const report = loadBuilder([
    makeInteraction({
      objections: "payment",
      performed: true,
      result: "customer-concern-resolved",
    }),
  ])();

  assert.equal(Object.hasOwn(report, "behavioralEvidence"), false);
  assert.equal(Object.hasOwn(report, "evidenceTier"), false);
  assert.deepEqual(clone(report.coachingSignals), []);
  assert.deepEqual(clone(report.learningSignals), []);
  assert.equal(report.systemMetadata.processingStatus, "raw");
});

test("capture requires no Profile, Guidance, Reflection, or persistence globals", () => {
  const buildReport = loadBuilder([
    makeInteraction({
      objections: "payment",
      performed: true,
      result: "unknown",
    }),
  ]);

  assert.doesNotThrow(() => buildReport());
});

test("Trial Close requires both explicit performed action and canonical result", () => {
  for (const fixture of [
    {},
    { trialClosePerformed: true },
    { trialCloseResult: "customer-expressed-readiness-to-proceed" },
  ]) {
    const interaction = loadBuilder([makeInteraction(fixture)])()
      .customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("each canonical Trial Close response serializes exactly", () => {
  const results = [
    "customer-expressed-readiness-to-proceed",
    "customer-expressed-not-ready-to-proceed",
    "customer-declined-to-proceed",
    "customer-response-unclear",
  ];

  for (const result of results) {
    const interaction = loadBuilder([
      makeInteraction({ trialClosePerformed: true, trialCloseResult: result }),
    ])().customerInteractions[0];
    const event = interaction.salesStepOutcomes[0];

    assert.match(event.id, /^sales_step_outcome_\d+_\d+$/);
    assert.equal(event.step, "trial-close");
    assert.equal(event.performedBy, "commander");
    assert.equal(event.result, result);
  }
});

test("non-canonical and free-text Trial Close responses cannot persist", () => {
  for (const result of [
    "customer-advanced",
    "customer-committed",
    "successful-close",
    "The customer seemed ready",
    "customer-expressed-readiness-to-proceed ",
  ]) {
    const interaction = loadBuilder([
      makeInteraction({ trialClosePerformed: true, trialCloseResult: result }),
    ])().customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("Objection Handling and Trial Close events coexist with distinct stable IDs", () => {
  const interaction = loadBuilder([
    makeInteraction({
      objections: "payment",
      performed: true,
      result: "customer-concern-resolved",
      trialClosePerformed: true,
      trialCloseResult: "customer-expressed-readiness-to-proceed",
    }),
  ])().customerInteractions[0];
  const savedAndReloaded = clone(interaction);

  assert.deepEqual(
    clone(interaction.salesStepOutcomes.map((event) => event.step)),
    ["objection-handling", "trial-close"],
  );
  assert.notEqual(
    interaction.salesStepOutcomes[0].id,
    interaction.salesStepOutcomes[1].id,
  );
  assert.deepEqual(
    savedAndReloaded.salesStepOutcomes.map((event) => event.id),
    clone(interaction.salesStepOutcomes.map((event) => event.id)),
  );
});

test("Trial Close capture remains raw and is not inferred from strengths or text", () => {
  const rawReport = loadBuilder([
    makeInteraction({
      trialClosePerformed: true,
      trialCloseResult: "customer-expressed-readiness-to-proceed",
    }),
  ])();
  const inferredReport = loadBuilder([
    makeInteraction({
      strengths: ["trial-close"],
      notableMoment: "The customer was ready to proceed",
    }),
  ])();

  assert.equal(Object.hasOwn(rawReport, "behavioralEvidence"), false);
  assert.equal(rawReport.systemMetadata.processingStatus, "raw");
  assert.equal(
    Object.hasOwn(inferredReport.customerInteractions[0], "salesStepOutcomes"),
    false,
  );
});
