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

test("E1 exclusion is optional and default selection remains unchanged", () => {
  const first = makePersistedCoachingSignal({
    id: "coaching_strength_exclusion-report_first_discovery",
  });
  const second = makePersistedCoachingSignal({
    id: "coaching_strength_exclusion-report_second_rapport",
  });
  const reports = [{ id: "exclusion-report", coachingSignals: [first, second] }];

  const defaultResult = MissionIntelligenceSystem.identifyCoachingSignal(reports);
  const emptyResult = MissionIntelligenceSystem.identifyCoachingSignal(
    reports,
    null,
    { excludeSignalIds: [] },
  );

  assert.equal(defaultResult.signalId, first.id);
  assert.equal(emptyResult.signalId, first.id);
});

test("E1 exclusion skips exact IDs and preserves deterministic scan order", () => {
  const first = makePersistedCoachingSignal({
    id: "coaching_strength_exclusion-order_first_discovery",
  });
  const second = makePersistedCoachingSignal({
    id: "coaching_strength_exclusion-order_second_rapport",
  });
  const third = makePersistedCoachingSignal({
    id: "coaching_strength_exclusion-order_third_presentation",
  });
  const reports = [{ coachingSignals: [first, second, third] }];

  const oneExcluded = MissionIntelligenceSystem.identifyCoachingSignal(
    reports,
    null,
    { excludeSignalIds: new Set([first.id]) },
  );
  const twoExcluded = MissionIntelligenceSystem.identifyCoachingSignal(
    reports,
    null,
    { excludeSignalIds: [first.id, second.id] },
  );

  assert.equal(oneExcluded.signalId, second.id);
  assert.equal(twoExcluded.signalId, third.id);
});

test("E1 exclusion uses exact identity without parsing IDs or insight wording", () => {
  const signal = makePersistedCoachingSignal({
    id: "coaching_strength_exact-report_exact-interaction_discovery",
    insight: "covered-looking wording",
  });
  const reports = [{ coachingSignals: [signal] }];

  const result = MissionIntelligenceSystem.identifyCoachingSignal(
    reports,
    null,
    {
      excludeSignalIds: [
        "discovery",
        "exact-interaction",
        "covered-looking wording",
        `${signal.id}_suffix`,
      ],
    },
  );

  assert.equal(result.signalId, signal.id);
});

test("E1 exclusions compose with existing ownership and review filtering", () => {
  const rejected = makePersistedCoachingSignal({
    id: "coaching_strength_review-exclusion_rejected_discovery",
  });
  const excluded = makePersistedCoachingSignal({
    id: "coaching_strength_review-exclusion_excluded_rapport",
  });
  const eligible = makePersistedCoachingSignal({
    id: "coaching_strength_review-exclusion_eligible_presentation",
  });
  const userCreated = {
    id: "user-created",
    signal: "User-created coaching text",
  };
  const reviews = {
    reviews: [
      makeOccurrenceReview(rejected, rejected.sourceRefs[0], {
        status: "rejected",
      }),
    ],
  };
  const result = MissionIntelligenceSystem.identifyCoachingSignal(
    [{ coachingSignals: [userCreated, rejected, excluded, eligible] }],
    reviews,
    { excludeSignalIds: [excluded.id] },
  );

  assert.equal(result.signalId, eligible.id);
});

test("malformed E1 exclusions fail safely without mutating reports", () => {
  const reports = [{ coachingSignals: [makePersistedCoachingSignal()] }];
  const before = jsonClone(reports);

  for (const excludeSignalIds of [null, 42, {}, [null, 42, {}]]) {
    assert.doesNotThrow(() =>
      MissionIntelligenceSystem.identifyCoachingSignal(reports, null, {
        excludeSignalIds,
      }),
    );
    assert.equal(
      MissionIntelligenceSystem.identifyCoachingSignal(reports, null, {
        excludeSignalIds,
      }).signalId,
      reports[0].coachingSignals[0].id,
    );
  }

  assert.deepEqual(reports, before);
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

function makeBehavioralEvidenceReport({
  reportId = "report-e3",
  reportDate = "2026-08-26",
  reportCreatedAt = "2026-08-26T12:00:00.000Z",
  interactionId = "interaction-e3",
  interactionCreatedAt = "2026-08-26T12:30:00.000Z",
  objections = ["payment"],
  outcomes,
  extras = {},
} = {}) {
  const interaction = {
    id: interactionId,
    createdAt: interactionCreatedAt,
    objections,
    ...extras,
  };
  if (outcomes !== undefined) {
    interaction.salesStepOutcomes = outcomes;
  }
  return {
    id: reportId,
    date: reportDate,
    createdAt: reportCreatedAt,
    customerInteractions: [interaction],
  };
}

function resolvedObjectionOutcome(id = "sales_step_outcome_e3") {
  return {
    id,
    step: "objection-handling",
    performedBy: "commander",
    result: "customer-concern-resolved",
  };
}

function readyTrialCloseOutcome(id = "sales_step_outcome_trial_close") {
  return {
    id,
    step: "trial-close",
    performedBy: "commander",
    result: "customer-expressed-readiness-to-proceed",
  };
}

function sharedDiscoveryOutcome(id = "sales_step_outcome_discovery") {
  return {
    id,
    step: "discovery",
    performedBy: "commander",
    result: "customer-shared-needs-goals",
  };
}

function productSelectionOutcome(id = "sales_step_outcome_product_selection", overrides = {}) {
  return {
    id,
    step: "product-selection",
    performedBy: "commander",
    needRef: { field: "keyNeeds", index: 0 },
    selectedUnitRef: { type: "unit-reference", value: "Model-A" },
    result: "customer-considered-selected-unit",
    ...overrides,
  };
}

function presentationOutcome(id = "sales_step_outcome_presentation", overrides = {}) {
  return {
    id,
    step: "presentation",
    performedBy: "commander",
    needRef: { field: "keyNeeds", index: 0 },
    selectedUnitRef: { type: "unit-reference", value: "Model-A" },
    presentationRef: {
      type: "feature-benefit-reference",
      value: "Double-over-double bunks",
    },
    result: "customer-considered-presented-feature-benefit",
    ...overrides,
  };
}

test("E3 returns empty for no reports and old reports", () => {
  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyBehavioralEvidence()),
    [],
  );
  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyBehavioralEvidence([
        makeBehavioralEvidenceReport(),
      ]),
    ),
    [],
  );
});

test("E3 requires both an objection and a resolved structured event", () => {
  const fixtures = [
    makeBehavioralEvidenceReport({ objections: ["payment"], outcomes: [] }),
    makeBehavioralEvidenceReport({
      objections: [],
      outcomes: [resolvedObjectionOutcome()],
    }),
    makeBehavioralEvidenceReport({
      objections: ["", "  "],
      outcomes: [resolvedObjectionOutcome()],
    }),
  ];

  for (const report of fixtures) {
    assert.deepEqual(
      jsonClone(
        MissionIntelligenceSystem.identifyBehavioralEvidence([report]),
      ),
      [],
    );
  }
});

test("E3 rejects the wrong step, performer, and every non-qualifying result", () => {
  const variants = [
    { ...resolvedObjectionOutcome(), step: "trial-close" },
    { ...resolvedObjectionOutcome(), performedBy: "customer" },
    { ...resolvedObjectionOutcome(), result: "customer-concern-partially-resolved" },
    { ...resolvedObjectionOutcome(), result: "customer-concern-unresolved" },
    { ...resolvedObjectionOutcome(), result: "unknown" },
  ];

  for (const outcome of variants) {
    const report = makeBehavioralEvidenceReport({ outcomes: [outcome] });
    assert.deepEqual(
      jsonClone(
        MissionIntelligenceSystem.identifyBehavioralEvidence([report]),
      ),
      [],
    );
  }
});

test("exact structured combination returns the canonical E3 projection", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report-source",
    interactionId: "interaction-source",
    outcomes: [resolvedObjectionOutcome("outcome-source")],
  });
  const result = MissionIntelligenceSystem.identifyBehavioralEvidence([report]);

  assert.deepEqual(jsonClone(result), [
    {
      type: "field-report-behavioral-evidence",
      evidenceTier: "E3",
      evidenceId:
        "behavioral_evidence_report-source_interaction-source_outcome-source",
      sourceFingerprint:
        'behavioral_evidence_source_v1:{"objections":["payment"],"outcomeEntryId":"outcome-source","step":"objection-handling","performedBy":"commander","result":"customer-concern-resolved"}',
      competency: "objection-handling",
      label: "Objection Handling",
      insight:
        "This interaction records an objection, an Objection Handling step you reported performing, and a resolved customer concern. That outcome is consistent with effective Objection Handling in this interaction.",
      source: "fieldReportStructuredOutcome",
      sourceRef: {
        artifactId: "report-source",
        subType: "customerInteraction",
        subId: "interaction-source",
      },
      evidenceRefs: [
        { field: "objections" },
        { field: "salesStepOutcomes", entryId: "outcome-source" },
      ],
      latestReviewStatus: "unreviewed",
      latestReviewId: null,
      reviewedAt: null,
      latestReviewCorrectedCompetency: null,
      latestReviewNote: null,
    },
  ]);
  assert.doesNotMatch(
    result[0].insight,
    /demonstrated|verified|proven|caused|stable strength/i,
  );
});

