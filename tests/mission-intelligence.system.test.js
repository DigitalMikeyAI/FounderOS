const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadMissionIntelligenceSystem() {
  const sourcePath = path.resolve(
    __dirname,
    "..",
    "systems",
    "mission-intelligence.system.js",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = vm.createContext({});

  // Test-local exposure only: production remains a browser-global const.
  vm.runInContext(
    `${source}\n;globalThis.__MissionIntelligenceSystem = MissionIntelligenceSystem;`,
    context,
    { filename: sourcePath },
  );

  return context.__MissionIntelligenceSystem;
}

const MissionIntelligenceSystem = loadMissionIntelligenceSystem();

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeReport({
  reportId = "report-001",
  interactionId = "interaction-001",
  explicitStrengths,
  learningSignals = [],
  coachingSignals = [],
  processingStatus = "raw",
  customerGoal = "",
  objections = [],
  keyNeeds = [],
  hotButtons = [],
} = {}) {
  const interaction = {
    id: interactionId,
    customerGoal,
    objections,
    keyNeeds,
    hotButtons,
  };

  if (explicitStrengths !== undefined) {
    interaction.explicitStrengths = explicitStrengths;
  }

  return {
    id: reportId,
    createdAt: "2026-08-25T12:00:00.000Z",
    customerInteractions: [interaction],
    learningSignals,
    coachingSignals,
    systemMetadata: {
      processingStatus,
      updatedAt: "2026-08-25T12:00:00.000Z",
    },
  };
}

function ownedSignals(report) {
  return (report.coachingSignals || []).filter(
    (signal) =>
      signal &&
      typeof signal.id === "string" &&
      signal.id.startsWith("coaching_strength_"),
  );
}

test("one strength derives one deterministic coaching signal", () => {
  const input = makeReport({ explicitStrengths: ["discovery"] });
  const before = jsonClone(input);
  const result = MissionIntelligenceSystem.processFieldReport(input);
  const signals = ownedSignals(result.report);

  assert.equal(result.changed, true);
  assert.deepEqual(input, before);
  assert.equal(signals.length, 1);
  assert.equal(
    signals[0].id,
    "coaching_strength_report-001_interaction-001_discovery",
  );
  assert.equal(signals[0].signalType, "strength");
  assert.deepEqual(jsonClone(signals[0].sourceRefs[0]), {
    artifactId: "report-001",
    subType: "customerInteraction",
    subId: "interaction-001",
  });
  assert.match(signals[0].signal, /self-identified/i);
  assert.doesNotMatch(signals[0].signal, /demonstrated|verified/i);
  assert.equal(result.report.systemMetadata.processingStatus, "processed");
});

test("multiple strengths derive one signal per strength", () => {
  const input = makeReport({
    reportId: "report-multiple",
    interactionId: "interaction-multiple",
    explicitStrengths: ["discovery", "objection-handling"],
  });
  const result = MissionIntelligenceSystem.processFieldReport(input);
  const signals = ownedSignals(result.report);
  const ids = signals.map((signal) => signal.id);

  assert.equal(signals.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(jsonClone(ids.sort()), [
    "coaching_strength_report-multiple_interaction-multiple_discovery",
    "coaching_strength_report-multiple_interaction-multiple_objection-handling",
  ]);
  assert.ok(
    signals.every(
      (signal) => signal.sourceRefs[0].subId === "interaction-multiple",
    ),
  );
  assert.ok(signals.every((signal) => !/Discovery.*Objection Handling/i.test(signal.signal)));
});

test("processing the same report is idempotent", () => {
  const first = MissionIntelligenceSystem.processFieldReport(
    makeReport({ explicitStrengths: ["discovery"] }),
  );
  const originalSignal = jsonClone(ownedSignals(first.report)[0]);
  const second = MissionIntelligenceSystem.processFieldReport(first.report);

  assert.equal(second.changed, false);
  assert.equal(ownedSignals(second.report).length, 1);
  assert.equal(ownedSignals(second.report)[0].id, originalSignal.id);
  assert.equal(ownedSignals(second.report)[0].createdAt, originalSignal.createdAt);
});

test("reconciliation removes one stale strength signal", () => {
  const initial = MissionIntelligenceSystem.processFieldReport(
    makeReport({
      explicitStrengths: ["discovery", "objection-handling"],
    }),
  ).report;
  const discoveryBefore = jsonClone(
    ownedSignals(initial).find((signal) => signal.id.endsWith("_discovery")),
  );
  const edited = jsonClone(initial);
  edited.customerInteractions[0].explicitStrengths = ["discovery"];
  const result = MissionIntelligenceSystem.processFieldReport(edited);
  const signals = ownedSignals(result.report);

  assert.equal(result.changed, true);
  assert.equal(signals.length, 1);
  assert.deepEqual(jsonClone(signals[0]), discoveryBefore);
  assert.equal(result.report.systemMetadata.processingStatus, "processed");
});

test("removing the final owned signal returns status to raw", () => {
  const initial = MissionIntelligenceSystem.processFieldReport(
    makeReport({ explicitStrengths: ["discovery"] }),
  ).report;
  const edited = jsonClone(initial);
  edited.customerInteractions[0].explicitStrengths = [];
  const removed = MissionIntelligenceSystem.processFieldReport(edited);
  const repeated = MissionIntelligenceSystem.processFieldReport(removed.report);

  assert.equal(removed.changed, true);
  assert.equal(ownedSignals(removed.report).length, 0);
  assert.equal(removed.report.systemMetadata.processingStatus, "raw");
  assert.equal(repeated.changed, false);
  assert.equal(repeated.report.systemMetadata.processingStatus, "raw");
});

test("restoring evidence restores the deterministic signal exactly once", () => {
  const original = MissionIntelligenceSystem.processFieldReport(
    makeReport({ explicitStrengths: ["discovery"] }),
  ).report;
  const originalId = ownedSignals(original)[0].id;
  const removedInput = jsonClone(original);
  removedInput.customerInteractions[0].explicitStrengths = [];
  const removed = MissionIntelligenceSystem.processFieldReport(removedInput).report;
  const restoredInput = jsonClone(removed);
  restoredInput.customerInteractions[0].explicitStrengths = ["discovery"];
  const restored = MissionIntelligenceSystem.processFieldReport(restoredInput);

  assert.equal(restored.changed, true);
  assert.equal(ownedSignals(restored.report).length, 1);
  assert.equal(ownedSignals(restored.report)[0].id, originalId);
  assert.equal(restored.report.systemMetadata.processingStatus, "processed");
});

test("old reports without explicitStrengths remain valid", () => {
  const input = makeReport();
  const before = jsonClone(input);
  const result = MissionIntelligenceSystem.processFieldReport(input);

  assert.equal(result.changed, false);
  assert.equal(ownedSignals(result.report).length, 0);
  assert.equal(result.report.systemMetadata.processingStatus, "raw");
  assert.deepEqual(input, before);
});

test("existing learning rules still produce processed state", () => {
  const input = makeReport({
    reportId: "report-learning",
    interactionId: "interaction-learning",
    customerGoal: "Find the right product",
    objections: ["price"],
  });
  const result = MissionIntelligenceSystem.processFieldReport(input);

  assert.equal(result.changed, true);
  assert.equal(result.report.learningSignals.length, 1);
  assert.equal(
    result.report.learningSignals[0].id,
    "learning_goal_objection_coexistence_report-learning_interaction-learning",
  );
  assert.equal(ownedSignals(result.report).length, 0);
  assert.equal(result.report.systemMetadata.processingStatus, "processed");
});

test("user-created coaching signals are preserved but do not imply processed", () => {
  const userSignal = {
    id: "user-coaching-001",
    createdAt: "2026-08-24T10:00:00.000Z",
    updatedAt: "2026-08-24T10:00:00.000Z",
    signal: "User-authored coaching note.",
    signalType: "note",
    sourceRefs: [],
    notes: "Keep exactly as entered.",
  };
  const input = makeReport({
    coachingSignals: [userSignal],
    processingStatus: "processed",
  });
  const result = MissionIntelligenceSystem.processFieldReport(input);

  assert.equal(result.changed, true);
  assert.deepEqual(jsonClone(result.report.coachingSignals), [userSignal]);
  assert.equal(result.report.systemMetadata.processingStatus, "raw");
});

test("non-canonical strengths are ignored", () => {
  const input = makeReport({ explicitStrengths: ["fake-strength"] });
  const result = MissionIntelligenceSystem.processFieldReport(input);

  assert.equal(result.changed, false);
  assert.equal(ownedSignals(result.report).length, 0);
  assert.equal(result.report.systemMetadata.processingStatus, "raw");
});

test("duplicate explicitStrengths values do not duplicate signals", () => {
  const input = makeReport({
    explicitStrengths: ["discovery", "discovery"],
  });
  const result = MissionIntelligenceSystem.processFieldReport(input);
  const signals = ownedSignals(result.report);

  assert.equal(result.changed, true);
  assert.equal(signals.length, 1);
  assert.equal(new Set(signals.map((signal) => signal.id)).size, 1);
});

function makePersistedCoachingSignal({
  id = "coaching_strength_projection-report_projection-interaction_discovery",
  insight =
    'User self-identified "Discovery" as a strength during this customer interaction.',
  createdAt = "2026-08-25T12:00:00.000Z",
  notes = "Internal derivation note.",
} = {}) {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    signal: insight,
    signalType: "strength",
    sourceRefs: [
      {
        artifactId: "projection-report",
        subType: "customerInteraction",
        subId: "projection-interaction",
        extraField: "must-not-project",
      },
    ],
    notes,
    internalField: "must-not-project",
  };
}

test("singular coaching projection selects newest owned signal", () => {
  const olderSignal = makePersistedCoachingSignal({
    id: "coaching_strength_older-report_interaction_discovery",
  });
  const newerSignal = makePersistedCoachingSignal({
    id: "coaching_strength_newer-report_interaction_rapport",
    insight:
      'User self-identified "Rapport" as a strength during this customer interaction.',
  });
  const result = MissionIntelligenceSystem.identifyCoachingSignal([
    { id: "older-report", coachingSignals: [olderSignal] },
    { id: "newer-report", coachingSignals: [newerSignal] },
  ]);

  assert.equal(result.signalId, newerSignal.id);
  assert.equal(result.insight, newerSignal.signal);
  assert.equal(
    result.followUpPrompt,
    "What happened in that interaction that made this feel like a strength to you?",
  );
});

test("singular coaching projection ignores user-created signals", () => {
  const owned = makePersistedCoachingSignal();
  const result = MissionIntelligenceSystem.identifyCoachingSignal([
    {
      coachingSignals: [
        { id: "user-created-signal", signal: "Discovery is your strength." },
        owned,
      ],
    },
  ]);

  assert.equal(result.signalId, owned.id);
});

test("singular coaching projection preserves self-assessment wording", () => {
  const signal = makePersistedCoachingSignal();
  const result = MissionIntelligenceSystem.identifyCoachingSignal([
    { coachingSignals: [signal] },
  ]);

  assert.equal(result.insight, signal.signal);
  assert.match(result.insight, /self-identified/i);
  assert.doesNotMatch(result.insight, /demonstrated|verified|proven/i);
});

test("singular coaching prompt is deterministic across competencies", () => {
  const discovery = MissionIntelligenceSystem.identifyCoachingSignal([
    { coachingSignals: [makePersistedCoachingSignal()] },
  ]);
  const rapport = MissionIntelligenceSystem.identifyCoachingSignal([
    {
      coachingSignals: [
        makePersistedCoachingSignal({
          id: "coaching_strength_projection-report_projection-interaction_rapport",
          insight:
            'User self-identified "Rapport" as a strength during this customer interaction.',
        }),
      ],
    },
  ]);

  assert.equal(discovery.followUpPrompt, rapport.followUpPrompt);
  assert.equal(
    discovery.followUpPrompt,
    "What happened in that interaction that made this feel like a strength to you?",
  );
  assert.match(discovery.followUpPrompt, /that interaction/);
  assert.match(discovery.followUpPrompt, /feel like a strength to you/);
  assert.doesNotMatch(discovery.followUpPrompt, /Discovery|Rapport/);
});

test("singular coaching projection returns canonical evidence reference", () => {
  const signal = makePersistedCoachingSignal();
  const result = MissionIntelligenceSystem.identifyCoachingSignal([
    { coachingSignals: [signal] },
  ]);

  assert.deepEqual(jsonClone(result), {
    type: "field-report-coaching",
    insight: signal.signal,
    followUpPrompt:
      "What happened in that interaction that made this feel like a strength to you?",
    signalId: signal.id,
    evidence: ["artifactId: projection-report"],
    source: "coachingSignal",
    reportId: null,
    reportDate: null,
    createdAt: signal.createdAt,
    sourceRef: {
      artifactId: "projection-report",
      subType: "customerInteraction",
      subId: "projection-interaction",
    },
  });
});

test("singular coaching projection aligns with canonical history provenance", () => {
  const signal = makePersistedCoachingSignal();
  const reports = [
    {
      id: " projection-report ",
      date: " 2026-08-25 ",
      coachingSignals: [signal],
    },
  ];
  const singular = MissionIntelligenceSystem.identifyCoachingSignal(reports);
  const plural = MissionIntelligenceSystem.identifyCoachingSignals(reports)[0];

  assert.equal(singular.reportId, plural.reportId);
  assert.equal(singular.reportDate, plural.reportDate);
  assert.equal(singular.createdAt, plural.createdAt);
  assert.deepEqual(jsonClone(singular.sourceRef), jsonClone(plural.sourceRef));
  assert.deepEqual(jsonClone(singular.sourceRef), {
    artifactId: "projection-report",
    subType: "customerInteraction",
    subId: "projection-interaction",
  });
  assert.equal(singular.insight, signal.signal);
  assert.equal(
    singular.followUpPrompt,
    "What happened in that interaction that made this feel like a strength to you?",
  );
});

test("singular coaching sourceRef is a defensive canonical copy", () => {
  const signal = makePersistedCoachingSignal();
  const originalSourceRef = jsonClone(signal.sourceRefs[0]);
  const result = MissionIntelligenceSystem.identifyCoachingSignal([
    { coachingSignals: [signal] },
  ]);

  assert.notEqual(result.sourceRef, signal.sourceRefs[0]);
  result.sourceRef.artifactId = "changed-after-projection";

  assert.deepEqual(jsonClone(signal.sourceRefs[0]), originalSourceRef);
  assert.equal(signal.sourceRefs[0].extraField, "must-not-project");
  assert.equal(Object.hasOwn(result.sourceRef, "extraField"), false);
});

test("singular coaching projection does not infer missing provenance", () => {
  const signal = makePersistedCoachingSignal({
    id: "coaching_strength_report-from-id_interaction-from-id_rapport",
  });
  delete signal.createdAt;
  signal.sourceRefs = ["malformed-source-ref"];

  const result = MissionIntelligenceSystem.identifyCoachingSignal([
    { coachingSignals: [signal] },
  ]);

  assert.equal(result.reportId, null);
  assert.equal(result.reportDate, null);
  assert.equal(result.createdAt, null);
  assert.deepEqual(jsonClone(result.sourceRef), {
    artifactId: "",
    subType: "",
    subId: "",
  });
  assert.doesNotMatch(JSON.stringify(result.sourceRef), /report-from-id|interaction-from-id/);
});

test("singular coaching projection returns null for malformed reports", () => {
  assert.equal(MissionIntelligenceSystem.identifyCoachingSignal(), null);
  assert.equal(
    MissionIntelligenceSystem.identifyCoachingSignal([
      null,
      {},
      { coachingSignals: "invalid" },
      { coachingSignals: [{ id: "coaching_strength_missing_text" }] },
    ]),
    null,
  );
});

test("singular coaching projection does not mutate input", () => {
  const reports = [{ coachingSignals: [makePersistedCoachingSignal()] }];
  const before = jsonClone(reports);

  MissionIntelligenceSystem.identifyCoachingSignal(reports);

  assert.deepEqual(reports, before);
});

test("singular coaching projection requires no persistence globals", () => {
  const reports = [{ coachingSignals: [makePersistedCoachingSignal()] }];

  assert.doesNotThrow(() =>
    MissionIntelligenceSystem.identifyCoachingSignal(reports),
  );
});

test("coaching projection returns owned signals with presentation-safe fields", () => {
  const signal = makePersistedCoachingSignal();
  const reports = [
    {
      id: "projection-report",
      date: "2026-08-25",
      createdAt: "2026-08-25T11:00:00.000Z",
      coachingSignals: [signal],
    },
  ];
  const before = jsonClone(reports);
  const results = MissionIntelligenceSystem.identifyCoachingSignals(reports);

  assert.equal(results.length, 1);
  assert.deepEqual(jsonClone(results[0]), {
    type: "field-report-coaching",
    insight: signal.signal,
    signalId: signal.id,
    reportId: "projection-report",
    reportDate: "2026-08-25",
    sourceRef: {
      artifactId: "projection-report",
      subType: "customerInteraction",
      subId: "projection-interaction",
    },
    createdAt: signal.createdAt,
  });
  assert.deepEqual(reports, before);
  assert.match(results[0].insight, /self-identified/i);
  assert.doesNotMatch(results[0].insight, /demonstrated|verified/i);
});

test("coaching projection returns multiple owned signals", () => {
  const reports = [
    {
      id: "projection-report",
      coachingSignals: [
        makePersistedCoachingSignal(),
        makePersistedCoachingSignal({
          id: "coaching_strength_projection-report_projection-interaction_rapport",
          insight:
            'User self-identified "Rapport" as a strength during this customer interaction.',
        }),
      ],
    },
  ];
  const results = MissionIntelligenceSystem.identifyCoachingSignals(reports);

  assert.equal(results.length, 2);
  assert.deepEqual(
    jsonClone(results.map((result) => result.signalId)),
    [
      "coaching_strength_projection-report_projection-interaction_discovery",
      "coaching_strength_projection-report_projection-interaction_rapport",
    ],
  );
});

test("coaching projection excludes non-owned signals", () => {
  const owned = makePersistedCoachingSignal();
  const userCreated = {
    ...makePersistedCoachingSignal(),
    id: "user-created-coaching-signal",
    signal: "User-created note.",
  };
  const results = MissionIntelligenceSystem.identifyCoachingSignals([
    { coachingSignals: [userCreated, owned] },
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].signalId, owned.id);
});

test("coaching projection ordering is deterministic and respects limit", () => {
  const reports = [
    {
      id: "older-report",
      date: "2026-08-24",
      createdAt: "2026-08-24T12:00:00.000Z",
      coachingSignals: [
        makePersistedCoachingSignal({
          id: "coaching_strength_older-report_interaction_discovery",
        }),
      ],
    },
    {
      id: "newer-report",
      date: "2026-08-25",
      createdAt: "2026-08-25T12:00:00.000Z",
      coachingSignals: [
        makePersistedCoachingSignal({
          id: "coaching_strength_newer-report_interaction_rapport",
        }),
        makePersistedCoachingSignal({
          id: "coaching_strength_newer-report_interaction_presentation",
        }),
      ],
    },
  ];
  const results = MissionIntelligenceSystem.identifyCoachingSignals(reports, {
    limit: 2,
  });

  assert.deepEqual(
    jsonClone(results.map((result) => result.signalId)),
    [
      "coaching_strength_newer-report_interaction_rapport",
      "coaching_strength_newer-report_interaction_presentation",
    ],
  );
});

test("coaching projection handles malformed input and empty history", () => {
  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyCoachingSignals()),
    [],
  );
  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyCoachingSignals([
        null,
        {},
        { coachingSignals: "invalid" },
        { coachingSignals: [null, { id: "coaching_strength_missing-text" }] },
      ]),
    ),
    [],
  );
});

