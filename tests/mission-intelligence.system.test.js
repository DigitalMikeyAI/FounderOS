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

test("singular coaching projection returns canonical evidence reference", () => {
  const signal = makePersistedCoachingSignal();
  const result = MissionIntelligenceSystem.identifyCoachingSignal([
    { coachingSignals: [signal] },
  ]);

  assert.deepEqual(jsonClone(result), {
    type: "field-report-coaching",
    insight: signal.signal,
    signalId: signal.id,
    evidence: ["artifactId: projection-report"],
    source: "coachingSignal",
  });
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