test("E3 identity uses complete canonical source IDs without parsing them", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report_with_parts",
    interactionId: "interaction_with_parts",
    outcomes: [resolvedObjectionOutcome("outcome_with_parts")],
  });
  const [projection] =
    MissionIntelligenceSystem.identifyBehavioralEvidence([report]);

  assert.equal(
    projection.evidenceId,
    "behavioral_evidence_report_with_parts_interaction_with_parts_outcome_with_parts",
  );
  assert.equal(projection.sourceRef.artifactId, "report_with_parts");
  assert.equal(projection.sourceRef.subId, "interaction_with_parts");
  assert.equal(projection.evidenceRefs[1].entryId, "outcome_with_parts");
});

test("E3 skips malformed reports, interactions, outcomes, and IDs safely", () => {
  const malformed = [
    null,
    {},
    { id: "report", customerInteractions: null },
    { id: "report", customerInteractions: [null] },
    makeBehavioralEvidenceReport({ interactionId: "", outcomes: [resolvedObjectionOutcome()] }),
    makeBehavioralEvidenceReport({ outcomes: [null, {}, resolvedObjectionOutcome("")] }),
    makeBehavioralEvidenceReport({ outcomes: "not-an-array" }),
  ];

  assert.doesNotThrow(() =>
    MissionIntelligenceSystem.identifyBehavioralEvidence(malformed),
  );
  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyBehavioralEvidence(malformed)),
    [],
  );
});

test("duplicate E3 identity is projected once with stable source order", () => {
  const duplicate = resolvedObjectionOutcome("outcome-duplicate");
  const report = makeBehavioralEvidenceReport({
    outcomes: [duplicate, { ...duplicate }],
  });
  const result = MissionIntelligenceSystem.identifyBehavioralEvidence([report]);

  assert.equal(result.length, 1);
  assert.equal(result[0].evidenceRefs[1].entryId, "outcome-duplicate");
});

test("E3 ordering is newest report, newest interaction, then source event order", () => {
  const older = makeBehavioralEvidenceReport({
    reportId: "report-older",
    reportDate: "2026-08-25",
    interactionId: "interaction-older",
    outcomes: [resolvedObjectionOutcome("outcome-older")],
  });
  const newer = {
    id: "report-newer",
    date: "2026-08-26",
    createdAt: "2026-08-26T12:00:00.000Z",
    customerInteractions: [
      {
        id: "interaction-newer-a",
        createdAt: "2026-08-26T13:00:00.000Z",
        objections: ["payment"],
        salesStepOutcomes: [
          resolvedObjectionOutcome("outcome-a-first"),
          resolvedObjectionOutcome("outcome-a-second"),
        ],
      },
      {
        id: "interaction-newer-b",
        createdAt: "2026-08-26T14:00:00.000Z",
        objections: ["trade"],
        salesStepOutcomes: [resolvedObjectionOutcome("outcome-b")],
      },
    ],
  };
  const ids = MissionIntelligenceSystem.identifyBehavioralEvidence([
    newer,
    older,
  ]).map((item) => item.evidenceRefs[1].entryId);

  assert.deepEqual(jsonClone(ids), [
    "outcome-b",
    "outcome-a-first",
    "outcome-a-second",
    "outcome-older",
  ]);
});

test("E3 output and nested provenance are defensive copies", () => {
  const report = makeBehavioralEvidenceReport({
    outcomes: [resolvedObjectionOutcome("outcome-copy")],
  });
  const before = jsonClone(report);
  const [projection] =
    MissionIntelligenceSystem.identifyBehavioralEvidence([report]);

  projection.sourceRef.artifactId = "changed";
  projection.evidenceRefs[0].field = "changed";
  projection.evidenceRefs[1].entryId = "changed";
  projection.insight = "changed";

  assert.deepEqual(jsonClone(report), before);
});

test("E3 cannot be inferred from free text or E1 and E2 signal fields", () => {
  const report = makeBehavioralEvidenceReport({
    outcomes: undefined,
    extras: {
      explicitStrengths: ["objection-handling"],
      notableMoment: "I resolved the objection",
      buyerContext: "Resolved concern",
    },
  });
  report.notes = "Objection Handling succeeded";
  report.dailyCore = { keyLearning: "I resolved a concern" };
  report.learningSignals = [{ learning: "Resolved objection" }];
  report.coachingSignals = [{ signal: "Objection Handling strength" }];

  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyBehavioralEvidence([report])),
    [],
  );
});

test("E3 projection has no persistence or Profile, Guidance, Reflection effects", () => {
  const report = makeBehavioralEvidenceReport({
    outcomes: [resolvedObjectionOutcome("outcome-side-effects")],
  });
  const state = {
    report,
    profile: { strengths: ["Existing"] },
    guidance: { focus: "Existing guidance" },
    reflection: { entries: ["Existing reflection"] },
  };
  const before = jsonClone(state);

  assert.doesNotThrow(() =>
    MissionIntelligenceSystem.identifyBehavioralEvidence([report]),
  );
  assert.deepEqual(jsonClone(state), before);
  assert.equal(Object.hasOwn(report, "behavioralEvidence"), false);
});

test("performed Trial Close plus readiness returns the exact E3 projection", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report-trial-close",
    interactionId: "interaction-trial-close",
    objections: undefined,
    outcomes: [readyTrialCloseOutcome("outcome-trial-close")],
  });
  const result = MissionIntelligenceSystem.identifyBehavioralEvidence([report]);

  assert.deepEqual(jsonClone(result), [
    {
      type: "field-report-behavioral-evidence",
      evidenceTier: "E3",
      evidenceId:
        "behavioral_evidence_report-trial-close_interaction-trial-close_outcome-trial-close",
      sourceFingerprint:
        'behavioral_evidence_source_v1:{"outcomeEntryId":"outcome-trial-close","step":"trial-close","performedBy":"commander","result":"customer-expressed-readiness-to-proceed"}',
      competency: "trial-close",
      label: "Trial Close",
      insight:
        "This interaction records a Trial Close you reported performing and a customer response expressing readiness to proceed. That response is consistent with effective Trial Close use in this interaction.",
      source: "fieldReportStructuredOutcome",
      sourceRef: {
        artifactId: "report-trial-close",
        subType: "customerInteraction",
        subId: "interaction-trial-close",
      },
      evidenceRefs: [
        { field: "salesStepOutcomes", entryId: "outcome-trial-close" },
      ],
      latestReviewStatus: "unreviewed",
      latestReviewId: null,
      reviewedAt: null,
      latestReviewCorrectedCompetency: null,
      latestReviewNote: null,
    },
  ]);
  assert.doesNotMatch(
    result[0].insight,
    /caused|successfully closed|demonstrated|verified|strength/i,
  );
});

test("nonqualifying Trial Close results remain raw without E3", () => {
  for (const result of [
    "customer-expressed-not-ready-to-proceed",
    "customer-declined-to-proceed",
    "customer-response-unclear",
  ]) {
    const outcome = { ...readyTrialCloseOutcome(), result };
    assert.deepEqual(
      jsonClone(
        MissionIntelligenceSystem.identifyBehavioralEvidence([
          makeBehavioralEvidenceReport({ outcomes: [outcome] }),
        ]),
      ),
      [],
    );
  }
});

test("Trial Close E3 rejects wrong performer, wrong step, and malformed event", () => {
  for (const outcome of [
    { ...readyTrialCloseOutcome(), performedBy: "salesperson" },
    { ...readyTrialCloseOutcome(), step: "presentation" },
    { ...readyTrialCloseOutcome(), id: "" },
    null,
  ]) {
    assert.deepEqual(
      jsonClone(
        MissionIntelligenceSystem.identifyBehavioralEvidence([
          makeBehavioralEvidenceReport({ outcomes: [outcome] }),
        ]),
      ),
      [],
    );
  }
});

test("Trial Close fingerprint is stable, opaque, and ignores objections", () => {
  const outcome = readyTrialCloseOutcome("outcome-fingerprint-trial");
  const firstInteraction = { objections: ["payment"] };
  const secondInteraction = { objections: ["trade", "timing"] };
  const first =
    MissionIntelligenceSystem.buildBehavioralEvidenceSourceFingerprint(
      firstInteraction,
      outcome,
    );
  const second =
    MissionIntelligenceSystem.buildBehavioralEvidenceSourceFingerprint(
      secondInteraction,
      { ...outcome },
    );

  assert.equal(first, second);
  assert.equal(
    first,
    'behavioral_evidence_source_v1:{"outcomeEntryId":"outcome-fingerprint-trial","step":"trial-close","performedBy":"commander","result":"customer-expressed-readiness-to-proceed"}',
  );
  assert.match(first, /^behavioral_evidence_source_v1:/);
});

test("every Trial Close fingerprint source field changes the fingerprint", () => {
  const interaction = {};
  const outcome = readyTrialCloseOutcome("outcome-fingerprint-trial");
  const base =
    MissionIntelligenceSystem.buildBehavioralEvidenceSourceFingerprint(
      interaction,
      outcome,
    );
  for (const variant of [
    { ...outcome, id: "different-outcome" },
    { ...outcome, step: "trial-close-other" },
    { ...outcome, performedBy: "other" },
    { ...outcome, result: "customer-response-unclear" },
  ]) {
    assert.notEqual(
      MissionIntelligenceSystem.buildBehavioralEvidenceSourceFingerprint(
        interaction,
        variant,
      ),
      base,
    );
  }
});

