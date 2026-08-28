const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

// Deterministic clock: every `new Date()` and `Date.now()` inside the VM
// resolves to a single fixed instant, so review/decision timestamps are
// reproducible and ordering ties are broken by the production append-order
// semantics instead of wall-clock time.
const FIXED_NOW_MS = Date.parse("2026-08-27T12:00:00.000Z");
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length > 0 ? args : [FIXED_NOW_MS]));
  }
  static now() {
    return FIXED_NOW_MS;
  }
}

// Deterministic Math.random so generated decision/review id suffixes are
// reproducible across runs while remaining unique within the pipeline.
const deterministicMath = Object.create(Math);
let deterministicRandomCounter = 0;
deterministicMath.random = () => {
  deterministicRandomCounter += 1;
  return deterministicRandomCounter / 1_000;
};

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

function load(relativePath, context) {
  const file = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

// One Field Report that identifies exactly one E3 behavioral-evidence item
// for the canonical objection-handling competency with a resolved outcome.
function makeObjectionReport({ id, date, interactionId, outcomeId }) {
  return {
    id,
    date,
    createdAt: `${date}T12:00:00.000Z`,
    customerInteractions: [
      {
        id: interactionId,
        createdAt: `${date}T13:00:00.000Z`,
        objections: ["payment"],
        salesStepOutcomes: [
          {
            id: outcomeId,
            step: "objection-handling",
            performedBy: "commander",
            result: "customer-concern-resolved",
          },
        ],
      },
    ],
  };
}

// Four independent contributors, each with a distinct canonical identity
// (distinct report, interaction, and outcome ids).
function makeReports() {
  return [1, 2, 3, 4].map((index) =>
    makeObjectionReport({
      id: `pipeline-report-${index}`,
      date: `2026-08-2${index}`,
      interactionId: `pipeline-interaction-${index}`,
      outcomeId: `pipeline-outcome-${index}`,
    }),
  );
}

// Canonical review payload for one exact E3 evidence occurrence.
function evidenceTarget(system, report, overrides = {}) {
  const projection = system.identifyBehavioralEvidence([report])[0];
  return {
    evidenceId: projection.evidenceId,
    sourceRef: clone(projection.sourceRef),
    outcomeEntryId: projection.evidenceRefs.find(
      (ref) => ref.field === "salesStepOutcomes",
    ).entryId,
    sourceFingerprint: projection.sourceFingerprint,
    status: "confirmed-as-recorded",
    correctedCompetency: null,
    note: null,
    ...overrides,
  };
}

function createHarness({ savedFounder = null } = {}) {
  const localStorage = createStorage(
    savedFounder ? { digitalMikeyFounder: savedFounder } : {},
  );
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    localStorage,
    sessionStorage: createStorage(),
    Date: FixedDate,
    Math: deterministicMath,
    hasSurfacedSessionSignal() {
      return false;
    },
    markSessionSignalSurfaced() {
      return true;
    },
  });
  for (const relativePath of [
    "js/storage.js",
    "systems/mission-intelligence.system.js",
    "systems/commander.system.js",
    "js/core/archie-core.js",
  ]) {
    load(relativePath, context);
  }
  vm.runInContext(
    ";globalThis.__api = { founder, loadFounder, saveFounder, CommanderSystem, ArchieCore, MissionIntelligenceSystem };",
    context,
  );
  const api = context.__api;
  if (savedFounder) api.loadFounder();
  // Memory delegates to the real founder.memory.artifacts map so canonical
  // persistence (saveFounder/loadFounder) carries every artifact across reload.
  api.ArchieCore.systems = {
    commander: api.CommanderSystem,
    memory: {
      getArtifact(type) {
        return api.founder.memory.artifacts[type] || null;
      },
      saveArtifact(artifact) {
        api.founder.memory.artifacts[artifact.type] = clone(artifact);
        return api.founder.memory.artifacts[artifact.type];
      },
    },
    missionIntelligence: api.MissionIntelligenceSystem,
  };
  return { ...api, localStorage };
}

function seedArtifacts(founder) {
  const reports = makeReports();
  founder.memory.artifacts["camping.fieldReports"] = { reports };
  founder.memory.artifacts["camping.behavioralEvidenceReviews"] = {
    reviews: [],
  };
  founder.memory.artifacts["camping.behavioralPatternReviews"] = {
    reviews: [],
  };
  return reports;
}

