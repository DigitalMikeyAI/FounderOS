const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function quietConsole() {
  return { log() {}, warn() {}, error() {} };
}

function loadBrowserGlobal(relativePath, name, globals = {}) {
  const sourcePath = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = vm.createContext({ console: quietConsole(), ...globals });
  vm.runInContext(
    `${source}\n;globalThis.__testApi = ${name};`,
    context,
    { filename: sourcePath },
  );
  return context.__testApi;
}

function loadMissionIntelligence() {
  return loadBrowserGlobal(
    path.join("systems", "mission-intelligence.system.js"),
    "MissionIntelligenceSystem",
  );
}

function loadArchieCore() {
  return loadBrowserGlobal(
    path.join("js", "core", "archie-core.js"),
    "ArchieCore",
    {
      hasSurfacedSessionSignal() {
        return false;
      },
      markSessionSignalSurfaced() {
        return true;
      },
    },
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeOccurrence({
  reportId = "review-report",
  interactionId = "review-interaction",
  strength = "rapport",
  createdAt = "2026-08-26T12:00:00.000Z",
  owned = true,
} = {}) {
  const signalId = owned
    ? `coaching_strength_${reportId}_${interactionId}_${strength}`
    : "user-created-coaching-note";
  const insight = `User self-identified "${strength === "rapport" ? "Rapport" : "Discovery"}" as a strength during this customer interaction.`;
  const sourceRef = {
    artifactId: reportId,
    subType: "customerInteraction",
    subId: interactionId,
  };
  const signal = {
    id: signalId,
    createdAt,
    updatedAt: createdAt,
    signal: insight,
    signalType: "strength",
    sourceRefs: [{ ...sourceRef }],
  };
  const report = {
    id: reportId,
    date: "2026-08-26",
    createdAt: "2026-08-26T10:00:00.000Z",
    customerInteractions: [
      {
        id: interactionId,
        explicitStrengths: [strength],
      },
    ],
    learningSignals: [],
    coachingSignals: [signal],
    systemMetadata: {
      processingStatus: "processed",
      updatedAt: createdAt,
    },
  };
  return {
    report,
    signal,
    input: {
      signalId,
      signalCreatedAt: createdAt,
      sourceRef: { ...sourceRef },
      status: "confirmed-as-recorded",
    },
  };
}

function makeReview(overrides = {}) {
  return {
    id: "coaching_review_existing",
    signalId: "coaching_strength_review-report_review-interaction_rapport",
    signalCreatedAt: "2026-08-26T12:00:00.000Z",
    sourceRef: {
      artifactId: "review-report",
      subType: "customerInteraction",
      subId: "review-interaction",
    },
    originalInsight:
      'User self-identified "Rapport" as a strength during this customer interaction.',
    status: "confirmed-as-recorded",
    correctedStrength: null,
    note: null,
    reviewedAt: "2026-08-26T13:00:00.000Z",
    supersedesReviewId: null,
    ...overrides,
  };
}

test("valid owned coaching occurrence resolves through full provenance", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const result = system.validateCoachingReviewTarget(
    [fixture.report],
    fixture.input,
  );

  assert.equal(result.valid, true);
  assert.equal(result.report.id, fixture.report.id);
  assert.equal(result.interaction.id, fixture.report.customerInteractions[0].id);
  assert.equal(result.signal.id, fixture.signal.id);
  assert.deepEqual(clone(result.sourceRef), fixture.input.sourceRef);
});

test("user-created coaching signal cannot be reviewed", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence({ owned: false });
  const result = system.validateCoachingReviewTarget(
    [fixture.report],
    fixture.input,
  );

  assert.equal(result.valid, false);
});

test("sourceRef mismatch and signalCreatedAt mismatch fail closed", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();

  const wrongSource = system.validateCoachingReviewTarget(
    [fixture.report],
    {
      ...fixture.input,
      sourceRef: { ...fixture.input.sourceRef, subId: "wrong-interaction" },
    },
  );
  const wrongTime = system.validateCoachingReviewTarget(
    [fixture.report],
    { ...fixture.input, signalCreatedAt: "2099-01-01T00:00:00.000Z" },
  );

  assert.equal(wrongSource.valid, false);
  assert.equal(wrongTime.valid, false);
});

test("missing provenance is not inferred from a signal ID", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const result = system.validateCoachingReviewTarget([fixture.report], {
    signalId: fixture.signal.id,
    signalCreatedAt: fixture.signal.createdAt,
    status: "confirmed-as-recorded",
  });

  assert.equal(result.valid, false);
  assert.equal(result.reason, "invalid-target-provenance");
});