test("Trial Close E3 dedupes identity and preserves deterministic event order", () => {
  const first = readyTrialCloseOutcome("trial-first");
  const second = readyTrialCloseOutcome("trial-second");
  const report = makeBehavioralEvidenceReport({
    outcomes: [first, { ...first }, second],
  });
  const results = MissionIntelligenceSystem.identifyBehavioralEvidence([report]);

  assert.deepEqual(
    jsonClone(results.map((item) => item.evidenceRefs[0].entryId)),
    ["trial-first", "trial-second"],
  );
});

test("Trial Close E3 is not inferred from strengths, notes, or notable moments", () => {
  const report = makeBehavioralEvidenceReport({
    outcomes: undefined,
    extras: {
      explicitStrengths: ["trial-close"],
      notableMoment: "The customer was ready to proceed",
    },
  });
  report.notes = "I performed a successful Trial Close";

  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyBehavioralEvidence([report])),
    [],
  );
});

test("performed Discovery plus shared needs and goals returns exact E3", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report-discovery",
    interactionId: "interaction-discovery",
    objections: undefined,
    outcomes: [sharedDiscoveryOutcome("outcome-discovery")],
  });
  const [result] =
    MissionIntelligenceSystem.identifyBehavioralEvidence([report]);

  assert.equal(result.evidenceTier, "E3");
  assert.equal(result.competency, "discovery");
  assert.equal(result.label, "Discovery");
  assert.equal(
    result.sourceFingerprint,
    'behavioral_evidence_source_v1:{"outcomeEntryId":"outcome-discovery","step":"discovery","performedBy":"commander","result":"customer-shared-needs-goals"}',
  );
  assert.deepEqual(jsonClone(result.evidenceRefs), [
    { field: "salesStepOutcomes", entryId: "outcome-discovery" },
  ]);
  assert.match(result.insight, /questions.*sharing needs and goals/i);
  assert.doesNotMatch(result.insight, /caused|verified|strength/i);
});

test("other canonical Discovery responses remain raw without E3", () => {
  for (const result of [
    "customer-shared-limited-information",
    "customer-declined-to-share",
    "customer-response-unclear",
  ]) {
    const outcome = { ...sharedDiscoveryOutcome(), result };
    assert.deepEqual(
      jsonClone(
        MissionIntelligenceSystem.identifyBehavioralEvidence([
          makeBehavioralEvidenceReport({
            objections: undefined,
            outcomes: [outcome],
          }),
        ]),
      ),
      [],
    );
  }
});

test("Discovery E3 rejects inference and malformed authority", () => {
  for (const outcome of [
    { ...sharedDiscoveryOutcome(), performedBy: "system" },
    { ...sharedDiscoveryOutcome(), step: "needs-analysis" },
    { ...sharedDiscoveryOutcome(), id: "" },
  ]) {
    assert.deepEqual(
      jsonClone(
        MissionIntelligenceSystem.identifyBehavioralEvidence([
          makeBehavioralEvidenceReport({ objections: undefined, outcomes: [outcome] }),
        ]),
      ),
      [],
    );
  }

  const textOnly = makeBehavioralEvidenceReport({
    objections: undefined,
    outcomes: undefined,
    extras: {
      explicitStrengths: ["discovery"],
      notableMoment: "The customer shared needs and goals",
    },
  });
  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyBehavioralEvidence([textOnly])),
    [],
  );
});

test("Product Selection requires exact same-interaction linkage for E3", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report-product-selection",
    interactionId: "interaction-product-selection",
    objections: undefined,
    extras: { keyNeeds: ["sleeping capacity"] },
    outcomes: [productSelectionOutcome("outcome-product-selection")],
  });
  const [evidence] = MissionIntelligenceSystem.identifyBehavioralEvidence([report]);
  assert.equal(evidence.competency, "product-selection");
  assert.equal(evidence.label, "Product Selection");
  assert.deepEqual(jsonClone(evidence.evidenceRefs), [
    { field: "salesStepOutcomes", entryId: "outcome-product-selection" },
  ]);

  for (const outcome of [
    productSelectionOutcome("missing-need", { needRef: null }),
    productSelectionOutcome("wrong-index", { needRef: { field: "keyNeeds", index: 9 } }),
    productSelectionOutcome("wrong-field", { needRef: { field: "customerGoal", index: 0 } }),
    productSelectionOutcome("unsafe-unit", { selectedUnitRef: { type: "unit-reference", value: "1HGCM82633A004352" } }),
    productSelectionOutcome("wrong-step", { step: "discovery" }),
  ]) {
    const malformed = makeBehavioralEvidenceReport({
      objections: undefined,
      extras: { keyNeeds: ["sleeping capacity"] },
      outcomes: [outcome],
    });
    assert.deepEqual(
      jsonClone(MissionIntelligenceSystem.identifyBehavioralEvidence([malformed])),
      [],
    );
  }
});

test("Product Selection neutral non-considered results remain raw without E3", () => {
  for (const result of [
    "customer-requested-different-option",
    "selected-unit-unavailable",
    "customer-response-unclear",
  ]) {
    const report = makeBehavioralEvidenceReport({
      objections: undefined,
      extras: { keyNeeds: ["sleeping capacity"] },
      outcomes: [productSelectionOutcome("raw-product-selection", { result })],
    });
    assert.deepEqual(
      jsonClone(MissionIntelligenceSystem.identifyBehavioralEvidence([report])),
      [],
    );
  }
});

test("Presentation E3 requires exact bounded same-interaction linkage", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report-presentation",
    interactionId: "interaction-presentation",
    objections: undefined,
    extras: { keyNeeds: ["sleeping capacity"] },
    outcomes: [presentationOutcome("outcome-presentation")],
  });
  const [evidence] = MissionIntelligenceSystem.identifyBehavioralEvidence([report]);

  assert.equal(evidence.competency, "presentation");
  assert.equal(evidence.label, "Presentation");
  assert.deepEqual(jsonClone(evidence.evidenceRefs), [
    { field: "salesStepOutcomes", entryId: "outcome-presentation" },
  ]);
  assert.doesNotMatch(evidence.insight, /effective|successful|persuasive|verified|proven/i);

  for (const outcome of [
    presentationOutcome("missing-need", { needRef: null }),
    presentationOutcome("wrong-index", { needRef: { field: "keyNeeds", index: 9 } }),
    presentationOutcome("wrong-field", { needRef: { field: "customerGoal", index: 0 } }),
    presentationOutcome("wrong-performer", { performedBy: "system" }),
    presentationOutcome("unsafe-unit", { selectedUnitRef: { type: "unit-reference", value: "1HGCM82633A004352" } }),
    presentationOutcome("wrong-unit-type", { selectedUnitRef: { type: "inventory-id", value: "Model A" } }),
    presentationOutcome("unsafe-feature", { presentationRef: { type: "feature-benefit-reference", value: "buyer@example.com" } }),
    presentationOutcome("wrong-feature-type", { presentationRef: { type: "feature", value: "Bunks" } }),
    presentationOutcome("wrong-result", { result: "successful-presentation" }),
    presentationOutcome("wrong-step", { step: "product-selection" }),
  ]) {
    const malformed = makeBehavioralEvidenceReport({
      objections: undefined,
      extras: { keyNeeds: ["sleeping capacity"] },
      outcomes: [outcome],
    });
    assert.deepEqual(
      jsonClone(MissionIntelligenceSystem.identifyBehavioralEvidence([malformed])),
      [],
      outcome.id,
    );
  }
});

test("all four neutral Presentation results qualify as bounded E3 occurrences", () => {
  for (const result of [
    "customer-considered-presented-feature-benefit",
    "customer-requested-more-detail",
    "customer-preferred-different-feature-benefit",
    "customer-response-unclear",
  ]) {
    const report = makeBehavioralEvidenceReport({
      objections: undefined,
      extras: { keyNeeds: ["sleeping capacity"] },
      outcomes: [presentationOutcome(`outcome-${result}`, { result })],
    });
    const [evidence] = MissionIntelligenceSystem.identifyBehavioralEvidence([report]);
    assert.equal(evidence.competency, "presentation");
  }
});

test("Presentation active E3 requires an exact current Commander review", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report-active-presentation",
    interactionId: "interaction-active-presentation",
    objections: undefined,
    extras: { keyNeeds: ["sleeping capacity"] },
    outcomes: [presentationOutcome("outcome-active-presentation")],
  });
  const review = makeBehavioralEvidenceReview(report, {
    id: "behavioral-review-active-presentation",
  });

  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence([report], null),
    null,
  );
  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence([report], {
      reviews: [{ ...review, sourceFingerprint: "stale" }],
    }),
    null,
  );
  const active = MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
    [report],
    { reviews: [review] },
  );
  assert.equal(active.competency, "presentation");
  assert.equal(active.latestReviewId, "behavioral-review-active-presentation");
});

function makeBehavioralEvidenceReview(report, overrides = {}) {
  const [evidence] =
    MissionIntelligenceSystem.identifyBehavioralEvidence([report]);
  return {
    id: `behavioral-review-${evidence.evidenceId}`,
    evidenceId: evidence.evidenceId,
    sourceRef: jsonClone(evidence.sourceRef),
    outcomeEntryId: evidence.evidenceRefs.find(
      (ref) => ref.field === "salesStepOutcomes",
    ).entryId,
    sourceFingerprint: evidence.sourceFingerprint,
    originalInsight: evidence.insight,
    originalCompetency: evidence.competency,
    status: "confirmed-as-recorded",
    correctedCompetency: null,
    note: null,
    reviewedAt: "2026-08-26T15:00:00.000Z",
    supersedesReviewId: null,
    ...overrides,
  };
}