test("E4 to Profile capability pipeline preserves every authority firewall", async () => {
  const harness = createHarness();
  const { founder, ArchieCore } = harness;
  const MissionIntelligenceSystem = harness.MissionIntelligenceSystem;
  const reports = seedArtifacts(founder);

  const beforeMission = clone({
    currentMission: founder.currentMission,
    missionStatus: founder.missionStatus,
    missionObjectives: founder.missionObjectives,
    missionProgress: founder.missionProgress,
  });

  // ------------------------------------------------------------------
  // 1. E3 confirmation through the canonical Commander review authority.
  // ------------------------------------------------------------------
  for (const report of reports) {
    const result = await ArchieCore.reviewBehavioralEvidence(
      evidenceTarget(MissionIntelligenceSystem, report),
    );
    assert.equal(result.success, true);
    assert.equal(result.changed, true);
  }
  const e3Container =
    founder.memory.artifacts["camping.behavioralEvidenceReviews"];
  assert.equal(e3Container.reviews.length, 4);
  assert.equal(
    new Set(e3Container.reviews.map((review) => review.id)).size,
    e3Container.reviews.length,
    "every E3 review has a unique deterministic id",
  );

  // ------------------------------------------------------------------
  // 2. E4 is DERIVED, not persisted. Profile untouched; no decisions.
  // ------------------------------------------------------------------
  const beforeProfile = clone(founder.profile);
  const patterns = MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
    reports,
    e3Container,
    null,
  );
  assert.equal(patterns.length, 1);
  const pattern = patterns[0];
  assert.equal(pattern.evidenceTier, "E4");
  assert.equal(pattern.patternId, "behavioral_pattern_objection-handling");
  assert.match(
    pattern.patternVersionIdentity,
    /^behavioral_pattern_version_v1_[0-9a-f]{16}$/,
  );
  assert.equal(pattern.interactionCount, 4);
  assert.equal(pattern.reportCount, 4);
  assert.equal(pattern.latestPatternReviewStatus, "unreviewed");
  assert.deepEqual(clone(founder.profile), beforeProfile);
  assert.equal(
    founder.memory.artifacts["camping.profileCapabilityDecisions"],
    undefined,
  );

  // ------------------------------------------------------------------
  // 3. Exact E4 version confirmed through the canonical review method.
  // ------------------------------------------------------------------
  // Contributor identities must be host-realm arrays for cross-VM deep equality;
  // pattern.contributors.map(...) executes inside the VM realm.
  const contributorIdentities = clone(
    pattern.contributors
      .map((contributor) => contributor.activeIdentity)
      .sort(),
  );
  const confirmed = await ArchieCore.reviewBehavioralPattern({
    patternId: pattern.patternId,
    patternVersionIdentity: pattern.patternVersionIdentity,
    contributorIdentities,
    status: "confirmed-as-pattern",
    correctedInterpretation: null,
    note: null,
  });
  assert.equal(confirmed.success, true);
  assert.equal(confirmed.changed, true);

  const e4Container =
    founder.memory.artifacts["camping.behavioralPatternReviews"];
  assert.equal(e4Container.reviews.length, 1);
  const rederived = MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
    reports,
    e3Container,
    e4Container,
  );
  assert.equal(rederived.length, 1);
  assert.equal(
    rederived[0].patternVersionIdentity,
    pattern.patternVersionIdentity,
  );
  assert.equal(rederived[0].latestPatternReviewStatus, "confirmed-as-pattern");
  assert.equal(rederived[0].latestPatternReviewId, confirmed.review.id);
  // Confirmation alone must not add a Profile capability.
  assert.deepEqual(clone(founder.profile), beforeProfile);
  assert.equal(
    founder.memory.artifacts["camping.profileCapabilityDecisions"],
    undefined,
  );