test("coaching projection omits notes by default and includes them explicitly", () => {
  const signal = makePersistedCoachingSignal();
  const reports = [{ coachingSignals: [signal] }];
  const defaultResult = MissionIntelligenceSystem.identifyCoachingSignals(reports);
  const notesResult = MissionIntelligenceSystem.identifyCoachingSignals(reports, {
    includeNotes: true,
  });

  assert.equal(Object.hasOwn(defaultResult[0], "notes"), false);
  assert.equal(notesResult[0].notes, signal.notes);
  assert.equal(Object.hasOwn(defaultResult[0], "internalField"), false);
});

test("coaching projection is read-only and does not require persistence globals", () => {
  const reports = [{ coachingSignals: [makePersistedCoachingSignal()] }];
  const before = jsonClone(reports);

  assert.doesNotThrow(() =>
    MissionIntelligenceSystem.identifyCoachingSignals(reports),
  );
  assert.deepEqual(reports, before);
});

function makeRepeatedAssessmentReport({
  reportId,
  date,
  interactions,
} = {}) {
  const report = {
    id: reportId,
    date,
    createdAt: `${date}T09:00:00.000Z`,
    customerInteractions: interactions.map((interaction) => ({
      id: interaction.id,
      explicitStrengths: [...interaction.strengths],
    })),
    learningSignals: [],
    coachingSignals: [],
    systemMetadata: {
      processingStatus: "raw",
      updatedAt: `${date}T09:00:00.000Z`,
    },
  };

  return MissionIntelligenceSystem.processFieldReport(report).report;
}