test("active E3 returns null without exact confirmed current evidence", () => {
  const report = makeBehavioralEvidenceReport({
    outcomes: [resolvedObjectionOutcome("outcome-active-gate")],
  });

  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence([], null),
    null,
  );
  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence([report], null),
    null,
  );
  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
      [report],
      { reviews: [] },
    ),
    null,
  );
});

test("exact confirmed current E3 returns the canonical active projection", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report-active",
    interactionId: "interaction-active",
    outcomes: [resolvedObjectionOutcome("outcome-active")],
  });
  const review = makeBehavioralEvidenceReview(report, {
    id: "behavioral-review-active",
    reviewedAt: "2026-08-26T16:00:00.000Z",
  });
  const active = MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
    [report],
    { reviews: [review] },
  );

  assert.deepEqual(jsonClone(active), {
    type: "active-behavioral-evidence",
    evidenceTier: "E3",
    activeIdentity: active.activeIdentity,
    evidenceId:
      "behavioral_evidence_report-active_interaction-active_outcome-active",
    competency: "objection-handling",
    label: "Objection Handling",
    insight:
      "This interaction records an objection, an Objection Handling step you reported performing, and a resolved customer concern. That outcome is consistent with effective Objection Handling in this interaction.",
    followUpPrompt:
      "What stands out to you about how that interaction unfolded?",
    source: "fieldReportStructuredOutcome",
    sourceFingerprint: review.sourceFingerprint,
    sourceRef: {
      artifactId: "report-active",
      subType: "customerInteraction",
      subId: "interaction-active",
    },
    evidenceRefs: [
      { field: "objections" },
      { field: "salesStepOutcomes", entryId: "outcome-active" },
    ],
    latestReviewId: "behavioral-review-active",
    reviewedAt: "2026-08-26T16:00:00.000Z",
  });
  assert.doesNotMatch(
    `${active.insight} ${active.followUpPrompt}`,
    /demonstrated|verified|proven|caused|good at|strength/i,
  );
});

test("corrected and rejected E3 never become active", () => {
  const report = makeBehavioralEvidenceReport({
    outcomes: [resolvedObjectionOutcome("outcome-active-review-state")],
  });
  for (const status of ["corrected", "rejected"]) {
    const review = makeBehavioralEvidenceReview(report, {
      status,
      correctedCompetency: status === "corrected" ? "discovery" : null,
      note: "Reviewed differently.",
    });
    assert.equal(
      MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
        [report],
        { reviews: [review] },
      ),
      null,
    );
  }
});

test("active E3 fails closed for every stale review identity field", () => {
  const report = makeBehavioralEvidenceReport({
    outcomes: [resolvedObjectionOutcome("outcome-active-identity")],
  });
  const review = makeBehavioralEvidenceReview(report);
  const staleReviews = [
    { ...review, evidenceId: "wrong-evidence" },
    {
      ...review,
      sourceRef: { ...review.sourceRef, subId: "wrong-interaction" },
    },
    { ...review, outcomeEntryId: "wrong-outcome" },
    { ...review, sourceFingerprint: "wrong-fingerprint" },
  ];

  for (const staleReview of staleReviews) {
    assert.equal(
      MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
        [report],
        { reviews: [staleReview] },
      ),
      null,
    );
  }
});

test("active identity is exact FNV-1a 64, stable, storage-safe, and opaque", () => {
  const known =
    MissionIntelligenceSystem.buildBehavioralEvidenceActiveIdentity(
      "evidence-id",
      "fingerprint",
    );
  assert.equal(
    known,
    "behavioral_evidence_active_v1_39c316d1ab44928f",
  );
  assert.match(known, /^behavioral_evidence_active_v1_[0-9a-f]{16}$/);
  assert.match(known, /^[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(known, /fingerprint|\{|\}|:|\s/);
  assert.equal(
    MissionIntelligenceSystem.buildBehavioralEvidenceActiveIdentity(
      "evidence-id",
      "fingerprint",
    ),
    known,
  );
  assert.notEqual(
    MissionIntelligenceSystem.buildBehavioralEvidenceActiveIdentity(
      "different-evidence-id",
      "fingerprint",
    ),
    known,
  );
  assert.notEqual(
    MissionIntelligenceSystem.buildBehavioralEvidenceActiveIdentity(
      "evidence-id",
      "different-fingerprint",
    ),
    known,
  );
});

test("active identity does not depend on source array position or ID parsing", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report_with_parts",
    interactionId: "interaction_with_parts",
    outcomes: [resolvedObjectionOutcome("outcome_with_parts")],
  });
  const review = makeBehavioralEvidenceReview(report);
  const first = MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
    [report],
    { reviews: [review] },
  );
  const moved = jsonClone(report);
  moved.customerInteractions[0].salesStepOutcomes.unshift({
    id: "ignored-outcome",
    step: "objection-handling",
    performedBy: "commander",
    result: "unknown",
  });
  const second = MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
    [moved],
    { reviews: [review] },
  );

  assert.equal(first.activeIdentity, second.activeIdentity);
  assert.equal(first.sourceRef.artifactId, "report_with_parts");
  assert.equal(first.sourceRef.subId, "interaction_with_parts");
  assert.equal(first.competency, "objection-handling");
});

test("material source edit detaches readiness until newly confirmed", () => {
  const original = makeBehavioralEvidenceReport({
    objections: ["payment"],
    outcomes: [resolvedObjectionOutcome("outcome-active-lifecycle")],
  });
  const originalReview = makeBehavioralEvidenceReview(original);
  const originalActive =
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
      [original],
      { reviews: [originalReview] },
    );
  const changed = jsonClone(original);
  changed.customerInteractions[0].objections = ["trade value"];

  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
      [changed],
      { reviews: [originalReview] },
    ),
    null,
  );
  const changedReview = makeBehavioralEvidenceReview(changed, {
    id: "behavioral-review-changed-source",
  });
  const changedActive =
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
      [changed],
      { reviews: [originalReview, changedReview] },
    );
  const repeatedActive =
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
      [jsonClone(changed)],
      { reviews: [originalReview, changedReview] },
    );

  assert.ok(changedActive);
  assert.notEqual(changedActive.activeIdentity, originalActive.activeIdentity);
  assert.equal(changedActive.activeIdentity, repeatedActive.activeIdentity);

  const nonqualifying = jsonClone(changed);
  nonqualifying.customerInteractions[0].salesStepOutcomes[0].result =
    "customer-concern-unresolved";
  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
      [nonqualifying],
      { reviews: [originalReview, changedReview] },
    ),
    null,
  );
});

test("active E3 selection reuses passive ordering and picks newest eligible", () => {
  const older = makeBehavioralEvidenceReport({
    reportId: "report-active-older",
    reportDate: "2026-08-25",
    interactionId: "interaction-active-older",
    outcomes: [resolvedObjectionOutcome("outcome-active-older")],
  });
  const newer = makeBehavioralEvidenceReport({
    reportId: "report-active-newer",
    reportDate: "2026-08-26",
    interactionId: "interaction-active-newer",
    outcomes: [resolvedObjectionOutcome("outcome-active-newer")],
  });
  const reviews = [
    makeBehavioralEvidenceReview(older),
    makeBehavioralEvidenceReview(newer),
  ];
  const passiveIds = MissionIntelligenceSystem.identifyBehavioralEvidence(
    [newer, older],
    { reviews },
  ).map((item) => item.evidenceId);
  const active = MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
    [newer, older],
    { reviews },
  );

  assert.equal(active.evidenceId, passiveIds[0]);
  assert.equal(active.evidenceId.includes("report-active-newer"), true);
});

test("active E3 is defensively copied and has no external side effects", () => {
  const report = makeBehavioralEvidenceReport({
    outcomes: [resolvedObjectionOutcome("outcome-active-copy")],
  });
  const reviews = { reviews: [makeBehavioralEvidenceReview(report)] };
  const passive = MissionIntelligenceSystem.identifyBehavioralEvidence(
    [report],
    reviews,
  );
  const state = {
    report,
    reviews,
    passive,
    profile: { strengths: ["Existing"] },
    guidance: { focus: "Existing guidance" },
    reflection: { entries: ["Existing reflection"] },
  };
  const before = jsonClone(state);
  const active = MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
    [report],
    reviews,
  );

  active.sourceRef.artifactId = "changed";
  active.evidenceRefs[0].field = "changed";
  active.insight = "changed";
  assert.deepEqual(jsonClone(state), before);
  assert.equal(Object.hasOwn(report, "activeBehavioralEvidence"), false);
});

test("canonical E3 linkage returns only the exact same-interaction E1 ID", () => {
  const exactId =
    "coaching_strength_report-link_interaction-link_objection-handling";
  const report = {
    id: "report-link",
    coachingSignals: [
      {
        id: exactId,
        sourceRefs: [
          {
            artifactId: "report-link",
            subType: "customerInteraction",
            subId: "interaction-link",
          },
        ],
      },
      {
        id: "coaching_strength_report-link_other-objection-handling",
        sourceRefs: [
          {
            artifactId: "report-link",
            subType: "customerInteraction",
            subId: "other",
          },
        ],
      },
    ],
  };

  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyLinkedCoachingSignalIds([report], {
        sourceRef: {
          artifactId: "report-link",
          subType: "customerInteraction",
          subId: "interaction-link",
        },
        competency: "objection-handling",
      }),
    ),
    [exactId],
  );
});

