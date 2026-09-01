const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeInput(value = "", checked = false) {
  return { value, checked };
}

function makeInteraction({
  buyerContext = "First-time buyer",
  customerGoal = "Find the right RV",
  keyNeeds = "sleeping capacity",
  hotButtons = "outdoor kitchen",
  objections = "",
  performed = false,
  result = "",
  trialClosePerformed = false,
  trialCloseResult = "",
  discoveryPerformed = false,
  discoveryResult = "",
  productSelectionPerformed = false,
  productSelectionNeedRef = "",
  productSelectionUnitRef = "",
  productSelectionResult = "",
  presentationPerformed = false,
  presentationNeedRef = "",
  presentationUnitRef = "",
  presentationReference = "",
  presentationResult = "",
  rapportContextCategory = "",
  rapportReferencedBack = false,
  strengths = [],
  notableMoment = "",
} = {}) {
  const fields = {
    ".fr-buyerContext": makeInput(buyerContext),
    ".fr-customerGoal": makeInput(customerGoal),
    ".fr-keyNeeds": makeInput(keyNeeds),
    ".fr-hotButtons": makeInput(hotButtons),
    ".fr-objections": makeInput(objections),
    ".fr-notableMoment": makeInput(notableMoment),
    ".fr-objection-handling-performed": makeInput("", performed),
    ".fr-objection-handling-result": makeInput(result),
    ".fr-trial-close-performed": makeInput("", trialClosePerformed),
    ".fr-trial-close-result": makeInput(trialCloseResult),
    ".fr-discovery-performed": makeInput("", discoveryPerformed),
    ".fr-discovery-result": makeInput(discoveryResult),
    ".fr-product-selection-performed": makeInput("", productSelectionPerformed),
    ".fr-product-selection-need-ref": makeInput(productSelectionNeedRef),
    ".fr-product-selection-unit-ref": makeInput(productSelectionUnitRef),
    ".fr-product-selection-result": makeInput(productSelectionResult),
    ".fr-presentation-performed": makeInput("", presentationPerformed),
    ".fr-presentation-need-ref": makeInput(presentationNeedRef),
    ".fr-presentation-unit-ref": makeInput(presentationUnitRef),
    ".fr-presentation-reference": makeInput(presentationReference),
    ".fr-presentation-result": makeInput(presentationResult),
    ".fr-rapport-context-category": makeInput(rapportContextCategory),
    ".fr-rapport-referenced-back": makeInput("", rapportReferencedBack),
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

function loadInteractionRuntime() {
  const makeControl = () => ({
    value: "",
    checked: false,
    hidden: false,
    innerHTML: "",
    style: {},
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
  });
  const selectors = [
    ".fr-remove-interaction",
    ".fr-buyerContext",
    ".fr-customerGoal",
    ".fr-keyNeeds",
    ".fr-hotButtons",
    ".fr-objections",
    ".fr-notableMoment",
    ".fr-rapport-context-field",
    ".fr-rapport-context-category",
    ".fr-rapport-referenced-back",
    ".fr-objection-outcome-capture",
    ".fr-objection-handling-performed",
    ".fr-objection-result-field",
    ".fr-trial-close-performed",
    ".fr-trial-close-result-field",
    ".fr-discovery-performed",
    ".fr-discovery-result-field",
    ".fr-product-selection-performed",
    ".fr-product-selection-need-field",
    ".fr-product-selection-need-ref",
    ".fr-product-selection-unit-field",
    ".fr-product-selection-unit-ref",
    ".fr-product-selection-result-field",
    ".fr-product-selection-result",
    ".fr-presentation-performed",
    ".fr-presentation-need-field",
    ".fr-presentation-need-ref",
    ".fr-presentation-unit-field",
    ".fr-presentation-unit-ref",
    ".fr-presentation-reference-field",
    ".fr-presentation-reference",
    ".fr-presentation-result-field",
    ".fr-presentation-result",
  ];
  const fields = new Map(selectors.map((selector) => [selector, makeControl()]));
  const interaction = makeControl();
  interaction.dataset = {};
  interaction.querySelector = (selector) => fields.get(selector) || null;
  interaction.querySelectorAll = () => [];
  interaction.remove = () => {};

  const elements = new Map();
  for (const id of [
    "field-report-enter",
    "fr-add-interaction",
    "fr-interactions-container",
    "fr-save",
    "fr-cancel",
    "fr-feedback",
    "fr-date",
  ]) {
    elements.set(id, makeControl());
  }
  elements.get("fr-interactions-container").children = [];
  elements.get("fr-interactions-container").appendChild = function (child) {
    this.children.push(child);
  };

  const expanded = makeControl();
  const collapsed = makeControl();
  const sourcePath = path.resolve(
    __dirname,
    "..",
    "js",
    "widgets",
    "field-report.widget.js",
  );
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    Set,
    window: {},
    document: {
      readyState: "complete",
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelector(selector) {
        if (selector === ".field-report-expanded") return expanded;
        if (selector === ".field-report-collapsed") return collapsed;
        return null;
      },
      querySelectorAll() {
        return [];
      },
      createElement() {
        return interaction;
      },
    },
  });
  vm.runInContext(fs.readFileSync(sourcePath, "utf8"), context, {
    filename: sourcePath,
  });
  return { elements, fields, interaction };
}