// ------------------------------------------------------------------
  // 4. Candidate projection is read-only and references the exact E4.
  // ------------------------------------------------------------------
  const candidates = MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
    reports,
    e3Container,
    e4Container,
  );
  assert.equal(candidates.length, 1);
  const candidate = candidates[0];
  assert.equal(candidate.candidateId, "profile_candidate_behavioral_capability_objection-handling");
  assert.match(
    candidate.candidateVersionIdentity,
    /^profile_candidate_version_v1_[0-9a-f]{16}$/,
  );
  assert.equal(candidate.source, "confirmedRecurringBehavioralPattern");
  assert.equal(candidate.patternId, pattern.patternId);
  assert.equal(candidate.patternVersionIdentity, pattern.patternVersionIdentity);
  assert.equal(candidate.patternReviewId, confirmed.review.id);
  assert.deepEqual(
    clone(candidate.contributorActiveIdentities),
    contributorIdentities,
  );
  assert.equal(candidate.interactionCount, 4);
  assert.equal(candidate.reportCount, 4);
  assert.deepEqual(clone(founder.profile), beforeProfile);
  assert.equal(
    founder.memory.artifacts["camping.profileCapabilityDecisions"],
    undefined,
  );
  // Candidate is actionable before any decision exists.
  assert.equal(ArchieCore.getActionableProfileCapabilityCandidates().length, 1);

  // ------------------------------------------------------------------
  // 5. Explicit Commander adoption writes the ledger and the Profile.
  // ------------------------------------------------------------------
  const beforeAdoptReports = clone(
    founder.memory.artifacts["camping.fieldReports"],
  );
  const beforeAdoptE3 = clone(e3Container);
  const beforeAdoptE4 = clone(e4Container);

  const adopted = await ArchieCore.decideProfileCapabilityCandidate({
    candidateId: candidate.candidateId,
    candidateVersionIdentity: candidate.candidateVersionIdentity,
    decision: "adopt",
    note: null,
  });
  assert.equal(adopted.success, true);
  assert.equal(adopted.changed, true);

  const decisions =
    founder.memory.artifacts["camping.profileCapabilityDecisions"].decisions;
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].decision, "adopt");
  assert.equal(decisions[0].candidateId, candidate.candidateId);
  assert.equal(decisions[0].candidateVersionIdentity, candidate.candidateVersionIdentity);
  assert.equal(decisions[0].sourcePatternId, pattern.patternId);
  assert.equal(decisions[0].sourcePatternVersionIdentity, pattern.patternVersionIdentity);
  assert.equal(decisions[0].sourcePatternReviewId, confirmed.review.id);
  assert.deepEqual(
    clone(decisions[0].contributorActiveIdentities),
    contributorIdentities,
  );

  const capabilities = founder.profile.capabilities;
  assert.equal(capabilities.length, 1);
  assert.equal(capabilities[0].id, "profile_capability_objection-handling");
  assert.equal(capabilities[0].type, "developing-capability");
  assert.equal(capabilities[0].competency, "objection-handling");
  assert.equal(capabilities[0].status, "active");
  assert.equal(capabilities[0].adoptedBy, "commander");
  assert.equal(capabilities[0].withdrawnAt, null);
  assert.equal(capabilities[0].evidenceSupportState, "current");
  assert.equal(capabilities[0].provenance.candidateId, candidate.candidateId);
  assert.equal(
    capabilities[0].provenance.candidateVersionIdentity,
    candidate.candidateVersionIdentity,
  );
  assert.equal(capabilities[0].provenance.patternId, pattern.patternId);
  assert.equal(
    capabilities[0].provenance.patternVersionIdentity,
    pattern.patternVersionIdentity,
  );
  assert.equal(capabilities[0].provenance.patternReviewId, confirmed.review.id);
  assert.deepEqual(
    clone(capabilities[0].provenance.contributorActiveIdentities),
    contributorIdentities,
  );
  assert.equal(capabilities[0].provenance.decisionId, decisions[0].id);
  // Legacy Profile fields are untouched.
  assert.deepEqual(clone(founder.profile.strengths), beforeProfile.strengths);
  assert.deepEqual(clone(founder.profile.skills), beforeProfile.skills);

  // Adoption mutates neither raw Field Reports nor E3/E4 review history.
  assert.deepEqual(
    clone(founder.memory.artifacts["camping.fieldReports"]),
    beforeAdoptReports,
  );
  assert.deepEqual(
    clone(founder.memory.artifacts["camping.behavioralEvidenceReviews"]),
    beforeAdoptE3,
  );
  assert.deepEqual(
    clone(founder.memory.artifacts["camping.behavioralPatternReviews"]),
    beforeAdoptE4,
  );
  // The adopted candidate is no longer actionable.
  assert.equal(ArchieCore.getActionableProfileCapabilityCandidates().length, 0);
