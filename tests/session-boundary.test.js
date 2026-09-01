const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeStorage({ throws = false } = {}) {
  const values = new Map();

  return {
    getItem(key) {
      if (throws) {
        throw new Error("Storage unavailable");
      }
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (throws) {
        throw new Error("Storage unavailable");
      }
      values.set(String(key), String(value));
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

function loadStorageSystem({
  sessionStorage = makeStorage(),
  localStorage = makeStorage(),
} = {}) {
  const sourcePath = path.resolve(__dirname, "..", "js", "storage.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = vm.createContext({ sessionStorage, localStorage, console });

  vm.runInContext(
    `${source}\n;globalThis.__storageTestApi = { founder, hasShownSessionWelcome, markSessionWelcomeShown, hasSurfacedSessionSignal, markSessionSignalSurfaced, recordFounderVisit };`,
    context,
    { filename: sourcePath },
  );

  return context.__storageTestApi;
}

test("a fresh tab session is eligible for the returning-user welcome", () => {
  const api = loadStorageSystem();

  assert.equal(api.hasShownSessionWelcome(), false);
});

test("marking the session welcome makes it visible to eligibility checks", () => {
  const api = loadStorageSystem();

  assert.equal(api.markSessionWelcomeShown(), true);
  assert.equal(api.hasShownSessionWelcome(), true);
});

test("the marker survives same-tab script reconstruction", () => {
  const sharedSessionStorage = makeStorage();
  const firstLoad = loadStorageSystem({ sessionStorage: sharedSessionStorage });

  firstLoad.markSessionWelcomeShown();

  const reconstructedLoad = loadStorageSystem({
    sessionStorage: sharedSessionStorage,
  });

  assert.equal(reconstructedLoad.hasShownSessionWelcome(), true);
});

test("a different tab session starts eligible", () => {
  const firstTabStorage = makeStorage();
  const secondTabStorage = makeStorage();

  loadStorageSystem({ sessionStorage: firstTabStorage }).markSessionWelcomeShown();

  assert.equal(
    loadStorageSystem({ sessionStorage: secondTabStorage }).hasShownSessionWelcome(),
    false,
  );
});

test("unavailable sessionStorage fails open without throwing", () => {
  const api = loadStorageSystem({ sessionStorage: makeStorage({ throws: true }) });

  assert.doesNotThrow(() => api.hasShownSessionWelcome());
  assert.equal(api.hasShownSessionWelcome(), false);
  assert.doesNotThrow(() => api.markSessionWelcomeShown());
  assert.equal(api.markSessionWelcomeShown(), false);
});

test("welcome helpers do not mutate Founder data or localStorage", () => {
  const localStorage = makeStorage();
  const api = loadStorageSystem({ localStorage });
  const founderBefore = JSON.parse(JSON.stringify(api.founder));

  api.hasShownSessionWelcome();
  api.markSessionWelcomeShown();

  assert.deepEqual(JSON.parse(JSON.stringify(api.founder)), founderBefore);
  assert.deepEqual(localStorage.snapshot(), {});
});

test("visit recording retains its separate existing session marker", () => {
  const sessionStorage = makeStorage();
  const localStorage = makeStorage();
  const api = loadStorageSystem({ sessionStorage, localStorage });

  api.recordFounderVisit();
  api.recordFounderVisit();

  assert.equal(sessionStorage.snapshot().founderOSVisitRecorded, "true");
  assert.equal(
    Object.hasOwn(sessionStorage.snapshot(), "founderOSSessionWelcomeShown"),
    false,
  );
  assert.equal(api.founder.memory.totalVisits, 1);
});

test("a fresh learning signal ID has not surfaced", () => {
  const api = loadStorageSystem();

  assert.equal(api.hasSurfacedSessionSignal("learning", "learning_report_1"), false);
});

test("marking a learning signal makes only that ID surfaced", () => {
  const api = loadStorageSystem();

  assert.equal(api.markSessionSignalSurfaced("learning", "learning_report_1"), true);
  assert.equal(api.hasSurfacedSessionSignal("learning", "learning_report_1"), true);
  assert.equal(api.hasSurfacedSessionSignal("learning", "learning_report_2"), false);
});

test("learning and coaching signal namespaces do not collide", () => {
  const api = loadStorageSystem();

  api.markSessionSignalSurfaced("learning", "shared_signal_id");

  assert.equal(api.hasSurfacedSessionSignal("learning", "shared_signal_id"), true);
  assert.equal(api.hasSurfacedSessionSignal("coaching", "shared_signal_id"), false);
});

test("repeated coaching uses the exact typed per-tab session key", () => {
  const sessionStorage = makeStorage();
  const api = loadStorageSystem({ sessionStorage });
  const summaryId = "repeated_self_assessment_discovery";

  assert.equal(
    api.hasSurfacedSessionSignal("repeatedCoaching", summaryId),
    false,
  );
  assert.equal(
    api.markSessionSignalSurfaced("repeatedCoaching", summaryId),
    true,
  );
  assert.equal(
    sessionStorage.snapshot()[
      "founderOSSessionSignal:repeatedCoaching:repeated_self_assessment_discovery"
    ],
    "true",
  );
});

test("repeated coaching markers remain independent across tabs and types", () => {
  const firstStorage = makeStorage();
  const firstTab = loadStorageSystem({ sessionStorage: firstStorage });
  const secondTab = loadStorageSystem({ sessionStorage: makeStorage() });
  const summaryId = "repeated_self_assessment_discovery";

  firstTab.markSessionSignalSurfaced("repeatedCoaching", summaryId);

  assert.equal(firstTab.hasSurfacedSessionSignal("repeatedCoaching", summaryId), true);
  assert.equal(firstTab.hasSurfacedSessionSignal("coaching", summaryId), false);
  assert.equal(secondTab.hasSurfacedSessionSignal("repeatedCoaching", summaryId), false);
});

test("behavioral evidence uses the exact typed per-tab session key", () => {
  const sessionStorage = makeStorage();
  const api = loadStorageSystem({ sessionStorage });
  const activeIdentity = "behavioral_evidence_active_v1_e3alpha";

  assert.equal(
    api.hasSurfacedSessionSignal("behavioralEvidence", activeIdentity),
    false,
  );
  assert.equal(
    api.markSessionSignalSurfaced("behavioralEvidence", activeIdentity),
    true,
  );
  assert.equal(
    sessionStorage.snapshot()[
      "founderOSSessionSignal:behavioralEvidence:behavioral_evidence_active_v1_e3alpha"
    ],
    "true",
  );
});

test("behavioral evidence dedupes in one tab and is eligible in a fresh tab", () => {
  const activeIdentity = "behavioral_evidence_active_v1_e3alpha";
  const firstTab = loadStorageSystem();

  firstTab.markSessionSignalSurfaced("behavioralEvidence", activeIdentity);

  assert.equal(
    firstTab.hasSurfacedSessionSignal("behavioralEvidence", activeIdentity),
    true,
  );
  assert.equal(
    loadStorageSystem().hasSurfacedSessionSignal(
      "behavioralEvidence",
      activeIdentity,
    ),
    false,
  );
});

test("behavioral evidence namespace does not alter existing marker types", () => {
  const api = loadStorageSystem();
  const sharedId = "shared_signal_id";

  api.markSessionSignalSurfaced("behavioralEvidence", sharedId);

  assert.equal(api.hasSurfacedSessionSignal("behavioralEvidence", sharedId), true);
  assert.equal(api.hasSurfacedSessionSignal("learning", sharedId), false);
  assert.equal(api.hasSurfacedSessionSignal("coaching", sharedId), false);
  assert.equal(api.hasSurfacedSessionSignal("repeatedCoaching", sharedId), false);
  assert.equal(api.markSessionSignalSurfaced("unknown", sharedId), false);
});

test("a new tab storage makes the same signal eligible again", () => {
  const firstTab = loadStorageSystem();
  firstTab.markSessionSignalSurfaced("learning", "learning_report_1");

  const secondTab = loadStorageSystem({ sessionStorage: makeStorage() });

  assert.equal(secondTab.hasSurfacedSessionSignal("learning", "learning_report_1"), false);
});

test("invalid signal types and IDs fail safely", () => {
  const api = loadStorageSystem();

  assert.equal(api.hasSurfacedSessionSignal("unknown", "learning_report_1"), false);
  assert.equal(api.markSessionSignalSurfaced("unknown", "learning_report_1"), false);
  assert.equal(api.hasSurfacedSessionSignal("learning", ""), false);
  assert.equal(api.markSessionSignalSurfaced("learning", "bad:id"), false);
});

test("signal helpers fail open when sessionStorage throws", () => {
  const api = loadStorageSystem({ sessionStorage: makeStorage({ throws: true }) });

  assert.doesNotThrow(() => api.hasSurfacedSessionSignal("learning", "learning_report_1"));
  assert.equal(api.hasSurfacedSessionSignal("learning", "learning_report_1"), false);
  assert.doesNotThrow(() => api.markSessionSignalSurfaced("learning", "learning_report_1"));
  assert.equal(api.markSessionSignalSurfaced("learning", "learning_report_1"), false);
});

test("signal helpers do not mutate Founder data or localStorage", () => {
  const localStorage = makeStorage();
  const api = loadStorageSystem({ localStorage });
  const founderBefore = JSON.parse(JSON.stringify(api.founder));

  api.hasSurfacedSessionSignal("learning", "learning_report_1");
  api.markSessionSignalSurfaced("learning", "learning_report_1");

  assert.deepEqual(JSON.parse(JSON.stringify(api.founder)), founderBefore);
  assert.deepEqual(localStorage.snapshot(), {});
});