function makeOccurrenceReview(signal, sourceRef, overrides = {}) {
  return {
    id: `review-${signal.id}-${overrides.status || "confirmed"}`,
    signalId: signal.id,
    signalCreatedAt: signal.createdAt,
    sourceRef: { ...sourceRef },
    originalInsight: signal.signal,
    status: "confirmed-as-recorded",
    correctedStrength: null,
    note: null,
    reviewedAt: "2026-08-27T12:00:00.000Z",
    supersedesReviewId: null,
    ...overrides,
  };
}

test("one eligible self-assessment remains E1 and produces no summary", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "single-report",
    date: "2026-08-25",
    interactions: [{ id: "single-interaction", strengths: ["discovery"] }],
  });

  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyRepeatedSelfAssessments([report])),
    [],
  );
});

test("two independent unreviewed interactions produce an E2 summary", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "two-interactions-report",
    date: "2026-08-25",
    interactions: [
      { id: "interaction-a", strengths: ["discovery"] },
      { id: "interaction-b", strengths: ["discovery"] },
    ],
  });
  const result = MissionIntelligenceSystem.identifyRepeatedSelfAssessments([
    report,
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].evidenceTier, "E2");
  assert.equal(result[0].strength, "discovery");
  assert.equal(result[0].interactionCount, 2);
  assert.equal(result[0].reportCount, 1);
  assert.equal(
    result[0].insight,
    'You have self-identified "Discovery" as a strength in 2 recorded interactions.',
  );
  assert.doesNotMatch(result[0].insight, /verified|proven|demonstrated|you are strong/i);
});

