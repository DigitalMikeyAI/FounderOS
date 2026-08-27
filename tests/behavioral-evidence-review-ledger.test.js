const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(relativePath, name, globals = {}) {
  const file = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(file, "utf8");
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    ...globals,
  });
  vm.runInContext(`${source}\n;globalThis.__api = ${name};`, context, {
    filename: file,
  });
  return context.__api;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeReport({
  objections = ["payment", "timing"],
  outcomeId = "outcome-review",
  step = "objection-handling",
  performedBy = "commander",
  result = "customer-concern-resolved",
} = {}) {
  return {
    id: "report-review",
    date: "2026-08-26",
    createdAt: "2026-08-26T10:00:00.000Z",
    customerInteractions: [
      {
        id: "interaction-review",
        createdAt: "2026-08-26T11:00:00.000Z",
        objections,
        salesStepOutcomes: [{ id: outcomeId, step, performedBy, result }],
      },
    ],
  };
}

function targetFrom(projection, overrides = {}) {
  return {
    evidenceId: projection.evidenceId,
    sourceRef: clone(projection.sourceRef),
    outcomeEntryId: projection.evidenceRefs[1].entryId,
    sourceFingerprint: projection.sourceFingerprint,
    status: "confirmed-as-recorded",
    correctedCompetency: null,
    note: null,
    ...overrides,
  };
}

test("fingerprint is stable, source-ordered, and independent of array position", () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const report = makeReport();
  const first = system.identifyBehavioralEvidence([report])[0];
  const repeated = system.identifyBehavioralEvidence([clone(report)])[0];
  const withEarlierNonqualifier = clone(report);
  withEarlierNonqualifier.customerInteractions[0].salesStepOutcomes.unshift({
    id: "ignored",
    step: "objection-handling",
    performedBy: "commander",
    result: "unknown",
  });
  const moved = system.identifyBehavioralEvidence([withEarlierNonqualifier])[0];

  assert.equal(first.sourceFingerprint, repeated.sourceFingerprint);
  assert.equal(first.sourceFingerprint, moved.sourceFingerprint);
  assert.match(first.sourceFingerprint, /^behavioral_evidence_source_v1:/);
});

test("every material fingerprint source field changes the fingerprint", () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const baseReport = makeReport();
  const interaction = baseReport.customerInteractions[0];
  const outcome = interaction.salesStepOutcomes[0];
  const base = system.buildBehavioralEvidenceSourceFingerprint(interaction, outcome);
  const variants = [
    makeReport({ objections: ["different"] }),
    makeReport({ outcomeId: "different-id" }),
    makeReport({ step: "trial-close" }),
    makeReport({ performedBy: "other" }),
    makeReport({ result: "unknown" }),
  ];

  for (const report of variants) {
    const changedInteraction = report.customerInteractions[0];
    const changedOutcome = changedInteraction.salesStepOutcomes[0];
    assert.notEqual(
      system.buildBehavioralEvidenceSourceFingerprint(
        changedInteraction,
        changedOutcome,
      ),
      base,
    );
  }
});

test("no review is unreviewed and all exact identity fields are required", () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const report = makeReport();
  const projection = system.identifyBehavioralEvidence([report])[0];

  assert.equal(projection.latestReviewStatus, "unreviewed");
  for (const changed of [
    { evidenceId: "wrong" },
    { sourceRef: { ...projection.sourceRef, subId: "wrong" } },
    { outcomeEntryId: "wrong" },
    { sourceFingerprint: "wrong" },
  ]) {
    assert.equal(
      system.validateBehavioralEvidenceReviewTarget(
        [report],
        targetFrom(projection, changed),
      ).valid,
      false,
    );
  }
  assert.equal(
    system.validateBehavioralEvidenceReviewTarget([report], {
      evidenceId: projection.evidenceId,
      status: "confirmed-as-recorded",
    }).valid,
    false,
  );
});

test("confirmation, correction, and rejection build canonical records", () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const report = makeReport();
  const projection = system.identifyBehavioralEvidence([report])[0];
  for (const input of [
    targetFrom(projection),
    targetFrom(projection, {
      status: "corrected",
      correctedCompetency: "discovery",
      note: "Different interpretation.",
    }),
    targetFrom(projection, { status: "rejected", note: "Not accurate." }),
  ]) {
    const validated = system.validateBehavioralEvidenceReviewTarget(
      [report],
      input,
    );
    const built = system.buildBehavioralEvidenceReviewRecord(
      validated,
      input,
      [],
    );
    assert.equal(built.valid, true);
    assert.match(built.review.id, /^behavioral_evidence_review_/);
    assert.equal(built.review.status, input.status);
    assert.equal(built.review.evidenceId, projection.evidenceId);
    assert.equal(built.review.sourceFingerprint, projection.sourceFingerprint);
  }
});

test("unreviewed is rejected and correction requires a real change or note", () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const report = makeReport();
  const projection = system.identifyBehavioralEvidence([report])[0];
  const validated = system.validateBehavioralEvidenceReviewTarget(
    [report],
    targetFrom(projection),
  );

  assert.equal(
    system.buildBehavioralEvidenceReviewRecord(
      validated,
      targetFrom(projection, { status: "unreviewed" }),
      [],
    ).valid,
    false,
  );
  assert.equal(
    system.buildBehavioralEvidenceReviewRecord(
      validated,
      targetFrom(projection, { status: "corrected" }),
      [],
    ).reason,
    "correction-detail-required",
  );
  assert.equal(
    system.buildBehavioralEvidenceReviewRecord(
      validated,
      targetFrom(projection, {
        status: "corrected",
        correctedCompetency: "objection-handling",
      }),
      [],
    ).reason,
    "invalid-corrected-competency",
  );
});