test("canonical E3 linkage does not match different interaction or competency", () => {
  const report = {
    id: "report-link",
    coachingSignals: [
      {
        id: "coaching_strength_report-link_interaction-other_objection-handling",
        sourceRefs: [
          {
            artifactId: "report-link",
            subType: "customerInteraction",
            subId: "interaction-other",
          },
        ],
      },
      {
        id: "coaching_strength_report-link_interaction-link_rapport",
        sourceRefs: [
          {
            artifactId: "report-link",
            subType: "customerInteraction",
            subId: "interaction-link",
          },
        ],
      },
    ],
  };

  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyLinkedCoachingSignalIds([report], {
        sourceRef: {
          artifactId: "report-link",
          subType: "customerInteraction",
          subId: "interaction-link",
        },
        competency: "objection-handling",
      }),
    ),
    [],
  );
});

test("canonical E3 linkage is read-only and fails safely", () => {
  const reports = [{ id: "report-link", coachingSignals: [] }];
  const before = jsonClone(reports);

  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyLinkedCoachingSignalIds(reports, null),
    ),
    [],
  );
  assert.deepEqual(reports, before);
});

test("confirmed Trial Close reuses active readiness while corrected and rejected stay inactive", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report-active-trial",
    interactionId: "interaction-active-trial",
    objections: undefined,
    outcomes: [readyTrialCloseOutcome("outcome-active-trial")],
  });
  const confirmed = makeBehavioralEvidenceReview(report, {
    id: "review-active-trial-confirmed",
  });
  const active = MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
    [report],
    { reviews: [confirmed] },
  );

  assert.ok(active);
  assert.equal(active.competency, "trial-close");
  assert.equal(active.label, "Trial Close");
  assert.match(active.activeIdentity, /^behavioral_evidence_active_v1_/);

  for (const status of ["corrected", "rejected"]) {
    const review = {
      ...confirmed,
      id: `review-active-trial-${status}`,
      status,
      correctedCompetency: status === "corrected" ? "presentation" : null,
      reviewedAt: "2026-08-26T16:00:00.000Z",
    };
    assert.equal(
      MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
        [report],
        { reviews: [confirmed, review] },
      ),
      null,
    );
  }
});

test("Discovery E3 becomes active only after an exact current Commander review", () => {
  const report = makeBehavioralEvidenceReport({
    reportId: "report-active-discovery",
    interactionId: "interaction-active-discovery",
    objections: undefined,
    outcomes: [sharedDiscoveryOutcome("outcome-active-discovery")],
  });

  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence([report], {
      reviews: [],
    }),
    null,
  );

  const confirmed = makeBehavioralEvidenceReview(report, {
    id: "review-active-discovery-confirmed",
  });
  const active = MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
    [report],
    { reviews: [confirmed] },
  );
  assert.equal(active.competency, "discovery");
  assert.equal(active.label, "Discovery");

  const stale = { ...confirmed, sourceFingerprint: "stale" };
  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence([report], {
      reviews: [stale],
    }),
    null,
  );
});

function makeRecurringPatternFixture({
  competency = "objection-handling",
  count = 3,
  reportPrefix = "pattern-report",
  interactionPrefix = "pattern-interaction",
  outcomePrefix = "pattern-outcome",
  reviewedAtPrefix = "2026-08-26T15:00:0",
} = {}) {
  const reports = [];
  const reviews = [];
  for (let index = 0; index < count; index += 1) {
    const outcome =
      competency === "trial-close"
        ? readyTrialCloseOutcome(`${outcomePrefix}-${index + 1}`)
        : competency === "discovery"
          ? sharedDiscoveryOutcome(`${outcomePrefix}-${index + 1}`)
          : competency === "product-selection"
            ? productSelectionOutcome(`${outcomePrefix}-${index + 1}`)
            : competency === "presentation"
              ? presentationOutcome(`${outcomePrefix}-${index + 1}`)
              : resolvedObjectionOutcome(`${outcomePrefix}-${index + 1}`);
    const report = makeBehavioralEvidenceReport({
      reportId: `${reportPrefix}-${index + 1}`,
      reportDate: `2026-08-${String(20 + index).padStart(2, "0")}`,
      reportCreatedAt: `2026-08-${String(20 + index).padStart(2, "0")}T12:00:00.000Z`,
      interactionId: `${interactionPrefix}-${index + 1}`,
      interactionCreatedAt: `2026-08-${String(20 + index).padStart(2, "0")}T13:00:00.000Z`,
      objections:
        competency === "objection-handling" ? ["payment"] : undefined,
      extras:
        ["product-selection", "presentation"].includes(competency)
          ? { keyNeeds: ["sleeping capacity"] }
          : {},
      outcomes: [outcome],
    });
    reports.push(report);
    reviews.push(
      makeBehavioralEvidenceReview(report, {
        id: `pattern-review-${competency}-${index + 1}`,
        reviewedAt: `${reviewedAtPrefix}${index}.000Z`,
      }),
    );
  }
  return { reports, reviews };
}

test("Presentation uses the generic E4 threshold without Profile mutation", () => {
  const one = makeRecurringPatternFixture({ competency: "presentation", count: 1 });
  assert.deepEqual(
    jsonClone(MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      one.reports,
      { reviews: one.reviews },
    )),
    [],
  );

  const three = makeRecurringPatternFixture({ competency: "presentation", count: 3 });
  const [pattern] = MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
    three.reports,
    { reviews: three.reviews },
  );
  assert.equal(pattern.competency, "presentation");
  assert.equal(pattern.interactionCount, 3);
  assert.equal(pattern.latestPatternReviewStatus, "unreviewed");
  assert.equal(
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      three.reports,
      { reviews: three.reviews },
      { reviews: [] },
    ).length,
    0,
  );
});

test("E4 threshold requires three current confirmed independent E3s", () => {
  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyRecurringBehavioralPatterns([], null),
    ),
    [],
  );
  for (const count of [1, 2]) {
    const fixture = makeRecurringPatternFixture({ count });
    assert.deepEqual(
      jsonClone(
        MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
          fixture.reports,
          { reviews: fixture.reviews },
        ),
      ),
      [],
    );
  }
  for (const count of [3, 4]) {
    const fixture = makeRecurringPatternFixture({ count });
    const [pattern] =
      MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
        fixture.reports,
        { reviews: fixture.reviews },
      );
    assert.equal(pattern.interactionCount, count);
  }
});

test("Discovery uses the unchanged generic E4 threshold", () => {
  const one = makeRecurringPatternFixture({ competency: "discovery", count: 1 });
  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
        one.reports,
        { reviews: one.reviews },
      ),
    ),
    [],
  );

  const three = makeRecurringPatternFixture({
    competency: "discovery",
    count: 3,
  });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      three.reports,
      { reviews: three.reviews },
    );
  assert.equal(pattern.evidenceTier, "E4");
  assert.equal(pattern.competency, "discovery");
  assert.equal(pattern.interactionCount, 3);
});

test("E4 projection has the exact authority-safe shape and provenance", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    );

  assert.equal(pattern.type, "recurring-behavioral-pattern");
  assert.equal(pattern.evidenceTier, "E4");
  assert.equal(pattern.patternId, "behavioral_pattern_objection-handling");
  assert.match(
    pattern.patternVersionIdentity,
    /^behavioral_pattern_version_v1_[0-9a-f]{16}$/,
  );
  assert.equal(pattern.competency, "objection-handling");
  assert.equal(pattern.label, "Objection Handling");
  assert.equal(pattern.interactionCount, 3);
  assert.equal(pattern.reportCount, 3);
  assert.equal(
    pattern.insight,
    "Across 3 Commander-reviewed interaction records, the available evidence is consistent with effective Objection Handling recurring across those interactions.",
  );
  assert.equal(pattern.source, "confirmedBehavioralEvidenceAggregation");
  assert.equal(pattern.latestPatternReviewStatus, "unreviewed");
  assert.equal(pattern.latestPatternReviewId, null);
  assert.equal(pattern.patternReviewedAt, null);
  assert.deepEqual(
    Object.keys(pattern.contributors[0]),
    [
      "activeIdentity",
      "evidenceId",
      "sourceFingerprint",
      "sourceRef",
      "outcomeEntryId",
      "latestReviewId",
      "reviewedAt",
    ],
  );
  assert.equal(pattern.contributors[0].outcomeEntryId, "pattern-outcome-3");
  assert.doesNotMatch(
    pattern.insight,
    /strength|verified|proven|mastery|universal|performance/i,
  );
});

test("E4 review filtering excludes every non-current or non-confirmed E3", () => {
  for (const change of [
    { status: "unreviewed" },
    { status: "corrected", correctedCompetency: "trial-close" },
    { status: "rejected" },
    { sourceFingerprint: "stale-fingerprint" },
    { evidenceId: "stale-evidence" },
  ]) {
    const fixture = makeRecurringPatternFixture({ count: 3 });
    fixture.reviews[2] = { ...fixture.reviews[2], ...change };
    assert.deepEqual(
      jsonClone(
        MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
          fixture.reports,
          { reviews: fixture.reviews },
        ),
      ),
      [],
    );
  }
});