test("confirmed occurrences count while rejected and corrected occurrences do not", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "review-filter-report",
    date: "2026-08-25",
    interactions: [
      { id: "confirmed-interaction", strengths: ["rapport"] },
      { id: "unreviewed-interaction", strengths: ["rapport"] },
      { id: "rejected-interaction", strengths: ["rapport"] },
      { id: "corrected-interaction", strengths: ["rapport"] },
    ],
  });
  const byInteraction = new Map(
    report.coachingSignals.map((signal) => [signal.sourceRefs[0].subId, signal]),
  );
  const reviews = {
    reviews: [
      makeOccurrenceReview(
        byInteraction.get("confirmed-interaction"),
        byInteraction.get("confirmed-interaction").sourceRefs[0],
      ),
      makeOccurrenceReview(
        byInteraction.get("rejected-interaction"),
        byInteraction.get("rejected-interaction").sourceRefs[0],
        { status: "rejected" },
      ),
      makeOccurrenceReview(
        byInteraction.get("corrected-interaction"),
        byInteraction.get("corrected-interaction").sourceRefs[0],
        { status: "corrected", correctedStrength: "discovery" },
      ),
    ],
  };
  const result = MissionIntelligenceSystem.identifyRepeatedSelfAssessments(
    [report],
    reviews,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].strength, "rapport");
  assert.equal(result[0].interactionCount, 2);
  assert.deepEqual(
    jsonClone(result[0].occurrences.map((item) => item.latestReviewStatus).sort()),
    ["confirmed-as-recorded", "unreviewed"],
  );
  assert.equal(result.some((summary) => summary.strength === "discovery"), false);
});

