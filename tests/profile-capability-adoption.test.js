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

function makeCandidate(version = "candidate-version-a") {
  return {
    candidateId: "profile_candidate_behavioral_capability_objection-handling",
    candidateVersionIdentity: version,
    competency: "objection-handling",
  };
}

function makeDecision(overrides = {}) {
  return {
    id: "profile_capability_decision_a",
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

function createHarness({ decisions = [], candidates = [], savedFounder = null } = {}) {
  const localStorage = createStorage(
    savedFounder ? { digitalMikeyFounder: savedFounder } : {},
  );
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
    ";globalThis.__api = { founder, loadFounder, ArchieCore, CommanderSystem, validateCommanderProfileCapability };",
    context,
  );
  const api = context.__api;
  if (savedFounder) api.loadFounder();
  const artifacts = api.founder.memory.artifacts;
  artifacts["camping.fieldReports"] = { reports: [{ id: "report-a" }] };
  artifacts["camping.behavioralEvidenceReviews"] = { reviews: [] };
  artifacts["camping.behavioralPatternReviews"] = { reviews: [] };
  if (decisions.length) {
    artifacts["camping.profileCapabilityDecisions"] = {
      type: "camping.profileCapabilityDecisions",
      schemaVersion: "PROFILE_CAPABILITY_DECISION_SCHEMA_v1",
      decisions: clone(decisions),
    };
  }
  let currentCandidates = clone(candidates);
  api.ArchieCore.systems = {
    commander: api.CommanderSystem,
    memory: {
      getArtifact(type) {
        return artifacts[type] || null;
      },
    },
    missionIntelligence: {
      identifyProfileCapabilityCandidates() {
        return clone(currentCandidates);
      },
    },
  };
  return {
    ...api,
    localStorage,
    setCandidates(value) {
      currentCandidates = clone(value);
    },
  };
}

test("an adopt decision materializes the exact active capability", async () => {
  const decision = makeDecision();
  const harness = createHarness({
    decisions: [decision],
    candidates: [makeCandidate()],
  });
  const result =
    await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  const capability = harness.founder.profile.capabilities[0];

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.deepEqual(
    clone(capability),
    clone({
      id: "profile_capability_objection-handling",
      type: "developing-capability",
      competency: "objection-handling",
      label: "Objection Handling",
      status: "active",
      adoptedAt: decision.decidedAt,
      withdrawnAt: null,
      adoptedBy: "commander",
      adoptedWording: decision.proposedProfileWording,
      evidenceSupportState: "current",
      provenance: {
        candidateId: decision.candidateId,
        candidateVersionIdentity: decision.candidateVersionIdentity,
        patternId: decision.sourcePatternId,
        patternVersionIdentity: decision.sourcePatternVersionIdentity,
        patternReviewId: decision.sourcePatternReviewId,
        contributorActiveIdentities: ["active-a", "active-b", "active-c"],
        decisionId: decision.id,
      },
    }),
  );
});

test("non-adoption decisions and candidates alone create no identity", async () => {
  for (const decisionType of ["defer", "reject", "suppress"]) {
    const harness = createHarness({
      decisions: [makeDecision({ decision: decisionType })],
      candidates: [makeCandidate()],
    });
    const result =
      await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
    assert.equal(result.success, true, decisionType);
    assert.deepEqual(clone(harness.founder.profile.capabilities), []);
  }
  const candidateOnly = createHarness({ candidates: [makeCandidate()] });
  await candidateOnly.ArchieCore.synchronizeAdoptedProfileCapabilities();
  assert.deepEqual(clone(candidateOnly.founder.profile.capabilities), []);
});

test("support state changes without removing or rewriting adopted identity", async () => {
  const decision = makeDecision();
  const harness = createHarness({
    decisions: [decision],
    candidates: [makeCandidate()],
  });
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  const adoptedSnapshot = clone(harness.founder.profile.capabilities[0]);

  harness.setCandidates([makeCandidate("candidate-version-b")]);
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  assert.equal(
    harness.founder.profile.capabilities[0].evidenceSupportState,
    "support-changed",
  );
  assert.equal(harness.founder.profile.capabilities[0].id, adoptedSnapshot.id);
  assert.equal(
    harness.founder.profile.capabilities[0].adoptedWording,
    adoptedSnapshot.adoptedWording,
  );
  assert.deepEqual(
    clone(harness.founder.profile.capabilities[0].provenance),
    adoptedSnapshot.provenance,
  );

  harness.setCandidates([]);
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  assert.equal(
    harness.founder.profile.capabilities[0].evidenceSupportState,
    "insufficient-current-support",
  );
  assert.equal(harness.founder.profile.capabilities[0].status, "active");

  harness.setCandidates([makeCandidate()]);
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  assert.equal(
    harness.founder.profile.capabilities[0].evidenceSupportState,
    "current",
  );
});

test("later non-adopt decisions never revoke an earlier adoption", async () => {
  for (const decisionType of ["defer", "reject", "suppress"]) {
    const harness = createHarness({
      decisions: [
        makeDecision(),
        makeDecision({
          id: `decision-b-${decisionType}`,
          candidateVersionIdentity: "candidate-version-b",
          decision: decisionType,
          decidedAt: "2026-08-28T12:00:00.000Z",
        }),
      ],
      candidates: [makeCandidate("candidate-version-b")],
    });
    await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
    const capability = harness.founder.profile.capabilities[0];
    assert.equal(capability.status, "active", decisionType);
    assert.equal(capability.provenance.decisionId, "profile_capability_decision_a");
    assert.equal(capability.evidenceSupportState, "support-changed");
  }
});

test("a later adopt updates provenance without duplicating capability", async () => {
  const adoptB = makeDecision({
    id: "profile_capability_decision_b",
    candidateVersionIdentity: "candidate-version-b",
    proposedProfileWording: "Developing capability: Updated Objection Handling",
    sourcePatternVersionIdentity: "pattern-version-b",
    sourcePatternReviewId: "pattern-review-b",
    contributorActiveIdentities: ["active-a", "active-b", "active-c", "active-d"],
    decidedAt: "2026-08-28T12:00:00.000Z",
  });
  const harness = createHarness({
    decisions: [makeDecision(), adoptB],
    candidates: [makeCandidate("candidate-version-b")],
  });
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  const capabilities = harness.founder.profile.capabilities;

  assert.equal(capabilities.length, 1);
  assert.equal(capabilities[0].id, "profile_capability_objection-handling");
  assert.equal(capabilities[0].adoptedAt, adoptB.decidedAt);
  assert.equal(capabilities[0].adoptedWording, adoptB.proposedProfileWording);
  assert.equal(capabilities[0].provenance.decisionId, adoptB.id);
  assert.equal(capabilities[0].evidenceSupportState, "current");
});

test("malformed adoption fails validation without partially changing Profile", async () => {
  const harness = createHarness({
    decisions: [makeDecision({ sourcePatternReviewId: "" })],
    candidates: [makeCandidate()],
  });
  const beforeProfile = clone(harness.founder.profile);
  const result =
    await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();

  assert.equal(result.success, false);
  assert.equal(result.reason, "invalid-capability-provenance");
  assert.deepEqual(clone(harness.founder.profile), beforeProfile);
});

test("saved capability and exact provenance survive reload", async () => {
  const harness = createHarness({
    decisions: [makeDecision()],
    candidates: [makeCandidate()],
  });
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();
  const beforeReload = clone(harness.founder.profile.capabilities);
  const saved = harness.localStorage.getItem("digitalMikeyFounder");
  const reloaded = createHarness({ savedFounder: saved });

  assert.deepEqual(clone(reloaded.founder.profile.capabilities), beforeReload);
});

test("existing Profile fields and unrelated capabilities are preserved", async () => {
  const harness = createHarness({
    decisions: [makeDecision()],
    candidates: [makeCandidate()],
  });
  harness.founder.profile.strengths = ["Existing Strength"];
  harness.founder.profile.skills = ["Existing Skill"];
  harness.founder.profile.goals = ["Existing Goal"];
  harness.founder.profile.futureField = { preserved: true };
  const trialClose = {
    id: "profile_capability_trial-close",
    type: "developing-capability",
    competency: "trial-close",
    label: "Trial Close",
    status: "active",
    adoptedAt: "2026-08-26T12:00:00.000Z",
    withdrawnAt: null,
    adoptedBy: "commander",
    adoptedWording: "Developing capability: Trial Close",
    evidenceSupportState: "insufficient-current-support",
    provenance: {
      candidateId: "profile_candidate_behavioral_capability_trial-close",
      candidateVersionIdentity: "trial-candidate-version",
      patternId: "behavioral_pattern_trial-close",
      patternVersionIdentity: "trial-pattern-version",
      patternReviewId: "trial-pattern-review",
      contributorActiveIdentities: ["trial-a"],
      decisionId: "trial-decision",
    },
  };
  harness.founder.profile.capabilities = [clone(trialClose)];
  await harness.ArchieCore.synchronizeAdoptedProfileCapabilities();

  assert.deepEqual(clone(harness.founder.profile.strengths), ["Existing Strength"]);
  assert.deepEqual(clone(harness.founder.profile.skills), ["Existing Skill"]);
  assert.deepEqual(clone(harness.founder.profile.goals), ["Existing Goal"]);
  assert.deepEqual(clone(harness.founder.profile.futureField), { preserved: true });
  assert.equal(harness.founder.profile.capabilities.length, 2);
  assert.deepEqual(clone(harness.founder.profile.capabilities[1]), trialClose);
});

test("projection adds no withdrawal, UI, coaching, Guidance, or Reflection route", () => {
  const coreSource = fs.readFileSync(
    path.resolve(__dirname, "..", "js/core/archie-core.js"),
    "utf8",
  );
  const method =
    coreSource.match(
      /async synchronizeAdoptedProfileCapabilities\(\)[\s\S]*?\n  },/,
    )?.[0] || "";
  assert.doesNotMatch(
    method,
    /decision\s*===?\s*["']withdraw["']|status:\s*["']withdrawn["']|localStorage|deliverBriefing|Guidance|Reflection|Communication|coaching/i,
  );
});