test("E4 counts one contributor per competency and interaction", () => {
  const fixture = makeRecurringPatternFixture({ count: 2 });
  const duplicatedInteraction = jsonClone(fixture.reports[0]);
  duplicatedInteraction.customerInteractions[0].salesStepOutcomes.push(
    resolvedObjectionOutcome("same-interaction-second-outcome"),
  );
  const secondEvidence =
    MissionIntelligenceSystem.identifyBehavioralEvidence([
      duplicatedInteraction,
    ])[1];
  fixture.reports[0] = duplicatedInteraction;
  fixture.reviews.push({
    ...fixture.reviews[0],
    id: "same-interaction-second-review",
    evidenceId: secondEvidence.evidenceId,
    outcomeEntryId: "same-interaction-second-outcome",
    sourceFingerprint: secondEvidence.sourceFingerprint,
  });

  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
        fixture.reports,
        { reviews: fixture.reviews },
      ),
    ),
    [],
  );
});

test("E4 is competency-generic and never combines mixed competencies", () => {
  const objectionHandling = makeRecurringPatternFixture({
    competency: "objection-handling",
    count: 3,
    reportPrefix: "oh-report",
    interactionPrefix: "oh-interaction",
    outcomePrefix: "oh-outcome",
  });
  const trialClose = makeRecurringPatternFixture({
    competency: "trial-close",
    count: 3,
    reportPrefix: "trial-report",
    interactionPrefix: "trial-interaction",
    outcomePrefix: "trial-outcome",
    reviewedAtPrefix: "2026-08-27T15:00:0",
  });
  const patterns =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      [...objectionHandling.reports, ...trialClose.reports],
      { reviews: [...objectionHandling.reviews, ...trialClose.reviews] },
    );

  assert.deepEqual(
    jsonClone(patterns.map((pattern) => pattern.competency)),
    ["trial-close", "objection-handling"],
  );
  assert.equal(patterns[0].interactionCount, 3);
  assert.equal(patterns[1].interactionCount, 3);

  const mixedBelowThreshold =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      [...objectionHandling.reports.slice(0, 2), trialClose.reports[0]],
      {
        reviews: [
          ...objectionHandling.reviews.slice(0, 2),
          trialClose.reviews[0],
        ],
      },
    );
  assert.deepEqual(jsonClone(mixedBelowThreshold), []);
});

test("E4 version identity follows exact contributor membership", () => {
  const four = makeRecurringPatternFixture({ count: 4 });
  const firstThree = {
    reports: four.reports.slice(0, 3),
    reviews: four.reviews.slice(0, 3),
  };
  const alternateThree = {
    reports: [four.reports[0], four.reports[1], four.reports[3]],
    reviews: [four.reviews[0], four.reviews[1], four.reviews[3]],
  };
  const project = (fixture) =>
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    )[0];
  const versionThree = project(firstThree);
  const repeatedThree = project(jsonClone(firstThree));
  const versionFour = project(four);
  const changedThree = project(alternateThree);

  assert.equal(
    versionThree.patternVersionIdentity,
    repeatedThree.patternVersionIdentity,
  );
  assert.notEqual(
    versionThree.patternVersionIdentity,
    versionFour.patternVersionIdentity,
  );
  assert.notEqual(
    versionThree.patternVersionIdentity,
    changedThree.patternVersionIdentity,
  );
  assert.equal(versionThree.patternId, versionFour.patternId);
  assert.equal(versionThree.patternId, changedThree.patternId);
  assert.equal(project(firstThree).patternVersionIdentity, versionThree.patternVersionIdentity);
});

test("E4 source edit and reconfirmation changes version while threshold loss removes it", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const original =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    )[0];
  const changedReports = jsonClone(fixture.reports);
  changedReports[2].customerInteractions[0].objections = ["trade value"];

  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
        changedReports,
        { reviews: fixture.reviews },
      ),
    ),
    [],
  );
  const changedReview = makeBehavioralEvidenceReview(changedReports[2], {
    id: "pattern-review-changed-source",
    reviewedAt: "2026-08-27T18:00:00.000Z",
  });
  const changed =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      changedReports,
      { reviews: [...fixture.reviews, changedReview] },
    )[0];

  assert.equal(changed.patternId, original.patternId);
  assert.notEqual(
    changed.patternVersionIdentity,
    original.patternVersionIdentity,
  );
  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
        fixture.reports.slice(0, 2),
        { reviews: fixture.reviews.slice(0, 2) },
      ),
    ),
    [],
  );
});

test("E4 ordering is count, newest review, then canonical competency", () => {
  const fourObjection = makeRecurringPatternFixture({
    count: 4,
    reportPrefix: "order-oh-report",
    interactionPrefix: "order-oh-interaction",
    outcomePrefix: "order-oh-outcome",
  });
  const threeTrial = makeRecurringPatternFixture({
    competency: "trial-close",
    count: 3,
    reportPrefix: "order-trial-report",
    interactionPrefix: "order-trial-interaction",
    outcomePrefix: "order-trial-outcome",
    reviewedAtPrefix: "2026-08-28T15:00:0",
  });
  let patterns = MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
    [...fourObjection.reports, ...threeTrial.reports],
    { reviews: [...fourObjection.reviews, ...threeTrial.reviews] },
  );
  assert.deepEqual(
    jsonClone(patterns.map((pattern) => pattern.competency)),
    ["objection-handling", "trial-close"],
  );

  const threeObjection = {
    reports: fourObjection.reports.slice(0, 3),
    reviews: threeTrial.reviews.map((review, index) => ({
      ...fourObjection.reviews[index],
      reviewedAt: review.reviewedAt,
    })),
  };
  patterns = MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
    [...threeObjection.reports, ...threeTrial.reports],
    { reviews: [...threeObjection.reviews, ...threeTrial.reviews] },
  );
  assert.deepEqual(
    jsonClone(patterns.map((pattern) => pattern.competency)),
    ["objection-handling", "trial-close"],
  );
});

test("E4 contributor order is deterministic and results are defensive copies", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const state = {
    reports: fixture.reports,
    reviewContainer: { reviews: fixture.reviews },
    profile: { strengths: ["Existing"] },
    guidance: { focus: "Existing" },
    reflection: { entries: ["Existing"] },
  };
  const before = jsonClone(state);
  const first = MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
    state.reports,
    state.reviewContainer,
  );
  const repeated =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      jsonClone(state.reports),
      jsonClone(state.reviewContainer),
    );

  assert.deepEqual(
    jsonClone(first[0].contributors.map((item) => item.evidenceId)),
    jsonClone(repeated[0].contributors.map((item) => item.evidenceId)),
  );
  first[0].contributors[0].sourceRef.artifactId = "changed";
  first[0].contributors.pop();
  first[0].insight = "changed";
  assert.deepEqual(jsonClone(state), before);
  assert.equal(Object.hasOwn(state.reports[0], "recurringBehavioralPatterns"), false);
});

test("E4 requires no persistence, UI, active, Profile, Guidance, or Reflection globals", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  assert.doesNotThrow(() =>
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    ),
  );
  assert.equal(
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    )[0].evidenceTier,
    "E4",
  );
});

test("E4 exact-version review builds canonical append-only records", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    );
  const contributorIdentities = pattern.contributors
    .map((contributor) => contributor.activeIdentity)
    .sort();
  const validated =
    MissionIntelligenceSystem.validateBehavioralPatternReviewTarget(
      fixture.reports,
      { reviews: fixture.reviews },
      {
        patternId: pattern.patternId,
        patternVersionIdentity: pattern.patternVersionIdentity,
        contributorIdentities,
      },
    );
  const first = MissionIntelligenceSystem.buildBehavioralPatternReviewRecord(
    validated,
    { status: "confirmed-as-pattern" },
  );

  assert.equal(validated.valid, true);
  assert.equal(first.valid, true);
  assert.equal(first.changed, true);
  assert.equal(first.review.patternId, pattern.patternId);
  assert.equal(
    first.review.patternVersionIdentity,
    pattern.patternVersionIdentity,
  );
  assert.equal(first.review.competency, pattern.competency);
  assert.equal(first.review.originalInsight, pattern.insight);
  assert.deepEqual(
    jsonClone(first.review.contributorIdentities),
    jsonClone(contributorIdentities),
  );
  assert.equal(first.review.status, "confirmed-as-pattern");
  assert.equal(first.review.correctedInterpretation, null);
  assert.equal(first.review.note, null);
  assert.equal(first.review.supersedesReviewId, null);
  assert.ok(Date.parse(first.review.reviewedAt));

  const second =
    MissionIntelligenceSystem.buildBehavioralPatternReviewRecord(
      validated,
      { status: "rejected", note: "The records do not form this pattern." },
      [first.review],
    );
  assert.equal(second.changed, true);
  assert.equal(second.review.supersedesReviewId, first.review.id);
  assert.equal([first.review, second.review].length, 2);
});

