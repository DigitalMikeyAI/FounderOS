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
