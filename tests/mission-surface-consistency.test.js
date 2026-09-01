const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const dashboard = read("index.html");
const missions = read("missions.html");
const progress = read("progress.html");

test("Missions is the only full mission-management surface", () => {
  for (const control of [
    /id="accept-mission"/,
    /id="mission-task-container"/,
    /id="archive-mission-button"/,
    /id="pending-mission-request-status"/,
    /id="select-rapport-mission"/,
  ]) assert.match(missions, control);

  for (const surface of [dashboard, progress]) {
    assert.doesNotMatch(surface, /id="accept-mission"/);
    assert.doesNotMatch(surface, /id="mission-task-container"/);
    assert.doesNotMatch(surface, /id="archive-mission-button"/);
    assert.doesNotMatch(surface, /id="pending-mission-request-status"/);
    assert.doesNotMatch(surface, /id="select-rapport-mission"/);
  }
});

test("Dashboard exposes a read-only mission summary and exact navigation CTA", () => {
  assert.match(dashboard, /id="active-mission-title"/);
  assert.match(dashboard, /id="active-mission-description"/);
  assert.match(dashboard, /id="mission-status"/);
  assert.match(dashboard, /id="mission-progress"/);
  assert.match(dashboard, /id="mission-objective-summary"/);
  assert.match(
    dashboard,
    /id="open-mission"[^>]*href="missions\.html"[^>]*>\s*Open Mission\s*<\/a>/,
  );
  const cta = dashboard.match(/<a id="open-mission"[\s\S]*?<\/a>/)[0];
  assert.doesNotMatch(cta, /onclick|missionStatus|pendingMission|localStorage/);
});

test("Dashboard contains no interactive objective completion controls", () => {
  assert.doesNotMatch(dashboard, /class="mission-task"/);
  assert.doesNotMatch(dashboard, /id="objective-\$\{index\}"/);
  assert.doesNotMatch(dashboard, /Open Field Report/);
});

test("Progress remains history and review without active lifecycle controls", () => {
  assert.match(progress, /Mission History/);
  assert.match(progress, /Learning History/);
  assert.match(progress, /Coaching History/);
  assert.doesNotMatch(progress, /id="mission-briefing"/);
  assert.doesNotMatch(progress, /id="accept-mission"/);
  assert.doesNotMatch(progress, /id="mission-task-container"/);
  assert.doesNotMatch(progress, /id="archive-mission-button"/);
  assert.doesNotMatch(dashboard, /id="command-log"/);
});

test("Field Report area has recording controls but no mission lifecycle controls", () => {
  const fieldReport = dashboard.match(
    /<section class="card field-report-card"[\s\S]*?<script src="js\/widgets\/field-report\.widget\.js"><\/script>/,
  );
  assert.ok(fieldReport);
  assert.match(fieldReport[0], /field-report-form/);
  assert.doesNotMatch(
    fieldReport[0],
    /accept-mission|archive-mission|pending-mission|select-.*mission|mission-task/,
  );
});

test("Dashboard read-only summary uses authoritative objective state without writes", () => {
  const writes = [];
  const summary = { textContent: "" };
  let progressUpdates = 0;
  let statusUpdates = 0;
  const context = vm.createContext({
    console,
    founder: {
      missionObjectives: ["Notice", { text: "Perform" }, "Record"],
      missionObjectiveCompletion: [true, false, true],
      missionStatus: "active",
    },
    MissionSystem: {
      normalizeMissionObjective(objective) {
        return typeof objective === "string" ? { text: objective } : objective;
      },
    },
    localStorage: {
      getItem() { throw new Error("Dashboard rendering must not read legacy objective keys"); },
      setItem(key, value) { writes.push([key, value]); },
    },
    document: {
      getElementById(id) {
        if (id === "mission-objective-summary") return summary;
        return null;
      },
      querySelectorAll() { return []; },
      createElement() { return {}; },
    },
    updateMissionProgress() { progressUpdates += 1; },
    updateMissionStatus() { statusUpdates += 1; },
  });
  vm.runInContext(read("js/missions.js"), context, { filename: "js/missions.js" });
  vm.runInContext("updateMissionChecklist(); globalThis.__tasks = tasks;", context);

  assert.equal(summary.textContent, "2 of 3 objectives complete.");
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.__tasks.map(({ id, checked }) => ({ id, checked })))),
    [
      { id: "objective-0", checked: true },
      { id: "objective-1", checked: false },
      { id: "objective-2", checked: true },
    ],
  );
  assert.deepEqual(writes, []);
  assert.equal(progressUpdates, 1);
  assert.equal(statusUpdates, 1);
});

test("shared startup previews pending missions only where management UI exists", () => {
  const source = read("js/main.js");
  assert.match(
    source,
    /missionBriefing\s*&&\s*missionResult\s*&&\s*acceptMission[\s\S]*presentPendingMissionRequestForPreview/,
  );
  assert.match(source, /if \(!missionBriefing\)[\s\S]*window\.location\.href = "missions\.html"/);
});

test("navigation and read-only rendering introduce no evidence authority", () => {
  const changedSources = `${read("js/main.js")} ${read("js/missions.js")}`;
  const summaryBlock = changedSources.match(
    /function getReadOnlyMissionTasks\(\)[\s\S]*?function updateMissionObjectiveSummary\(\)[\s\S]*?\n}/,
  );
  assert.ok(summaryBlock);
  assert.doesNotMatch(
    summaryBlock[0],
    /fieldReports|salesStepOutcomes|learningSignals|coachingSignals|behavioralEvidence|profile\.capabilities/,
  );
});

test("Archive Mission, pending selection, and Field Report handoff stay Missions-only", () => {
  assert.match(missions, /id="archive-mission-button"/);
  assert.match(missions, /id="pending-mission-request-status"/);
  assert.match(read("js/missions.js"), /href="index\.html#field-report-card"/);
  assert.doesNotMatch(dashboard, /id="archive-mission-button"/);
  assert.doesNotMatch(progress, /id="archive-mission-button"/);
});

test("End Day remains available without becoming a duplicated direct Archive Mission action", () => {
  assert.match(dashboard, /id="end-day-button"/);
  assert.match(missions, /id="end-day-button"/);
  assert.doesNotMatch(dashboard, /id="archive-mission-button"/);
});