test("history is append-only, superseded, and duplicate submissions are idempotent", () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const report = makeReport();
  const projection = system.identifyBehavioralEvidence([report])[0];
  const firstInput = targetFrom(projection);
  const validated = system.validateBehavioralEvidenceReviewTarget(
    [report],
    firstInput,
  );
  const first = system.buildBehavioralEvidenceReviewRecord(
    validated,
    firstInput,
    [],
  ).review;
  const duplicate = system.buildBehavioralEvidenceReviewRecord(
    validated,
    firstInput,
    [first],
  );
  const corrected = system.buildBehavioralEvidenceReviewRecord(
    validated,
    targetFrom(projection, { status: "corrected", note: "Clarified." }),
    [first],
  );

  assert.equal(duplicate.changed, false);
  assert.equal(corrected.changed, true);
  assert.equal(corrected.review.supersedesReviewId, first.id);
  assert.equal(first.status, "confirmed-as-recorded");
});

test("latest review uses reviewedAt then append order and controls projection filtering", () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const report = makeReport();
  const projection = system.identifyBehavioralEvidence([report])[0];
  const base = {
    id: "review-one",
    ...targetFrom(projection),
    originalInsight: projection.insight,
    originalCompetency: projection.competency,
    reviewedAt: "2026-08-26T13:00:00.000Z",
    supersedesReviewId: null,
  };
  const laterAppend = { ...base, id: "review-two", status: "rejected" };
  const container = { reviews: [base, laterAppend] };

  assert.equal(
    system.identifyLatestBehavioralEvidenceReview(
      container,
      targetFrom(projection),
    ).id,
    "review-two",
  );
  assert.equal(system.identifyBehavioralEvidence([report], container).length, 0);
  assert.equal(
    system.identifyBehavioralEvidence([report], container, {
      includeRejected: true,
    })[0].latestReviewStatus,
    "rejected",
  );
});

test("source changes detach review while preserving historical ledger input", () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const report = makeReport();
  const projection = system.identifyBehavioralEvidence([report])[0];
  const validated = system.validateBehavioralEvidenceReviewTarget(
    [report],
    targetFrom(projection),
  );
  const review = system.buildBehavioralEvidenceReviewRecord(
    validated,
    targetFrom(projection),
    [],
  ).review;
  const changed = makeReport({ objections: ["different objection"] });
  const changedProjection = system.identifyBehavioralEvidence(
    [changed],
    { reviews: [review] },
  )[0];

  assert.equal(changedProjection.latestReviewStatus, "unreviewed");
  assert.equal(review.status, "confirmed-as-recorded");
  const nonqualifying = makeReport({ result: "customer-concern-unresolved" });
  assert.equal(
    system.identifyBehavioralEvidence([nonqualifying], { reviews: [review] })
      .length,
    0,
  );
});

test("ArchieCore persists the separate artifact and truthful idempotent no-op", async () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const core = load("js/core/archie-core.js", "ArchieCore", {
    hasSurfacedSessionSignal() { return false; },
    markSessionSignalSurfaced() { return true; },
  });
  const report = makeReport();
  const projection = system.identifyBehavioralEvidence([report])[0];
  const artifacts = { "camping.fieldReports": { reports: [report] } };
  let saveCount = 0;
  const profile = { strengths: ["Existing"] };
  core.systems = {
    missionIntelligence: system,
    memory: {
      getArtifact(type) { return artifacts[type] || null; },
      saveArtifact(artifact) {
        saveCount += 1;
        artifacts[artifact.type] = clone(artifact);
        return artifacts[artifact.type];
      },
    },
  };

  const first = await core.reviewBehavioralEvidence(targetFrom(projection));
  const second = await core.reviewBehavioralEvidence(targetFrom(projection));
  assert.equal(first.success, true);
  assert.equal(first.changed, true);
  assert.equal(second.success, true);
  assert.equal(second.changed, false);
  assert.equal(saveCount, 1);
  assert.equal(artifacts["camping.behavioralEvidenceReviews"].reviews.length, 1);
  assert.deepEqual(profile, { strengths: ["Existing"] });
});

test("persistence failure is truthful and source data remains unchanged", async () => {
  const system = load("systems/mission-intelligence.system.js", "MissionIntelligenceSystem");
  const core = load("js/core/archie-core.js", "ArchieCore", {
    hasSurfacedSessionSignal() { return false; },
    markSessionSignalSurfaced() { return true; },
  });
  const report = makeReport();
  const before = clone(report);
  const projection = system.identifyBehavioralEvidence([report])[0];
  core.systems = {
    missionIntelligence: system,
    memory: {
      getArtifact(type) {
        return type === "camping.fieldReports" ? { reports: [report] } : null;
      },
      saveArtifact() { return null; },
    },
  };

  const result = await core.reviewBehavioralEvidence(targetFrom(projection));
  assert.equal(result.success, false);
  assert.equal(result.reason, "behavioral-evidence-review-persistence-failed");
  assert.deepEqual(report, before);
});