test("confirmed-as-recorded builds an E1-safe canonical review", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const validated = system.validateCoachingReviewTarget(
    [fixture.report],
    fixture.input,
  );
  const built = system.buildCoachingReviewRecord(validated, fixture.input, []);

  assert.equal(built.valid, true);
  assert.equal(built.changed, true);
  assert.match(built.review.id, /^coaching_review_/);
  assert.equal(built.review.status, "confirmed-as-recorded");
  assert.equal(built.review.correctedStrength, null);
  assert.equal(built.review.originalInsight, fixture.signal.signal);
  assert.equal(Object.hasOwn(built.review, "evidenceTier"), false);
  assert.doesNotMatch(built.review.originalInsight, /verified|proven|demonstrated/i);
});

test("status-specific correction rules reject malformed requests", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const validated = system.validateCoachingReviewTarget(
    [fixture.report],
    fixture.input,
  );

  assert.equal(
    system.buildCoachingReviewRecord(
      validated,
      { ...fixture.input, status: "unreviewed" },
      [],
    ).valid,
    false,
  );
  assert.equal(
    system.buildCoachingReviewRecord(
      validated,
      { ...fixture.input, status: "corrected" },
      [],
    ).valid,
    false,
  );
  assert.equal(
    system.buildCoachingReviewRecord(
      validated,
      { ...fixture.input, status: "corrected", correctedStrength: "invented" },
      [],
    ).valid,
    false,
  );
  assert.equal(
    system.buildCoachingReviewRecord(
      validated,
      { ...fixture.input, status: "rejected", correctedStrength: "discovery" },
      [],
    ).valid,
    false,
  );
});

test("corrected and rejected reviews never mutate source evidence", () => {
  const system = loadMissionIntelligence();

  for (const reviewInput of [
    { status: "corrected", correctedStrength: "discovery", note: null },
    { status: "rejected", correctedStrength: null, note: "Not what I meant." },
  ]) {
    const fixture = makeOccurrence();
    const before = clone(fixture.report);
    const validated = system.validateCoachingReviewTarget(
      [fixture.report],
      { ...fixture.input, ...reviewInput },
    );
    const built = system.buildCoachingReviewRecord(
      validated,
      { ...fixture.input, ...reviewInput },
      [],
    );

    assert.equal(built.valid, true);
    assert.deepEqual(fixture.report, before);
    assert.deepEqual(fixture.report.coachingSignals[0], before.coachingSignals[0]);
  }
});

test("review records defensively copy canonical provenance", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const validated = system.validateCoachingReviewTarget(
    [fixture.report],
    fixture.input,
  );
  const built = system.buildCoachingReviewRecord(validated, fixture.input, []);

  built.review.sourceRef.artifactId = "changed";

  assert.equal(fixture.input.sourceRef.artifactId, "review-report");
  assert.equal(fixture.signal.sourceRefs[0].artifactId, "review-report");
  assert.equal(validated.sourceRef.artifactId, "review-report");
});

test("review history is append-only and supersedes the latest record", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const first = makeReview();
  const existing = [first];
  const before = clone(existing);
  const validated = system.validateCoachingReviewTarget(
    [fixture.report],
    fixture.input,
  );
  const built = system.buildCoachingReviewRecord(
    validated,
    { ...fixture.input, status: "rejected", note: "Not intended." },
    existing,
  );

  assert.equal(built.valid, true);
  assert.equal(built.changed, true);
  assert.equal(built.review.supersedesReviewId, first.id);
  assert.deepEqual(existing, before);
});

test("materially identical latest review is idempotent", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const existing = [makeReview()];
  const validated = system.validateCoachingReviewTarget(
    [fixture.report],
    fixture.input,
  );
  const built = system.buildCoachingReviewRecord(
    validated,
    fixture.input,
    existing,
  );

  assert.equal(built.valid, true);
  assert.equal(built.changed, false);
  assert.equal(built.review.id, existing[0].id);
});

test("latest review uses reviewedAt then append order deterministically", () => {
  const system = loadMissionIntelligence();
  const older = makeReview({ id: "older", reviewedAt: "2026-08-26T12:00:00.000Z" });
  const tiedFirst = makeReview({ id: "tied-first", reviewedAt: "2026-08-26T14:00:00.000Z" });
  const tiedLast = makeReview({ id: "tied-last", reviewedAt: "2026-08-26T14:00:00.000Z" });
  const latest = system.identifyLatestCoachingReview(
    { reviews: [older, tiedFirst, tiedLast] },
    {
      signalId: tiedLast.signalId,
      signalCreatedAt: tiedLast.signalCreatedAt,
      sourceRef: tiedLast.sourceRef,
    },
  );

  assert.equal(latest.id, "tied-last");
});

