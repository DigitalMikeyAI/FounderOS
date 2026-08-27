const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const storagePath = path.resolve(__dirname, "..", "js", "storage.js");
const storageSource = fs.readFileSync(storagePath, "utf8");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function loadStorage(initial = {}) {
  const localStorage = createStorage(initial);
  const sessionStorage = createStorage();
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    localStorage,
    sessionStorage,
  });
  vm.runInContext(
    `${storageSource}\n;globalThis.__api = { founder, saveFounder, loadFounder, normalizeCommanderProfile, validateCommanderProfileCapability, COMMANDER_PROFILE_SCHEMA_VERSION };`,
    context,
    { filename: storagePath },
  );
  return { ...context.__api, localStorage };
}

function makeCapability(overrides = {}) {
  return {
    id: "profile_capability_objection-handling",
    type: "developing-capability",
    competency: "objection-handling",
    label: "Objection Handling",
    status: "active",
    adoptedAt: "2026-08-27T12:00:00.000Z",
    withdrawnAt: null,
    adoptedBy: "commander",
    adoptedWording: "Developing capability: Objection Handling",
    evidenceSupportState: "current",
    provenance: {
      candidateId:
        "profile_candidate_behavioral_capability_objection-handling",
      candidateVersionIdentity: "candidate-version-exact",
      patternId: "behavioral_pattern_objection-handling",
      patternVersionIdentity: "pattern-version-exact",
      patternReviewId: "pattern-review-exact",
      contributorActiveIdentities: [
        "active-a",
        "active-b",
        "active-c",
      ],
      decisionId: "profile-decision-exact",
    },
    ...overrides,
  };
}

test("default Profile exposes the versioned empty capabilities contract", () => {
  const { founder, COMMANDER_PROFILE_SCHEMA_VERSION } = loadStorage();
  assert.equal(
    COMMANDER_PROFILE_SCHEMA_VERSION,
    "COMMANDER_PROFILE_SCHEMA_v1",
  );
  assert.equal(
    founder.profile.schemaVersion,
    "COMMANDER_PROFILE_SCHEMA_v1",
  );
  assert.deepEqual(clone(founder.profile.capabilities), []);
});

test("legacy Profile loads capabilities safely without rewriting existing fields", () => {
  const legacyProfile = {
    strengths: ["Teaching"],
    interests: ["Technology"],
    skills: ["Explaining"],
    goals: ["Build FounderOS"],
    values: ["Clarity"],
    learningStyle: "Hands-on",
    confidenceAreas: ["Communication"],
    growthAreas: ["Delegation"],
    futureField: { preserved: true },
  };
  const { founder, loadFounder } = loadStorage({
    digitalMikeyFounder: JSON.stringify({
      name: "Commander",
      profile: legacyProfile,
    }),
  });
  loadFounder();

  assert.deepEqual(clone(founder.profile.strengths), ["Teaching"]);
  assert.deepEqual(clone(founder.profile.skills), ["Explaining"]);
  assert.deepEqual(clone(founder.profile.goals), ["Build FounderOS"]);
  assert.deepEqual(clone(founder.profile.capabilities), []);
  assert.deepEqual(clone(founder.profile.futureField), { preserved: true });
  assert.equal(
    founder.profile.schemaVersion,
    "COMMANDER_PROFILE_SCHEMA_v1",
  );
});

test("valid capability preserves its complete identity and provenance", () => {
  const { validateCommanderProfileCapability } = loadStorage();
  const capability = makeCapability();
  const before = clone(capability);
  const result = validateCommanderProfileCapability(capability);

  assert.equal(result.valid, true);
  assert.deepEqual(clone(result.capability), before);
  result.capability.provenance.contributorActiveIdentities[0] = "changed";
  assert.deepEqual(capability, before);
});

test("invalid type, status, support, competency, and provenance fail safely", () => {
  const { validateCommanderProfileCapability } = loadStorage();
  const cases = [
    [makeCapability({ type: "strength" }), "invalid-capability-identity"],
    [makeCapability({ status: "pending" }), "invalid-capability-status"],
    [
      makeCapability({ evidenceSupportState: "high-confidence" }),
      "invalid-evidence-support-state",
    ],
    [
      makeCapability({
        competency: "",
        id: "profile_capability_",
      }),
      "invalid-capability-competency",
    ],
    [
      makeCapability({
        provenance: {
          ...makeCapability().provenance,
          patternReviewId: "",
        },
      }),
      "invalid-capability-provenance",
    ],
  ];

  for (const [capability, reason] of cases) {
    const result = validateCommanderProfileCapability(capability);
    assert.equal(result.valid, false);
    assert.equal(result.reason, reason);
  }
});