test("E4 exact latest review is idempotent and changed details append", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    );
  const validated =
    MissionIntelligenceSystem.validateBehavioralPatternReviewTarget(
      fixture.reports,
      { reviews: fixture.reviews },
      {
        patternId: pattern.patternId,
        patternVersionIdentity: pattern.patternVersionIdentity,
        contributorIdentities: pattern.contributors
          .map((contributor) => contributor.activeIdentity)
          .sort(),
      },
    );
  const first = MissionIntelligenceSystem.buildBehavioralPatternReviewRecord(
    validated,
    {
      status: "corrected",
      correctedInterpretation: "A narrower recurring pattern.",
      note: "Keep this scoped.",
    },
  );
  const repeated =
    MissionIntelligenceSystem.buildBehavioralPatternReviewRecord(
      validated,
      {
        status: "corrected",
        correctedInterpretation: "A narrower recurring pattern.",
        note: "Keep this scoped.",
      },
      [first.review],
    );
  const changed =
    MissionIntelligenceSystem.buildBehavioralPatternReviewRecord(
      validated,
      {
        status: "corrected",
        correctedInterpretation: "A narrower recurring pattern.",
        note: "Updated note.",
      },
      [first.review],
    );

  assert.equal(repeated.changed, false);
  assert.equal(repeated.review.id, first.review.id);
  assert.equal(changed.changed, true);
  assert.equal(changed.review.supersedesReviewId, first.review.id);
});

test("E4 review validation fails closed for stale version or contributors", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    );
  const target = {
    patternId: pattern.patternId,
    patternVersionIdentity: pattern.patternVersionIdentity,
    contributorIdentities: pattern.contributors
      .map((contributor) => contributor.activeIdentity)
      .sort(),
  };
  assert.equal(
    MissionIntelligenceSystem.validateBehavioralPatternReviewTarget(
      fixture.reports,
      { reviews: fixture.reviews },
      { ...target, patternVersionIdentity: "stale-version" },
    ).reason,
    "behavioral-pattern-target-not-current",
  );
  assert.equal(
    MissionIntelligenceSystem.validateBehavioralPatternReviewTarget(
      fixture.reports,
      { reviews: fixture.reviews },
      { ...target, contributorIdentities: target.contributorIdentities.slice(1) },
    ).reason,
    "behavioral-pattern-contributors-mismatch",
  );
});

test("E4 projection applies only the latest exact-version review", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    );
  const contributorIdentities = pattern.contributors
    .map((contributor) => contributor.activeIdentity)
    .sort();
  const base = {
    patternId: pattern.patternId,
    patternVersionIdentity: pattern.patternVersionIdentity,
    competency: pattern.competency,
    originalInsight: pattern.insight,
    contributorIdentities,
    correctedInterpretation: null,
    note: null,
    supersedesReviewId: null,
  };
  const older = {
    ...base,
    id: "pattern-review-older",
    status: "confirmed-as-pattern",
    reviewedAt: "2026-08-26T12:00:00.000Z",
  };
  const latest = {
    ...base,
    id: "pattern-review-latest",
    status: "corrected",
    correctedInterpretation: "A narrower interpretation.",
    note: "Scoped to these interactions.",
    reviewedAt: "2026-08-26T13:00:00.000Z",
    supersedesReviewId: older.id,
  };
  const [reviewed] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
      { reviews: [older, latest] },
    );

  assert.equal(reviewed.latestPatternReviewStatus, "corrected");
  assert.equal(reviewed.latestPatternReviewId, latest.id);
  assert.equal(reviewed.patternReviewedAt, latest.reviewedAt);
  assert.equal(
    reviewed.latestPatternCorrectedInterpretation,
    latest.correctedInterpretation,
  );
  assert.equal(reviewed.latestPatternReviewNote, latest.note);
  assert.equal(reviewed.interactionCount, pattern.interactionCount);
  assert.deepEqual(
    jsonClone(reviewed.contributors),
    jsonClone(pattern.contributors),
  );

  const fixture4 = makeRecurringPatternFixture({ count: 4 });
  const [changedVersion] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture4.reports,
      { reviews: fixture4.reviews },
      { reviews: [older, latest] },
    );
  assert.equal(changedVersion.patternId, pattern.patternId);
  assert.notEqual(
    changedVersion.patternVersionIdentity,
    pattern.patternVersionIdentity,
  );
  assert.equal(changedVersion.latestPatternReviewStatus, "unreviewed");
});

test("E4 review statuses validate without mutating source state", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const before = jsonClone(fixture);
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    );
  const validated =
    MissionIntelligenceSystem.validateBehavioralPatternReviewTarget(
      fixture.reports,
      { reviews: fixture.reviews },
      {
        patternId: pattern.patternId,
        patternVersionIdentity: pattern.patternVersionIdentity,
        contributorIdentities: pattern.contributors
          .map((contributor) => contributor.activeIdentity)
          .sort(),
      },
    );
  for (const status of ["confirmed-as-pattern", "corrected", "rejected"]) {
    const built = MissionIntelligenceSystem.buildBehavioralPatternReviewRecord(
      validated,
      {
        status,
        note: status === "corrected" ? "Correction note." : null,
      },
    );
    assert.equal(built.valid, true);
  }
  assert.equal(
    MissionIntelligenceSystem.buildBehavioralPatternReviewRecord(
      validated,
      { status: "corrected" },
    ).reason,
    "correction-detail-required",
  );
  assert.equal(
    MissionIntelligenceSystem.buildBehavioralPatternReviewRecord(
      validated,
      { status: "invalid" },
    ).reason,
    "invalid-review-status",
  );
  assert.deepEqual(jsonClone(fixture), before);
});

function makeConfirmedPatternReview(pattern, overrides = {}) {
  return {
    id: `profile-pattern-review-${pattern.competency}`,
    patternId: pattern.patternId,
    patternVersionIdentity: pattern.patternVersionIdentity,
    competency: pattern.competency,
    originalInsight: pattern.insight,
    contributorIdentities: pattern.contributors
      .map((contributor) => contributor.activeIdentity)
      .sort(),
    status: "confirmed-as-pattern",
    correctedInterpretation: null,
    note: null,
    reviewedAt: "2026-08-27T12:00:00.000Z",
    supersedesReviewId: null,
    ...overrides,
  };
}

test("Profile candidates require one exact current confirmed E4 review", () => {
  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyProfileCapabilityCandidates([], null),
    ),
    [],
  );
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    );
  const confirmed = makeConfirmedPatternReview(pattern);
  assert.equal(
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      fixture.reports,
      { reviews: fixture.reviews },
      { reviews: [confirmed] },
    ).length,
    1,
  );
  for (const review of [
    { ...confirmed, status: "corrected", note: "Different wording." },
    { ...confirmed, status: "rejected", note: "Not accepted." },
    { ...confirmed, patternVersionIdentity: "stale-version" },
    {
      ...confirmed,
      contributorIdentities: confirmed.contributorIdentities.slice(1),
    },
  ]) {
    assert.deepEqual(
      jsonClone(
        MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
          fixture.reports,
          { reviews: fixture.reviews },
          { reviews: [review] },
        ),
      ),
      [],
    );
  }
});

test("Profile candidate has the exact authority-safe shape and wording", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    );
  const review = makeConfirmedPatternReview(pattern);
  const [candidate] =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      fixture.reports,
      { reviews: fixture.reviews },
      { reviews: [review] },
    );

  assert.deepEqual(jsonClone(candidate), jsonClone({
    type: "profile-capability-candidate",
    candidateId:
      "profile_candidate_behavioral_capability_objection-handling",
    candidateVersionIdentity: candidate.candidateVersionIdentity,
    candidateType: "behavioral-developing-capability",
    competency: "objection-handling",
    label: "Objection Handling",
    proposedProfileType: "developing-capability",
    proposedProfileWording: "Developing capability: Objection Handling",
    recommendation:
      "Your reviewed interaction records suggest that Objection Handling may be a developing capability.",
    source: "confirmedRecurringBehavioralPattern",
    patternId: pattern.patternId,
    patternVersionIdentity: pattern.patternVersionIdentity,
    patternReviewId: review.id,
    interactionCount: 3,
    reportCount: 3,
    contributorActiveIdentities: review.contributorIdentities,
  }));
  assert.match(
    candidate.candidateVersionIdentity,
    /^profile_candidate_version_v1_[0-9a-f]{16}$/,
  );
  assert.doesNotMatch(
    candidate.recommendation,
    /verified|demonstrated|strength|permanent|objective/i,
  );
});

test("Profile candidate identity tracks exact pattern version and review", () => {
  const fixture3 = makeRecurringPatternFixture({ count: 3 });
  const [pattern3] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture3.reports,
      { reviews: fixture3.reviews },
    );
  const review3 = makeConfirmedPatternReview(pattern3);
  const [candidate3] =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      fixture3.reports,
      { reviews: fixture3.reviews },
      { reviews: [review3] },
    );
  const [repeated] =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      fixture3.reports,
      { reviews: fixture3.reviews },
      { reviews: [jsonClone(review3)] },
    );
  assert.equal(
    repeated.candidateVersionIdentity,
    candidate3.candidateVersionIdentity,
  );

  const fixture4 = makeRecurringPatternFixture({ count: 4 });
  const [pattern4] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture4.reports,
      { reviews: fixture4.reviews },
    );
  assert.deepEqual(
    jsonClone(
      MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
        fixture4.reports,
        { reviews: fixture4.reviews },
        { reviews: [review3] },
      ),
    ),
    [],
  );
  const review4 = makeConfirmedPatternReview(pattern4, {
    id: "profile-pattern-review-four",
  });
  const [candidate4] =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      fixture4.reports,
      { reviews: fixture4.reviews },
      { reviews: [review4] },
    );
  assert.equal(candidate4.candidateId, candidate3.candidateId);
  assert.notEqual(
    candidate4.candidateVersionIdentity,
    candidate3.candidateVersionIdentity,
  );

  const newReview = { ...review3, id: "profile-pattern-review-new" };
  const [reviewedAgain] =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      fixture3.reports,
      { reviews: fixture3.reviews },
      { reviews: [newReview] },
    );
  assert.notEqual(
    reviewedAgain.candidateVersionIdentity,
    candidate3.candidateVersionIdentity,
  );
  const [restored] =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      fixture3.reports,
      { reviews: fixture3.reviews },
      { reviews: [review3] },
    );
  assert.equal(
    restored.candidateVersionIdentity,
    candidate3.candidateVersionIdentity,
  );
});

