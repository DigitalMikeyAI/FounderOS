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
    `${source}\n;globalThis.__storageTestApi = { founder, hasShownSessionWelcome, markSessionWelcomeShown, recordFounderVisit };`,
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
