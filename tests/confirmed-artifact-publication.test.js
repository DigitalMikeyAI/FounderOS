const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const storageSource = fs.readFileSync(path.join(root, "js", "storage.js"), "utf8");
const commanderSource = fs.readFileSync(path.join(root, "systems", "commander.system.js"), "utf8");
const memorySource = fs.readFileSync(path.join(root, "systems", "memory.system.js"), "utf8");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStorage(initial = {}, behavior = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      if (behavior.getItem) return behavior.getItem(key, values);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (behavior.setItem) behavior.setItem(key, String(value), values);
      else values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    get values() { return values; },
  };
}

function loadHarness({ initial = {}, behavior = {}, includeCommander = true, json = JSON } = {}) {
  const localStorage = createStorage(initial, behavior);
  const context = vm.createContext({
    JSON: json,
    Date,
    localStorage,
    sessionStorage: createStorage(),
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(storageSource, context, { filename: "js/storage.js" });
  if (includeCommander) {
    vm.runInContext(commanderSource, context, { filename: "systems/commander.system.js" });
  }
  vm.runInContext(memorySource, context, { filename: "systems/memory.system.js" });
  vm.runInContext(
    ";globalThis.__api = { founder, loadFounder, saveFounder, CommanderSystem: typeof CommanderSystem === 'undefined' ? null : CommanderSystem, MemorySystem };",
    context,
  );
  return { api: context.__api, localStorage };
}

function seedLiveState(harness) {
  const { founder, MemorySystem } = harness.api;
  const oldArtifact = { type: "target", value: "old", nested: { preserved: true } };
  const unrelatedArtifact = { type: "unrelated", value: "unchanged" };
  founder.memory.artifacts = { target: oldArtifact, unrelated: unrelatedArtifact };
  founder.profile = { strengths: ["Existing"], capabilities: [{ id: "capability" }], other: true };
  MemorySystem.lastArtifact = oldArtifact;
  return { oldArtifact, unrelatedArtifact, profile: founder.profile, memory: founder.memory, artifacts: founder.memory.artifacts };
}

test("confirmed artifact save persists candidate then publishes live artifact and lastArtifact", () => {
  const harness = loadHarness();
  const refs = seedLiveState(harness);
  const input = { type: "target", nested: { value: "new" } };
  const saved = harness.api.MemorySystem.saveArtifact(input);
  const persisted = JSON.parse(harness.localStorage.values.get("digitalMikeyFounder"));

  assert.deepEqual(clone(persisted.memory.artifacts.target), clone(saved));
  assert.equal(harness.api.founder.memory.artifacts.target, saved);
  assert.equal(harness.api.MemorySystem.getLastArtifact(), saved);
  assert.equal(harness.api.founder.memory, refs.memory);
  assert.equal(harness.api.founder.memory.artifacts, refs.artifacts);
  assert.equal(harness.api.founder.memory.artifacts.unrelated, refs.unrelatedArtifact);
  assert.equal(harness.api.founder.profile, refs.profile);
});

test("primary-write observation sees only pre-commit live artifact, lastArtifact, and Profile", () => {
  let observed;
  const harness = loadHarness({ behavior: { setItem(key, value, values) {
    if (key === "digitalMikeyFounder") {
      observed = {
        artifact: harness.api.MemorySystem.getArtifact("target"),
        lastArtifact: harness.api.MemorySystem.getLastArtifact(),
        profile: harness.api.founder.profile,
      };
    }
    values.set(key, value);
  } } });
  const refs = seedLiveState(harness);

  harness.api.MemorySystem.saveArtifact({ type: "target", value: "new" });

  assert.equal(observed.artifact, refs.oldArtifact);
  assert.equal(observed.lastArtifact, refs.oldArtifact);
  assert.equal(observed.profile, refs.profile);
});

test("primary, serialization, and failed-load failures do not publish artifact state", () => {
  for (const scenario of ["primary", "serialization", "failed-load"]) {
    const harness = loadHarness({ behavior: {
      setItem(key) { if (scenario === "primary" && key === "digitalMikeyFounder") throw new Error("primary failed"); },
    } });
    const refs = seedLiveState(harness);
    if (scenario === "serialization") {
      harness.api.founder.circular = harness.api.founder;
    }
    if (scenario === "failed-load") {
      harness.localStorage.values.set("digitalMikeyFounder", "{bad json");
      harness.api.loadFounder();
    }

    assert.throws(() => harness.api.MemorySystem.saveArtifact({ type: "target", value: "new" }));
    assert.equal(harness.api.founder.memory, refs.memory);
    assert.equal(harness.api.founder.memory.artifacts, refs.artifacts);
    assert.equal(harness.api.founder.memory.artifacts.target, refs.oldArtifact);
    assert.equal(harness.api.MemorySystem.getLastArtifact(), refs.oldArtifact);
    assert.equal(harness.api.founder.profile, refs.profile);
    assert.equal(harness.api.founder.memory.artifacts.unrelated, refs.unrelatedArtifact);
  }
});

test("legacy mirror failure confirms primary persistence and publishes artifact state", () => {
  const harness = loadHarness({ behavior: { setItem(key, value, values) {
    if (key === "founder") throw new Error("legacy failed");
    values.set(key, value);
  } } });
  seedLiveState(harness);
  const saved = harness.api.MemorySystem.saveArtifact({ type: "target", value: "new" });

  assert.equal(saved.value, "new");
  assert.equal(harness.api.MemorySystem.getLastArtifact(), saved);
  assert.equal(JSON.parse(harness.localStorage.values.get("digitalMikeyFounder")).memory.artifacts.target.value, "new");
});

test("missing or non-true persistence confirmation throws without publication", () => {
  const missing = loadHarness({ includeCommander: false });
  const missingRefs = seedLiveState(missing);
  assert.throws(() => missing.api.MemorySystem.saveArtifact({ type: "target", value: "new" }), /unavailable/);
  assert.equal(missing.api.founder.memory.artifacts.target, missingRefs.oldArtifact);

  for (const confirmation of [false, null, undefined]) {
    const harness = loadHarness();
    const refs = seedLiveState(harness);
    harness.api.CommanderSystem.save = () => confirmation;
    assert.throws(() => harness.api.MemorySystem.saveArtifact({ type: "target", value: "new" }), /not confirmed/);
    assert.equal(harness.api.founder.memory.artifacts.target, refs.oldArtifact);
    assert.equal(harness.api.MemorySystem.getLastArtifact(), refs.oldArtifact);
    assert.equal(harness.api.founder.profile, refs.profile);
  }
});

test("unrelated artifacts leave absent and existing Profile untouched", () => {
  const absent = loadHarness();
  delete absent.api.founder.profile;
  absent.api.MemorySystem.saveArtifact({ type: "unrelated", value: true });
  assert.equal(Object.hasOwn(absent.api.founder, "profile"), false);

  const existing = loadHarness();
  const profile = existing.api.founder.profile;
  const before = clone(profile);
  existing.api.MemorySystem.saveArtifact({ type: "unrelated", value: true });
  assert.equal(existing.api.founder.profile, profile);
  assert.deepEqual(clone(existing.api.founder.profile), before);
});

test("strength-profile persists artifact and strengths together then publishes without replacing Profile", () => {
  let candidateDuringPrimary;
  const harness = loadHarness({ behavior: { setItem(key, value, values) {
    if (key === "digitalMikeyFounder") candidateDuringPrimary = JSON.parse(value);
    values.set(key, value);
  } } });
  const refs = seedLiveState(harness);
  const saved = harness.api.MemorySystem.saveArtifact({ type: "strength-profile", strengths: ["Updated"] });

  assert.deepEqual(candidateDuringPrimary.memory.artifacts["strength-profile"].strengths, ["Updated"]);
  assert.deepEqual(candidateDuringPrimary.profile.strengths, ["Updated"]);
  assert.equal(harness.api.founder.profile, refs.profile);
  assert.deepEqual(clone(harness.api.founder.profile.strengths), ["Updated"]);
  assert.deepEqual(clone(harness.api.founder.profile.capabilities), [{ id: "capability" }]);
  assert.equal(harness.api.founder.memory.artifacts["strength-profile"], saved);
});

test("strength-profile failure publishes neither artifact nor strengths", () => {
  const harness = loadHarness({ behavior: { setItem(key) {
    if (key === "digitalMikeyFounder") throw new Error("primary failed");
  } } });
  const refs = seedLiveState(harness);
  assert.throws(() => harness.api.MemorySystem.saveArtifact({ type: "strength-profile", strengths: ["Updated"] }));
  assert.equal(harness.api.founder.profile, refs.profile);
  assert.deepEqual(clone(harness.api.founder.profile.strengths), ["Existing"]);
  assert.equal(harness.api.founder.memory.artifacts.target, refs.oldArtifact);
  assert.equal(harness.api.founder.memory.artifacts["strength-profile"], undefined);
});

test("saved input is deeply detached, getters remain live, recall remains shallow, and reload restores committed artifact", () => {
  const first = loadHarness();
  const input = { type: "detached", nested: { value: "saved" } };
  const saved = first.api.MemorySystem.saveArtifact(input);
  input.nested.value = "mutated";

  assert.equal(saved.nested.value, "saved");
  assert.equal(first.api.MemorySystem.getArtifact("detached"), saved);
  assert.equal(first.api.MemorySystem.getArtifacts().detached, saved);
  assert.equal(first.api.MemorySystem.getLastArtifact(), saved);
  const recalled = first.api.MemorySystem.recall("detached");
  assert.notEqual(recalled.artifact, saved);
  assert.equal(recalled.artifact.nested, saved.nested);

  const second = loadHarness({ initial: { digitalMikeyFounder: first.localStorage.values.get("digitalMikeyFounder") } });
  second.api.loadFounder();
  assert.deepEqual(clone(second.api.MemorySystem.getArtifact("detached").nested), { value: "saved" });
});