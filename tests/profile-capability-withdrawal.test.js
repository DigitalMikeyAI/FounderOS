const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
  };
}

function makeAdopt(overrides = {}) {
  return {
    id: "profile_capability_decision_adopt_a",
    candidateId: "profile_candidate_behavioral_capability_objection-handling",
    candidateVersionIdentity: "candidate-version-a",
    competency: "objection-handling",
    label: "Objection Handling",
    proposedProfileType: "developing-capability",
    proposedProfileWording: "Developing capability: Objection Handling",
    sourcePatternId: "behavioral_pattern_objection-handling",
    sourcePatternVersionIdentity: "pattern-version-a",
    sourcePatternReviewId: "pattern-review-a",
    contributorActiveIdentities: ["active-a", "active-b", "active-c"],
    decision: "adopt",
    note: null,
    decidedAt: "2026-08-27T12:00:00.000Z",
    supersedesDecisionId: null,
    ...overrides,
  };
}

function makeCapability(adopt = makeAdopt(), overrides = {}) {
  return {
    id: `profile_capability_${adopt.competency}`,
    type: "developing-capability",
    competency: adopt.competency,
    label: adopt.label,
    status: "active",
    adoptedAt: adopt.decidedAt,
    withdrawnAt: null,
    adoptedBy: "commander",
    adoptedWording: adopt.proposedProfileWording,
    evidenceSupportState: "current",
    provenance: {
      candidateId: adopt.candidateId,
      candidateVersionIdentity: adopt.candidateVersionIdentity,
      patternId: adopt.sourcePatternId,
      patternVersionIdentity: adopt.sourcePatternVersionIdentity,
      patternReviewId: adopt.sourcePatternReviewId,
      contributorActiveIdentities: adopt.contributorActiveIdentities.slice(),
      decisionId: adopt.id,
    },
    ...overrides,
  };
}

function createHarness({ failDecisionSave = false, failProfileSave = false } = {}) {
  const localStorage = createStorage();
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    localStorage,
    sessionStorage: createStorage(),
    Date,
    Math,
  });
  for (const relativePath of [
    "js/storage.js",
    "systems/commander.system.js",
    "js/core/archie-core.js",
  ]) {
    const file = path.resolve(__dirname, "..", relativePath);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  vm.runInContext(
    ";globalThis.__api = { founder, loadFounder, ArchieCore, CommanderSystem };",
    context,
  );
  const { founder, ArchieCore, CommanderSystem } = context.__api;
  const adopt = makeAdopt();
  const capability = makeCapability(adopt);
  founder.profile.capabilities = [clone(capability)];
  founder.profile.strengths = ["Existing Strength"];
  founder.profile.skills = ["Existing Skill"];
  founder.profile.goals = ["Existing Goal"];
  founder.memory.artifacts = {
    "camping.fieldReports": { reports: [{ id: "report-a" }] },
    "camping.behavioralEvidenceReviews": { reviews: [{ id: "e3-a" }] },
    "camping.behavioralPatternReviews": { reviews: [{ id: "e4-a" }] },
    "camping.profileCapabilityDecisions": {
      type: "camping.profileCapabilityDecisions",
      schemaVersion: "PROFILE_CAPABILITY_DECISION_SCHEMA_v1",
      decisions: [clone(adopt)],
      createdAt: adopt.decidedAt,
      updatedAt: adopt.decidedAt,
    },
  };
  const artifacts = founder.memory.artifacts;
  let decisionSaveCount = 0;
  let profileSaveCount = 0;
  CommanderSystem.save = function save() {
    profileSaveCount += 1;
    if (failProfileSave && profileSaveCount === 1) return false;
    localStorage.setItem("digitalMikeyFounder", JSON.stringify(founder));
    return true;
  };
  let candidates = [
    {
      candidateId: adopt.candidateId,
      candidateVersionIdentity: adopt.candidateVersionIdentity,
      competency: adopt.competency,
    },
  ];
  ArchieCore.systems = {
    commander: CommanderSystem,
    memory: {
      getArtifact(type) {
        return artifacts[type] || null;
      },
      saveArtifact(artifact) {
        decisionSaveCount += 1;
        if (failDecisionSave && decisionSaveCount === 1) return null;
        artifacts[artifact.type] = clone(artifact);
        return artifacts[artifact.type];
      },
    },
    missionIntelligence: {
      identifyProfileCapabilityCandidates() {
        return clone(candidates);
      },
    },
  };
  return {
    founder,
    ArchieCore,
    CommanderSystem,
    localStorage,
    adopt,
    capability,
    artifacts,
    setCandidates(value) {
      candidates = clone(value);
    },
    getDecisionSaveCount() {
      return decisionSaveCount;
    },
    getProfileSaveCount() {
      return profileSaveCount;
    },
  };
}