test("canonical strengths group independently", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "group-report",
    date: "2026-08-25",
    interactions: [
      { id: "group-a", strengths: ["rapport", "discovery"] },
      { id: "group-b", strengths: ["rapport", "discovery"] },
    ],
  });
  const result = MissionIntelligenceSystem.identifyRepeatedSelfAssessments([
    report,
  ]);

  assert.deepEqual(
    jsonClone(result.map((summary) => summary.strength)),
    ["rapport", "discovery"],
  );
  assert.equal(result[0].interactionCount, 2);
  assert.equal(result[1].interactionCount, 2);
});

test("duplicate signals count once but distinct interactions count independently", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "duplicate-report",
    date: "2026-08-25",
    interactions: [
      { id: "duplicate-a", strengths: ["presentation"] },
      { id: "duplicate-b", strengths: ["presentation"] },
    ],
  });
  report.coachingSignals.push(jsonClone(report.coachingSignals[0]));
  const result = MissionIntelligenceSystem.identifyRepeatedSelfAssessments([
    report,
  ]);

  assert.equal(result[0].interactionCount, 2);
  assert.equal(result[0].occurrences.length, 2);
});

test("same strength across reports counts interactions and reports separately", () => {
  const first = makeRepeatedAssessmentReport({
    reportId: "cross-report-a",
    date: "2026-08-24",
    interactions: [{ id: "cross-a", strengths: ["trial-close"] }],
  });
  const second = makeRepeatedAssessmentReport({
    reportId: "cross-report-b",
    date: "2026-08-25",
    interactions: [{ id: "cross-b", strengths: ["trial-close"] }],
  });
  const result = MissionIntelligenceSystem.identifyRepeatedSelfAssessments([
    first,
    second,
  ]);

  assert.equal(result[0].interactionCount, 2);
  assert.equal(result[0].reportCount, 2);
});