test("review history projection is read-only", () => {
  const system = loadMissionIntelligence();
  const container = { reviews: [makeReview()] };
  const before = clone(container);
  const projected = system.identifyCoachingReviews(container);

  projected[0].status = "rejected";

  assert.deepEqual(container, before);
});

test("active eligibility follows the latest exact-occurrence review", () => {
  const system = loadMissionIntelligence();

  for (const [status, expectedEligible] of [
    ["confirmed-as-recorded", true],
    ["corrected", false],
    ["rejected", false],
  ]) {
    const fixture = makeOccurrence();
    const review = makeReview({ status });
    const projection = system.identifyCoachingSignal(
      [fixture.report],
      { reviews: [review] },
    );

    assert.equal(Boolean(projection), expectedEligible);
    if (projection) {
      assert.equal(projection.latestReviewStatus, "confirmed-as-recorded");
      assert.equal(projection.insight, fixture.signal.signal);
    }
  }
});

test("active selection skips rejected newest signal and returns next eligible", () => {
  const system = loadMissionIntelligence();
  const older = makeOccurrence({
    reportId: "older-report",
    interactionId: "older-interaction",
    strength: "discovery",
    createdAt: "2026-08-25T12:00:00.000Z",
  });
  const newest = makeOccurrence();
  const rejectedNewest = makeReview({ status: "rejected" });
  const projection = system.identifyCoachingSignal(
    [older.report, newest.report],
    { reviews: [rejectedNewest] },
  );

  assert.equal(projection.signalId, older.signal.id);
  assert.equal(projection.latestReviewStatus, "unreviewed");
});

test("history projection exposes review metadata only when requested", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const review = makeReview();
  const unchangedShape = system.identifyCoachingSignals([fixture.report])[0];
  const enriched = system.identifyCoachingSignals([fixture.report], {
    reviewContainer: { reviews: [review] },
  })[0];

  assert.equal(Object.hasOwn(unchangedShape, "latestReviewStatus"), false);
  assert.equal(enriched.latestReviewStatus, "confirmed-as-recorded");
  assert.equal(enriched.latestReviewId, review.id);
  assert.equal(enriched.reviewedAt, review.reviewedAt);
});

test("Rule #3 removal leaves review ledger untouched", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const ledger = { reviews: [makeReview()] };
  const ledgerBefore = clone(ledger);
  const reportWithoutStrength = clone(fixture.report);
  reportWithoutStrength.customerInteractions[0].explicitStrengths = [];
  const reconciled = system.processFieldReport(reportWithoutStrength);

  assert.equal(reconciled.report.coachingSignals.length, 0);
  assert.deepEqual(ledger, ledgerBefore);
  assert.equal(
    system.identifyLatestCoachingReview(ledger, {
      signalId: fixture.signal.id,
      signalCreatedAt: fixture.signal.createdAt,
      sourceRef: fixture.input.sourceRef,
    }).id,
    ledger.reviews[0].id,
  );
});

test("regenerated occurrence with new createdAt starts unreviewed", () => {
  const system = loadMissionIntelligence();
  const fixture = makeOccurrence();
  const ledger = { reviews: [makeReview({ status: "rejected" })] };
  const removed = clone(fixture.report);
  removed.customerInteractions[0].explicitStrengths = [];
  const reconciled = system.processFieldReport(removed).report;
  const restored = clone(reconciled);
  restored.customerInteractions[0].explicitStrengths = ["rapport"];
  const regenerated = system.processFieldReport(restored).report;
  const newSignal = regenerated.coachingSignals[0];
  const projection = system.identifyCoachingSignal([regenerated], ledger);

  assert.equal(newSignal.id, fixture.signal.id);
  assert.notEqual(newSignal.createdAt, fixture.signal.createdAt);
  assert.equal(projection.signalId, newSignal.id);
  assert.equal(projection.latestReviewStatus, "unreviewed");
});

