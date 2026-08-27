const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const progressSource = fs.readFileSync(
  path.resolve(__dirname, "..", "progress.html"),
  "utf8",
);
const archieSource = fs.readFileSync(
  path.resolve(__dirname, "..", "js", "archie.js"),
  "utf8",
);

function loadUi() {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(
    `${archieSource}\n;globalThis.__ui = { getBehavioralEvidenceReviewDisplay, buildBehavioralEvidenceReviewPayload, submitBehavioralEvidenceReview };`,
    context,
  );
  return context.__ui;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeEvidence(overrides = {}) {
  return {
    evidenceId: "behavioral_evidence_report_interaction_outcome",
    sourceFingerprint:
      'behavioral_evidence_source_v1:{"objections":["payment"],"outcomeEntryId":"outcome","step":"objection-handling","performedBy":"commander","result":"customer-concern-resolved"}',
    competency: "objection-handling",
    insight:
      "This interaction records an objection, an Objection Handling step you reported performing, and a resolved customer concern. That outcome is consistent with effective Objection Handling in this interaction.",
    sourceRef: {
      artifactId: "report",
      subType: "customerInteraction",
      subId: "interaction",
    },
    evidenceRefs: [
      { field: "objections" },
      { field: "salesStepOutcomes", entryId: "outcome" },
    ],
    latestReviewStatus: "unreviewed",
    ...overrides,
  };
}

test("dedicated section has exact title, subtitle, disclaimer, and placement", () => {
  const patternsIndex = progressSource.indexOf("Patterns You've Reported");
  const evidenceIndex = progressSource.indexOf(">Behavioral Evidence<");
  assert.ok(patternsIndex >= 0);
  assert.ok(evidenceIndex > patternsIndex);
  assert.match(
    progressSource,
    /Structured action-and-outcome records from your Field Reports/,
  );
  assert.match(
    progressSource,
    /These records are derived from structured interaction outcomes you reported\. Each describes one interaction and is not independent verification of skill\./,
  );
});

test("card and modal use exact E3 authority copy", () => {
  assert.match(archieSource, /STRUCTURED INTERACTION EVIDENCE · E3/);
  assert.match(
    archieSource,
    /Source: Commander-reported Field Report outcome/,
  );
  assert.match(progressSource, /Review behavioral evidence/);
  assert.match(
    progressSource,
    /This review checks whether the source record and FounderOS interpretation accurately reflect what you reported\. It does not verify your skill or performance\./,
  );
});

test("review display covers unreviewed, confirmed, and corrected safely", () => {
  const { getBehavioralEvidenceReviewDisplay } = loadUi();
  assert.equal(
    getBehavioralEvidenceReviewDisplay("unreviewed").badge,
    "UNREVIEWED",
  );
  const confirmed = getBehavioralEvidenceReviewDisplay(
    "confirmed-as-recorded",
  );
  assert.equal(confirmed.badge, "CONFIRMED AS RECORDED");
  assert.match(confirmed.supportingText, /reflect what you reported/i);
  assert.doesNotMatch(confirmed.supportingText, /verified skill|proven/i);
  assert.equal(
    getBehavioralEvidenceReviewDisplay("corrected").badge,
    "CORRECTED",
  );
});

test("payload passes the exact projection target without parsing IDs", () => {
  const { buildBehavioralEvidenceReviewPayload } = loadUi();
  const evidence = makeEvidence();
  const before = clone(evidence);
  const result = buildBehavioralEvidenceReviewPayload(evidence, {
    status: "confirmed-as-recorded",
  });

  assert.equal(result.valid, true);
  assert.deepEqual(clone(result.payload), {
    evidenceId: evidence.evidenceId,
    sourceRef: evidence.sourceRef,
    outcomeEntryId: "outcome",
    sourceFingerprint: evidence.sourceFingerprint,
    status: "confirmed-as-recorded",
    correctedCompetency: null,
    note: null,
  });
  assert.deepEqual(evidence, before);
});

test("existing passive review UI accepts Trial Close projection unchanged", () => {
  const { buildBehavioralEvidenceReviewPayload } = loadUi();
  const evidence = makeEvidence({
    evidenceId:
      "behavioral_evidence_report_interaction_trial-close-outcome",
    sourceFingerprint:
      'behavioral_evidence_source_v1:{"outcomeEntryId":"trial-close-outcome","step":"trial-close","performedBy":"commander","result":"customer-expressed-readiness-to-proceed"}',
    competency: "trial-close",
    insight:
      "This interaction records a Trial Close you reported performing and a customer response expressing readiness to proceed. That response is consistent with effective Trial Close use in this interaction.",
    evidenceRefs: [
      { field: "salesStepOutcomes", entryId: "trial-close-outcome" },
    ],
  });
  const result = buildBehavioralEvidenceReviewPayload(evidence, {
    status: "confirmed-as-recorded",
  });

  assert.equal(result.valid, true);
  assert.equal(result.payload.outcomeEntryId, "trial-close-outcome");
  assert.equal(result.payload.sourceFingerprint, evidence.sourceFingerprint);
  assert.match(evidence.insight, /Trial Close/);
  assert.doesNotMatch(evidence.insight, /caused|successfully closed|strength/i);
});

test("correction allows canonical competency or note and requires a real change", () => {
  const { buildBehavioralEvidenceReviewPayload } = loadUi();
  const evidence = makeEvidence();
  assert.equal(
    buildBehavioralEvidenceReviewPayload(evidence, { status: "corrected" })
      .reason,
    "correction-detail-required",
  );
  assert.equal(
    buildBehavioralEvidenceReviewPayload(evidence, {
      status: "corrected",
      correctedCompetency: "objection-handling",
    }).reason,
    "invalid-corrected-competency",
  );
  assert.equal(
    buildBehavioralEvidenceReviewPayload(evidence, {
      status: "corrected",
      correctedCompetency: "discovery",
    }).payload.correctedCompetency,
    "discovery",
  );
  assert.equal(
    buildBehavioralEvidenceReviewPayload(evidence, {
      status: "corrected",
      note: "Interpretation needs context.",
    }).payload.note,
    "Interpretation needs context.",
  );
});

test("rejection is supported with an optional note and no correction", () => {
  const { buildBehavioralEvidenceReviewPayload } = loadUi();
  const result = buildBehavioralEvidenceReviewPayload(makeEvidence(), {
    status: "rejected",
    correctedCompetency: "discovery",
    note: "Not representative.",
  });
  assert.equal(result.valid, true);
  assert.equal(result.payload.status, "rejected");
  assert.equal(result.payload.correctedCompetency, null);
  assert.equal(result.payload.note, "Not representative.");
});

test("modal exposes no raw outcome editing control", () => {
  const modalStart = progressSource.indexOf(
    'id="behavioral-evidence-review-modal"',
  );
  const modalEnd = progressSource.indexOf(
    "<!-- =====================================\n        SYSTEM NOTIFICATION",
    modalStart,
  );
  const modal = progressSource.slice(modalStart, modalEnd);
  assert.doesNotMatch(modal, /customer-concern-resolved/);
  assert.doesNotMatch(modal, /salesStepOutcomes/);
  assert.doesNotMatch(modal, /raw result/i);
});

test("successful and unchanged reviews rerender exactly once", async () => {
  const { submitBehavioralEvidenceReview } = loadUi();
  for (const changed of [true, false]) {
    let rerenders = 0;
    const result = await submitBehavioralEvidenceReview(
      makeEvidence(),
      { status: "confirmed-as-recorded" },
      {
        async reviewBehavioralEvidence() {
          return { success: true, changed };
        },
      },
      async () => { rerenders += 1; },
    );
    assert.equal(result.success, true);
    assert.equal(rerenders, 1);
  }
});

test("failed save reports failure and never rerenders", async () => {
  const { submitBehavioralEvidenceReview } = loadUi();
  let rerenders = 0;
  const result = await submitBehavioralEvidenceReview(
    makeEvidence(),
    { status: "rejected" },
    {
      async reviewBehavioralEvidence() {
        return {
          success: false,
          reason: "behavioral-evidence-review-persistence-failed",
        };
      },
    },
    async () => { rerenders += 1; },
  );
  assert.equal(result.success, false);
  assert.equal(rerenders, 0);
  assert.match(
    archieSource,
    /FounderOS couldn't save this evidence review\. Your original record was not changed\./,
  );
});

test("existing E1 and E2 surfaces and controls remain present", () => {
  assert.match(progressSource, /Coaching History/);
  assert.match(progressSource, /Patterns You've Reported/);
  assert.match(archieSource, /function updateCoachingHistory/);
  assert.match(archieSource, /function updateRepeatedSelfAssessmentInsights/);
  assert.match(archieSource, /Review evidence/);
  assert.match(archieSource, /Review again/);
});
