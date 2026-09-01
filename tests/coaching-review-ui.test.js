const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadReviewUiHelpers() {
  const sourcePath = path.resolve(__dirname, "..", "js", "archie.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
  });

  vm.runInContext(
    `${source}\n;globalThis.__reviewUi = { getCoachingReviewDisplay, buildCoachingReviewPayload, submitCoachingHistoryReview };`,
    context,
    { filename: sourcePath },
  );

  return context.__reviewUi;
}

function makeSignal(overrides = {}) {
  return {
    type: "field-report-coaching",
    insight:
      'User self-identified "Rapport" as a strength during this customer interaction.',
    signalId:
      "coaching_strength_review-report_review-interaction_rapport",
    createdAt: "2026-08-26T12:00:00.000Z",
    reportDate: "2026-08-26",
    sourceRef: {
      artifactId: "review-report",
      subType: "customerInteraction",
      subId: "review-interaction",
    },
    latestReviewStatus: "unreviewed",
    ...overrides,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("card display copy covers every review state without authority inflation", () => {
  const { getCoachingReviewDisplay } = loadReviewUiHelpers();
  const expected = {
    unreviewed: "UNREVIEWED",
    "confirmed-as-recorded": "CONFIRMED AS RECORDED",
    corrected: "CORRECTED",
    rejected: "REJECTED",
  };

  for (const [status, badge] of Object.entries(expected)) {
    const display = getCoachingReviewDisplay(status);
    assert.equal(display.badge, badge);
    assert.doesNotMatch(
      `${display.badge} ${display.supportingText}`,
      /verified strength|proven strength|demonstrated ability|skill approved/i,
    );
  }
});

test("confirmed card copy is explicitly scoped to what was reported", () => {
  const { getCoachingReviewDisplay } = loadReviewUiHelpers();
  const display = getCoachingReviewDisplay("confirmed-as-recorded");

  assert.match(display.supportingText, /reflects what you reported/i);
  assert.doesNotMatch(display.supportingText, /good at|ability|competence/i);
});

test("corrected and rejected displays preserve rather than hide the signal", () => {
  const { getCoachingReviewDisplay } = loadReviewUiHelpers();
  const signal = makeSignal();
  const before = clone(signal);

  assert.equal(getCoachingReviewDisplay("corrected").badge, "CORRECTED");
  assert.equal(getCoachingReviewDisplay("rejected").badge, "REJECTED");
  assert.equal(signal.insight, before.insight);
  assert.deepEqual(signal, before);
});

test("confirm submission uses exact provenance and canonical payload", () => {
  const { buildCoachingReviewPayload } = loadReviewUiHelpers();
  const signal = makeSignal();
  const result = buildCoachingReviewPayload(signal, {
    status: "confirmed-as-recorded",
    correctedStrength: "",
    note: "ignored for v0.1 confirm UI",
  });

  assert.equal(result.valid, true);
  assert.deepEqual(clone(result.payload), {
    signalId: signal.signalId,
    signalCreatedAt: signal.createdAt,
    sourceRef: signal.sourceRef,
    status: "confirmed-as-recorded",
    correctedStrength: null,
    note: null,
  });
});

test("correction requires a corrected strength or note", () => {
  const { buildCoachingReviewPayload } = loadReviewUiHelpers();
  const signal = makeSignal();
  const missing = buildCoachingReviewPayload(signal, {
    status: "corrected",
    correctedStrength: "",
    note: "",
  });
  const strengthCorrection = buildCoachingReviewPayload(signal, {
    status: "corrected",
    correctedStrength: "discovery",
    note: "",
  });
  const noteCorrection = buildCoachingReviewPayload(signal, {
    status: "corrected",
    correctedStrength: "",
    note: "I intended to record Discovery.",
  });

  assert.equal(missing.valid, false);
  assert.equal(missing.reason, "correction-detail-required");
  assert.equal(strengthCorrection.payload.correctedStrength, "discovery");
  assert.equal(noteCorrection.payload.note, "I intended to record Discovery.");
});

test("reject submission preserves an optional note and null correction", () => {
  const { buildCoachingReviewPayload } = loadReviewUiHelpers();
  const signal = makeSignal();
  const result = buildCoachingReviewPayload(signal, {
    status: "rejected",
    correctedStrength: "discovery",
    note: "This does not represent what I intended.",
  });

  assert.equal(result.valid, true);
  assert.equal(result.payload.status, "rejected");
  assert.equal(result.payload.correctedStrength, null);
  assert.equal(result.payload.note, "This does not represent what I intended.");
});

test("missing provenance fails instead of being inferred from signalId", () => {
  const { buildCoachingReviewPayload } = loadReviewUiHelpers();
  const signal = makeSignal({ sourceRef: null });
  const result = buildCoachingReviewPayload(signal, {
    status: "confirmed-as-recorded",
  });

  assert.equal(result.valid, false);
  assert.equal(result.reason, "invalid-review-provenance");
});

test("successful and idempotent reviews both trigger one rerender", async () => {
  const { submitCoachingHistoryReview } = loadReviewUiHelpers();

  for (const changed of [true, false]) {
    let rerenderCount = 0;
    let receivedPayload = null;
    const result = await submitCoachingHistoryReview(
      makeSignal(),
      { status: "confirmed-as-recorded" },
      {
        async reviewCoachingSignal(payload) {
          receivedPayload = clone(payload);
          return { success: true, changed };
        },
      },
      async () => {
        rerenderCount += 1;
      },
    );

    assert.equal(result.success, true);
    assert.equal(rerenderCount, 1);
    assert.equal(receivedPayload.status, "confirmed-as-recorded");
  }
});

test("failed persistence neither reports success nor rerenders", async () => {
  const { submitCoachingHistoryReview } = loadReviewUiHelpers();
  let rerenderCount = 0;
  const result = await submitCoachingHistoryReview(
    makeSignal(),
    { status: "rejected", note: "Not intended." },
    {
      async reviewCoachingSignal() {
        return { success: false, reason: "coaching-review-persistence-failed" };
      },
    },
    async () => {
      rerenderCount += 1;
    },
  );

  assert.equal(result.success, false);
  assert.equal(result.reason, "coaching-review-persistence-failed");
  assert.equal(rerenderCount, 0);
});

test("UI helpers do not mutate signal, Field Report, Profile, Guidance, or Reflection", async () => {
  const { submitCoachingHistoryReview } = loadReviewUiHelpers();
  const signal = makeSignal();
  const fieldReport = { id: "review-report", coachingSignals: [clone(signal)] };
  const profile = { strengths: ["Existing"] };
  const guidance = { focus: "Existing guidance" };
  const reflection = { entries: ["Existing reflection"] };
  const before = clone({ signal, fieldReport, profile, guidance, reflection });

  await submitCoachingHistoryReview(
    signal,
    { status: "rejected", note: "Not intended." },
    {
      async reviewCoachingSignal() {
        return { success: true, changed: true };
      },
    },
  );

  assert.deepEqual(
    clone({ signal, fieldReport, profile, guidance, reflection }),
    before,
  );
});
