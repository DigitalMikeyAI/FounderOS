const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadCore() {
  const file = path.resolve(__dirname, "..", "js/core/archie-core.js");
  const source = fs.readFileSync(file, "utf8");
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
  });
  vm.runInContext(`${source}\n;globalThis.__api = ArchieCore;`, context, {
    filename: file,
  });
  return { core: context.__api, source };
}

function makeCandidate(version = "profile_candidate_version_v1_a") {
  return {
    type: "profile-capability-candidate",
    candidateId: "profile_candidate_behavioral_capability_objection-handling",
    candidateVersionIdentity: version,
    candidateType: "behavioral-developing-capability",
    competency: "objection-handling",
    label: "Objection Handling",
    proposedProfileType: "developing-capability",
    proposedProfileWording: "Developing capability: Objection Handling",
    recommendation:
      "Your reviewed interaction records suggest that Objection Handling may be a developing capability.",
    source: "confirmedRecurringBehavioralPattern",
    patternId: "behavioral_pattern_objection-handling",
    patternVersionIdentity: `behavioral_pattern_version_${version}`,
    patternReviewId: `behavioral_pattern_review_${version}`,
    interactionCount: 3,
    reportCount: 3,
    contributorActiveIdentities: ["active-a", "active-b", "active-c"],
  };
}

function decisionInput(candidate, overrides = {}) {
  return {
    candidateId: candidate.candidateId,
    candidateVersionIdentity: candidate.candidateVersionIdentity,
    decision: "adopt",
    note: "Commander approved this recommendation.",
    ...overrides,
  };
}

function createHarness(options = {}) {
  const { core, source } = loadCore();
  const candidate = options.candidate || makeCandidate();
  const profile = { capabilities: [], strengths: ["Existing Strength"] };
  const artifacts = {
    "camping.fieldReports": { reports: [{ id: "report-a" }] },
    "camping.behavioralEvidenceReviews": { reviews: [{ id: "e3-a" }] },
    "camping.behavioralPatternReviews": { reviews: [{ id: "e4-a" }] },
    ...(options.artifacts || {}),
  };
  let currentCandidates = [clone(candidate)];
  let saveCount = 0;
  core.systems = {
    memory: {
      getArtifact(type) {
        return artifacts[type] || null;
      },
      saveArtifact(artifact) {
        saveCount += 1;
        if (options.saveSucceeds === false) return null;
        artifacts[artifact.type] = clone(artifact);
        return artifacts[artifact.type];
      },
    },
    missionIntelligence: {
      identifyProfileCapabilityCandidates(reports, e3, e4) {
        assert.equal(reports, artifacts["camping.fieldReports"].reports);
        assert.equal(e3, artifacts["camping.behavioralEvidenceReviews"]);
        assert.equal(e4, artifacts["camping.behavioralPatternReviews"]);
        return clone(currentCandidates);
      },
    },
  };
  return {
    core,
    source,
    candidate,
    profile,
    artifacts,
    setCandidates(value) {
      currentCandidates = clone(value);
    },
    getSaveCount() {
      return saveCount;
    },
  };
}

test("adopt creates the exact decision artifact and candidate snapshot", async () => {
  const harness = createHarness();
  const result = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(harness.candidate),
  );
  const artifact = harness.artifacts["camping.profileCapabilityDecisions"];
  const record = artifact.decisions[0];

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(harness.getSaveCount(), 1);
  assert.equal(artifact.type, "camping.profileCapabilityDecisions");
  assert.equal(
    artifact.schemaVersion,
    "PROFILE_CAPABILITY_DECISION_SCHEMA_v1",
  );
  assert.ok(artifact.createdAt);
  assert.ok(artifact.updatedAt);
  assert.match(record.id, /^profile_capability_decision_\d+_[a-z0-9]+$/);
  assert.deepEqual(
    clone(record),
    clone({
      id: record.id,
      candidateId: harness.candidate.candidateId,
      candidateVersionIdentity: harness.candidate.candidateVersionIdentity,
      competency: "objection-handling",
      label: "Objection Handling",
      proposedProfileType: "developing-capability",
      proposedProfileWording: "Developing capability: Objection Handling",
      sourcePatternId: harness.candidate.patternId,
      sourcePatternVersionIdentity: harness.candidate.patternVersionIdentity,
      sourcePatternReviewId: harness.candidate.patternReviewId,
      contributorActiveIdentities: ["active-a", "active-b", "active-c"],
      decision: "adopt",
      note: "Commander approved this recommendation.",
      decidedAt: record.decidedAt,
      supersedesDecisionId: null,
    }),
  );
  assert.ok(record.decidedAt);
});

test("changed decisions append and form an exact supersession chain", async () => {
  const harness = createHarness();
  const first = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(harness.candidate),
  );
  const firstSnapshot = clone(first.decision);
  const second = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(harness.candidate, { decision: "defer", note: null }),
  );
  const third = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(harness.candidate, { decision: "reject", note: "No." }),
  );
  const records = harness.artifacts["camping.profileCapabilityDecisions"].decisions;

  assert.equal(records.length, 3);
  assert.equal(second.decision.supersedesDecisionId, first.decision.id);
  assert.equal(third.decision.supersedesDecisionId, second.decision.id);
  assert.deepEqual(records[0], firstSnapshot);
});

