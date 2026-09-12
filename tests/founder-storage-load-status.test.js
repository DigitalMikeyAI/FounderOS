const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const storageSource = fs.readFileSync(
  path.resolve(__dirname, "..", "js", "storage.js"),
  "utf8",
);

function createStorage(initial = {}, behavior = {}) {
  const values = new Map(Object.entries(initial));
  const operations = [];
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) {
      operations.push(["get", key]);
      if (behavior.getItem) return behavior.getItem(key, values);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      operations.push(["set", key, String(value)]);
      if (behavior.setItem) behavior.setItem(key, String(value), values);
      else values.set(key, String(value));
    },
    removeItem(key) {
      operations.push(["remove", key]);
      if (behavior.removeItem) behavior.removeItem(key, values);
      else values.delete(key);
    },
    get values() { return values; },
    operations,
  };
}

function loadHarness({ initial = {}, behavior = {} } = {}) {
  const localStorage = createStorage(initial, behavior);
  const context = vm.createContext({
    localStorage,
    sessionStorage: createStorage(),
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(storageSource, context, { filename: "js/storage.js" });
  vm.runInContext(
    ";globalThis.__api = { founder, loadFounder, saveFounder, getFounderStorageLoadStatus };",
    context,
  );
  return { api: context.__api, localStorage };
}

test("Founder storage status begins not-loaded and reads without side effects", () => {
  const harness = loadHarness();
  const founder = harness.api.founder;

  assert.equal(harness.api.getFounderStorageLoadStatus(), "not-loaded");
  assert.equal(harness.api.founder, founder);
  assert.deepEqual(harness.localStorage.operations, []);
});

test("safe missing storage is absent while valid primary and legacy-only states are loaded", () => {
  const absent = loadHarness();
  absent.api.loadFounder();
  assert.equal(absent.api.getFounderStorageLoadStatus(), "absent");

  const primary = loadHarness({
    initial: { digitalMikeyFounder: JSON.stringify({ name: "Primary" }) },
  });
  primary.api.loadFounder();
  assert.equal(primary.api.getFounderStorageLoadStatus(), "loaded");

  const legacy = loadHarness({
    initial: { founder: JSON.stringify({ name: "Legacy" }) },
  });
  legacy.api.loadFounder();
  assert.equal(legacy.api.getFounderStorageLoadStatus(), "loaded");
});

test("invalid or inaccessible primary records produce failed status without legacy reinterpretation", () => {
  for (const primary of ["{bad json", "", "null", "[]"]) {
    const harness = loadHarness({
      initial: {
        digitalMikeyFounder: primary,
        founder: JSON.stringify({ name: "Legacy must not load" }),
      },
    });
    harness.api.loadFounder();
    assert.equal(harness.api.getFounderStorageLoadStatus(), "failed");
    assert.equal(harness.api.founder.name, "Explorer");
    assert.throws(() => harness.api.saveFounder(), /refusing to overwrite/);
  }

  const inaccessible = loadHarness({
    behavior: { getItem() { throw new Error("read denied"); } },
  });
  inaccessible.api.loadFounder();
  assert.equal(inaccessible.api.getFounderStorageLoadStatus(), "failed");
});

test("migration failure finishes failed and does not clear the PIH-1 save guard", () => {
  const harness = loadHarness({
    initial: {
      digitalMikeyFounder: JSON.stringify({ missionObjectives: ["One"] }),
      "objective-0": "true",
    },
    behavior: {
      setItem(key) {
        if (key === "digitalMikeyFounder") throw new Error("primary unavailable");
      },
    },
  });

  harness.api.loadFounder();

  assert.equal(harness.api.getFounderStorageLoadStatus(), "failed");
  assert.throws(() => harness.api.saveFounder(), /refusing to overwrite/);
});

test("a repaired later load becomes loaded and clears the existing save guard", () => {
  const harness = loadHarness({ initial: { digitalMikeyFounder: "{bad json" } });
  harness.api.loadFounder();
  assert.equal(harness.api.getFounderStorageLoadStatus(), "failed");
  assert.throws(() => harness.api.saveFounder(), /refusing to overwrite/);

  harness.localStorage.values.set(
    "digitalMikeyFounder",
    JSON.stringify({ name: "Recovered", missionObjectiveCompletionMigrated: true }),
  );
  harness.api.loadFounder();

  assert.equal(harness.api.getFounderStorageLoadStatus(), "loaded");
  assert.doesNotThrow(() => harness.api.saveFounder());
});

test("a later safe absent lookup reports absent without changing the failed-save guard", () => {
  const harness = loadHarness({ initial: { digitalMikeyFounder: "{bad json" } });
  harness.api.loadFounder();
  harness.localStorage.values.clear();

  harness.api.loadFounder();

  assert.equal(harness.api.getFounderStorageLoadStatus(), "absent");
  assert.throws(() => harness.api.saveFounder(), /refusing to overwrite/);
});

test("saveFounder does not alter load status", () => {
  const harness = loadHarness();
  harness.api.saveFounder();
  assert.equal(harness.api.getFounderStorageLoadStatus(), "not-loaded");
  harness.api.loadFounder();
  assert.equal(harness.api.getFounderStorageLoadStatus(), "loaded");
  harness.api.saveFounder();
  assert.equal(harness.api.getFounderStorageLoadStatus(), "loaded");
});