// ------------------------------------------------------------------
  // 6. Support change via the canonical E3 review mechanism.
  //    Detach one contributor (4 -> 3 confirmed), confirm the new E4
  //    version, then re-synchronize. Support becomes "support-changed"
  //    without a new adopt decision or rewritten provenance.
  // ------------------------------------------------------------------
  const originalDecisionId = decisions[0].id;
  const originalCandidateVersion = candidate.candidateVersionIdentity;
  const detachFourth = await ArchieCore.reviewBehavioralEvidence(
    evidenceTarget(MissionIntelligenceSystem, reports[3], {
      status: "rejected",
      note: "This interaction is not retained as pattern support.",
    }),
  );
  assert.equal(detachFourth.success, true);
  assert.equal(detachFourth.changed, true);

  const e3AfterDetach =
    founder.memory.artifacts["camping.behavioralEvidenceReviews"];
  const patternsAfterDetach =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      reports,
      e3AfterDetach,
      null,
    );
  assert.equal(patternsAfterDetach.length, 1);
  const newPattern = patternsAfterDetach[0];
  assert.equal(newPattern.interactionCount, 3);
  assert.notEqual(
    newPattern.patternVersionIdentity,
    pattern.patternVersionIdentity,
  );

  const newContributorIdentities = clone(
    newPattern.contributors
      .map((contributor) => contributor.activeIdentity)
      .sort(),
  );
  const confirmedNew = await ArchieCore.reviewBehavioralPattern({
    patternId: newPattern.patternId,
    patternVersionIdentity: newPattern.patternVersionIdentity,
    contributorIdentities: newContributorIdentities,
    status: "confirmed-as-pattern",
    correctedInterpretation: null,
    note: null,
  });
  assert.equal(confirmedNew.success, true);
  assert.equal(confirmedNew.changed, true);

  const e4AfterDetach =
    founder.memory.artifacts["camping.behavioralPatternReviews"];
  assert.equal(
    new Set(e4AfterDetach.reviews.map((review) => review.id)).size,
    e4AfterDetach.reviews.length,
    "every E4 pattern review has a unique deterministic id",
  );
  const candidateAfterDetach =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      reports,
      e3AfterDetach,
      e4AfterDetach,
    );
  assert.equal(candidateAfterDetach.length, 1);
  assert.notEqual(
    candidateAfterDetach[0].candidateVersionIdentity,
    candidate.candidateVersionIdentity,
  );
  const actionableAfterDetach =
    ArchieCore.getActionableProfileCapabilityCandidates();
  assert.equal(actionableAfterDetach.length, 1);
  assert.equal(
    actionableAfterDetach[0].candidateVersionIdentity,
    candidateAfterDetach[0].candidateVersionIdentity,
  );
  assert.notEqual(
    actionableAfterDetach[0].candidateVersionIdentity,
    candidate.candidateVersionIdentity,
    "the original candidate-version decision does not transfer to the new version",
  );

  const synced = await ArchieCore.synchronizeAdoptedProfileCapabilities();
  assert.equal(synced.success, true);
  assert.equal(founder.profile.capabilities.length, 1);
  assert.equal(founder.profile.capabilities[0].status, "active");
  assert.equal(
    founder.profile.capabilities[0].evidenceSupportState,
    "support-changed",
  );
  // Original adoption authority and provenance are preserved.
  assert.equal(
    founder.profile.capabilities[0].provenance.decisionId,
    originalDecisionId,
  );
  assert.equal(
    founder.profile.capabilities[0].provenance.candidateVersionIdentity,
    originalCandidateVersion,
  );
  // No replacement adoption and no new decision record.
  assert.equal(
    founder.memory.artifacts["camping.profileCapabilityDecisions"].decisions
      .length,
    1,
  );