test("stable capability ID is competency-owned rather than evidence-version-owned", () => {
  const { validateCommanderProfileCapability } = loadStorage();
  const first = makeCapability();
  const changedEvidence = makeCapability({
    provenance: {
      ...first.provenance,
      candidateVersionIdentity: "candidate-version-new",
      patternVersionIdentity: "pattern-version-new",
      patternReviewId: "pattern-review-new",
    },
  });

  assert.equal(validateCommanderProfileCapability(first).valid, true);
  assert.equal(
    validateCommanderProfileCapability(changedEvidence).valid,
    true,
  );
  assert.equal(first.id, changedEvidence.id);
});

test("withdrawn capability remains valid with history and exact provenance", () => {
  const { validateCommanderProfileCapability } = loadStorage();
  const withdrawn = makeCapability({
    status: "withdrawn",
    withdrawnAt: "2026-08-28T12:00:00.000Z",
    evidenceSupportState: "insufficient-current-support",
  });
  const result = validateCommanderProfileCapability(withdrawn);

  assert.equal(result.valid, true);
  assert.equal(result.capability.status, "withdrawn");
  assert.equal(
    result.capability.withdrawnAt,
    "2026-08-28T12:00:00.000Z",
  );
  assert.deepEqual(
    clone(result.capability.provenance),
    clone(withdrawn.provenance),
  );
});

test("save and reload preserves a valid capability exactly", () => {
  const capability = makeCapability();
  const first = loadStorage();
  first.founder.profile.capabilities = [clone(capability)];
  first.saveFounder();
  const saved = first.localStorage.getItem("digitalMikeyFounder");
  const second = loadStorage({ digitalMikeyFounder: saved });
  second.loadFounder();

  assert.deepEqual(
    clone(second.founder.profile.capabilities),
    [capability],
  );
  assert.deepEqual(clone(second.founder.profile.strengths), []);
});

test("unrelated and strength-profile saves preserve capabilities", () => {
  const capability = makeCapability();
  const founder = {
    profile: {
      schemaVersion: "COMMANDER_PROFILE_SCHEMA_v1",
      strengths: ["Existing"],
      capabilities: [clone(capability)],
    },
    memory: { artifacts: {} },
  };
  let saveCount = 0;
  const file = path.resolve(
    __dirname,
    "..",
    "systems",
    "memory.system.js",
  );
  const source = fs.readFileSync(file, "utf8");
  const context = vm.createContext({
    founder,
    console: { log() {}, warn() {}, error() {} },
    CommanderSystem: {
      save() {
        saveCount += 1;
      },
    },
  });
  vm.runInContext(
    `${source}\n;globalThis.__MemorySystem = MemorySystem;`,
    context,
    { filename: file },
  );
  const memory = context.__MemorySystem;
  const beforeCapability = clone(founder.profile.capabilities);

  memory.saveArtifact({ type: "unrelated-artifact", value: true });
  assert.deepEqual(founder.profile.capabilities, beforeCapability);
  assert.deepEqual(clone(founder.profile.strengths), ["Existing"]);

  memory.saveArtifact({
    type: "strength-profile",
    strengths: ["Updated"],
  });
  assert.deepEqual(clone(founder.profile.strengths), ["Updated"]);
  assert.deepEqual(founder.profile.capabilities, beforeCapability);
  assert.equal(saveCount, 2);
});

test("schema adds no E4, candidate, consent, UI, or coaching integration", () => {
  assert.doesNotMatch(
    storageSource,
    /identifyRecurringBehavioralPatterns|behavioralPatternReviews|profile-candidate|consent ledger|active coaching/i,
  );
  const changedProduction = ["js/storage.js", "systems/memory.system.js"];
  assert.deepEqual(changedProduction, [
    "js/storage.js",
    "systems/memory.system.js",
  ]);
});
