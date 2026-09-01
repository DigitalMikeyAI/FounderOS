const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadHarness(initialNow = "2026-08-31T14:00:00.000Z") {
  const storage = new Map();
  const elements = new Map();
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    JSON,
    Math,
    __now: initialNow,
    __tasks: [],
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          elements.set(id, {
            hidden: false,
            style: {},
            textContent: "",
            innerHTML: "",
            addEventListener() {},
          });
        }
        return elements.get(id);
      },
      querySelectorAll(selector) {
        return selector === ".mission-task" ? context.__tasks : [];
      },
    },
    CommanderSystem: {
      save() {
        context.saveFounder();
      },
    },
    updateFounderLevel() {},
    updateFounderDisplay() {},
    updateCommandLog() {},
    updateXP() {},
    updateMissionProgress() {},
    updateMissionStatus() {},
    generateArchieLogNote() {
      return "Archived by Commander";
    },
    ArchieCore: { refreshSession: async () => {} },
  });

  vm.runInContext(
    "Date = class extends Date { constructor(value) { super(value === undefined ? __now : value); } static now() { return new Date(__now).getTime(); } };",
    context,
  );
  for (const relativePath of ["js/storage.js", "js/endday.js"]) {
    const filename = path.join(root, relativePath);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  }
  vm.runInContext(
    ";globalThis.__api = { founder, archiveMissionDay };",
    context,
  );

  function activate(mission, completedCount) {
    context.__tasks = [0, 1, 2, 3].map((index) => ({
      id: `objective-${index}`,
      checked: index < completedCount,
      dataset: { xp: "25" },
    }));
    vm.runInContext("tasks = __tasks;", context);
    Object.assign(context.__api.founder, {
      currentMission: mission,
      missionStatus: "active",
    });
  }

  return {
    api: context.__api,
    context,
    storage,
    activate,
    setNow(value) {
      context.__now = value;
    },
  };
}

test("two same-day mission archives create distinct newest-first history events", () => {
  const { api, activate, setNow } = loadHarness();
  Object.assign(api.founder, { xp: 10, streak: 2, commandLog: [] });

  activate("Mission A", 3);
  const firstResult = api.archiveMissionDay();
  const firstSnapshot = clone(api.founder.commandLog[0]);

  setNow("2026-08-31T16:30:00.000Z");
  activate("Mission B", 4);
  const secondResult = api.archiveMissionDay();

  assert.equal(firstResult.success, true);
  assert.equal(secondResult.success, true);
  assert.equal(api.founder.commandLog.length, 2);
  assert.deepEqual(clone(api.founder.commandLog[1]), firstSnapshot);
  assert.deepEqual(
    clone(api.founder.commandLog.map(({ mission, xp, objectives }) => ({ mission, xp, objectives }))),
    [
      { mission: "Mission B", xp: 100, objectives: 4 },
      { mission: "Mission A", xp: 75, objectives: 3 },
    ],
  );
  assert.notEqual(api.founder.commandLog[0].id, api.founder.commandLog[1].id);
  assert.equal(api.founder.commandLog[0].date, "2026-08-31");
  assert.equal(api.founder.commandLog[1].date, "2026-08-31");
  assert.equal(api.founder.xp, 185);
  assert.equal(api.founder.streak, 3);
});

test("duplicate archive invocation cannot add history or award XP twice", () => {
  const { api, activate } = loadHarness();
  Object.assign(api.founder, { xp: 0, streak: 0, commandLog: [] });
  activate("Mission A", 3);

  api.archiveMissionDay();
  const duplicateResult = api.archiveMissionDay();

  assert.deepEqual(clone(duplicateResult), {
    success: false,
    changed: false,
    reason: "no-active-mission",
  });
  assert.equal(api.founder.xp, 75);
  assert.equal(api.founder.commandLog.length, 1);
});

test("daily streak credits the first completed archive only and a later day again", () => {
  const { api, activate, setNow } = loadHarness();
  Object.assign(api.founder, { xp: 0, streak: 5, commandLog: [] });

  activate("Incomplete Mission", 0);
  api.archiveMissionDay();
  assert.equal(api.founder.streak, 5);

  activate("Completed Mission A", 2);
  api.archiveMissionDay();
  activate("Completed Mission B", 1);
  api.archiveMissionDay();
  assert.equal(api.founder.streak, 6);

  setNow("2026-09-01T09:00:00.000Z");
  activate("Next-Day Mission", 1);
  api.archiveMissionDay();
  assert.equal(api.founder.streak, 7);
  assert.deepEqual(
    clone(api.founder.commandLog.map((entry) => entry.date)),
    ["2026-09-01", "2026-08-31", "2026-08-31", "2026-08-31"],
  );
});

test("saved founder reload preserves both same-day records and their order", () => {
  const { api, activate, context, setNow } = loadHarness();
  Object.assign(api.founder, { xp: 0, streak: 0, commandLog: [] });
  activate("Mission A", 3);
  api.archiveMissionDay();
  setNow("2026-08-31T18:00:00.000Z");
  activate("Mission B", 2);
  api.archiveMissionDay();
  const beforeReload = clone(api.founder.commandLog);

  vm.runInContext(
    "founder.commandLog = []; loadFounder(); globalThis.__reloaded = founder.commandLog;",
    context,
  );

  assert.deepEqual(clone(context.__reloaded), beforeReload);
  assert.equal(context.__reloaded[0].mission, "Mission B");
  assert.equal(context.__reloaded[1].mission, "Mission A");
  assert.equal(api.founder.xp, 125);
});

test("command-log renderer displays every same-date entry without grouping", () => {
  const source = fs.readFileSync(path.join(root, "js/archie.js"), "utf8");
  const rendererStart = source.indexOf("function updateCommandLog()");
  const rendererEnd = source.indexOf(
    "// LEARNING HISTORY RENDERER",
    rendererStart,
  );
  const rendererSource = source.slice(rendererStart, rendererEnd);
  assert.ok(rendererSource, "command-log renderer should be extractable");

  const records = [];
  const commandLog = { innerHTML: "", appendChild(record) { records.push(record); } };
  const context = vm.createContext({
    Date,
    founder: {
      commandLog: [
        { date: "2026-08-31", mission: "Mission B", xp: 100, objectives: 4, streak: 1 },
        { date: "2026-08-31", mission: "Mission A", xp: 75, objectives: 3, streak: 1 },
      ],
    },
    document: {
      getElementById() { return commandLog; },
      createElement() { return { className: "", innerHTML: "" }; },
    },
  });
  vm.runInContext(`${rendererSource}; updateCommandLog();`, context);

  assert.equal(records.length, 2);
  assert.match(records[0].innerHTML, /Mission B/);
  assert.match(records[0].innerHTML, /\+100/);
  assert.match(records[0].innerHTML, /4 completed/);
  assert.match(records[1].innerHTML, /Mission A/);
  assert.match(records[1].innerHTML, /\+75/);
  assert.match(records[1].innerHTML, /3 completed/);
});

test("Progress initializes the existing command-log renderer", () => {
  const html = fs.readFileSync(path.join(root, "progress.html"), "utf8");

  assert.match(
    html,
    /function initCommandLog\(\)[\s\S]*?typeof updateCommandLog === "function"[\s\S]*?updateCommandLog\(\)/,
  );
});