// ------------------------------------------------------------------
  // 7. Reduce active support below the recurring-pattern threshold via
  //    the canonical E3 review mechanism (3 -> 2 confirmed).
  // ------------------------------------------------------------------
  const detachThird = await ArchieCore.reviewBehavioralEvidence(
    evidenceTarget(MissionIntelligenceSystem, reports[2], {
      status: "rejected",
      note: "This interaction is not retained as pattern support.",
    }),
  );
  assert.equal(detachThird.success, true);
  assert.equal(detachThird.changed, true);

  const e3Below =
    founder.memory.artifacts["camping.behavioralEvidenceReviews"];
  const e4Below =
    founder.memory.artifacts["camping.behavioralPatternReviews"];
  const patternsBelow = MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
    reports,
    e3Below,
    e4Below,
  );
  assert.equal(patternsBelow.length, 0);
  const candidatesBelow =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      reports,
      e3Below,
      e4Below,
    );
  assert.equal(candidatesBelow.length, 0);

  const syncedBelow = await ArchieCore.synchronizeAdoptedProfileCapabilities();
  assert.equal(syncedBelow.success, true);
  assert.equal(founder.profile.capabilities.length, 1);
  // The capability remains Commander-adopted and active; it is never
  // automatically withdrawn by evidence-support loss.
  assert.equal(founder.profile.capabilities[0].status, "active");
  assert.equal(
    founder.profile.capabilities[0].evidenceSupportState,
    "insufficient-current-support",
  );
  assert.equal(
    founder.profile.capabilities[0].provenance.decisionId,
    originalDecisionId,
  );
  assert.equal(
    founder.profile.capabilities[0].provenance.candidateVersionIdentity,
    originalCandidateVersion,
  );
  // The decision ledger remains append-only and unmodified.
  const ledgerFinal =
    founder.memory.artifacts["camping.profileCapabilityDecisions"].decisions;
  assert.equal(ledgerFinal.length, 1);
  assert.equal(ledgerFinal[0].decision, "adopt");
  assert.equal(
    new Set(ledgerFinal.map((decision) => decision.id)).size,
    ledgerFinal.length,
    "every Profile capability decision has a unique deterministic id",
  );
  assert.equal(
    ArchieCore.getActionableProfileCapabilityCandidates().length,
    0,
    "no candidate remains actionable below the recurring-pattern threshold",
  );

  // No evidence record was deleted anywhere in the pipeline.
  assert.equal(
    founder.memory.artifacts["camping.fieldReports"].reports.length,
    4,
  );
  assert.equal(
    founder.memory.artifacts["camping.behavioralEvidenceReviews"].reviews
      .length,
    6, // four confirmed + two rejected (all preserved)
  );
  assert.equal(
    founder.memory.artifacts["camping.behavioralPatternReviews"].reviews.length,
    2, // original version + changed version (both preserved)
  );

  // ------------------------------------------------------------------
  // 8. Save and reload through the canonical persistence boundary.
  // ------------------------------------------------------------------
  const beforeReloadCapability = clone(founder.profile.capabilities[0]);
  const reloaded = createHarness({
    savedFounder: harness.localStorage.getItem("digitalMikeyFounder"),
  });
  const { founder: reloadedFounder, ArchieCore: reloadedCore } = reloaded;

  // All artifacts, the capability, and the decision ledger survive reload.
  assert.equal(
    reloadedFounder.memory.artifacts["camping.fieldReports"].reports.length,
    4,
  );
  assert.equal(
    reloadedFounder.memory.artifacts["camping.behavioralEvidenceReviews"]
      .reviews.length,
    6,
  );
  assert.equal(
    reloadedFounder.memory.artifacts["camping.behavioralPatternReviews"]
      .reviews.length,
    2,
  );
  assert.equal(
    reloadedFounder.memory.artifacts["camping.profileCapabilityDecisions"]
      .decisions.length,
    1,
  );
  assert.equal(reloadedFounder.profile.capabilities.length, 1);
  assert.deepEqual(
    clone(reloadedFounder.profile.capabilities[0]),
    beforeReloadCapability,
  );

  // The normal refresh path recomputes the same support state
  // deterministically through synchronization.
  const afterRefresh = await reloadedCore.synchronizeAdoptedProfileCapabilities();
  assert.equal(afterRefresh.success, true);
  assert.equal(reloadedFounder.profile.capabilities[0].status, "active");
  assert.equal(
    reloadedFounder.profile.capabilities[0].evidenceSupportState,
    "insufficient-current-support",
  );
  assert.deepEqual(
    clone(reloadedFounder.profile.capabilities[0].provenance),
    clone(beforeReloadCapability.provenance),
  );

  // ------------------------------------------------------------------
  // 9. Mission, coaching, Guidance, and Briefing state firewall.
  // ------------------------------------------------------------------
  assert.equal(founder.currentMission, beforeMission.currentMission);
  assert.equal(founder.missionStatus, beforeMission.missionStatus);
  assert.equal(founder.missionProgress, beforeMission.missionProgress);
  assert.deepEqual(
    clone(founder.missionObjectives),
    beforeMission.missionObjectives,
  );
  const artifactTypes = Object.keys(founder.memory.artifacts).sort();
  assert.deepEqual(artifactTypes, [
    "camping.behavioralEvidenceReviews",
    "camping.behavioralPatternReviews",
    "camping.fieldReports",
    "camping.profileCapabilityDecisions",
  ]);
});