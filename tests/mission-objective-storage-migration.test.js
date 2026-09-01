const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadStorage(initialEntries = []) {
  const storage = new Map(initialEntries);
  const writes = [];
  const removals = [];
  const localStorage = {
    get length() { return storage.size; },
    key(index) { return Array.from(storage.keys())[index] || null; },
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) {
      writes.push(key);
      storage.set(key, String(value));
    },
    removeItem(key) {
      removals.push(key);
      storage.delete(key);
    },
  };
  const context = vm.createContext({ console, localStorage });
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/storage.js"), "utf8"),
    context,
    { filename: "js/storage.js" },
  );
  vm.runInContext(
    "globalThis.__api={founder,loadFounder,saveFounder};",
    context,
  );
  return { api: context.__api, storage, writes, removals };
}

test("legacy objective booleans migrate once into Commander state and numeric keys are deleted", () => {
  const savedFounder = {
    currentMission: "Legacy mission",
    missionObjectives: ["One", "Two", "Three"],
  };
  const harness = loadStorage([
    ["digitalMikeyFounder", JSON.stringify(savedFounder)],
    ["objective-0", "true"],
    ["objective-1", "false"],
    ["objective-2", "true"],
    ["objective-3", "true"],
    ["objective-99", "true"],
  ]);

  harness.api.loadFounder();

  assert.deepEqual(
    clone(harness.api.founder.missionObjectiveCompletion),
    [true, false, true],
  );
  assert.equal(harness.api.founder.missionObjectiveCompletionMigrated, true);
  assert.equal(
    Array.from(harness.storage.keys()).some((key) => /^objective-\d+$/.test(key)),
    false,
  );
  assert.deepEqual(
    new Set(harness.removals),
    new Set(["objective-0", "objective-1", "objective-2", "objective-3", "objective-99"]),
  );

  const persisted = JSON.parse(harness.storage.get("digitalMikeyFounder"));
  assert.deepEqual(persisted.missionObjectiveCompletion, [true, false, true]);
  assert.equal(persisted.missionObjectiveCompletionMigrated, true);

  const writesAfterMigration = harness.writes.length;
  harness.api.loadFounder();
  assert.equal(harness.writes.length, writesAfterMigration);
});

test("malformed and out-of-range legacy values create no completion", () => {
  const harness = loadStorage([
    ["digitalMikeyFounder", JSON.stringify({
      currentMission: "Legacy mission",
      missionObjectives: ["One", "Two", "Three"],
    })],
    ["objective-0", "yes"],
    ["objective-1", "1"],
    ["objective-2", "TRUE"],
    ["objective-8", "true"],
  ]);

  harness.api.loadFounder();

  assert.deepEqual(clone(harness.api.founder.missionObjectiveCompletion), []);
  assert.equal(harness.api.founder.missionObjectiveCompletionMigrated, true);
  assert.equal(
    Array.from(harness.storage.keys()).some((key) => /^objective-\d+$/.test(key)),
    false,
  );
});

test("existing authoritative booleans win while missing indexes may migrate once", () => {
  const harness = loadStorage([
    ["digitalMikeyFounder", JSON.stringify({
      currentMission: "Transition mission",
      missionObjectives: ["One", "Two", "Three"],
      missionObjectiveCompletion: [false],
    })],
    ["objective-0", "true"],
    ["objective-1", "true"],
    ["objective-2", "false"],
  ]);

  harness.api.loadFounder();

  assert.deepEqual(
    clone(harness.api.founder.missionObjectiveCompletion),
    [false, true, false],
  );
});

test("already-migrated authoritative empty state ignores stale legacy keys", () => {
  const harness = loadStorage([
    ["digitalMikeyFounder", JSON.stringify({
      currentMission: "Current mission",
      missionObjectives: ["One", "Two", "Three"],
      missionObjectiveCompletion: [],
      missionObjectiveCompletionMigrated: true,
    })],
    ["objective-0", "true"],
  ]);

  harness.api.loadFounder();

  assert.deepEqual(clone(harness.api.founder.missionObjectiveCompletion), []);
  assert.equal(harness.storage.get("objective-0"), "true");
  assert.equal(harness.writes.length, 0);
});

test("current mission code has no loose-key read or write authority", () => {
  const source = fs.readFileSync(path.join(root, "js/missions.js"), "utf8");
  assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem)\([^\n]*objective-/);
  assert.doesNotMatch(source, /localStorage\.setItem\(\s*task\.id/);
  assert.match(source, /founder\.missionObjectiveCompletion = Array\.from\(/);
});