test("explicit withdrawal appends history and preserves exact identity snapshot", async () => {
  const harness = createHarness();
  const beforeE3 = clone(harness.artifacts["camping.behavioralEvidenceReviews"]);
  const beforeE4 = clone(harness.artifacts["camping.behavioralPatternReviews"]);
  const result = await harness.ArchieCore.withdrawProfileCapability({
    capabilityId: harness.capability.id,
    note: "I no longer want this in my current Profile.",
  });
  const records =
    harness.artifacts["camping.profileCapabilityDecisions"].decisions;
  const withdrawn = harness.founder.profile.capabilities[0];

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], harness.adopt);
  assert.equal(records[1].decision, "withdraw");
  assert.equal(records[1].capabilityId, harness.capability.id);
  assert.equal(records[1].originalAdoptionDecisionId, harness.adopt.id);
  assert.equal(records[1].supersedesDecisionId, harness.adopt.id);
  assert.equal(records[1].note, "I no longer want this in my current Profile.");
  assert.ok(records[1].decidedAt);
  assert.equal(withdrawn.id, harness.capability.id);
  assert.equal(withdrawn.status, "withdrawn");
  assert.equal(withdrawn.withdrawnAt, records[1].decidedAt);
  assert.equal(withdrawn.adoptedAt, harness.capability.adoptedAt);
  assert.equal(withdrawn.adoptedWording, harness.capability.adoptedWording);
  assert.equal(withdrawn.evidenceSupportState, "current");
  assert.deepEqual(
    clone(withdrawn.provenance),
    clone(harness.capability.provenance),
  );
  assert.deepEqual(
    harness.artifacts["camping.behavioralEvidenceReviews"],
    beforeE3,
  );
  assert.deepEqual(
    harness.artifacts["camping.behavioralPatternReviews"],
    beforeE4,
  );
});

test("repeated withdrawal is idempotent with no additional saves", async () => {
  const harness = createHarness();
  await harness.ArchieCore.withdrawProfileCapability({
    capabilityId: harness.capability.id,
  });
  const decisionSaves = harness.getDecisionSaveCount();
  const profileSaves = harness.getProfileSaveCount();
  const repeated = await harness.ArchieCore.withdrawProfileCapability({
    capabilityId: harness.capability.id,
  });

  assert.equal(repeated.success, true);
  assert.equal(repeated.changed, false);
  assert.equal(harness.getDecisionSaveCount(), decisionSaves);
  assert.equal(harness.getProfileSaveCount(), profileSaves);
  assert.equal(
    harness.artifacts["camping.profileCapabilityDecisions"].decisions.length,
    2,
  );
});

test("withdrawn capability stays stored but is excluded from current identity", async () => {
  const harness = createHarness();
  const trial = makeCapability(
    makeAdopt({
      id: "trial-adopt",
      candidateId: "profile_candidate_behavioral_capability_trial-close",
      candidateVersionIdentity: "trial-version",
      competency: "trial-close",
      label: "Trial Close",
      proposedProfileWording: "Developing capability: Trial Close",
      sourcePatternId: "behavioral_pattern_trial-close",
    }),
  );
  harness.founder.profile.capabilities.push(clone(trial));
  await harness.ArchieCore.withdrawProfileCapability({
    capabilityId: harness.capability.id,
  });

  assert.equal(harness.founder.profile.capabilities.length, 2);
  assert.deepEqual(
    clone(harness.CommanderSystem.getActiveProfileCapabilities()),
    [trial],
  );
  assert.deepEqual(clone(harness.founder.profile.strengths), ["Existing Strength"]);
  assert.deepEqual(clone(harness.founder.profile.skills), ["Existing Skill"]);
  assert.deepEqual(clone(harness.founder.profile.goals), ["Existing Goal"]);
});

test("evidence changes never withdraw or reactivate identity automatically", async () => {
  const harness = createHarness();
  harness.setCandidates([
    {
      candidateId: harness.adopt.candidateId,
      candidateVersionIdentity: "candidate-version-b",
      competency: harness.adopt.competency,
    },
  ]);
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  assert.equal(harness.founder.profile.capabilities[0].status, "active");
  assert.equal(
    harness.founder.profile.capabilities[0].evidenceSupportState,
    "support-changed",
  );
  await harness.ArchieCore.withdrawProfileCapability({
    capabilityId: harness.capability.id,
  });
  harness.setCandidates([]);
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  assert.equal(harness.founder.profile.capabilities[0].status, "withdrawn");
  assert.equal(
    harness.founder.profile.capabilities[0].evidenceSupportState,
    "insufficient-current-support",
  );
  harness.setCandidates([
    {
      candidateId: harness.adopt.candidateId,
      candidateVersionIdentity: harness.adopt.candidateVersionIdentity,
      competency: harness.adopt.competency,
    },
  ]);
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  assert.equal(harness.founder.profile.capabilities[0].status, "withdrawn");
});