test("ArchieCore persists a canonical ledger through MemorySystem", async () => {
  const system = loadMissionIntelligence();
  const core = loadArchieCore();
  const fixture = makeOccurrence();
  const artifacts = {
    "camping.fieldReports": { type: "camping.fieldReports", reports: [fixture.report] },
  };
  let savedInput = null;
  core.systems = {
    missionIntelligence: system,
    memory: {
      getArtifact(type) {
        return artifacts[type] || null;
      },
      saveArtifact(artifact) {
        savedInput = clone(artifact);
        artifacts[artifact.type] = clone(artifact);
        return artifacts[artifact.type];
      },
    },
  };
  const sourceBefore = clone(fixture.report);
  const result = await core.reviewCoachingSignal(fixture.input);

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(savedInput.type, "camping.coachingReviews");
  assert.equal(savedInput.schemaVersion, "COACHING_REVIEW_SCHEMA_v1");
  assert.equal(savedInput.reviews.length, 1);
  assert.deepEqual(fixture.report, sourceBefore);
});

test("MemorySystem stores the review artifact without profile mapping", () => {
  const founder = {
    profile: { strengths: ["Existing Profile Strength"] },
    memory: { artifacts: {} },
  };
  let commanderSaveCount = 0;
  const memorySystem = loadBrowserGlobal(
    path.join("systems", "memory.system.js"),
    "MemorySystem",
    {
      founder,
      CommanderSystem: {
        save() {
          commanderSaveCount += 1;
        },
      },
    },
  );
  const profileBefore = clone(founder.profile);
  const saved = memorySystem.saveArtifact({
    type: "camping.coachingReviews",
    schemaVersion: "COACHING_REVIEW_SCHEMA_v1",
    reviews: [makeReview()],
  });

  assert.equal(saved.type, "camping.coachingReviews");
  assert.equal(founder.memory.artifacts["camping.coachingReviews"].reviews.length, 1);
  assert.deepEqual(founder.profile, profileBefore);
  assert.equal(commanderSaveCount, 1);
});

test("ArchieCore duplicate review is a truthful persistence no-op", async () => {
  const system = loadMissionIntelligence();
  const core = loadArchieCore();
  const fixture = makeOccurrence();
  const artifacts = {
    "camping.fieldReports": { reports: [fixture.report] },
    "camping.coachingReviews": { reviews: [makeReview()] },
  };
  let saveCount = 0;
  core.systems = {
    missionIntelligence: system,
    memory: {
      getArtifact(type) {
        return artifacts[type] || null;
      },
      saveArtifact() {
        saveCount += 1;
        return {};
      },
    },
  };
  const result = await core.reviewCoachingSignal(fixture.input);

  assert.equal(result.success, true);
  assert.equal(result.changed, false);
  assert.equal(saveCount, 0);
});

test("ArchieCore persistence failure preserves prior containers and consumers", async () => {
  const system = loadMissionIntelligence();
  const core = loadArchieCore();
  const fixture = makeOccurrence();
  const fieldReports = { reports: [fixture.report] };
  const reviewContainer = { reviews: [makeReview()] };
  const fieldBefore = clone(fieldReports);
  const reviewBefore = clone(reviewContainer);
  let profileCalls = 0;
  let guidanceCalls = 0;
  let reflectionCalls = 0;
  core.systems = {
    missionIntelligence: system,
    memory: {
      getArtifact(type) {
        return type === "camping.fieldReports" ? fieldReports : reviewContainer;
      },
      saveArtifact() {
        throw new Error("Persistence unavailable");
      },
    },
    commander: { save() { profileCalls += 1; } },
    guidance: { build() { guidanceCalls += 1; } },
    reflection: { record() { reflectionCalls += 1; } },
  };
  const result = await core.reviewCoachingSignal({
    ...fixture.input,
    status: "rejected",
    note: "Not intended.",
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, "coaching-review-persistence-failed");
  assert.deepEqual(fieldReports, fieldBefore);
  assert.deepEqual(reviewContainer, reviewBefore);
  assert.equal(profileCalls, 0);
  assert.equal(guidanceCalls, 0);
  assert.equal(reflectionCalls, 0);
});

test("ArchieCore fails without persistence when linkage is invalid", async () => {
  const system = loadMissionIntelligence();
  const core = loadArchieCore();
  const fixture = makeOccurrence();
  let saveCount = 0;
  core.systems = {
    missionIntelligence: system,
    memory: {
      getArtifact(type) {
        return type === "camping.fieldReports"
          ? { reports: [fixture.report] }
          : null;
      },
      saveArtifact() {
        saveCount += 1;
        return {};
      },
    },
  };
  const result = await core.reviewCoachingSignal({
    ...fixture.input,
    sourceRef: { ...fixture.input.sourceRef, artifactId: "missing-report" },
  });

  assert.equal(result.success, false);
  assert.equal(saveCount, 0);
});