test("Profile candidate digest input has a locked storage-safe vector", () => {
  const digest = MissionIntelligenceSystem.buildDeterministicIdentityDigest(
    JSON.stringify({
      candidateId:
        "profile_candidate_behavioral_capability_objection-handling",
      patternVersionIdentity: "behavioral_pattern_version_v1_example",
      patternReviewId: "pattern-review-example",
    }),
  );
  assert.equal(digest, "f8891bb6301dc86e");
  assert.match(`profile_candidate_version_v1_${digest}`, /^[A-Za-z0-9_-]+$/);
});

test("Profile candidates are generic and preserve source E4 ordering", () => {
  const objection = makeRecurringPatternFixture({
    competency: "objection-handling",
    count: 3,
    reportPrefix: "candidate-objection-report",
    interactionPrefix: "candidate-objection-interaction",
    outcomePrefix: "candidate-objection-outcome",
  });
  const trial = makeRecurringPatternFixture({
    competency: "trial-close",
    count: 4,
    reportPrefix: "candidate-trial-report",
    interactionPrefix: "candidate-trial-interaction",
    outcomePrefix: "candidate-trial-outcome",
  });
  const reports = objection.reports.concat(trial.reports);
  const reviews = objection.reviews.concat(trial.reviews);
  const patterns =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      reports,
      { reviews },
    );
  const patternReviews = patterns.map((pattern) =>
    makeConfirmedPatternReview(pattern),
  );
  const candidates =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      reports,
      { reviews },
      { reviews: patternReviews },
    );

  assert.deepEqual(
    jsonClone(candidates.map((candidate) => candidate.competency)),
    jsonClone(patterns.map((pattern) => pattern.competency)),
  );
  assert.deepEqual(
    jsonClone(candidates.map((candidate) => candidate.label)),
    ["Trial Close", "Objection Handling"],
  );
  const methodSource =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates.toString();
  assert.doesNotMatch(methodSource, /objection-handling|trial-close/);
  assert.doesNotMatch(methodSource, /score|rank|\.sort\(.*candidate/i);
});

test("Profile candidate projection is defensively copied and side-effect free", () => {
  const fixture = makeRecurringPatternFixture({ count: 3 });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      fixture.reports,
      { reviews: fixture.reviews },
    );
  const patternReviewContainer = {
    reviews: [makeConfirmedPatternReview(pattern)],
  };
  const profile = {
    strengths: ["Existing"],
    skills: ["Existing"],
    goals: ["Existing"],
    capabilities: [],
  };
  const state = {
    fixture,
    pattern,
    patternReviewContainer,
    profile,
    guidance: { current: "Existing" },
    reflection: { current: "Existing" },
  };
  const before = jsonClone(state);
  const [candidate] =
    MissionIntelligenceSystem.identifyProfileCapabilityCandidates(
      fixture.reports,
      { reviews: fixture.reviews },
      patternReviewContainer,
    );
  candidate.contributorActiveIdentities[0] = "changed";
  candidate.recommendation = "changed";

  assert.deepEqual(jsonClone(state), before);
  assert.deepEqual(profile.capabilities, []);
  assert.equal(Object.hasOwn(profile, "candidates"), false);
});

function makeRapportBehavioralReport({
  reportId = "report-rapport",
  interactionId = "interaction-rapport",
  outcomeId = "outcome-rapport",
  category = "pets",
  action = "referenced-back-to-customer-context",
  performedBy = "commander",
  contextType = "customer-context-category",
} = {}) {
  return {
    id: reportId,
    date: "2026-08-31",
    createdAt: "2026-08-31T12:00:00.000Z",
    customerInteractions: [
      {
        id: interactionId,
        createdAt: "2026-08-31T12:05:00.000Z",
        salesStepOutcomes: [
          {
            id: outcomeId,
            step: "rapport",
            performedBy,
            action,
            customerContextRef: { type: contextType, category },
          },
        ],
      },
    ],
  };
}

test("canonical category-only Rapport actions create bounded unreviewed E3", () => {
  const categories = [
    "travel-companions",
    "pets",
    "destination",
    "hobby",
    "prior-rv-experience",
    "trip-style",
    "non-sensitive-preference",
  ];

  for (const category of categories) {
    const report = makeRapportBehavioralReport({ category });
    const before = jsonClone(report);
    const [evidence] =
      MissionIntelligenceSystem.identifyBehavioralEvidence([report]);

    assert.deepEqual(report, before);
    assert.equal(evidence.competency, "rapport");
    assert.equal(evidence.label, "Rapport");
    assert.equal(evidence.evidenceTier, "E3");
    assert.equal(evidence.latestReviewStatus, "unreviewed");
    assert.deepEqual(jsonClone(evidence.evidenceRefs), [
      { field: "salesStepOutcomes", entryId: "outcome-rapport" },
    ]);
    assert.match(evidence.sourceFingerprint, new RegExp(`"category":"${category}"`));
    assert.match(evidence.insight, /you reported performing/i);
    assert.match(evidence.insight, /does not establish customer trust/i);
    assert.doesNotMatch(evidence.insight, /demonstrated|verified|successful rapport/i);
  }
});

test("Rapport E3 fails closed for inference, free text, and malformed contracts", () => {
  const malformed = [
    makeRapportBehavioralReport({ category: "customer-liked-me" }),
    makeRapportBehavioralReport({ category: "travel-companion" }),
    makeRapportBehavioralReport({ category: "pet" }),
    makeRapportBehavioralReport({ category: "pets " }),
    makeRapportBehavioralReport({ category: "family-context" }),
    makeRapportBehavioralReport({ category: "local-geographic-connection" }),
    makeRapportBehavioralReport({ action: "referenced-customer-context" }),
    makeRapportBehavioralReport({ action: "built-trust" }),
    makeRapportBehavioralReport({ performedBy: "system" }),
    makeRapportBehavioralReport({ contextType: "customer-profile" }),
  ];
  const inferred = makeRapportBehavioralReport();
  inferred.customerInteractions[0].salesStepOutcomes = [];
  Object.assign(inferred.customerInteractions[0], {
    buyerContext: "Customer seemed comfortable",
    notableMoment: "We had great chemistry and built trust",
    explicitStrengths: ["rapport"],
  });
  malformed.push(inferred);

  for (const report of malformed) {
    assert.deepEqual(
      jsonClone(MissionIntelligenceSystem.identifyBehavioralEvidence([report])),
      [],
    );
  }
});

test("Rapport becomes active only after an exact current Commander review", () => {
  const report = makeRapportBehavioralReport();
  const [evidence] =
    MissionIntelligenceSystem.identifyBehavioralEvidence([report]);
  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence([report]),
    null,
  );

  const review = {
    id: "review-rapport",
    evidenceId: evidence.evidenceId,
    sourceRef: jsonClone(evidence.sourceRef),
    outcomeEntryId: "outcome-rapport",
    sourceFingerprint: evidence.sourceFingerprint,
    status: "confirmed-as-recorded",
    reviewedAt: "2026-08-31T13:00:00.000Z",
  };
  const active = MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
    [report],
    { reviews: [review] },
  );

  assert.equal(active.competency, "rapport");
  assert.equal(active.latestReviewId, "review-rapport");
  const changed = makeRapportBehavioralReport({ category: "destination" });
  assert.equal(
    MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
      [changed],
      { reviews: [review] },
    ),
    null,
  );
});

test("reviewed Rapport E3 uses the existing generic E4 pipeline", () => {
  const reports = [1, 2, 3].map((index) =>
    makeRapportBehavioralReport({
      reportId: `report-rapport-${index}`,
      interactionId: `interaction-rapport-${index}`,
      outcomeId: `outcome-rapport-${index}`,
    }),
  );
  const reviews = reports.map((report, index) => {
    const [evidence] =
      MissionIntelligenceSystem.identifyBehavioralEvidence([report]);
    return {
      id: `review-rapport-${index + 1}`,
      evidenceId: evidence.evidenceId,
      sourceRef: jsonClone(evidence.sourceRef),
      outcomeEntryId: `outcome-rapport-${index + 1}`,
      sourceFingerprint: evidence.sourceFingerprint,
      status: "confirmed-as-recorded",
      reviewedAt: `2026-08-31T1${index}:00:00.000Z`,
    };
  });
  const [pattern] =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      reports,
      { reviews },
    );

  assert.equal(pattern.competency, "rapport");
  assert.equal(pattern.evidenceTier, "E4");
  assert.equal(pattern.interactionCount, 3);
  assert.equal(pattern.reportCount, 3);
  assert.match(pattern.insight, /Commander-reviewed interaction records/i);
  assert.doesNotMatch(pattern.insight, /trust|comfort|likability|sentiment/i);
});
