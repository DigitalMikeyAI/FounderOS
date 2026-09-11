const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const storageSource = fs.readFileSync(path.join(root, "js", "storage.js"), "utf8");
const commanderSource = fs.readFileSync(
  path.join(root, "systems", "commander.system.js"),
  "utf8",
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function loadHarness({ initial = {}, behavior = {}, json = JSON, commander = false } = {}) {
  const localStorage = createStorage(initial, behavior);
  const sessionStorage = createStorage();
  const notices = [];
  const context = vm.createContext({
    JSON: json,
    localStorage,
    sessionStorage,
    console: {
      log() {},
      error(...args) { notices.push(["error", ...args]); },
      warn(...args) { notices.push(["warn", ...args]); },
    },
  });
  vm.runInContext(storageSource, context, { filename: "js/storage.js" });
  if (commander) {
    vm.runInContext(commanderSource, context, { filename: "systems/commander.system.js" });
  }
  vm.runInContext(
    ";globalThis.__api = { founder, saveFounder, loadFounder, recordFounderVisit, CommanderSystem: typeof CommanderSystem === 'undefined' ? null : CommanderSystem };",
    context,
  );
  return { api: context.__api, localStorage, notices };
}

test("successful save serializes once, commits primary first, mirrors exactly, and reloads", () => {
  let serializations = 0;
  const json = { ...JSON, stringify(value) { serializations += 1; return JSON.stringify(value); } };
  const first = loadHarness({ json });
  first.api.founder.name = "Committed Commander";
  first.api.saveFounder();

  const primary = first.localStorage.values.get("digitalMikeyFounder");
  assert.equal(serializations, 1);
  assert.equal(first.localStorage.values.get("founder"), primary);
  assert.deepEqual(first.localStorage.operations.filter(([kind]) => kind === "set").map(([, key]) => key), ["digitalMikeyFounder", "founder"]);

  const reloaded = loadHarness({ initial: { digitalMikeyFounder: primary } });
  reloaded.api.loadFounder();
  assert.equal(reloaded.api.founder.name, "Committed Commander");
});

test("serialization failure changes neither Founder key and remains observable", () => {
  const initial = { digitalMikeyFounder: "old-primary", founder: "old-legacy" };
  const harness = loadHarness({ initial, json: { ...JSON, stringify() { throw new Error("cannot serialize"); } } });
  assert.throws(() => harness.api.saveFounder(), /cannot serialize/);
  assert.deepEqual(Object.fromEntries(harness.localStorage.values), initial);
  assert.equal(harness.localStorage.operations.some(([kind]) => kind === "set"), false);
});

test("primary write failure does not attempt legacy write and remains observable", () => {
  const initial = { digitalMikeyFounder: "old-primary", founder: "old-legacy" };
  const harness = loadHarness({ initial, behavior: { setItem(key) { if (key === "digitalMikeyFounder") throw new Error("primary unavailable"); } } });
  assert.throws(() => harness.api.saveFounder(), /primary unavailable/);
  assert.deepEqual(Object.fromEntries(harness.localStorage.values), initial);
  assert.deepEqual(harness.localStorage.operations.filter(([kind]) => kind === "set").map(([, key]) => key), ["digitalMikeyFounder"]);
});

test("legacy mirror failure preserves committed primary and does not report save failure", () => {
  const harness = loadHarness({
    initial: { founder: "old-legacy" },
    behavior: { setItem(key, value, values) { if (key === "founder") throw new Error("legacy unavailable"); values.set(key, value); } },
  });
  harness.api.founder.name = "Primary Wins";
  assert.doesNotThrow(() => harness.api.saveFounder());
  assert.equal(harness.localStorage.values.get("founder"), "old-legacy");
  const primary = harness.localStorage.values.get("digitalMikeyFounder");
  assert.equal(JSON.parse(primary).name, "Primary Wins");
  assert.equal(harness.notices.some(([kind]) => kind === "warn"), true);

  const reloaded = loadHarness({ initial: { digitalMikeyFounder: primary, founder: "old-legacy" } });
  reloaded.api.loadFounder();
  assert.equal(reloaded.api.founder.name, "Primary Wins");
});

test("interruption after primary commitment reloads the complete authoritative snapshot", () => {
  const first = loadHarness({ behavior: { setItem(key, value, values) { values.set(key, value); if (key === "founder") throw new Error("interrupted"); } } });
  first.api.founder.memory.artifacts.report = { id: "artifact-1" };
  first.api.saveFounder();
  const second = loadHarness({ initial: { digitalMikeyFounder: first.localStorage.values.get("digitalMikeyFounder") } });
  second.api.loadFounder();
  assert.deepEqual(clone(second.api.founder.memory.artifacts), { report: { id: "artifact-1" } });
});

test("legacy-only load falls back, while primary remains authoritative when records diverge", () => {
  const legacyOnly = loadHarness({ initial: { founder: JSON.stringify({ name: "Legacy Commander" }) } });
  legacyOnly.api.loadFounder();
  assert.equal(legacyOnly.api.founder.name, "Legacy Commander");
  legacyOnly.api.saveFounder();
  assert.equal(legacyOnly.localStorage.values.get("digitalMikeyFounder"), legacyOnly.localStorage.values.get("founder"));

  const divergent = loadHarness({ initial: {
    digitalMikeyFounder: JSON.stringify({ name: "Stale Primary" }),
    founder: JSON.stringify({ name: "Newer Legacy" }),
  } });
  divergent.api.loadFounder();
  assert.equal(divergent.api.founder.name, "Stale Primary");
});

test("an empty primary blocks legacy fallback and subsequent Founder saves", () => {
  const initial = {
    digitalMikeyFounder: "",
    founder: JSON.stringify({ name: "Valid Legacy" }),
  };
  const harness = loadHarness({ initial });

  harness.api.loadFounder();

  assert.equal(harness.api.founder.name, "Explorer");
  assert.throws(() => harness.api.saveFounder(), /refusing to overwrite/);
  assert.throws(() => harness.api.recordFounderVisit(), /refusing to overwrite/);
  assert.deepEqual(Object.fromEntries(harness.localStorage.values), initial);
});

test("unreadable Founder data blocks subsequent default saves without selecting another record", () => {
  const corruptedPrimary = loadHarness({ initial: {
    digitalMikeyFounder: "{bad json",
    founder: JSON.stringify({ name: "Valid Legacy" }),
  } });
  corruptedPrimary.api.loadFounder();
  assert.equal(corruptedPrimary.api.founder.name, "Explorer");
  assert.throws(() => corruptedPrimary.api.recordFounderVisit(), /refusing to overwrite/);
  assert.equal(corruptedPrimary.localStorage.values.get("digitalMikeyFounder"), "{bad json");
  assert.equal(JSON.parse(corruptedPrimary.localStorage.values.get("founder")).name, "Valid Legacy");

  const corruptedLegacy = loadHarness({ initial: { founder: "{bad json" } });
  corruptedLegacy.api.loadFounder();
  assert.throws(() => corruptedLegacy.api.saveFounder(), /refusing to overwrite/);
  assert.equal(corruptedLegacy.localStorage.values.get("founder"), "{bad json");

  const nonSnapshot = loadHarness({ initial: { digitalMikeyFounder: "null" } });
  nonSnapshot.api.loadFounder();
  assert.throws(() => nonSnapshot.api.saveFounder(), /refusing to overwrite/);
  assert.equal(nonSnapshot.localStorage.values.get("digitalMikeyFounder"), "null");

  const unreadable = loadHarness({ behavior: { getItem() { throw new Error("read denied"); } } });
  unreadable.api.loadFounder();
  assert.throws(() => unreadable.api.saveFounder(), /refusing to overwrite/);
  assert.equal(unreadable.localStorage.operations.some(([kind]) => kind === "set"), false);
});

test("a successful later load clears the failed-load guard in the same runtime", () => {
  const harness = loadHarness({ initial: { digitalMikeyFounder: "{bad json" } });

  harness.api.loadFounder();
  assert.throws(() => harness.api.saveFounder(), /refusing to overwrite/);

  harness.localStorage.values.set(
    "digitalMikeyFounder",
    JSON.stringify({ name: "Recovered Commander", missionObjectiveCompletionMigrated: true }),
  );
  harness.api.loadFounder();

  assert.equal(harness.api.founder.name, "Recovered Commander");
  assert.doesNotThrow(() => harness.api.saveFounder());
  assert.equal(
    JSON.parse(harness.localStorage.values.get("digitalMikeyFounder")).name,
    "Recovered Commander",
  );
});

test("a valid primary loads normally even with a corrupted legacy mirror", () => {
  const harness = loadHarness({ initial: {
    digitalMikeyFounder: JSON.stringify({ name: "Good Primary" }),
    founder: "{bad json",
  } });
  harness.api.loadFounder();
  assert.equal(harness.api.founder.name, "Good Primary");
  assert.doesNotThrow(() => harness.api.saveFounder());
});

test("objective migration removes old keys only after primary commitment and preserves values", () => {
  const primary = JSON.stringify({ missionObjectives: ["One", "Two"] });
  const failed = loadHarness({
    initial: { digitalMikeyFounder: primary, "objective-0": "true", "objective-1": "false" },
    behavior: { setItem(key) { if (key === "digitalMikeyFounder") throw new Error("primary unavailable"); } },
  });
  failed.api.loadFounder();
  assert.equal(failed.localStorage.values.get("objective-0"), "true");
  assert.equal(failed.localStorage.values.get("objective-1"), "false");

  const succeeded = loadHarness({ initial: { digitalMikeyFounder: primary, "objective-0": "true", "objective-1": "false" } });
  succeeded.api.loadFounder();
  assert.equal(succeeded.localStorage.values.has("objective-0"), false);
  assert.deepEqual(JSON.parse(succeeded.localStorage.values.get("digitalMikeyFounder")).missionObjectiveCompletion, [true, false]);
});

test("Commander save remains truthful and normal save/reload preserves Profile and artifacts", () => {
  const first = loadHarness({ commander: true });
  first.api.founder.profile.capabilities = [{ id: "capability-1", status: "active" }];
  first.api.founder.memory.artifacts = { fieldReports: [{ id: "report-1" }] };
  assert.equal(first.api.CommanderSystem.save(), true);
  const second = loadHarness({ initial: { digitalMikeyFounder: first.localStorage.values.get("digitalMikeyFounder") } });
  second.api.loadFounder();
  assert.deepEqual(clone(second.api.founder.profile.capabilities), [{ id: "capability-1", status: "active" }]);
  assert.deepEqual(clone(second.api.founder.memory.artifacts), { fieldReports: [{ id: "report-1" }] });

  const failed = loadHarness({ commander: true, behavior: { setItem() { throw new Error("primary unavailable"); } } });
  assert.throws(() => failed.api.CommanderSystem.save(), /primary unavailable/);
});