test("user-created and malformed signals never contribute", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "malformed-report",
    date: "2026-08-25",
    interactions: [
      { id: "malformed-a", strengths: ["discovery"] },
      { id: "malformed-b", strengths: ["discovery"] },
    ],
  });
  report.coachingSignals = [
    { id: "user-created", signalType: "strength", signal: "Discovery" },
    { id: report.coachingSignals[0].id, signalType: "strength" },
    { ...report.coachingSignals[1], sourceRefs: [] },
  ];

  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyRepeatedSelfAssessments([report])),
    [],
  );
});

test("missing source data is not recovered by parsing signal IDs or wording", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "no-inference-report",
    date: "2026-08-25",
    interactions: [
      { id: "no-inference-a", strengths: [] },
      { id: "no-inference-b", strengths: [] },
    ],
  });
  report.coachingSignals = ["a", "b"].map((suffix) => ({
    id: `coaching_strength_no-inference-report_no-inference-${suffix}_discovery`,
    createdAt: `2026-08-25T1${suffix === "a" ? "0" : "1"}:00:00.000Z`,
    signal:
      'User self-identified "Discovery" as a strength during this customer interaction.',
    signalType: "strength",
    sourceRefs: [
      {
        artifactId: "no-inference-report",
        subType: "customerInteraction",
        subId: `no-inference-${suffix}`,
      },
    ],
  }));

  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyRepeatedSelfAssessments([report])),
    [],
  );
});

