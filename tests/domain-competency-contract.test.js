const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const contractPath = path.resolve(
  __dirname,
  "..",
  "systems",
  "domain-competency.contract.js",
);
const contractSource = fs.readFileSync(contractPath, "utf8");

function loadContract() {
  const context = vm.createContext({});
  vm.runInContext(
    `${contractSource}\n;globalThis.__contract = DomainCompetencyContract;`,
    context,
    { filename: contractPath },
  );
  return context.__contract;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const expected = [
  { key: "rapport", label: "Rapport" },
  { key: "discovery", label: "Discovery" },
  { key: "product-selection", label: "Product Selection" },
  { key: "presentation", label: "Presentation" },
  { key: "objection-handling", label: "Objection Handling" },
  { key: "trial-close", label: "Trial Close" },
];

test("contract owns the exact camping.sales vocabulary and labels", () => {
  const contract = loadContract();
  assert.equal(contract.CAMPING_SALES_DOMAIN, "camping.sales");
  assert.deepEqual(
    clone(contract.getDomainCompetencies("camping.sales")),
    expected,
  );
  assert.equal(new Set(expected.map((entry) => entry.key)).size, expected.length);
});

test("canonical validation requires exact domain and exact key", () => {
  const contract = loadContract();
  for (const { key } of expected) {
    assert.equal(contract.isCanonicalDomainCompetency("camping.sales", key), true);
  }
  for (const [domain, competency] of [
    ["generic-career", "discovery"],
    ["camping.sales", "Trial Close"],
    ["camping.sales", "trial_close"],
    ["camping.sales", " trial-close "],
    ["camping.sales", "closing"],
    ["CAMPING.SALES", "trial-close"],
  ]) {
    assert.equal(contract.isCanonicalDomainCompetency(domain, competency), false);
  }
});

test("reference validation accepts only a complete canonical reference", () => {
  const contract = loadContract();
  assert.deepEqual(
    clone(
      contract.validateDomainCompetencyReference({
        domain: "camping.sales",
        competency: "trial-close",
      }),
    ),
    {
      valid: true,
      reference: { domain: "camping.sales", competency: "trial-close" },
    },
  );
  assert.equal(
    contract.validateDomainCompetencyReference({
      domain: "generic-career",
      competency: "discovery",
    }).valid,
    false,
  );
  assert.equal(
    contract.validateDomainCompetencyReference({
      domain: "camping.sales",
      competency: "unknown",
    }).valid,
    false,
  );
  assert.equal(contract.validateDomainCompetencyReference(null).valid, false);
});

test("label lookup is exact and performs no aliases or prose inference", () => {
  const contract = loadContract();
  for (const { key, label } of expected) {
    assert.equal(contract.getDomainCompetencyLabel("camping.sales", key), label);
  }
  assert.equal(
    contract.getDomainCompetencyLabel("camping.sales", "Trial Close"),
    null,
  );
  assert.equal(
    contract.getDomainCompetencyLabel("generic-career", "discovery"),
    null,
  );
  assert.equal(
    contract.getDomainCompetencyLabel(
      "camping.sales",
      "Practice a trial close with the customer",
    ),
    null,
  );
});

test("callers cannot mutate the canonical vocabulary", () => {
  const contract = loadContract();
  const first = contract.getDomainCompetencies("camping.sales");
  first[0].key = "changed";
  first.push({ key: "invented", label: "Invented" });
  assert.deepEqual(
    clone(contract.getDomainCompetencies("camping.sales")),
    expected,
  );
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.campingSalesCompetencies), true);
  assert.equal(Object.isFrozen(contract.campingSalesCompetencies[0]), true);
});

test("unknown domains return an empty defensive vocabulary", () => {
  const contract = loadContract();
  assert.deepEqual(clone(contract.getDomainCompetencies("unknown")), []);
  assert.deepEqual(clone(contract.getDomainCompetencies()), []);
});

test("contract introduces no Guidance, mission, persistence, or inference behavior", () => {
  assert.doesNotMatch(
    contractSource,
    /GuidanceSystem|MissionSystem|MissionIntelligenceSystem|CommanderSystem|localStorage|sessionStorage|profile\.capabilities|missionObjectives|natural language|keyword|score|confidence/i,
  );
  const guidanceSource = fs.readFileSync(
    path.resolve(__dirname, "..", "systems", "guidance.system.js"),
    "utf8",
  );
  const storageSource = fs.readFileSync(
    path.resolve(__dirname, "..", "js", "storage.js"),
    "utf8",
  );
  assert.doesNotMatch(guidanceSource, /DomainCompetencyContract|camping\.sales/);
  assert.doesNotMatch(storageSource, /competencyDomain|capabilityDomain/);
});