test("Add Interaction renders existing, Product Selection, and Presentation controls without runtime errors", () => {
  const runtime = loadInteractionRuntime();

  assert.doesNotThrow(() =>
    runtime.elements.get("fr-add-interaction").handlers.click(),
  );
  assert.equal(
    runtime.elements.get("fr-interactions-container").children[0],
    runtime.interaction,
  );
  for (const selector of [
    ".fr-buyerContext",
    ".fr-customerGoal",
    ".fr-keyNeeds",
    ".fr-objections",
    ".fr-trial-close-performed",
    ".fr-discovery-performed",
    ".fr-product-selection-performed",
    ".fr-product-selection-need-ref",
    ".fr-product-selection-unit-ref",
    ".fr-product-selection-result",
    ".fr-presentation-performed",
    ".fr-presentation-need-ref",
    ".fr-presentation-unit-ref",
    ".fr-presentation-reference",
    ".fr-presentation-result",
    ".fr-rapport-context-field",
    ".fr-rapport-context-category",
    ".fr-rapport-referenced-back",
  ]) {
    assert.ok(runtime.interaction.querySelector(selector), selector);
  }
  assert.equal(runtime.fields.get(".fr-product-selection-performed").checked, false);
  assert.equal(runtime.fields.get(".fr-product-selection-need-field").hidden, true);
  assert.equal(runtime.fields.get(".fr-product-selection-unit-field").hidden, true);
  assert.equal(runtime.fields.get(".fr-product-selection-result-field").hidden, true);
  assert.equal(typeof runtime.fields.get(".fr-keyNeeds").handlers.input, "function");
  assert.equal(runtime.fields.get(".fr-presentation-performed").checked, false);
  assert.equal(runtime.fields.get(".fr-presentation-need-field").hidden, true);
  assert.equal(runtime.fields.get(".fr-presentation-unit-field").hidden, true);
  assert.equal(runtime.fields.get(".fr-presentation-reference-field").hidden, true);
  assert.equal(runtime.fields.get(".fr-presentation-result-field").hidden, true);
  assert.equal(runtime.fields.get(".fr-rapport-referenced-back").checked, false);
  assert.equal(runtime.fields.get(".fr-rapport-context-field").hidden, true);
  runtime.fields.get(".fr-rapport-referenced-back").checked = true;
  runtime.fields.get(".fr-rapport-referenced-back").handlers.change();
  assert.equal(runtime.fields.get(".fr-rapport-context-field").hidden, false);
});