test("defer reject and suppress neither withdraw nor reactivate", async () => {
  for (const decisionType of ["defer", "reject", "suppress"]) {
    const active = createHarness();
    active.artifacts["camping.profileCapabilityDecisions"].decisions.push(
      makeAdopt({
        id: `${decisionType}-b`,
        candidateVersionIdentity: "candidate-version-b",
        decision: decisionType,
        decidedAt: "2026-08-28T12:00:00.000Z",
      }),
    );
    await active.ArchieCore.synchronizeAdoptedProfileCapabilities();
    assert.equal(active.founder.profile.capabilities[0].status, "active");

    await active.ArchieCore.withdrawProfileCapability({
      capabilityId: active.capability.id,
    });
    active.artifacts["camping.profileCapabilityDecisions"].decisions.push(
      makeAdopt({
        id: `${decisionType}-c`,
        candidateVersionIdentity: "candidate-version-c",
        decision: decisionType,
        decidedAt: "2026-08-29T12:00:00.000Z",
      }),
    );
    await active.ArchieCore.synchronizeAdoptedProfileCapabilities();
    assert.equal(active.founder.profile.capabilities[0].status, "withdrawn");
  }
});

test("a later explicit adopt reactivates the same capability with new provenance", async () => {
  const harness = createHarness();
  await harness.ArchieCore.withdrawProfileCapability({
    capabilityId: harness.capability.id,
  });
  const adoptB = makeAdopt({
    id: "profile_capability_decision_adopt_b",
    candidateVersionIdentity: "candidate-version-b",
    sourcePatternVersionIdentity: "pattern-version-b",
    sourcePatternReviewId: "pattern-review-b",
    decidedAt: "2026-08-29T12:00:00.000Z",
  });
  harness.artifacts["camping.profileCapabilityDecisions"].decisions.push(adoptB);
  harness.setCandidates([
    {
      candidateId: adoptB.candidateId,
      candidateVersionIdentity: adoptB.candidateVersionIdentity,
      competency: adoptB.competency,
    },
  ]);
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  const capability = harness.founder.profile.capabilities[0];

  assert.equal(capability.id, harness.capability.id);
  assert.equal(capability.status, "active");
  assert.equal(capability.withdrawnAt, null);
  assert.equal(capability.provenance.decisionId, adoptB.id);
  assert.equal(capability.provenance.candidateVersionIdentity, "candidate-version-b");
  assert.equal(
    harness.artifacts["camping.profileCapabilityDecisions"].decisions.length,
    3,
  );
});

test("decision save failure leaves the active Profile untouched", async () => {
  const harness = createHarness({ failDecisionSave: true });
  const beforeProfile = clone(harness.founder.profile);
  const beforeLedger = clone(
    harness.artifacts["camping.profileCapabilityDecisions"],
  );
  const result = await harness.ArchieCore.withdrawProfileCapability({
    capabilityId: harness.capability.id,
  });

  assert.equal(result.success, false);
  assert.equal(
    result.reason,
    "profile-capability-withdrawal-decision-save-failed",
  );
  assert.deepEqual(clone(harness.founder.profile), beforeProfile);
  assert.deepEqual(
    harness.artifacts["camping.profileCapabilityDecisions"],
    beforeLedger,
  );
});

test("Profile save failure rolls decision history back without half-state", async () => {
  const harness = createHarness({ failProfileSave: true });
  const beforeProfile = clone(harness.founder.profile);
  const beforeLedger = clone(
    harness.artifacts["camping.profileCapabilityDecisions"],
  );
  const result = await harness.ArchieCore.withdrawProfileCapability({
    capabilityId: harness.capability.id,
  });

  assert.equal(result.success, false);
  assert.equal(
    result.reason,
    "profile-capability-withdrawal-profile-save-failed",
  );
  assert.deepEqual(clone(harness.founder.profile), beforeProfile);
  assert.deepEqual(
    harness.artifacts["camping.profileCapabilityDecisions"],
    beforeLedger,
  );
});

test("malformed and missing capabilities fail safely", async () => {
  const malformed = createHarness();
  malformed.founder.profile.capabilities[0].provenance.patternReviewId = "";
  const invalid = await malformed.ArchieCore.withdrawProfileCapability({
    capabilityId: malformed.capability.id,
  });
  assert.equal(invalid.success, false);
  assert.equal(invalid.reason, "invalid-capability-provenance");
  assert.equal(malformed.getDecisionSaveCount(), 0);

  const missing = createHarness();
  const absent = await missing.ArchieCore.withdrawProfileCapability({
    capabilityId: "profile_capability_trial-close",
  });
  assert.equal(absent.success, false);
  assert.equal(absent.reason, "profile-capability-not-found");
  assert.equal(missing.getDecisionSaveCount(), 0);
});

test("withdrawn Profile and append-only ledger survive reload", async () => {
  const harness = createHarness();
  await harness.ArchieCore.withdrawProfileCapability({
    capabilityId: harness.capability.id,
  });
  const saved = harness.localStorage.getItem("digitalMikeyFounder");
  const parsed = JSON.parse(saved);

  assert.equal(parsed.profile.capabilities[0].status, "withdrawn");
  assert.equal(
    parsed.memory.artifacts["camping.profileCapabilityDecisions"].decisions
      .length,
    2,
  );
});