test("regenerated signal occurrence does not inherit an old rejection", () => {
  const original = makeRepeatedAssessmentReport({
    reportId: "regenerated-report",
    date: "2026-08-25",
    interactions: [
      { id: "regenerated-a", strengths: ["rapport"] },
      { id: "regenerated-b", strengths: ["rapport"] },
    ],
  });
  const rejectedSignal = original.coachingSignals[0];
  const reviews = {
    reviews: [
      makeOccurrenceReview(rejectedSignal, rejectedSignal.sourceRefs[0], {
        status: "rejected",
      }),
    ],
  };
  const regenerated = jsonClone(original);
  regenerated.coachingSignals[0].createdAt = "2099-01-01T00:00:00.000Z";
  regenerated.coachingSignals[0].updatedAt = "2099-01-01T00:00:00.000Z";
  const result = MissionIntelligenceSystem.identifyRepeatedSelfAssessments(
    [regenerated],
    reviews,
  );

  assert.equal(result[0].interactionCount, 2);
  assert.equal(result[0].occurrences[0].latestReviewStatus, "unreviewed");
});

test("summary provenance is defensively copied and inputs remain unchanged", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "copy-report",
    date: "2026-08-25",
    interactions: [
      { id: "copy-a", strengths: ["objection-handling"] },
      { id: "copy-b", strengths: ["objection-handling"] },
    ],
  });
  const ledger = { reviews: [] };
  const before = jsonClone({ report, ledger });
  const result = MissionIntelligenceSystem.identifyRepeatedSelfAssessments(
    [report],
    ledger,
  );
  result[0].occurrences[0].sourceRef.artifactId = "changed";

  assert.deepEqual(jsonClone({ report, ledger }), before);
});

test("summary ordering is count then recency then canonical order", () => {
  const older = makeRepeatedAssessmentReport({
    reportId: "ordering-older",
    date: "2026-08-24",
    interactions: [
      { id: "older-a", strengths: ["rapport", "discovery"] },
      { id: "older-b", strengths: ["rapport", "discovery"] },
    ],
  });
  const newer = makeRepeatedAssessmentReport({
    reportId: "ordering-newer",
    date: "2026-08-25",
    interactions: [
      { id: "newer-a", strengths: ["presentation"] },
      { id: "newer-b", strengths: ["presentation"] },
    ],
  });
  older.coachingSignals.forEach((signal) => {
    signal.createdAt = "2026-08-24T12:00:00.000Z";
  });
  newer.coachingSignals.forEach((signal) => {
    signal.createdAt = "2026-08-25T12:00:00.000Z";
  });
  const result = MissionIntelligenceSystem.identifyRepeatedSelfAssessments([
    older,
    newer,
  ]);

  assert.deepEqual(
    jsonClone(result.map((summary) => summary.strength)),
    ["presentation", "rapport", "discovery"],
  );
});

test("active repeated self-assessment returns null without passive E2", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "active-single-report",
    date: "2026-08-26",
    interactions: [{ id: "active-single", strengths: ["discovery"] }],
  });

  assert.equal(
    MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment([report]),
    null,
  );
});

test("all-unreviewed passive E2 is not active-eligible", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "active-unreviewed-report",
    date: "2026-08-26",
    interactions: [
      { id: "active-unreviewed-a", strengths: ["rapport"] },
      { id: "active-unreviewed-b", strengths: ["rapport"] },
    ],
  });

  assert.equal(
    MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment([report]),
    null,
  );
});

test("one confirmed plus one unreviewed occurrence becomes active-eligible", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "active-mixed-report",
    date: "2026-08-26",
    interactions: [
      { id: "active-mixed-a", strengths: ["discovery"] },
      { id: "active-mixed-b", strengths: ["discovery"] },
    ],
  });
  const confirmed = report.coachingSignals[0];
  const reviews = {
    reviews: [
      makeOccurrenceReview(confirmed, confirmed.sourceRefs[0]),
    ],
  };
  const result =
    MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment(
      [report],
      reviews,
    );

  assert.equal(result.evidenceTier, "E2");
  assert.equal(result.interactionCount, 2);
  assert.deepEqual(
    jsonClone(result.occurrences.map((occurrence) => occurrence.latestReviewStatus).sort()),
    ["confirmed-as-recorded", "unreviewed"],
  );
});

test("two confirmed occurrences remain active-eligible", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "active-confirmed-report",
    date: "2026-08-26",
    interactions: [
      { id: "active-confirmed-a", strengths: ["presentation"] },
      { id: "active-confirmed-b", strengths: ["presentation"] },
    ],
  });
  const reviews = {
    reviews: report.coachingSignals.map((signal) =>
      makeOccurrenceReview(signal, signal.sourceRefs[0]),
    ),
  };

  const result =
    MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment(
      [report],
      reviews,
    );

  assert.equal(result.strength, "presentation");
  assert.equal(result.interactionCount, 2);
});