test("Rapport requires one canonical category and an explicit reference-back action", () => {
  for (const fixture of [
    {},
    { rapportContextCategory: "pets" },
    { rapportReferencedBack: true },
    { rapportContextCategory: "customer seemed comfortable", rapportReferencedBack: true },
    { rapportContextCategory: "travel-companion", rapportReferencedBack: true },
    { rapportContextCategory: "pet", rapportReferencedBack: true },
    { rapportContextCategory: "pets ", rapportReferencedBack: true },
    { rapportContextCategory: "family-context", rapportReferencedBack: true },
    { rapportContextCategory: "local-geographic-connection", rapportReferencedBack: true },
  ]) {
    const interaction = loadBuilder([makeInteraction(fixture)])()
      .customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("each canonical Rapport category creates the exact category-only outcome", () => {
  const categories = [
    "travel-companions",
    "pets",
    "destination",
    "hobby",
    "prior-rv-experience",
    "trip-style",
    "non-sensitive-preference",
  ];

  for (const category of categories) {
    const interaction = loadBuilder([
      makeInteraction({
        rapportContextCategory: category,
        rapportReferencedBack: true,
      }),
    ])().customerInteractions[0];
    const outcome = interaction.salesStepOutcomes[0];

    assert.deepEqual(clone(outcome), {
      id: outcome.id,
      step: "rapport",
      performedBy: "commander",
      action: "referenced-back-to-customer-context",
      customerContextRef: {
        type: "customer-context-category",
        category,
      },
    });
    assert.equal(Object.hasOwn(outcome.customerContextRef, "value"), false);
    assert.equal(Object.hasOwn(outcome, "result"), false);
  }
});

test("Rapport capture stores no personal detail and creates no evidence itself", () => {
  const report = loadBuilder([
    makeInteraction({
      buyerContext: "Customer named Jamie works at Acme",
      notableMoment: "Customer seemed comfortable and trusted me",
      rapportContextCategory: "hobby",
      rapportReferencedBack: true,
    }),
  ])();
  const outcome = report.customerInteractions[0].salesStepOutcomes[0];
  const serializedOutcome = JSON.stringify(outcome);

  assert.equal(serializedOutcome.includes("Jamie"), false);
  assert.equal(serializedOutcome.includes("Acme"), false);
  assert.equal(serializedOutcome.includes("comfortable"), false);
  assert.equal(serializedOutcome.includes("trusted"), false);
  assert.equal(Object.hasOwn(report, "behavioralEvidence"), false);
  assert.equal(report.systemMetadata.processingStatus, "raw");
});

test("interaction scalar and array fields redact PII while preserving safe values and order", () => {
  const piiItems =
    "safe value, buyer@example.com, 212-555-0198, 1HGCM82633A004352";
  const interaction = loadBuilder([
    makeInteraction({
      buyerContext: "Contact buyer@example.com",
      customerGoal: "Call 212-555-0198",
      keyNeeds: piiItems,
      hotButtons: piiItems,
      objections: piiItems,
      notableMoment: "Vehicle 1HGCM82633A004352",
    }),
  ])().customerInteractions[0];
  const expectedItems = [
    "safe value",
    "[redacted-email]",
    "[redacted-phone]",
    "[redacted-vehicle-id]",
  ];

  assert.equal(interaction.buyerContext, "Contact [redacted-email]");
  assert.equal(interaction.customerGoal, "Call [redacted-phone]");
  assert.equal(interaction.notableMoment, "Vehicle [redacted-vehicle-id]");
  assert.deepEqual(clone(interaction.keyNeeds), expectedItems);
  assert.deepEqual(clone(interaction.hotButtons), expectedItems);
  assert.deepEqual(clone(interaction.objections), expectedItems);
});

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

test("Discovery requires both explicit performed action and canonical result", () => {
  for (const fixture of [
    {},
    { discoveryPerformed: true },
    { discoveryResult: "customer-shared-needs-goals" },
  ]) {
    const interaction = loadBuilder([makeInteraction(fixture)])()
      .customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("each canonical Discovery response serializes exactly", () => {
  const results = [
    "customer-shared-needs-goals",
    "customer-shared-limited-information",
    "customer-declined-to-share",
    "customer-response-unclear",
  ];

  for (const result of results) {
    const interaction = loadBuilder([
      makeInteraction({ discoveryPerformed: true, discoveryResult: result }),
    ])().customerInteractions[0];
    const event = interaction.salesStepOutcomes[0];

    assert.match(event.id, /^sales_step_outcome_\d+_\d+$/);
    assert.equal(event.step, "discovery");
    assert.equal(event.performedBy, "commander");
    assert.equal(event.result, result);
  }
});

test("non-canonical and free-text Discovery responses cannot persist", () => {
  for (const result of [
    "successful-discovery",
    "Customer told me what they need",
    "customer-shared-needs-goals ",
  ]) {
    const interaction = loadBuilder([
      makeInteraction({ discoveryPerformed: true, discoveryResult: result }),
    ])().customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("all three sales-step outcomes coexist in their established order", () => {
  const interaction = loadBuilder([
    makeInteraction({
      objections: "payment",
      performed: true,
      result: "customer-concern-resolved",
      trialClosePerformed: true,
      trialCloseResult: "customer-expressed-readiness-to-proceed",
      discoveryPerformed: true,
      discoveryResult: "customer-shared-needs-goals",
    }),
  ])().customerInteractions[0];

  assert.deepEqual(
    clone(interaction.salesStepOutcomes.map((event) => event.step)),
    ["objection-handling", "trial-close", "discovery"],
  );
  assert.equal(new Set(interaction.salesStepOutcomes.map((event) => event.id)).size, 3);
});

test("Product Selection defaults to no action and requires complete same-interaction linkage", () => {
  const fixtures = [
    {},
    { productSelectionPerformed: true },
    { productSelectionNeedRef: "key-needs-0", productSelectionUnitRef: "Model A", productSelectionResult: "customer-considered-selected-unit" },
    { productSelectionPerformed: true, productSelectionUnitRef: "Model A", productSelectionResult: "customer-considered-selected-unit" },
    { productSelectionPerformed: true, productSelectionNeedRef: "key-needs-0", productSelectionResult: "customer-considered-selected-unit" },
    { productSelectionPerformed: true, productSelectionNeedRef: "key-needs-0", productSelectionUnitRef: "Model A" },
    { productSelectionPerformed: true, productSelectionNeedRef: "key-needs-99", productSelectionUnitRef: "Model A", productSelectionResult: "customer-considered-selected-unit" },
  ];
  for (const fixture of fixtures) {
    const interaction = loadBuilder([makeInteraction(fixture)])().customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("Product Selection serializes one neutral outcome without PII or cross-report identity", () => {
  const interaction = loadBuilder([
    makeInteraction({
      keyNeeds: "sleeping capacity, outdoor kitchen",
      productSelectionPerformed: true,
      productSelectionNeedRef: "key-needs-1",
      productSelectionUnitRef: "Model-A-2026",
      productSelectionResult: "customer-considered-selected-unit",
    }),
  ])().customerInteractions[0];
  const outcome = interaction.salesStepOutcomes[0];

  assert.deepEqual(clone(outcome), {
    id: outcome.id,
    step: "product-selection",
    performedBy: "commander",
    needRef: { field: "keyNeeds", index: 1 },
    selectedUnitRef: { type: "unit-reference", value: "Model-A-2026" },
    result: "customer-considered-selected-unit",
  });
  assert.equal(JSON.stringify(outcome).includes("customer@example.com"), false);
  assert.equal(JSON.stringify(outcome).includes("1HGCM82633A004352"), false);
  assert.equal(Object.hasOwn(outcome, "customerGoal"), false);
});

test("Product Selection accepts each canonical neutral result and rejects unsafe unit references", () => {
  for (const result of [
    "customer-considered-selected-unit",
    "customer-requested-different-option",
    "selected-unit-unavailable",
    "customer-response-unclear",
  ]) {
    const interaction = loadBuilder([
      makeInteraction({
        productSelectionPerformed: true,
        productSelectionNeedRef: "key-needs-0",
        productSelectionUnitRef: "Model A",
        productSelectionResult: result,
      }),
    ])().customerInteractions[0];
    assert.equal(interaction.salesStepOutcomes[0].result, result);
  }
  for (const unit of ["1HGCM82633A004352", "buyer@example.com", "212-555-0198"]) {
    const interaction = loadBuilder([
      makeInteraction({
        productSelectionPerformed: true,
        productSelectionNeedRef: "key-needs-0",
        productSelectionUnitRef: unit,
        productSelectionResult: "customer-considered-selected-unit",
      }),
    ])().customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("Presentation defaults closed and incomplete linkage creates no outcome", () => {
  const complete = {
    presentationPerformed: true,
    presentationNeedRef: "key-needs-0",
    presentationUnitRef: "Model A",
    presentationReference: "Double-over-double bunks",
    presentationResult: "customer-considered-presented-feature-benefit",
  };
  for (const missing of [
    "presentationPerformed",
    "presentationNeedRef",
    "presentationUnitRef",
    "presentationReference",
    "presentationResult",
  ]) {
    const fixture = { ...complete };
    fixture[missing] = missing === "presentationPerformed" ? false : "";
    const interaction = loadBuilder([makeInteraction(fixture)])().customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false, missing);
  }
  const defaultInteraction = loadBuilder([makeInteraction()])().customerInteractions[0];
  assert.equal(Object.hasOwn(defaultInteraction, "salesStepOutcomes"), false);
});

test("Presentation serializes one exact same-interaction need-to-feature outcome", () => {
  const interaction = loadBuilder([
    makeInteraction({
      keyNeeds: "sleeping capacity, storage",
      presentationPerformed: true,
      presentationNeedRef: "key-needs-1",
      presentationUnitRef: "Model-A-2026",
      presentationReference: "Large pass-through storage",
      presentationResult: "customer-requested-more-detail",
      notableMoment: "Unstructured narrative stays outside the outcome",
    }),
  ])().customerInteractions[0];
  const outcome = interaction.salesStepOutcomes[0];

  assert.deepEqual(clone(outcome), {
    id: outcome.id,
    step: "presentation",
    performedBy: "commander",
    needRef: { field: "keyNeeds", index: 1 },
    selectedUnitRef: { type: "unit-reference", value: "Model-A-2026" },
    presentationRef: {
      type: "feature-benefit-reference",
      value: "Large pass-through storage",
    },
    result: "customer-requested-more-detail",
  });
  assert.equal(JSON.stringify(outcome).includes("Unstructured narrative"), false);
});

test("Presentation accepts exact neutral results and rejects unsafe or malformed inputs", () => {
  const results = [
    "customer-considered-presented-feature-benefit",
    "customer-requested-more-detail",
    "customer-preferred-different-feature-benefit",
    "customer-response-unclear",
  ];
  for (const result of results) {
    const interaction = loadBuilder([makeInteraction({
      presentationPerformed: true,
      presentationNeedRef: "key-needs-0",
      presentationUnitRef: "Model A",
      presentationReference: "Residential refrigerator",
      presentationResult: result,
    })])().customerInteractions[0];
    assert.equal(interaction.salesStepOutcomes.length, 1);
    assert.equal(interaction.salesStepOutcomes[0].result, result);
  }

  for (const overrides of [
    { presentationNeedRef: "key-needs-99" },
    { presentationNeedRef: "customer-goal-0" },
    { presentationUnitRef: "1HGCM82633A004352" },
    { presentationUnitRef: "buyer@example.com" },
    { presentationUnitRef: "212-555-0198" },
    { presentationUnitRef: "A".repeat(65) },
    { presentationReference: "1HGCM82633A004352" },
    { presentationReference: "buyer@example.com" },
    { presentationReference: "212-555-0198" },
    { presentationReference: "A".repeat(65) },
    { presentationResult: "successful-presentation" },
  ]) {
    const interaction = loadBuilder([makeInteraction({
      presentationPerformed: true,
      presentationNeedRef: "key-needs-0",
      presentationUnitRef: "Model A",
      presentationReference: "Residential refrigerator",
      presentationResult: "customer-response-unclear",
      ...overrides,
    })])().customerInteractions[0];
    assert.equal(Object.hasOwn(interaction, "salesStepOutcomes"), false);
  }
});

test("Product Selection alone never creates a Presentation outcome", () => {
  const interaction = loadBuilder([makeInteraction({
    productSelectionPerformed: true,
    productSelectionNeedRef: "key-needs-0",
    productSelectionUnitRef: "Model A",
    productSelectionResult: "customer-considered-selected-unit",
  })])().customerInteractions[0];
  assert.deepEqual(clone(interaction.salesStepOutcomes.map((outcome) => outcome.step)), [
    "product-selection",
  ]);
});