test("an exact repeat is idempotent while a note change appends", async () => {
  const harness = createHarness();
  const input = decisionInput(harness.candidate);
  await harness.core.decideProfileCapabilityCandidate(input);
  const duplicate = await harness.core.decideProfileCapabilityCandidate(input);
  const changedNote = await harness.core.decideProfileCapabilityCandidate({
    ...input,
    note: "Updated note.",
  });

  assert.equal(duplicate.success, true);
  assert.equal(duplicate.changed, false);
  assert.equal(changedNote.changed, true);
  assert.equal(harness.getSaveCount(), 2);
  assert.equal(
    harness.artifacts["camping.profileCapabilityDecisions"].decisions.length,
    2,
  );
});

test("all four decisions work and invalid input fails without saving", async () => {
  for (const decision of ["adopt", "defer", "reject", "suppress"]) {
    const harness = createHarness();
    const result = await harness.core.decideProfileCapabilityCandidate(
      decisionInput(harness.candidate, { decision, note: "" }),
    );
    assert.equal(result.success, true, decision);
    assert.equal(result.decision.decision, decision);
    assert.equal(result.decision.note, null);
  }
  for (const input of [
    null,
    {},
    { candidateId: "x", candidateVersionIdentity: "y", decision: "withdraw" },
  ]) {
    const harness = createHarness();
    const result = await harness.core.decideProfileCapabilityCandidate(input);
    assert.equal(result.success, false);
    assert.equal(harness.getSaveCount(), 0);
  }
});

test("stale versions fail and a new current version is independently actionable", async () => {
  const versionA = makeCandidate("profile_candidate_version_v1_a");
  const versionB = makeCandidate("profile_candidate_version_v1_b");
  const harness = createHarness({ candidate: versionA });
  const acceptedA = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(versionA, { decision: "defer" }),
  );
  harness.setCandidates([versionB]);
  const staleA = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(versionA, { decision: "reject" }),
  );
  const acceptedB = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(versionB, { decision: "adopt" }),
  );
  const records = harness.artifacts["camping.profileCapabilityDecisions"].decisions;

  assert.equal(acceptedA.success, true);
  assert.equal(staleA.success, false);
  assert.equal(staleA.reason, "profile-capability-candidate-not-current");
  assert.equal(acceptedB.success, true);
  assert.equal(acceptedB.decision.supersedesDecisionId, null);
  assert.equal(records.length, 2);
  assert.equal(records[0].candidateVersionIdentity, versionA.candidateVersionIdentity);
  assert.equal(records[1].candidateVersionIdentity, versionB.candidateVersionIdentity);
});

test("a restored former version resolves against its former history", async () => {
  const versionA = makeCandidate("profile_candidate_version_v1_a");
  const versionB = makeCandidate("profile_candidate_version_v1_b");
  const harness = createHarness({ candidate: versionA });
  const firstA = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(versionA, { decision: "defer" }),
  );
  harness.setCandidates([versionB]);
  await harness.core.decideProfileCapabilityCandidate(decisionInput(versionB));
  harness.setCandidates([versionA]);
  const restoredA = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(versionA, { decision: "reject" }),
  );

  assert.equal(restoredA.success, true);
  assert.equal(restoredA.decision.supersedesDecisionId, firstA.decision.id);
});

test("candidate validation and persistence failures are truthful", async () => {
  const malformed = createHarness();
  malformed.setCandidates([
    { ...malformed.candidate, contributorActiveIdentities: [null] },
  ]);
  const invalid = await malformed.core.decideProfileCapabilityCandidate(
    decisionInput(malformed.candidate),
  );
  assert.equal(invalid.success, false);
  assert.equal(invalid.reason, "invalid-profile-capability-candidate");
  assert.equal(malformed.getSaveCount(), 0);

  const failing = createHarness({ saveSucceeds: false });
  const failed = await failing.core.decideProfileCapabilityCandidate(
    decisionInput(failing.candidate),
  );
  assert.equal(failed.success, false);
  assert.equal(failed.reason, "profile-capability-decision-persistence-failed");
  assert.equal(failing.getSaveCount(), 1);
});

test("decision recording preserves all sources and has no forbidden side effects", async () => {
  const harness = createHarness();
  const beforeProfile = clone(harness.profile);
  const beforeReports = clone(harness.artifacts["camping.fieldReports"]);
  const beforeE3 = clone(harness.artifacts["camping.behavioralEvidenceReviews"]);
  const beforeE4 = clone(harness.artifacts["camping.behavioralPatternReviews"]);
  const beforeCandidate = clone(harness.candidate);
  const result = await harness.core.decideProfileCapabilityCandidate(
    decisionInput(harness.candidate, { decision: "suppress" }),
  );

  result.decision.contributorActiveIdentities.push("changed-return-value");
  assert.deepEqual(harness.profile, beforeProfile);
  assert.deepEqual(harness.artifacts["camping.fieldReports"], beforeReports);
  assert.deepEqual(
    harness.artifacts["camping.behavioralEvidenceReviews"],
    beforeE3,
  );
  assert.deepEqual(
    harness.artifacts["camping.behavioralPatternReviews"],
    beforeE4,
  );
  assert.deepEqual(harness.candidate, beforeCandidate);
  assert.doesNotMatch(
    harness.source.match(/async decideProfileCapabilityCandidate[\s\S]*?\n  },/)?.[0] || "",
    /localStorage|sessionStorage|deliverBriefing|Guidance|Reflection|Communication/,
  );
});