test("rejected or corrected contributor cannot satisfy the active threshold", () => {
  for (const status of ["rejected", "corrected"]) {
    const report = makeRepeatedAssessmentReport({
      reportId: `active-${status}-report`,
      date: "2026-08-26",
      interactions: [
        { id: `active-${status}-a`, strengths: ["rapport"] },
        { id: `active-${status}-b`, strengths: ["rapport"] },
      ],
    });
    const first = report.coachingSignals[0];
    const second = report.coachingSignals[1];
    const reviews = {
      reviews: [
        makeOccurrenceReview(first, first.sourceRefs[0]),
        makeOccurrenceReview(second, second.sourceRefs[0], {
          status,
          correctedStrength: status === "corrected" ? "discovery" : null,
        }),
      ],
    };

    assert.equal(
      MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment(
        [report],
        reviews,
      ),
      null,
    );
  }
});

test("active projection preserves insight and adds stable identity and prompt", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "active-contract-report",
    date: "2026-08-26",
    interactions: [
      { id: "active-contract-a", strengths: ["objection-handling"] },
      { id: "active-contract-b", strengths: ["objection-handling"] },
    ],
  });
  const signal = report.coachingSignals[0];
  const reviews = {
    reviews: [makeOccurrenceReview(signal, signal.sourceRefs[0])],
  };
  const passive = MissionIntelligenceSystem.identifyRepeatedSelfAssessments(
    [report],
    reviews,
  )[0];
  const active =
    MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment(
      [report],
      reviews,
    );

  assert.equal(active.insight, passive.insight);
  assert.equal(
    active.summaryId,
    "repeated_self_assessment_objection-handling",
  );
  assert.equal(
    active.followUpPrompt,
    "What do you notice repeating across those interactions?",
  );
  assert.doesNotMatch(
    active.summaryId,
    /active-contract|2026|interaction|review|_2$/,
  );
  assert.doesNotMatch(
    `${active.insight} ${active.followUpPrompt}`,
    /verified|proven|demonstrated|competence/i,
  );
});

test("changing occurrence count preserves the strength-owned summary ID", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "active-membership-report",
    date: "2026-08-26",
    interactions: [
      { id: "active-membership-a", strengths: ["trial-close"] },
      { id: "active-membership-b", strengths: ["trial-close"] },
      { id: "active-membership-c", strengths: ["trial-close"] },
    ],
  });
  const [first, , third] = report.coachingSignals;
  const confirmed = makeOccurrenceReview(first, first.sourceRefs[0]);
  const countThree =
    MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment(
      [report],
      { reviews: [confirmed] },
    );
  const countTwo =
    MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment(
      [report],
      {
        reviews: [
          confirmed,
          makeOccurrenceReview(third, third.sourceRefs[0], { status: "rejected" }),
        ],
      },
    );

  assert.equal(countThree.interactionCount, 3);
  assert.equal(countTwo.interactionCount, 2);
  assert.equal(countThree.summaryId, countTwo.summaryId);
});

test("existing passive E2 order controls active selection", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "active-order-report",
    date: "2026-08-26",
    interactions: [
      { id: "active-order-a", strengths: ["rapport", "discovery"] },
      { id: "active-order-b", strengths: ["rapport", "discovery"] },
      { id: "active-order-c", strengths: ["discovery"] },
    ],
  });
  const confirmedByStrength = ["rapport", "discovery"].map((strength) => {
    const signal = report.coachingSignals.find((item) =>
      item.id.endsWith(`_${strength}`),
    );
    return makeOccurrenceReview(signal, signal.sourceRefs[0]);
  });
  const passive = MissionIntelligenceSystem.identifyRepeatedSelfAssessments(
    [report],
    { reviews: confirmedByStrength },
  );
  const active =
    MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment(
      [report],
      { reviews: confirmedByStrength },
    );

  assert.equal(passive[0].strength, "discovery");
  assert.equal(active.strength, passive[0].strength);
});

test("active projection is defensively copied and has no external side effects", () => {
  const report = makeRepeatedAssessmentReport({
    reportId: "active-copy-report",
    date: "2026-08-26",
    interactions: [
      { id: "active-copy-a", strengths: ["rapport"] },
      { id: "active-copy-b", strengths: ["rapport"] },
    ],
  });
  const signal = report.coachingSignals[0];
  const reviews = {
    reviews: [makeOccurrenceReview(signal, signal.sourceRefs[0])],
  };
  const state = {
    report,
    reviews,
    profile: { strengths: ["Existing"] },
    guidance: { focus: "Existing guidance" },
    reflection: { entries: ["Existing reflection"] },
  };
  const before = jsonClone(state);

  assert.doesNotThrow(() => {
    const result =
      MissionIntelligenceSystem.identifyActiveRepeatedSelfAssessment(
        [report],
        reviews,
      );
    result.occurrences[0].signalId = "changed";
    result.occurrences[0].sourceRef.artifactId = "changed";
  });

  assert.deepEqual(jsonClone(state), before);
});
