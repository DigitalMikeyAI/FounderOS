const test = require("node:test"); const assert = require("node:assert/strict"); const fs = require("node:fs"); const path = require("node:path"); const vm = require("node:vm");
const root = path.resolve(__dirname, ".."); const source = fs.readFileSync(path.join(root, "js/widgets/operating-setup.widget.js"), "utf8"); const index = fs.readFileSync(path.join(root, "index.html"), "utf8"); const styleSource = fs.readFileSync(path.join(root, "style.css"), "utf8"); const clone = (value) => JSON.parse(JSON.stringify(value)); const ownerFiles = ["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js", "systems/candidate-move-commitment.system.js", "systems/candidate-move-routine.system.js", "systems/candidate-move-schedule.system.js", "systems/candidate-move-performance.system.js", "systems/action-result.system.js", "systems/commander-context.system.js", "systems/commander-attention-policy.system.js"];
function element(datetimeLocal = false) { const result = { children: [], appendChild(child) { this.children.push(child); return child; }, replaceChildren(...children) { this.children = children; }, checked: false, textContent: "", hidden: false, disabled: false, handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } }; let value = ""; Object.defineProperty(result, "value", { get() { return value; }, set(next) { value = (datetimeLocal || result.type === "datetime-local") && typeof next === "string" ? next.replace(/(T\d{2}:\d{2}):00(?:\.0+)?$/, "$1") : next; }, enumerable: true }); return result; }
function activeSituation(revision = 1, subject = "Package", currentReality = "Ready.") { return { status: "available", current: { id: "situation_a", revision, subject, currentReality, carryStatus: "active" } }; }
function activeMove(revision = 1, action = "Send package.") { return { status: "available", current: { id: "candidate_move_a", situationId: "situation_a", revision, action, status: "active" } }; }
function activeContext(revision = 1, mode = "open") { return { status: "available", current: { revision, status: "active", scope: mode === "open" ? { mode } : { mode, situationIds: ["situation_a"] } } }; }
function activePolicy(revision = 1) { return { status: "available", current: { revision, status: "active", rules: [{ id: "attention_rule_a_a", conditions: ["move.clarify"] }] } }; }
function harness({ situation = { status: "absent", situation: null }, move = { status: "absent", candidateMove: null }, context = { status: "absent" }, policy = { status: "absent" }, fail = {} } = {}) {
  const nodes = new Map(); const ids = ["operating-setup-status", "operating-setup-error", "operating-situation-current", "operating-situation-subject", "operating-situation-reality", "operating-situation-form", "operating-situation-subject-input", "operating-situation-reality-input", "operating-situation-submit", "operating-situation-edit", "operating-situation-close", "operating-move-current", "operating-move-absent", "operating-move-prerequisite", "operating-move-action", "operating-move-form", "operating-move-action-input", "operating-move-submit", "operating-move-edit", "operating-move-withdraw", "operating-context-current", "operating-context-scoped", "operating-context-open", "operating-context-clear", "operating-policy-clarify", "operating-policy-current", "operating-policy-submit", "operating-policy-clear", "operating-policy-guidance"]; for (const match of index.matchAll(/id="(operating-[^"]+)"/g)) nodes.set(match[1], element()); const calls = { situation: [], move: [], context: [], policy: [], saves: 0, storage: 0, other: 0 };
  const SituationSystem = { getSituation() { return clone(situation); }, createSituation(input) { calls.situation.push(["create", clone(input)]); if (fail.situation) throw new Error("Situation failed"); situation = activeSituation(1, input.subject, input.currentReality); }, correctSituation(input) { calls.situation.push(["correct", clone(input)]); situation = activeSituation(input.expectedRevision + 1, situation.current.subject, input.currentReality); }, closeSituation(input) { calls.situation.push(["close", clone(input)]); situation = { status: "available", current: { ...situation.current, revision: input.expectedRevision + 1, carryStatus: "closed" } }; } };
  const CandidateMoveSystem = { getCandidateMove() { return clone(move); }, createCandidateMove(input) { calls.move.push(["create", clone(input)]); if (fail.move) throw new Error("Move failed"); move = activeMove(1, input.action); }, correctCandidateMove(input) { calls.move.push(["correct", clone(input)]); move = activeMove(input.expectedRevision + 1, input.action); }, withdrawCandidateMove(input) { calls.move.push(["withdraw", clone(input)]); move = { status: "available", current: { ...move.current, revision: input.expectedRevision + 1, status: "withdrawn" } }; } };
  const CommanderContextSystem = { getContext() { return clone(context); }, setOpenContext(input) { calls.context.push(["open", clone(input)]); context = activeContext((context.current?.revision || 0) + 1); }, setScopedContext(input) { calls.context.push(["scoped", clone(input)]); context = activeContext((context.current?.revision || 0) + 1, "scoped"); }, clearContext(input) { calls.context.push(["clear", clone(input)]); context = { status: "available", current: { revision: input.expectedRevision + 1, status: "cleared" } }; } };
  const CommanderAttentionPolicySystem = { getAttentionPolicy() { return clone(policy); }, establishAttentionPolicy(input) { calls.policy.push(["establish", clone(input)]); policy = activePolicy((policy.current?.revision || 0) + 1); }, replaceAttentionPolicy(input) { calls.policy.push(["replace", clone(input)]); policy = activePolicy(input.expectedRevision + 1); }, clearAttentionPolicy(input) { calls.policy.push(["clear", clone(input)]); policy = { status: "available", current: { revision: input.expectedRevision + 1, status: "cleared" } }; } };
  const runtime = vm.createContext({ window: {}, document: { createElement(tag) { const node = element(); node.tagName = tag; return node; }, getElementById(id) { return nodes.get(id) || null; } }, SituationSystem, CandidateMoveSystem, CommanderContextSystem, CommanderAttentionPolicySystem, console: { warn() {}, error() {} } }); vm.runInContext(source, runtime); const fire = (id, type = "click") => nodes.get(id).handlers[type]({ preventDefault() {} }); return { nodes, calls, fire, state: () => ({ situation, move, context, policy }), widget: runtime.window.OperatingSetupWidget }; }

test("fresh render is incomplete, creates no authority, and exposes only bounded singleton setup copy", () => { const h = harness(); assert.equal(h.nodes.get("operating-setup-status").textContent, "Start with what’s going on."); assert.deepEqual(h.calls, { situation: [], move: [], context: [], policy: [], saves: 0, storage: 0, other: 0 }); assert.match(index, /What’s going on\?/); assert.match(index, /What are you trying to do\?/); assert.doesNotMatch(index, /Add Situation|Add another move|backlog|portfolio|to-do/i); assert.match(index, /When I need to take another look/); assert.doesNotMatch(index, /move\.actionable|move\.waiting|move\.hold|commitment\.active|routine\.current/); });

test("real fresh owner contracts are absent only after healthy Founder load and render as incomplete", () => { const values = new Map(); const localStorage = { get length() { return values.size; }, key(i) { return Array.from(values.keys())[i] || null; }, getItem(key) { return values.has(key) ? values.get(key) : null; }, setItem(key, value) { values.set(key, String(value)); }, removeItem(key) { values.delete(key); } }; const runtime = vm.createContext({ Date, Math, JSON, localStorage, console: { warn() {}, error() {} } }); for (const file of ownerFiles) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), runtime, { filename: file }); vm.runInContext(";globalThis.__owners={loadFounder,SituationSystem,CandidateMoveSystem,CommanderContextSystem,CommanderAttentionPolicySystem};", runtime); assert.equal(runtime.__owners.SituationSystem.getSituation().status, "unavailable"); runtime.__owners.loadFounder(); const fresh = { situation: runtime.__owners.SituationSystem.getSituation(), move: runtime.__owners.CandidateMoveSystem.getCandidateMove(), context: runtime.__owners.CommanderContextSystem.getContext(), policy: runtime.__owners.CommanderAttentionPolicySystem.getAttentionPolicy() }; assert.deepEqual(clone(fresh), { situation: { status: "absent", situation: null }, move: { status: "absent", candidateMove: null }, context: { status: "absent" }, policy: { status: "absent" } }); const h = harness(fresh); assert.equal(h.nodes.get("operating-setup-status").textContent, "Start with what’s going on."); assert.match(h.nodes.get("operating-context-current").textContent, /haven’t chosen where/); assert.match(h.nodes.get("operating-policy-current").textContent, /haven’t saved radar/); assert.equal(h.nodes.get("operating-move-absent").hidden, false); assert.equal(h.nodes.get("operating-move-current").hidden, true); });
test("Current Move visibility requires an active Situation and an active Move", () => { const fresh = harness(); assert.equal(fresh.nodes.get("operating-move-absent").hidden, false); assert.equal(fresh.nodes.get("operating-move-current").hidden, true); assert.equal(fresh.nodes.get("operating-move-form").hidden, true); assert.equal(fresh.nodes.get("operating-move-prerequisite").hidden, false); const ready = harness({ situation: activeSituation() }); assert.equal(ready.nodes.get("operating-move-absent").hidden, false); assert.equal(ready.nodes.get("operating-move-current").hidden, true); assert.equal(ready.nodes.get("operating-move-form").hidden, false); assert.equal(ready.nodes.get("operating-move-prerequisite").hidden, true); const active = harness({ situation: activeSituation(), move: activeMove() }); assert.equal(active.nodes.get("operating-move-absent").hidden, true); assert.equal(active.nodes.get("operating-move-current").hidden, false); assert.equal(active.nodes.get("operating-move-form").hidden, true); assert.equal(active.nodes.get("operating-move-prerequisite").hidden, true); assert.match(styleSource, /\.operating-setup-card \[hidden\] \{ display: none !important; \}/); });

test("Situation and Current Move submit through owners with safe current bindings", () => { const h = harness(); h.nodes.get("operating-situation-subject-input").value = "<img src=x onerror=1>"; h.nodes.get("operating-situation-reality-input").value = "<script>bad()</script>"; h.fire("operating-situation-form", "submit"); assert.deepEqual(h.calls.situation, [["create", { subject: "<img src=x onerror=1>", currentReality: "<script>bad()</script>" }]]); assert.equal(h.nodes.get("operating-situation-subject").textContent, "<img src=x onerror=1>"); assert.equal(h.nodes.get("operating-situation-reality").textContent, "<script>bad()</script>"); h.nodes.get("operating-move-action-input").value = "Send it."; h.fire("operating-move-form", "submit"); assert.deepEqual(h.calls.move, [["create", { situationId: "situation_a", action: "Send it." }]]); assert.equal(h.nodes.get("operating-move-action").textContent, "Send it."); });

test("Current Situation is required for move creation and later failed move creation preserves earlier authority", () => { const absent = harness(); assert.equal(absent.nodes.get("operating-move-submit").disabled, true); const failed = harness({ situation: activeSituation(), fail: { move: true } }); failed.nodes.get("operating-move-action-input").value = "Try move."; failed.fire("operating-move-form", "submit"); assert.equal(failed.state().situation.current.subject, "Package"); assert.equal(failed.state().move.status, "absent"); assert.equal(failed.nodes.get("operating-setup-error").textContent, "Move failed"); });

test("Context establishes, switches, and clears with fresh revisions and exact current Situation binding", () => { const h = harness({ situation: activeSituation(), context: activeContext(4) }); h.fire("operating-context-scoped"); assert.deepEqual(h.calls.context[0], ["scoped", { situationIds: ["situation_a"], expectedRevision: 4 }]); h.fire("operating-context-open"); assert.deepEqual(h.calls.context[1], ["open", { expectedRevision: 5 }]); h.fire("operating-context-clear"); assert.deepEqual(h.calls.context[2], ["clear", { expectedRevision: 6 }]); });

test("Policy has no default or empty authority, supports Clarify, replaces, and clears with fresh revisions", () => { const h = harness({ policy: { status: "absent" } }); h.fire("operating-policy-submit"); assert.deepEqual(h.calls.policy, []); assert.match(h.nodes.get("operating-policy-guidance").textContent, /Select at least one/); h.nodes.get("operating-policy-clarify").checked = true; h.fire("operating-policy-submit"); assert.deepEqual(h.calls.policy[0], ["establish", { rules: [["move.clarify"]], expectedRevision: 0 }]); h.fire("operating-policy-submit"); assert.deepEqual(h.calls.policy[1], ["replace", { rules: [["move.clarify"]], expectedRevision: 1 }]); h.fire("operating-policy-clear"); assert.deepEqual(h.calls.policy[2], ["clear", { expectedRevision: 2 }]); });

test("corrections, closure, withdrawal, unavailable, cleared, and reload rendering use owner truth", () => { const h = harness({ situation: activeSituation(3), move: activeMove(4), context: { status: "available", current: { revision: 2, status: "cleared" } }, policy: { status: "unavailable" } }); assert.match(h.nodes.get("operating-context-current").textContent, /cleared/); assert.match(h.nodes.get("operating-policy-current").textContent, /unavailable/); h.fire("operating-situation-edit"); h.nodes.get("operating-situation-reality-input").value = "Changed."; h.fire("operating-situation-form", "submit"); assert.deepEqual(h.calls.situation[0], ["correct", { id: "situation_a", expectedRevision: 3, currentReality: "Changed." }]); h.fire("operating-move-edit"); h.nodes.get("operating-move-action-input").value = "Changed move."; h.fire("operating-move-form", "submit"); assert.deepEqual(h.calls.move[0], ["correct", { id: "candidate_move_a", expectedRevision: 4, action: "Changed move." }]); h.fire("operating-move-withdraw"); assert.deepEqual(h.calls.move[1], ["withdraw", { id: "candidate_move_a", expectedRevision: 5 }]); assert.match(h.nodes.get("operating-move-action").textContent, /withdrawn/); h.fire("operating-situation-close"); assert.deepEqual(h.calls.situation[1], ["close", { id: "situation_a", expectedRevision: 4 }]); assert.match(h.nodes.get("operating-situation-reality").textContent, /closed/); h.widget.render(); assert.equal(h.nodes.get("operating-setup-status").textContent, "Unavailable"); });

test("widget source has no direct persistence, cross-domain, or briefing integration", () => { for (const pattern of [/founder\./, /localStorage/, /sessionStorage/, /CommanderSystem\.save/, /Mission/, /Profile/, /Evidence/, /Memory/, /Guidance/, /Decision/, /Briefing/, /Communication/, /Notification/]) assert.doesNotMatch(source, pattern); assert.match(index, /js\/widgets\/operating-setup\.widget\.js/); });
// Real owners exercise the UI-to-persistence boundary without browser/profile data.
function realHarness(initial = {}, globals = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  const storage = { get length() { return values.size; }, key(i) { return [...values.keys()][i] || null; }, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { writes.push([key, String(value)]); values.set(key, String(value)); }, removeItem(key) { values.delete(key); } };
  const nodes = new Map([...index.matchAll(/id="(operating-[^"]+)"/g)].map((match) => { const node = element(["operating-commitment-deadline", "operating-schedule-time", "operating-performance-time", "operating-action-result-time"].includes(match[1])); node.open = false; return [match[1], node]; }));
  const context = vm.createContext({ Date, Math, JSON, localStorage: storage, sessionStorage: storage, window: {}, document: { createElement(tag) { const node = element(); node.tagName = tag; return node; }, getElementById(id) { return nodes.get(id) || null; } }, console: { log() {}, warn() {}, error() {} }, ...globals });
  const extra = ["candidate-move-hold", "candidate-move-dependency", "candidate-move-availability", "move-state"];
  for (const file of [...ownerFiles, ...extra.map((name) => `systems/${name}.system.js`)]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  vm.runInContext("loadFounder(); globalThis.api = { SituationSystem, CandidateMoveSystem, CandidateMoveCommitmentSystem, CandidateMoveRoutineSystem, CandidateMoveScheduleSystem, CandidateMovePerformanceSystem, ActionResultSystem, CandidateMoveHoldSystem, CandidateMoveDependencySystem, CandidateMoveAvailabilitySystem, MoveStateSystem, CommanderContextSystem, CommanderAttentionPolicySystem, CommanderSystem };", context);
  const calls = []; const commandMethods = new Set(["scheduleOccurrence", "rescheduleOccurrence", "cancelOccurrence", "reportPerformance", "retractPerformance", "reportActionResult", "retractActionResult"]);
  for (const [name, api] of Object.entries(context.api)) for (const method of Object.keys(api)) {
    if (!(commandMethods.has(method) || /^(create|correct|complete|cancel|close|release|resolve|confirm|reconfirm|withdraw|establish|replace|clear|pause|resume|retire)/.test(method)) || typeof api[method] !== "function") continue;
    const original = api[method]; api[method] = function (input) { calls.push({ name, method, input: clone(input) }); return original.call(this, input); };
  }
  vm.runInContext(source, context, { filename: "widget" });
  const n = (id) => nodes.get(`operating-${id}`);
  const fire = (id, type = "click") => { const target = n(id); assert.ok(target.handlers[type], `handler for ${id}`); target.handlers[type]({ preventDefault() {} }); };
  const input = (id, value) => { n(id).value = value; };
  const establish = () => { input("situation-subject-input", "Disposable package"); input("situation-reality-input", "Documents are collected."); fire("situation-form", "submit"); input("move-action-input", "Send the package."); fire("move-form", "submit"); };
  const confirm = () => { input("availability-input", "I checked the documents and destination."); fire("availability-form", "submit"); };
  const dependency = () => { input("dependency-input", "  Approval must arrive.  "); fire("dependency-form", "submit"); };
  const state = (expected) => { assert.equal(context.api.MoveStateSystem.getMoveState().state, expected); assert.equal(n("state-label").textContent, "Where things stand"); };
  return { n, fire, input, establish, confirm, dependency, state, api: context.api, calls, writes, values, render: context.window.OperatingSetupWidget.render };
}
function createCommitment(h, dueAt) { const move = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveCommitmentSystem.createCommitment({ candidateMoveId: move.id, expectedCandidateMoveRevision: move.revision, window: { kind: "deadline", dueAt } }); h.render(); return h.api.CandidateMoveCommitmentSystem.getCommitments().records.find((record) => record.status === "active"); }
function createRoutine(h, schedule = { kind: "weekly-utc", weekday: 1, opensAtUtc: "14:30:00Z", closesAtUtc: "15:00:00Z" }) { const move = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveRoutineSystem.createRoutine({ candidateMoveId: move.id, expectedCandidateMoveRevision: move.revision, schedule }); h.render(); return h.api.CandidateMoveRoutineSystem.getRoutines().routines.find((record) => record.lifecycle !== "retired"); }

test("Recurring window creates exact weekly UTC truth and does not offer schedule editing", () => {
  const h = realHarness(); h.establish(); h.input("routine-weekday", "1"); h.input("routine-opens", "14:30"); h.input("routine-closes", "15:00"); h.fire("routine-form", "submit");
  const call = h.calls.at(-1); assert.deepEqual(call, { name: "CandidateMoveRoutineSystem", method: "createRoutine", input: { candidateMoveId: h.api.CandidateMoveSystem.getCandidateMove().current.id, expectedCandidateMoveRevision: 1, schedule: { kind: "weekly-utc", weekday: 1, opensAtUtc: "14:30:00Z", closesAtUtc: "15:00:00Z" } } });
  assert.match(h.n("routine-current").textContent, /Active\. Every Monday, 14:30:00Z–15:00:00Z UTC\./); assert.match(index, /Opens \(UTC\)/); assert.match(index, /Closes \(UTC\)/); assert.equal(h.n("routine-form").hidden, true); assert.doesNotMatch(index, /correctRoutineSchedule|Edit recurring window|Change recurring window/);
});

test("Recurring window lifecycle uses rendered identity, preserves immutable schedules, and retains retired history", () => {
  const h = realHarness(); h.establish(); const first = createRoutine(h); const schedule = clone(first.schedule);
  assert.equal(h.n("routine-form").hidden, true);
  h.fire("routine-pause"); assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveRoutineSystem", method: "pauseRoutine", input: { id: first.id, expectedRevision: 1 } }); assert.match(h.n("routine-current").textContent, /Paused\. Every Monday/); assert.equal(h.n("routine-resume").hidden, false);
  assert.equal(h.n("routine-form").hidden, true);
  h.fire("routine-resume"); assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveRoutineSystem", method: "resumeRoutine", input: { id: first.id, expectedRevision: 2 } }); assert.equal(h.api.CandidateMoveRoutineSystem.getRoutines().routines[0].schedule.opensAtUtc, schedule.opensAtUtc);
  h.fire("routine-retire"); assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveRoutineSystem", method: "retireRoutine", input: { id: first.id, expectedRevision: 3 } }); assert.match(h.n("routine-current").textContent, /Previous recurring windows: Retired\. Every Monday/); assert.equal(h.n("routine-form").hidden, false);
  h.input("routine-weekday", "7"); h.input("routine-opens", "09:00"); h.input("routine-closes", "10:00"); h.fire("routine-form", "submit"); assert.match(h.n("routine-current").textContent, /Active\. Every Sunday, 09:00:00Z–10:00:00Z UTC\. Previous recurring windows: Retired\. Every Monday/); assert.doesNotMatch(h.n("routine-current").textContent, /latest|newest|oldest/i);
});

test("Recurring window respects owner lifecycle boundaries and rejects stale rendered commands before mutation", () => {
  const withdrawn = realHarness(); withdrawn.establish(); const active = createRoutine(withdrawn); withdrawn.fire("move-withdraw"); assert.equal(withdrawn.n("routine-form").hidden, true); withdrawn.fire("routine-pause"); assert.equal(withdrawn.api.CandidateMoveRoutineSystem.getRoutines().routines[0].lifecycle, "paused"); const beforeResume = withdrawn.calls.length; withdrawn.fire("routine-resume"); assert.equal(withdrawn.calls.length, beforeResume + 1); assert.match(withdrawn.n("setup-error").textContent, /Candidate Move revision does not match/); withdrawn.fire("routine-retire"); assert.equal(withdrawn.api.CandidateMoveRoutineSystem.getRoutines().routines[0].lifecycle, "retired"); assert.equal(active.id, withdrawn.api.CandidateMoveRoutineSystem.getRoutines().routines[0].id);

  const staleLifecycle = realHarness(); staleLifecycle.establish(); const routine = createRoutine(staleLifecycle); staleLifecycle.api.CandidateMoveRoutineSystem.pauseRoutine({ id: routine.id, expectedRevision: 1 }); const lifecycleCalls = staleLifecycle.calls.length; staleLifecycle.fire("routine-pause"); assert.equal(staleLifecycle.calls.length, lifecycleCalls); assert.match(staleLifecycle.n("setup-error").textContent, /recurring window changed/i); assert.equal(staleLifecycle.api.CandidateMoveRoutineSystem.getRoutines().routines[0].lifecycle, "paused");

  const corrected = realHarness(); corrected.establish(); createRoutine(corrected); corrected.fire("routine-pause"); corrected.fire("move-edit"); corrected.input("move-action-input", "Send the corrected package."); corrected.fire("move-form", "submit"); const beforeCorrectedResume = corrected.calls.length; corrected.fire("routine-resume"); assert.equal(corrected.calls.length, beforeCorrectedResume + 1); assert.match(corrected.n("setup-error").textContent, /Candidate Move revision does not match/); corrected.fire("routine-retire"); assert.equal(corrected.api.CandidateMoveRoutineSystem.getRoutines().routines[0].lifecycle, "retired");
});

test("A rendered recurring-window creation form cannot create after authoritative Routine truth changes without rerender", () => {
  const h = realHarness(); h.establish(); h.input("routine-weekday", "1"); h.input("routine-opens", "14:30"); h.input("routine-closes", "15:00");
  assert.equal(h.n("routine-form").hidden, false); const staleSubmit = h.n("routine-form").handlers.submit; const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  const existing = h.api.CandidateMoveRoutineSystem.createRoutine({ candidateMoveId: move.id, expectedCandidateMoveRevision: move.revision, schedule: { kind: "weekly-utc", weekday: 2, opensAtUtc: "09:00:00Z", closesAtUtc: "10:00:00Z" } });
  const beforeCalls = h.calls.length; const beforeWrites = h.writes.length; const beforeRecords = clone(h.api.CandidateMoveRoutineSystem.getRoutines().routines);
  staleSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, beforeCalls); assert.equal(h.writes.length, beforeWrites); assert.deepEqual(clone(h.api.CandidateMoveRoutineSystem.getRoutines().routines), beforeRecords); assert.equal(h.api.CandidateMoveRoutineSystem.getRoutine({ id: existing.id }).current.status, "active");
  assert.match(h.n("setup-error").textContent, /action or recurring window changed.*Review the current information/i); assert.match(h.n("routine-current").textContent, /Active\. Every Tuesday, 09:00:00Z–10:00:00Z UTC\./); assert.equal(h.n("routine-form").hidden, true);
});

test("A stale recurring-window lifecycle command cannot retarget a replacement Routine", () => {
  const h = realHarness(); h.establish(); const first = createRoutine(h); const stalePause = h.n("routine-pause").handlers.click;
  h.api.CandidateMoveRoutineSystem.retireRoutine({ id: first.id, expectedRevision: h.api.CandidateMoveRoutineSystem.getRoutine({ id: first.id }).current.revision }); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  const replacement = h.api.CandidateMoveRoutineSystem.createRoutine({ candidateMoveId: move.id, expectedCandidateMoveRevision: move.revision, schedule: { kind: "weekly-utc", weekday: 3, opensAtUtc: "11:00:00Z", closesAtUtc: "12:00:00Z" } });
  const beforeCalls = h.calls.length; const beforeWrites = h.writes.length; const beforeRecords = clone(h.api.CandidateMoveRoutineSystem.getRoutines().routines); const beforeReplacement = clone(h.api.CandidateMoveRoutineSystem.getRoutine({ id: replacement.id }));
  stalePause({ preventDefault() {} });
  assert.equal(h.calls.length, beforeCalls); assert.equal(h.writes.length, beforeWrites); assert.deepEqual(clone(h.api.CandidateMoveRoutineSystem.getRoutines().routines), beforeRecords); assert.deepEqual(clone(h.api.CandidateMoveRoutineSystem.getRoutine({ id: replacement.id })), beforeReplacement);
  assert.match(h.n("setup-error").textContent, /recurring window changed.*Review the current window/i); assert.match(h.n("routine-current").textContent, /Active\. Every Wednesday, 11:00:00Z–12:00:00Z UTC\./); assert.equal(h.n("routine-pause").hidden, false); assert.equal(h.n("routine-form").hidden, true);
});

test("Recurring-window lifecycle preserves authoritative non-zero-second schedules exactly", () => {
  const h = realHarness(); h.establish(); const schedule = { kind: "weekly-utc", weekday: 1, opensAtUtc: "14:30:17Z", closesAtUtc: "15:00:43Z" }; const routine = createRoutine(h, schedule);
  assert.match(h.n("routine-current").textContent, /Active\. Every Monday, 14:30:17Z–15:00:43Z UTC\./); assert.deepEqual(clone(h.api.CandidateMoveRoutineSystem.getRoutine({ id: routine.id }).current.schedule), schedule);
  h.fire("routine-pause"); assert.match(h.n("routine-current").textContent, /Paused\. Every Monday, 14:30:17Z–15:00:43Z UTC\./);
  h.fire("routine-resume"); assert.match(h.n("routine-current").textContent, /Active\. Every Monday, 14:30:17Z–15:00:43Z UTC\./);
  h.fire("routine-retire"); const history = h.api.CandidateMoveRoutineSystem.getRoutineHistory({ id: routine.id }); assert.deepEqual(clone(history.revisions.map((revision) => revision.schedule)), [schedule, schedule, schedule, schedule]); assert.match(h.n("routine-current").textContent, /Retired\. Every Monday, 14:30:17Z–15:00:43Z UTC\./);
});

test("Recurring-window rendering retains multiple retired records beside a non-retired Routine", () => {
  const h = realHarness(); h.establish(); const first = createRoutine(h, { kind: "weekly-utc", weekday: 1, opensAtUtc: "08:00:00Z", closesAtUtc: "09:00:00Z" }); h.fire("routine-retire");
  const second = createRoutine(h, { kind: "weekly-utc", weekday: 2, opensAtUtc: "10:00:00Z", closesAtUtc: "11:00:00Z" }); h.fire("routine-retire");
  const third = createRoutine(h, { kind: "weekly-utc", weekday: 3, opensAtUtc: "12:00:00Z", closesAtUtc: "13:00:00Z" }); const records = h.api.CandidateMoveRoutineSystem.getRoutines().routines;
  assert.equal(records.filter((record) => record.lifecycle === "retired").length, 2); assert.equal(records.find((record) => record.id === third.id).lifecycle, "active"); assert.equal(records.find((record) => record.id === first.id).lifecycle, "retired"); assert.equal(records.find((record) => record.id === second.id).lifecycle, "retired");
  assert.match(h.n("routine-current").textContent, /Active\. Every Wednesday, 12:00:00Z–13:00:00Z UTC\./); assert.match(h.n("routine-current").textContent, /Retired\. Every Monday, 08:00:00Z–09:00:00Z UTC\./); assert.match(h.n("routine-current").textContent, /Retired\. Every Tuesday, 10:00:00Z–11:00:00Z UTC\./); assert.equal(h.n("routine-form").hidden, true);
});

test("Recurring window UI remains decoupled from Radar and renders only text", () => {
  const h = realHarness(); h.establish(); h.input("routine-weekday", "1"); h.input("routine-opens", "14:30"); h.input("routine-closes", "15:00"); const before = h.calls.length; h.fire("routine-form", "submit"); assert.equal(h.calls.length, before + 1);
  for (const pattern of [/innerHTML/, /AttentionCandidateSystem/, /AttentionSystem/, /OperatingBriefingSystem/, /setTimeout/, /setInterval/, /dispatchEvent/]) assert.doesNotMatch(source, pattern);
  assert.match(h.n("routine-current").textContent, /UTC/);
});

test("real Hold create/release uses exact fresh inputs and terminal UI cannot recreate", () => {
  const h = realHarness(); h.establish(); h.state("clarify"); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.fire("hold-create"); h.state("hold"); assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveHoldSystem", method: "createHold", input: { candidateMoveId: move.id } });
  assert.equal(h.n("hold-create").hidden, true); assert.equal(h.n("hold-release").hidden, false);
  const hold = h.api.CandidateMoveHoldSystem.getHold().current;
  h.fire("hold-release"); h.state("clarify"); assert.deepEqual(h.calls.at(-1).input, { id: hold.id, expectedRevision: hold.revision });
  assert.equal(h.n("hold-create").hidden, true); assert.equal(h.n("hold-release").hidden, true); assert.match(h.n("hold-current").textContent, /released/);
});

test("Commitment deadline authoring uses current owner bindings, canonical UTC, and terminal truth", () => {
  const h = realHarness(); h.establish(); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.input("commitment-deadline", "2026-09-20T14:30:15"); h.fire("commitment-form", "submit");
  const created = h.calls.at(-1); const firstDueAt = new Date("2026-09-20T14:30:15").toISOString();
  assert.deepEqual(created, { name: "CandidateMoveCommitmentSystem", method: "createCommitment", input: { candidateMoveId: move.id, expectedCandidateMoveRevision: move.revision, window: { kind: "deadline", dueAt: firstDueAt } } });
  assert.match(created.input.window.dueAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); assert.match(h.n("commitment-current").textContent, /Active\. Recorded deadline/); assert.equal(h.n("commitment-complete").hidden, false); assert.equal(h.n("commitment-cancel").hidden, false); assert.equal(h.n("commitment-submit").textContent, "Change deadline");
  const first = h.api.CandidateMoveCommitmentSystem.getCommitments().records.find((record) => record.status === "active");
  h.input("commitment-deadline", "2026-09-21T09:00:00"); h.fire("commitment-form", "submit");
  assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveCommitmentSystem", method: "correctCommitmentWindow", input: { id: first.id, expectedRevision: first.revision, window: { kind: "deadline", dueAt: new Date("2026-09-21T09:00:00").toISOString() } } });
  const corrected = h.api.CandidateMoveCommitmentSystem.getCommitments().records.find((record) => record.status === "active"); h.fire("commitment-complete");
  assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveCommitmentSystem", method: "completeCommitment", input: { id: corrected.id, expectedRevision: corrected.revision } });
  assert.match(h.n("commitment-current").textContent, /Completed\. Recorded deadline/); assert.equal(h.n("commitment-complete").hidden, true); assert.equal(h.n("commitment-form").hidden, false); assert.equal(h.n("commitment-submit").textContent, "Record deadline");
  h.input("commitment-deadline", "2026-09-22T10:00:00"); h.fire("commitment-form", "submit"); const second = h.api.CandidateMoveCommitmentSystem.getCommitments().records.find((record) => record.status === "active"); h.fire("commitment-cancel");
  assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveCommitmentSystem", method: "cancelCommitment", input: { id: second.id, expectedRevision: second.revision } }); assert.match(h.n("commitment-current").textContent, /Canceled\. Recorded deadline/);
});

test("Commitment deadline guards prerequisites and invalid input, and owner failures re-render authority", () => {
  const absent = realHarness(); const before = absent.calls.length; absent.input("commitment-deadline", "2026-09-20T14:30"); absent.fire("commitment-form", "submit");
  assert.equal(absent.calls.length, before); assert.match(absent.n("commitment-prerequisite").textContent, /Record an action/); assert.equal(absent.n("commitment-form").hidden, true);
  const h = realHarness(); h.establish(); const count = h.calls.length; for (const value of ["", "not-a-date"]) { h.input("commitment-deadline", value); h.fire("commitment-form", "submit"); assert.equal(h.calls.length, count); assert.match(h.n("setup-error").textContent, /valid deadline/); }
  h.input("commitment-deadline", "2026-09-20T14:30"); h.fire("commitment-form", "submit"); const saved = clone(h.api.CandidateMoveCommitmentSystem.getCommitments()); const writes = h.writes.length;
  h.api.CandidateMoveCommitmentSystem.completeCommitment = () => { throw new Error("Confirmed save failed."); }; h.fire("commitment-complete");
  assert.match(h.n("setup-error").textContent, /Confirmed save failed/); assert.equal(h.writes.length, writes); assert.deepEqual(clone(h.api.CandidateMoveCommitmentSystem.getCommitments()), saved); assert.match(h.n("commitment-current").textContent, /Active\. Recorded deadline/);
});

test("Commitment correction preserves rendered deadline identity and converts only changed local input", () => {
  for (const dueAt of ["2026-09-20T14:30:15.000Z", "2026-09-20T14:30:15.123Z"]) {
    const h = realHarness(); h.establish(); const commitment = createCommitment(h, dueAt); h.fire("commitment-form", "submit");
    assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveCommitmentSystem", method: "correctCommitmentWindow", input: { id: commitment.id, expectedRevision: commitment.revision, window: { kind: "deadline", dueAt } } });
  }
  const h = realHarness(); h.establish(); const commitment = createCommitment(h, "2026-09-20T14:30:15.000Z"); h.input("commitment-deadline", "2026-09-21T09:00:00"); h.fire("commitment-form", "submit");
  assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveCommitmentSystem", method: "correctCommitmentWindow", input: { id: commitment.id, expectedRevision: commitment.revision, window: { kind: "deadline", dueAt: new Date("2026-09-21T09:00:00").toISOString() } } });
});

test("Commitment correction preserves repeated DST-hour identity instead of reparsing the displayed wall time", () => {
  class NewYorkFallbackDate extends Date {
    constructor(...args) { super(...(args.length === 0 ? [] : [typeof args[0] === "string" && args[0] === "2026-11-01T01:30:00" ? "2026-11-01T05:30:00.000Z" : args[0]])); }
    getFullYear() { return this.toISOString() === "2026-11-01T06:30:00.000Z" ? 2026 : super.getFullYear(); }
    getMonth() { return this.toISOString() === "2026-11-01T06:30:00.000Z" ? 10 : super.getMonth(); }
    getDate() { return this.toISOString() === "2026-11-01T06:30:00.000Z" ? 1 : super.getDate(); }
    getHours() { return this.toISOString() === "2026-11-01T06:30:00.000Z" ? 1 : super.getHours(); }
    getMinutes() { return this.toISOString() === "2026-11-01T06:30:00.000Z" ? 30 : super.getMinutes(); }
    getSeconds() { return this.toISOString() === "2026-11-01T06:30:00.000Z" ? 0 : super.getSeconds(); }
  }
  assert.equal(new NewYorkFallbackDate("2026-11-01T01:30:00").toISOString(), "2026-11-01T05:30:00.000Z");
  const h = realHarness({}, { Date: NewYorkFallbackDate }); h.establish(); const commitment = createCommitment(h, "2026-11-01T06:30:00.000Z");
  assert.equal(h.n("commitment-deadline").value, "2026-11-01T01:30"); h.fire("commitment-form", "submit");
  assert.equal(h.calls.at(-1).input.window.dueAt, "2026-11-01T06:30:00.000Z"); assert.equal(h.calls.at(-1).input.id, commitment.id);
});

test("Commitment deadline correction uses normalized browser values and rejects stale rendered authority", () => {
  const h = realHarness(); h.establish(); const commitment = createCommitment(h, "2026-09-20T14:30:00.123Z");
  assert.equal(h.n("commitment-deadline").value, "2026-09-20T10:30"); h.input("commitment-deadline", "2026-09-21T09:00:00");
  h.fire("commitment-form", "submit"); assert.equal(h.calls.at(-1).input.window.dueAt, new Date("2026-09-21T09:00:00").toISOString());

  const stale = realHarness(); stale.establish(); const original = createCommitment(stale, "2026-09-20T14:30:00.123Z");
  stale.api.CandidateMoveCommitmentSystem.correctCommitmentWindow({ id: original.id, expectedRevision: original.revision, window: { kind: "deadline", dueAt: "2026-09-22T10:45:00.456Z" } });
  const before = stale.calls.length; stale.fire("commitment-form", "submit");
  assert.equal(stale.calls.length, before); assert.match(stale.n("setup-error").textContent, /deadline changed.*Review the current deadline/i); assert.equal(stale.n("commitment-deadline").value, "2026-09-22T06:45");
  const fresh = stale.api.CandidateMoveCommitmentSystem.getCommitments().records.find((record) => record.id === original.id); assert.equal(fresh.revision, original.revision + 1); assert.equal(fresh.window.dueAt, "2026-09-22T10:45:00.456Z");
});

test("A stale Commitment correction form cannot switch to create or retarget a replacement", () => {
  for (const operation of ["completeCommitment", "cancelCommitment"]) {
    const h = realHarness(); h.establish(); const first = createCommitment(h, "2026-09-20T14:30:00.123Z");
    h.api.CandidateMoveCommitmentSystem[operation]({ id: first.id, expectedRevision: first.revision }); const before = h.calls.length; h.fire("commitment-form", "submit");
    assert.equal(h.calls.length, before); assert.match(h.n("setup-error").textContent, /commitment changed.*Review the current commitment/i); assert.match(h.n("commitment-current").textContent, operation === "completeCommitment" ? /Completed\. Recorded deadline/ : /Canceled\. Recorded deadline/); assert.equal(h.api.CandidateMoveCommitmentSystem.getCommitments().records.filter((record) => record.status === "active").length, 0);
  }
  const h = realHarness(); h.establish(); const first = createCommitment(h, "2026-09-20T14:30:00.123Z");
  h.api.CandidateMoveCommitmentSystem.completeCommitment({ id: first.id, expectedRevision: first.revision }); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.api.CandidateMoveCommitmentSystem.createCommitment({ candidateMoveId: move.id, expectedCandidateMoveRevision: move.revision, window: { kind: "deadline", dueAt: "2026-09-22T10:45:00.456Z" } }); const replacement = h.api.CandidateMoveCommitmentSystem.getCommitments().records.find((record) => record.status === "active"); const before = h.calls.length;
  h.fire("commitment-form", "submit");
  assert.equal(h.calls.length, before); assert.match(h.n("setup-error").textContent, /commitment changed.*Review the current commitment/i); assert.equal(h.api.CandidateMoveCommitmentSystem.getCommitments().records.find((record) => record.id === replacement.id).window.dueAt, "2026-09-22T10:45:00.456Z"); assert.match(h.n("commitment-current").textContent, /Active\. Recorded deadline/); assert.equal(h.n("commitment-deadline").value, "2026-09-22T06:45");
});

test("A rendered Commitment creation form cannot create after an active Commitment appears", () => {
  const h = realHarness(); h.establish(); const move = h.api.CandidateMoveSystem.getCandidateMove().current; h.input("commitment-deadline", "2026-09-20T14:30");
  h.api.CandidateMoveCommitmentSystem.createCommitment({ candidateMoveId: move.id, expectedCandidateMoveRevision: move.revision, window: { kind: "deadline", dueAt: "2026-09-22T10:45:00.456Z" } }); const before = h.calls.length;
  h.fire("commitment-form", "submit");
  assert.equal(h.calls.length, before); assert.match(h.n("setup-error").textContent, /commitment changed.*Review the current commitment/i); assert.equal(h.api.CandidateMoveCommitmentSystem.getCommitments().records.filter((record) => record.status === "active").length, 1); assert.match(h.n("commitment-current").textContent, /Active\. Recorded deadline/);
});

test("Commitment deadline correction remains valid after its Candidate Move is withdrawn", () => {
  const h = realHarness(); h.establish(); const commitment = createCommitment(h, "2026-09-20T14:30:00.123Z"); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.api.CandidateMoveSystem.withdrawCandidateMove({ id: move.id, expectedRevision: move.revision }); h.input("commitment-deadline", "2026-09-21T09:00:00"); const before = h.calls.length;
  h.fire("commitment-form", "submit");
  assert.equal(h.calls.length, before + 1); assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveCommitmentSystem", method: "correctCommitmentWindow", input: { id: commitment.id, expectedRevision: commitment.revision, window: { kind: "deadline", dueAt: new Date("2026-09-21T09:00:00").toISOString() } } }); assert.doesNotMatch(h.n("setup-error").textContent, /commitment changed|deadline changed/i);
  const corrected = h.api.CandidateMoveCommitmentSystem.getCommitments().records.find((record) => record.id === commitment.id); assert.equal(corrected.revision, commitment.revision + 1); assert.equal(corrected.window.dueAt, new Date("2026-09-21T09:00:00").toISOString()); assert.equal(h.n("commitment-deadline").value, "2026-09-21T09:00");
});

test("Commitment terminal records remain a historical set without timestamp ranking or history reads", () => {
  const h = realHarness(); h.establish(); createCommitment(h, "2026-09-20T14:30:00.000Z"); h.fire("commitment-complete");
  h.fire("move-edit"); h.input("move-action-input", "Send the corrected package."); h.fire("move-form", "submit"); createCommitment(h, "2026-09-21T14:30:00.000Z"); h.fire("commitment-cancel");
  const persisted = JSON.parse(h.values.get("digitalMikeyFounder")); const records = persisted.commitments.records;
  for (const record of records) for (const revision of record.revisions) revision.recordedAt = "2026-01-01T00:00:00.000Z";
  h.values.set("digitalMikeyFounder", JSON.stringify(persisted)); const reload = realHarness(Object.fromEntries(h.values));
  assert.match(reload.n("commitment-current").textContent, /Completed\. Recorded deadline/); assert.match(reload.n("commitment-current").textContent, /Canceled\. Recorded deadline/); assert.match(reload.n("commitment-current").textContent, /Recorded for: Send the package\./); assert.doesNotMatch(reload.n("commitment-current").textContent, /No deadline is recorded/); assert.doesNotMatch(source, /getCommitmentHistory/);
  const tied = reload.n("commitment-current").textContent; for (const record of records) for (const revision of record.revisions) revision.recordedAt = "2025-01-01T00:00:00.000Z";
  h.values.set("digitalMikeyFounder", JSON.stringify(persisted)); const rollback = realHarness(Object.fromEntries(h.values)); assert.equal(rollback.n("commitment-current").textContent, tied);
});

test("Commitment shows active and terminal records together without assigning terminal recency", () => {
  const h = realHarness(); h.establish(); createCommitment(h, "2026-09-20T14:30:00.000Z"); h.fire("commitment-complete");
  const active = createCommitment(h, "2026-09-21T14:30:00.000Z"); const copy = h.n("commitment-current").textContent;
  assert.match(copy, /Active\. Recorded deadline/); assert.match(copy, /Previous commitments: Completed\. Recorded deadline/); assert.doesNotMatch(copy, /latest|newest|oldest|current commitment/i); assert.equal(h.n("commitment-complete").hidden, false); assert.equal(h.api.CandidateMoveCommitmentSystem.getCommitments().records.find((record) => record.status === "active").id, active.id);
});

test("A new active Commitment cannot reuse another Commitment's rendered deadline identity", () => {
  const h = realHarness(); h.establish(); const first = createCommitment(h, "2026-09-20T14:30:00.123Z"); h.fire("commitment-complete");
  const second = createCommitment(h, "2026-09-21T14:30:00.456Z"); h.fire("commitment-form", "submit");
  assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveCommitmentSystem", method: "correctCommitmentWindow", input: { id: second.id, expectedRevision: second.revision, window: { kind: "deadline", dueAt: "2026-09-21T14:30:00.456Z" } } }); assert.notEqual(first.id, second.id);
});

test("Commitment lifecycle remains available after withdrawal while new deadline creation is blocked", () => {
  for (const [trigger, method] of [["commitment-complete", "completeCommitment"], ["commitment-cancel", "cancelCommitment"]]) {
    const h = realHarness(); h.establish(); const commitment = createCommitment(h, "2026-09-20T14:30:00.000Z"); h.fire("move-withdraw");
    assert.equal(h.n("commitment-form").hidden, false); assert.match(h.n("commitment-prerequisite").textContent, /withdrawn.*cannot be recorded/); h.fire(trigger);
    assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveCommitmentSystem", method, input: { id: commitment.id, expectedRevision: commitment.revision } });
  }
  const h = realHarness(); h.establish(); h.fire("move-withdraw"); const before = h.calls.length; h.input("commitment-deadline", "2026-09-20T14:30"); h.fire("commitment-form", "submit"); assert.equal(h.calls.length, before); assert.match(h.n("setup-error").textContent, /has not been withdrawn/);
});

test("Commitment deadline display uses valid local formatting and labels UTC fallback truthfully", () => {
  const normal = realHarness(); normal.establish(); createCommitment(normal, "2026-09-20T14:30:00.000Z"); assert.match(normal.n("commitment-current").textContent, /local time/); assert.doesNotMatch(normal.n("commitment-current").textContent, /Recorded for:/);
  const fallback = realHarness({}, { Intl: { DateTimeFormat() { throw new Error("unsupported"); } } }); fallback.establish(); createCommitment(fallback, "2026-09-20T14:30:00.000Z");
  assert.match(fallback.n("commitment-current").textContent, /2026-09-20T14:30:00\.000Z \(UTC\)/); assert.match(fallback.n("commitment-current").textContent, /shown in UTC/); assert.doesNotMatch(fallback.n("commitment-current").textContent, /local time/);
});

test("real Dependency validates input, creates, corrects and resolves the same lifetime", () => {
  assert.match(index, /Tell FounderOS what needs to happen before you can continue\./);
  assert.match(index, /You can update this while you’re waiting\./);
  assert.doesNotMatch(index, /You can record one outside condition for this action\. After it is resolved, you cannot record another\./);
  assert.doesNotMatch(index, /You can edit the same condition while you’re waiting\./);
  const h = realHarness(); h.establish(); const before = h.calls.length;
  for (const value of [" ", "x".repeat(2001)]) { h.input("dependency-input", value); h.fire("dependency-form", "submit"); assert.equal(h.calls.length, before); }
  h.dependency(); h.state("waiting"); const d = h.api.CandidateMoveDependencySystem.getDependency().current;
  assert.deepEqual(h.calls.at(-1).input, { candidateMoveId: h.api.CandidateMoveSystem.getCandidateMove().current.id, description: "Approval must arrive." });
  h.input("dependency-input", "Written approval must arrive."); h.fire("dependency-form", "submit");
  assert.deepEqual(h.calls.at(-1).input, { id: d.id, expectedRevision: 1, description: "Written approval must arrive." });
  h.fire("dependency-resolve"); assert.deepEqual(h.calls.at(-1).input, { id: d.id, expectedRevision: 2 }); h.state("clarify");
  assert.equal(h.n("dependency-form").hidden, true); assert.equal(h.n("dependency-resolution").hidden, true); assert.match(h.n("dependency-current").textContent, /Resolved/);
});

test("real Availability uses exact source revisions, repeated episodes and duplicate no-op", () => {
  const h = realHarness(); h.establish(); h.confirm(); h.state("actionable");
  const a = h.api.CandidateMoveAvailabilitySystem.getAvailability().current;
  assert.deepEqual(h.calls.at(-1).input, { candidateMoveId: a.candidateMoveId, expectedCandidateMoveRevision: 1, expectedSituationRevision: 1, conditionsConfirmed: "I checked the documents and destination." });
  const before = h.writes.length; h.confirm(); assert.equal(h.writes.length, before);
  assert.deepEqual(h.calls.at(-1).input, { id: a.id, expectedRevision: 1, expectedCandidateMoveRevision: 1, expectedSituationRevision: 1, conditionsConfirmed: "I checked the documents and destination." });
  h.fire("availability-withdraw"); h.state("clarify"); assert.deepEqual(h.calls.at(-1).input, { id: a.id, expectedRevision: 1 });
  h.confirm(); h.state("actionable"); assert.equal(h.api.CandidateMoveAvailabilitySystem.getAvailability().current.revision, 3);
});

test("real precedence transitions preserve lower source truth and never auto-mutate another owner", () => {
  const h = realHarness(); h.establish(); h.state("clarify"); h.confirm(); h.state("actionable");
  const availability = clone(h.api.CandidateMoveAvailabilitySystem.getAvailability());
  h.dependency(); h.state("waiting"); const dependency = clone(h.api.CandidateMoveDependencySystem.getDependency());
  h.fire("hold-create"); h.state("hold"); assert.deepEqual(clone(h.api.CandidateMoveDependencySystem.getDependency()), dependency);
  h.fire("hold-release"); h.state("waiting"); h.fire("dependency-resolve"); h.state("actionable");
  assert.deepEqual(clone(h.api.CandidateMoveAvailabilitySystem.getAvailability()), availability);
  assert.deepEqual(h.calls.map((x) => x.method), ["createSituation", "createCandidateMove", "confirmAvailability", "createDependency", "createHold", "releaseHold", "resolveDependency"]);
});

test("Move/Situation corrections refresh owner currentness and require renewed review without auto-reconfirmation", () => {
  const h = realHarness(); h.establish(); h.confirm();
  for (const [edit, input, form, value, expectedMove, expectedSituation] of [
    ["move-edit", "move-action-input", "move-form", "Send corrected package.", 2, 1],
    ["situation-edit", "situation-reality-input", "situation-form", "Documents corrected.", 2, 2],
  ]) {
    h.fire(edit); h.input(input, value); h.fire(form, "submit"); h.state("clarify");
    assert.equal(h.api.CandidateMoveAvailabilitySystem.getAvailability().current.isCurrent, false);
    assert.match(h.n("availability-current").textContent, /Something changed after your last readiness check/);
    const count = h.calls.length; h.confirm(); assert.equal(h.calls.length, count); assert.match(h.n("setup-error").textContent, /Review the updated facts/);
    h.confirm(); h.state("actionable"); assert.equal(h.calls.at(-1).input.expectedCandidateMoveRevision, expectedMove); assert.equal(h.calls.at(-1).input.expectedSituationRevision, expectedSituation);
  }
});

test("source changes outside render are detected before Availability submission", () => {
  const h = realHarness(); h.establish(); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.api.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: 1, action: "Use corrected destination." });
  const before = h.calls.length; h.confirm(); assert.equal(h.calls.length, before); assert.match(h.n("availability-review").textContent, /corrected destination/);
  h.confirm(); h.state("actionable"); assert.equal(h.calls.at(-1).input.expectedCandidateMoveRevision, 2);
});

test("Hold and Dependency remain applicable across corrections; closed Situation permits source operations", () => {
  const h = realHarness(); h.establish(); h.fire("situation-close");
  assert.equal(h.n("hold-create").hidden, false); assert.equal(h.n("dependency-form").hidden, false); assert.equal(h.n("availability-form").hidden, false);
  h.confirm(); h.confirm(); h.state("actionable"); assert.equal(h.calls.at(-1).input.expectedSituationRevision, 2);
  h.dependency(); h.fire("hold-create"); h.state("hold");
  const hold = clone(h.api.CandidateMoveHoldSystem.getHold()); const dependency = clone(h.api.CandidateMoveDependencySystem.getDependency());
  h.fire("move-edit"); assert.equal(h.n("move-form").hidden, false); h.input("move-action-input", "Send closed Situation package."); h.fire("move-form", "submit");
  h.state("hold"); assert.deepEqual(clone(h.api.CandidateMoveHoldSystem.getHold()), hold); assert.deepEqual(clone(h.api.CandidateMoveDependencySystem.getDependency()), dependency);
  h.fire("hold-release"); h.state("waiting"); h.fire("dependency-resolve"); h.state("clarify");
});

test("withdrawn Move prevents new truth and leaves explicit cleanup/history available", () => {
  const h = realHarness(); h.establish(); h.confirm(); h.dependency(); h.fire("hold-create"); h.fire("move-withdraw");
  assert.match(h.n("state-copy").textContent, /withdrawn; there is no current status/); assert.match(h.n("truth-lifecycle").textContent, /review past entries/);
  assert.equal(h.n("hold-create").hidden, true); assert.equal(h.n("availability-form").hidden, true);
  assert.equal(h.n("hold-release").hidden, false); assert.equal(h.n("dependency-form").hidden, false); assert.equal(h.n("availability-withdraw").hidden, false);
  h.fire("hold-release"); h.input("dependency-input", "Written approval outstanding."); h.fire("dependency-form", "submit"); h.fire("dependency-resolve"); h.fire("availability-withdraw");
  assert.equal(h.api.CandidateMoveHoldSystem.getHoldHistory().revisions.length, 2); assert.equal(h.api.CandidateMoveDependencySystem.getDependencyHistory().revisions.length, 3);
  const clean = realHarness(); clean.establish(); clean.fire("move-withdraw"); assert.equal(clean.n("hold-create").hidden, true); assert.equal(clean.n("dependency-form").hidden, true); assert.equal(clean.n("availability-form").hidden, true);
  const before = clean.calls.length; clean.fire("hold-create"); clean.dependency(); clean.confirm(); assert.equal(clean.calls.length, before);
});

test("display follows only MoveState reader even when source truth disagrees", () => {
  const h = realHarness(); h.establish(); h.fire("hold-create");
  for (const state of ["actionable", "waiting", "hold", "clarify"]) { h.api.MoveStateSystem.getMoveState = () => ({ status: "available", state }); h.render(); h.state(state); }
  for (const result of [{ status: "unavailable" }, { status: "unexpected" }, { status: "available", state: "invented" }]) { h.api.MoveStateSystem.getMoveState = () => result; h.render(); assert.equal(h.n("state-copy").textContent, "Where things stand is unavailable."); }
  h.api.MoveStateSystem.getMoveState = () => { throw new Error("reader"); }; h.render(); assert.match(h.n("state-copy").textContent, /unavailable/);
  h.api.MoveStateSystem.getMoveState = undefined; h.render(); assert.match(h.n("state-copy").textContent, /unavailable/);
  const fresh = realHarness(); assert.equal(fresh.n("state-copy").textContent, "You haven’t recorded an action yet.");
});

test("unavailable and throwing source readers hide mutations without substituting Clarify", () => {
  const h = realHarness(); h.establish();
  h.api.CandidateMoveHoldSystem.getHold = () => { throw new Error("bad"); };
  h.api.CandidateMoveDependencySystem.getDependency = undefined;
  h.api.CandidateMoveAvailabilitySystem.getAvailability = () => ({ status: "unavailable" });
  h.render(); assert.match(h.n("state-copy").textContent, /unavailable/); assert.equal(h.n("hold-create").hidden, true); assert.equal(h.n("dependency-form").hidden, true); assert.equal(h.n("availability-form").hidden, true);
});

test("fresh revisions are used and owner stale-revision failures remain visible without another mutation", () => {
  for (const [owner, method, trigger, setup] of [
    ["CandidateMoveHoldSystem", "releaseHold", "hold-release", (h) => h.fire("hold-create")],
    ["CandidateMoveDependencySystem", "resolveDependency", "dependency-resolve", (h) => h.dependency()],
    ["CandidateMoveAvailabilitySystem", "withdrawAvailability", "availability-withdraw", (h) => h.confirm()],
  ]) {
    const h = realHarness(); h.establish(); setup(h); const writes = h.writes.length; const count = h.calls.length;
    h.api[owner][method] = () => { throw new Error("Owner revision does not match."); }; h.fire(trigger);
    assert.match(h.n("setup-error").textContent, /revision does not match/); assert.equal(h.writes.length, writes); assert.equal(h.calls.length, count);
  }
  const h = realHarness(); h.establish(); h.dependency(); const d = h.api.CandidateMoveDependencySystem.getDependency().current;
  h.api.CandidateMoveDependencySystem.correctDependency({ id: d.id, expectedRevision: 1, description: "Updated outside UI." }); h.fire("dependency-resolve"); assert.equal(h.calls.at(-1).input.expectedRevision, 2);
});

test("partial success persists Hold when later confirmation fails and errors are bounded", () => {
  const h = realHarness(); h.establish(); h.fire("hold-create"); const hold = clone(h.api.CandidateMoveHoldSystem.getHold()); const before = h.writes.length;
  h.api.CommanderSystem.save = () => false; h.confirm(); assert.match(h.n("setup-error").textContent, /not confirmed/); h.state("hold");
  assert.equal(h.writes.length, before); assert.deepEqual(clone(h.api.CandidateMoveHoldSystem.getHold()), hold); assert.equal(h.api.CandidateMoveAvailabilitySystem.getAvailability().status, "absent");
  h.api.CandidateMoveHoldSystem.releaseHold = () => { throw new Error("x".repeat(1000)); }; h.fire("hold-release"); assert.equal(h.n("setup-error").textContent.length, 240);
});

test("four policy selections compile to OR rules and empty selection never changes saved policy", () => {
  const h = realHarness(); const options = ["actionable", "waiting", "hold", "clarify"];
  for (const option of options) assert.equal(h.n(`policy-${option}`).checked, false);
  const before = h.calls.length; h.fire("policy-submit"); assert.equal(h.calls.length, before);
  for (const option of options) h.n(`policy-${option}`).checked = true;
  h.fire("policy-submit"); assert.deepEqual(h.calls.at(-1).input, { rules: options.map((x) => [`move.${x}`]), expectedRevision: 0 });
  for (const option of options) assert.equal(h.n(`policy-${option}`).checked, true);
  for (const option of options) h.n(`policy-${option}`).checked = false;
  const writes = h.writes.length; h.fire("policy-submit"); assert.equal(h.writes.length, writes);
  h.n("policy-waiting").checked = true; h.fire("policy-submit"); assert.deepEqual(h.calls.at(-1).input, { rules: [["move.waiting"]], expectedRevision: 1 });
  h.fire("policy-clear"); assert.equal(h.api.CommanderAttentionPolicySystem.getAttentionPolicy().current.status, "cleared");
});

test("advanced policies remain intact until explicit whole-policy replacement and fresh review", () => {
  const h = realHarness(); const p = h.api.CommanderAttentionPolicySystem;
  p.establishAttentionPolicy({ rules: [["move.clarify"], ["move.waiting", "commitment.active"], ["routine.current"]], expectedRevision: 0 }); h.render();
  assert.equal(h.n("policy-clarify").checked, true); assert.equal(h.n("policy-waiting").checked, false); assert.equal(h.n("policy-advanced").hidden, false); assert.match(h.n("policy-rules").textContent, /AND/);
  const before = h.writes.length; h.fire("policy-submit"); assert.equal(h.writes.length, before);
  h.n("policy-replace-all").checked = true;
  p.replaceAttentionPolicy({ rules: [["commitment.active"]], expectedRevision: 1 }); const changed = h.writes.length;
  h.n("policy-hold").checked = true; h.fire("policy-submit"); assert.equal(h.writes.length, changed); assert.equal(h.n("policy-replace-all").checked, false);
  h.n("policy-hold").checked = true; h.n("policy-replace-all").checked = true; h.fire("policy-submit");
  assert.deepEqual(h.calls.at(-1).input, { rules: [["move.hold"]], expectedRevision: 2 });
  assert.equal(h.n("policy-advanced").hidden, true);
});

test("saved Clarify gains no new defaults and active-empty policies are rendered faithfully", () => {
  const h = realHarness(); h.api.CommanderAttentionPolicySystem.establishAttentionPolicy({ rules: [["move.clarify"]], expectedRevision: 0 }); h.render();
  for (const option of ["actionable", "waiting", "hold"]) assert.equal(h.n(`policy-${option}`).checked, false);
  assert.equal(h.n("policy-clarify").checked, true);
  h.api.CommanderAttentionPolicySystem.replaceAttentionPolicy({ rules: [], expectedRevision: 1 }); h.render(); assert.match(h.n("policy-current").textContent, /active with no rules/);
  const before = h.writes.length; h.fire("policy-submit"); assert.equal(h.writes.length, before);
});

test("reload preserves terminal history, confirmations and policy while render/disclosure writes nothing", () => {
  const h = realHarness(); h.establish(); h.confirm(); h.dependency(); h.fire("hold-create"); h.fire("hold-release"); h.fire("dependency-resolve");
  h.n("policy-actionable").checked = true; h.fire("policy-submit");
  const reload = realHarness(Object.fromEntries(h.values)); reload.state("actionable"); assert.equal(reload.n("hold-create").hidden, true); assert.equal(reload.n("dependency-form").hidden, true); assert.equal(reload.n("policy-actionable").checked, true);
  const before = reload.writes.length; reload.render(); reload.n("truth").open = true; reload.render(); assert.equal(reload.writes.length, before);
  assert.match(index, /<details id="operating-truth"[^>]*hidden>/); assert.match(index, /<summary>Change where things stand<\/summary>/); assert.doesNotMatch(index, /<details id="operating-truth"[^>]*\bopen/);
  assert.match(styleSource, /\.operating-setup-card \[hidden\] \{ display: none !important; \}/);
});

test("Commander text remains text and new widget paths have no prohibited side effects", () => {
  const h = realHarness(); h.establish(); h.input("dependency-input", "<img src=x onerror=alert(1)>"); h.fire("dependency-form", "submit"); assert.match(h.n("dependency-current").textContent, /<img/);
  h.input("availability-input", "<script>bad()</script>"); h.fire("availability-form", "submit"); assert.match(h.n("availability-current").textContent, /<script>/);
  for (const pattern of [/innerHTML/, /founder\./, /localStorage/, /sessionStorage/, /CommanderSystem\.save/, /getAttention\(/, /setTimeout/, /setInterval/, /dispatchEvent/, /\.state\s*=(?!=)/, /\.moveState\s*=/, /overdue|\blate\b|urgency|priority|reminder|notification/i]) assert.doesNotMatch(source, pattern);
  for (const label of ["When I’ve said I have what I need to do it", "When I’m waiting on something outside my control", "When I’ve chosen not to act yet", "When I need to take another look"]) assert.ok(index.includes(label));
  assert.doesNotMatch(index.slice(index.indexOf('id="operating-policy-step"'), index.indexOf('<!-- ---------- Field Report')), /type="checkbox"[^>]*(commitment|routine)/i);
});

test("human interface headings and default copy omit architecture terminology", () => {
  const card = index.slice(index.indexOf('id="operating-setup-card"'), index.indexOf('<!-- ---------- Field Report'));
  for (const copy of ["Your current focus", "What’s going on?", "What are you trying to do?", "Where things stand", "Change where things stand", "What’s true right now?", "I have what I need to do this.", "I’m waiting on something outside my control.", "I’m choosing not to act on this yet.", "I need to take another look."]) assert.ok(card.includes(copy), copy);
  const visibleText = card.replace(/<[^>]+>/g, " ");
  const forbidden = /Operating Intelligence Setup|Update Operating Truth|Commander Hold|External Dependency|Operating Sufficiency|Candidate Move|Attention Policy|Operating Context|revisions|bindings|provenance/i;
  assert.doesNotMatch(visibleText, forbidden);
  const h = realHarness(); h.establish(); h.confirm(); h.dependency(); h.fire("hold-create");
  for (const id of ["setup-status", "state-label", "state-copy", "hold-current", "dependency-current", "availability-current", "availability-review", "context-current", "policy-current"]) assert.doesNotMatch(h.n(id).textContent, forbidden);
});

test("four choices reveal only the selected flow and never mutate any authority", () => {
  const h = realHarness(); h.establish(); const before = h.calls.length, writes = h.writes.length;
  const flows = ["availability", "dependency", "hold", "review"];
  for (const flow of flows) assert.equal(h.n(`flow-${flow}`).hidden, true);
  for (const selected of [...flows, "availability", "review"]) {
    h.fire(`choice-${selected}`, "change");
    for (const flow of flows) { assert.equal(h.n(`flow-${flow}`).hidden, flow !== selected); assert.equal(h.n(`choice-${flow}`).checked, flow === selected); }
    assert.equal(h.calls.length, before); assert.equal(h.writes.length, writes);
  }
});

test("selected explicit submissions call exactly one matching owner with exact versions", () => {
  for (const [flow, trigger, type, owner, method] of [
    ["availability", "availability-form", "submit", "CandidateMoveAvailabilitySystem", "confirmAvailability"],
    ["dependency", "dependency-form", "submit", "CandidateMoveDependencySystem", "createDependency"],
    ["hold", "hold-create", "click", "CandidateMoveHoldSystem", "createHold"],
  ]) {
    const h = realHarness(); h.establish(); h.fire(`choice-${flow}`, "change");
    h.input("availability-input", "I checked."); h.input("dependency-input", "Approval."); const before = h.calls.length;
    h.fire(trigger, type); assert.equal(h.calls.length, before + 1); assert.equal(h.calls.at(-1).name, owner); assert.equal(h.calls.at(-1).method, method);
    assert.equal(h.calls.at(-1).input.candidateMoveId, h.api.CandidateMoveSystem.getCandidateMove().current.id);
    if (flow === "availability") { assert.equal(h.calls.at(-1).input.expectedCandidateMoveRevision, 1); assert.equal(h.calls.at(-1).input.expectedSituationRevision, 1); }
  }
});

test("state reader controls agency-preserving wording, even against source precedence", () => {
  const h = realHarness(); h.establish(); h.dependency(); h.fire("hold-create");
  const copies = { hold: "You’ve chosen not to act on this yet.", waiting: "You’re waiting on: Approval must arrive.", actionable: "You’ve said you have what you need to do this.", clarify: "Take another look before deciding what to do." };
  for (const [state, copy] of Object.entries(copies)) { h.api.MoveStateSystem.getMoveState = () => ({ status: "available", state }); const before = h.writes.length; h.render(); assert.equal(h.n("state-copy").textContent, copy); assert.equal(h.writes.length, before); }
});

test("stale readiness after reload shows current facts and prior statement without reconfirming", () => {
  const h = realHarness(); h.establish(); h.confirm(); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.api.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: 1, action: "Check the new destination." });
  const reload = realHarness(Object.fromEntries(h.values)); const before = reload.calls.length, writes = reload.writes.length;
  reload.fire("choice-availability", "change"); reload.render();
  assert.match(reload.n("availability-current").textContent, /Something changed after your last readiness check\. Take another look\./);
  assert.match(reload.n("availability-current").textContent, /Last time, you said you had what you needed because:\nI checked the documents and destination\./);
  assert.match(reload.n("availability-review").textContent, /What you’re trying to do now: Check the new destination\./);
  assert.match(reload.n("availability-review").textContent, /What’s true right now: Documents are collected\./);
  assert.equal(reload.calls.length, before); assert.equal(reload.writes.length, writes);
  reload.confirm(); assert.equal(reload.calls.length, before + 1); assert.equal(reload.calls.at(-1).method, "reconfirmAvailability"); assert.equal(reload.calls.at(-1).input.expectedCandidateMoveRevision, 2);
});

test("More details is collapsed by default and contains the context and radar editors without disclosure mutations", () => {
  const moreDetails = index.slice(index.indexOf('<details id="operating-more-details"'), index.indexOf('<!-- ---------- Field Report'));
  assert.match(moreDetails, /^<details id="operating-more-details"><summary>More details<\/summary>\s*<section[^>]+id="operating-context-step">/);
  assert.match(moreDetails, /id="operating-policy-step"/); assert.match(moreDetails, /What should FounderOS keep on your radar\?/);
  assert.doesNotMatch(moreDetails, /^<details id="operating-more-details"[^>]*\bopen/);
  assert.match(index.slice(index.indexOf('id="operating-setup-card"'), index.indexOf('<details id="operating-more-details"')), /<summary>Change where things stand<\/summary>/);
  assert.match(index, /Where should this apply\?/); assert.match(index, /It does not change where things stand\./);
  const h = realHarness(); h.establish(); const before = h.writes.length, calls = h.calls.length, state = clone(h.api.MoveStateSystem.getMoveState());
  assert.equal(h.n("more-details").open, false); assert.deepEqual(h.n("more-details").handlers, {});
  h.n("more-details").open = true; h.render(); h.n("more-details").open = false; h.render();
  assert.equal(h.writes.length, before); assert.equal(h.calls.length, calls); assert.deepEqual(clone(h.api.MoveStateSystem.getMoveState()), state);
  const situation = h.api.SituationSystem.getSituation().current;
  h.n("more-details").open = true; h.fire("context-scoped"); assert.deepEqual(clone(h.api.CommanderContextSystem.getContext().current.scope), { mode: "scoped", situationIds: [situation.id] }); assert.equal(h.api.CommanderContextSystem.getContext().current.revision, 1);
  h.n("policy-waiting").checked = true; h.fire("policy-submit"); assert.deepEqual(h.calls.filter((call) => call.name === "CommanderAttentionPolicySystem" && call.method === "establishAttentionPolicy").at(-1).input, { rules: [["move.waiting"]], expectedRevision: 0 });
  assert.deepEqual(h.n("policy-details").handlers, {});
});

test("plain-language close and withdraw labels keep their exact owner operations and lifecycle semantics", () => {
  assert.match(index, /id="operating-situation-close"[^>]*>This is no longer current<\/button>/);
  assert.match(index, /id="operating-move-withdraw"[^>]*>I’m no longer doing this<\/button>/);
  const h = realHarness(); h.establish(); const situation = h.api.SituationSystem.getSituation().current; const move = h.api.CandidateMoveSystem.getCandidateMove().current; h.fire("situation-close");
  assert.deepEqual(h.calls.filter((call) => call.method === "closeSituation").at(-1).input, { id: situation.id, expectedRevision: situation.revision });
  assert.equal(h.api.SituationSystem.getSituation().current.carryStatus, "closed");
  h.fire("move-withdraw");
  assert.deepEqual(h.calls.filter((call) => call.method === "withdrawCandidateMove").at(-1).input, { id: move.id, expectedRevision: move.revision });
  assert.equal(h.api.CandidateMoveSystem.getCandidateMove().current.status, "withdrawn");
});

test("advanced rules cannot be erased through the ordinary clear button", () => {
  const h = realHarness(); h.api.CommanderAttentionPolicySystem.establishAttentionPolicy({ rules: [["routine.current"]], expectedRevision: 0 }); h.render();
  assert.equal(h.n("policy-clear").hidden, true); assert.equal(h.n("policy-replace-all").checked, false); const before = h.calls.length, writes = h.writes.length;
  h.fire("policy-clear"); assert.equal(h.calls.length, before); assert.equal(h.writes.length, writes); assert.match(h.n("setup-error").textContent, /detailed rules are preserved/);
});

test("startup waits for load and hidden flow CSS overrides layout display", () => {
  const nodes = new Map([...index.matchAll(/id="(operating-[^"]+)"/g)].map((m) => [m[1], element()])); let load;
  const runtime = vm.createContext({ window: { addEventListener(event, callback, options) { assert.equal(event, "load"); assert.equal(options.once, true); load = callback; } }, document: { readyState: "loading", getElementById(id) { return nodes.get(id); } } });
  vm.runInContext(source, runtime); assert.equal(nodes.get("operating-setup-status").textContent, ""); assert.equal(typeof load, "function"); load(); assert.equal(nodes.get("operating-setup-status").textContent, "Unavailable");
  for (const flow of ["availability", "dependency", "hold", "review"]) assert.equal(nodes.get(`operating-flow-${flow}`).hidden, true);
  assert.match(styleSource, /\.operating-setup-card \[hidden\] \{ display: none !important; \}/);
});

function plannedRows(h, canceled = false) {
  const group = h.n("schedule-records").children.find((section) => section.children[0].textContent === (canceled ? "Canceled planned times" : "Scheduled planned times"));
  return group ? group.children.slice(1) : [];
}
function plannedControls(row) { const form = row.children[2]; return { input: form.children[0].children[0], submit: () => form.handlers.submit({ preventDefault() {} }), cancel: () => row.children[3].handlers.click({}) }; }
function plannedText(node) { return [node.textContent, ...(node.children || []).map(plannedText)].join(" "); }
function addPlan(h, occursAt = "2026-09-29T18:00:00.000Z", rerender = true) {
  const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  const record = h.api.CandidateMoveScheduleSystem.scheduleOccurrence({ candidateMoveId: move.id, expectedCandidateMoveRevision: move.revision, occursAt });
  if (rerender) h.render(); return record;
}
function noPlannedMutation(h, action) { const calls = h.calls.length, writes = h.writes.length; const before = clone(h.api.CandidateMoveScheduleSystem.getSchedules()); action(); assert.equal(h.calls.length, calls); assert.equal(h.writes.length, writes); assert.deepEqual(clone(h.api.CandidateMoveScheduleSystem.getSchedules()), before); }

test("Planned Time creation uses rendered Move, permits same-time records and clears successful input", () => {
  const h = realHarness(); h.establish(); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  assert.equal(h.n("schedule-status").textContent, "No planned times are recorded.");
  addPlan(h, undefined, false);
  for (let index = 0; index < 2; index++) {
    h.input("schedule-time", "2026-09-29T14:00:15"); h.fire("schedule-form", "submit");
    assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveScheduleSystem", method: "scheduleOccurrence", input: { candidateMoveId: move.id, expectedCandidateMoveRevision: move.revision, occursAt: new Date("2026-09-29T14:00:15").toISOString() } });
    assert.equal(h.n("schedule-time").value, "");
  }
  assert.equal(plannedRows(h).length, 3); const records = h.api.CandidateMoveScheduleSystem.getSchedules().records;
  assert.notEqual(records[1].id, records[2].id); assert.equal(records[1].occursAt, records[2].occursAt);
});

for (const change of ["correct", "withdraw"]) test(`Planned Time stale create after Move ${change} never rebinds`, () => {
  const h = realHarness(); h.establish(); h.input("schedule-time", "2026-09-29T14:00"); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  if (change === "correct") h.api.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: move.revision, action: "Call Alice." });
  else h.api.CandidateMoveSystem.withdrawCandidateMove({ id: move.id, expectedRevision: move.revision });
  noPlannedMutation(h, () => h.fire("schedule-form", "submit"));
  assert.match(h.n("setup-error").textContent, change === "correct" ? /action changed/ : /withdrawn/); assert.equal(h.n("schedule-time").value, "");
});

test("Planned Time invalid input and absent Move perform zero mutation", () => {
  const h = realHarness(); h.input("schedule-time", "2026-09-29T14:00"); noPlannedMutation(h, () => h.fire("schedule-form", "submit"));
  h.establish(); for (const value of ["", "bad"]) { h.input("schedule-time", value); noPlannedMutation(h, () => h.fire("schedule-form", "submit")); assert.equal(h.n("setup-error").textContent, "Enter a valid date and time."); }
});

for (const failure of ["unavailable", "throw", "missing", "malformed"]) test(`Planned Time ${failure} collection hides all mutation controls`, () => {
  const h = realHarness(); h.establish(); addPlan(h);
  h.api.CandidateMoveScheduleSystem.getSchedules = failure === "missing" ? undefined : () => { if (failure === "throw") throw new Error("private details"); return failure === "malformed" ? { status: "available" } : { status: "unavailable" }; };
  const count = h.calls.length, writes = h.writes.length; h.fire("schedule-form", "submit");
  assert.equal(h.calls.length, count); assert.equal(h.writes.length, writes);
  assert.equal(h.n("schedule-form").hidden, true); assert.equal(plannedRows(h).length, 0); assert.equal(h.n("schedule-status").textContent, "Planned times are unavailable right now.");
});

test("Planned Time empty available collection is empty truth", () => {
  const h = realHarness(); h.establish(); h.api.CandidateMoveScheduleSystem.getSchedules = () => ({ status: "available", records: [] }); h.render();
  assert.equal(h.n("schedule-status").textContent, "No planned times are recorded."); assert.equal(h.n("schedule-form").hidden, false);
});

test("Planned Time groups preserve collection order, safe accepted action and terminal controls", () => {
  const h = realHarness(); h.establish(); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.api.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: move.revision, action: "<img src=x onerror=bad()>" });
  const a = addPlan(h, "2030-01-01T00:00:00.000Z"), b = addPlan(h, "2000-01-01T00:00:00.000Z"), c = addPlan(h, "2025-01-01T00:00:00.000Z"), d = addPlan(h, "2024-01-01T00:00:00.000Z");
  h.api.CandidateMoveScheduleSystem.cancelOccurrence({ id: d.id, expectedRevision: 1 }); h.api.CandidateMoveScheduleSystem.cancelOccurrence({ id: c.id, expectedRevision: 1 }); h.render();
  const scheduled = plannedRows(h), canceled = plannedRows(h, true);
  assert.equal(scheduled.length, 2); assert.equal(canceled.length, 2);
  assert.equal(scheduled[0].children[0].textContent, "<img src=x onerror=bad()>");
  assert.equal(plannedControls(scheduled[0]).input.value, localValue(a.revisions[0].occursAt)); assert.equal(plannedControls(scheduled[1]).input.value, localValue(b.revisions[0].occursAt));
  const formatted = (instant) => new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(instant));
  assert.equal(canceled[0].children[1].textContent, `Canceled planned time: ${formatted(c.revisions[0].occursAt)}`); assert.equal(canceled[1].children[1].textContent, `Canceled planned time: ${formatted(d.revisions[0].occursAt)}`);
  for (const row of canceled) assert.equal(row.children.length, 2);
  const copy = plannedText(h.n("schedule-records")); for (const record of [a,b,c,d]) assert.ok(!copy.includes(record.id)); assert.doesNotMatch(copy, /revision|schema|occurrence|overdue|missed|completed/i);
});
function localValue(instant) { const d = new Date(instant), p = (n) => String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`.replace(/:00$/, ""); }

test("Planned Time exact reschedule/cancel preserves other same-time records and ignores cancel draft", () => {
  const h = realHarness(); h.establish(); const a = addPlan(h), b = addPlan(h); const other = clone(h.api.CandidateMoveScheduleSystem.getSchedule({id:b.id})); const move = clone(h.api.CandidateMoveSystem.getCandidateMove());
  let controls = plannedControls(plannedRows(h)[0]); controls.input.value = "2026-10-01T15:22:11"; controls.submit();
  assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveScheduleSystem", method: "rescheduleOccurrence", input: { id:a.id, expectedRevision:1, occursAt:new Date("2026-10-01T15:22:11").toISOString() } });
  const time = h.api.CandidateMoveScheduleSystem.getSchedule({id:a.id}).current.occursAt;
  controls = plannedControls(plannedRows(h)[0]); controls.input.value = "bad unsaved text"; controls.cancel();
  assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveScheduleSystem", method: "cancelOccurrence", input:{id:a.id, expectedRevision:2} });
  assert.equal(h.api.CandidateMoveScheduleSystem.getSchedule({id:a.id}).current.occursAt, time);
  assert.deepEqual(clone(h.api.CandidateMoveScheduleSystem.getSchedule({id:b.id})),other); assert.deepEqual(clone(h.api.CandidateMoveSystem.getCandidateMove()),move);
  assert.equal(plannedRows(h).length,1); assert.equal(plannedRows(h,true)[0].children.length,2);
});

for (const operation of ["submit", "cancel"]) for (const change of ["reschedule", "replacement"]) test(`Planned Time stale ${operation} after ${change} performs zero mutation`, () => {
  const h = realHarness(); h.establish(); const a = addPlan(h); const old = plannedControls(plannedRows(h)[0]);
  if (change === "reschedule") h.api.CandidateMoveScheduleSystem.rescheduleOccurrence({ id:a.id, expectedRevision:1, occursAt:"2026-10-01T00:00:00.000Z" });
  else { h.api.CandidateMoveScheduleSystem.cancelOccurrence({id:a.id, expectedRevision:1}); addPlan(h,undefined,false); }
  old.input.value = "2026-10-02T12:00"; noPlannedMutation(h, () => old[operation]()); assert.equal(h.n("setup-error").textContent, "This planned time changed. Review the current information, then try again.");
  assert.equal(plannedRows(h).length,1);
});

for (const change of ["correction", "withdrawal", "closure"]) test(`Planned Time lifecycle remains owned after ${change}`, () => {
  const h = realHarness(); h.establish(); const a = addPlan(h); const controls = plannedControls(plannedRows(h)[0]); const move=h.api.CandidateMoveSystem.getCandidateMove().current;
  if(change==="closure") { const s=h.api.SituationSystem.getSituation().current; h.api.SituationSystem.closeSituation({id:s.id,expectedRevision:s.revision}); }
  else if(change==="correction") h.api.CandidateMoveSystem.correctCandidateMove({id:move.id,expectedRevision:move.revision,action:"Call Alice."});
  else h.api.CandidateMoveSystem.withdrawCandidateMove({id:move.id,expectedRevision:move.revision});
  controls.input.value="2026-10-01T12:00"; controls.submit(); assert.equal(h.calls.at(-1).method,"rescheduleOccurrence"); assert.equal(h.calls.at(-1).input.id,a.id);
  assert.equal(plannedRows(h)[0].children[0].textContent,"Send the package.");
  assert.equal(h.n("schedule-form").hidden,change==="withdrawal");
  plannedControls(plannedRows(h)[0]).cancel(); assert.equal(h.calls.at(-1).method,"cancelOccurrence");
  if(change==="closure") { h.input("schedule-time","2026-10-02T12:00"); h.fire("schedule-form","submit"); assert.equal(h.calls.at(-1).method,"scheduleOccurrence"); }
});

for (const instant of ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z", "2026-11-01T06:30:15.123Z"]) test(`Planned Time unchanged field preserves ${instant} exactly with no save`, () => {
  class FoldDate extends Date {
    getFullYear(){return this.toISOString().startsWith("2026-11-01")?2026:super.getFullYear();}
    getMonth(){return this.toISOString().startsWith("2026-11-01")?10:super.getMonth();}
    getDate(){return this.toISOString().startsWith("2026-11-01")?1:super.getDate();}
    getHours(){return this.toISOString().startsWith("2026-11-01")?1:super.getHours();}
    getMinutes(){return this.toISOString().startsWith("2026-11-01")?30:super.getMinutes();}
  }
  const h=realHarness({}, {Date:FoldDate}); h.establish(); const a=addPlan(h,instant); const controls=plannedControls(plannedRows(h)[0]);
  assert.equal(controls.input.value,instant.includes(":15.")?"2026-11-01T01:30:15":"2026-11-01T01:30");
  const writes=h.writes.length; controls.submit(); assert.deepEqual(h.calls.at(-1).input,{id:a.id,expectedRevision:1,occursAt:instant}); assert.equal(h.writes.length,writes); assert.equal(h.api.CandidateMoveScheduleSystem.getScheduleHistory({id:a.id}).revisions.length,1);
});

for(const operation of ["create","submit","cancel"]) test(`Planned Time ${operation} save failure rerenders saved truth with bounded copy`,()=>{
  const h=realHarness();h.establish();const a=addPlan(h);const controls=plannedControls(plannedRows(h)[0]);const before=clone(h.api.CandidateMoveScheduleSystem.getSchedules()),writes=h.writes.length;
  h.api.CommanderSystem.save=()=>{throw new Error("secret storage revision schedule_private");};
  controls.input.value="2026-10-01T12:00";
  if(operation==="create"){h.input("schedule-time","2026-10-01T12:00");h.fire("schedule-form","submit");}else controls[operation]();
  assert.equal(h.n("setup-error").textContent,"Your change could not be saved. Review the saved information, then try again."); assert.equal(h.writes.length,writes); assert.deepEqual(clone(h.api.CandidateMoveScheduleSystem.getSchedules()),before); assert.equal(plannedControls(plannedRows(h)[0]).input.value,localValue(a.revisions[0].occursAt));
});

test("Planned Time local display has truthful UTC fallback",()=>{
 const h=realHarness({}, {Intl:{DateTimeFormat(){throw new Error("unsupported");}}});h.establish();addPlan(h,"2026-10-01T18:00:00.123Z");assert.match(plannedRows(h)[0].children[1].textContent,/2026-10-01T18:00:00\.123Z \(UTC\)/);assert.doesNotMatch(plannedRows(h)[0].children[1].textContent,/EST|EDT|local/);
});

test("Planned Time reload, render, disclosure and draft edits preserve authority and firewall",()=>{
 const h=realHarness();h.establish();const a=addPlan(h);addPlan(h);plannedControls(plannedRows(h)[1]).cancel();
 const reload=realHarness(Object.fromEntries(h.values));assert.equal(plannedRows(reload).length,1);assert.equal(plannedRows(reload,true).length,1);assert.equal(reload.api.CandidateMoveScheduleSystem.getSchedules().records[0].id,a.id);
 const writes=reload.writes.length,calls=reload.calls.length;reload.render();reload.n("more-details").open=true;plannedControls(plannedRows(reload)[0]).input.value="2026-10-01T12:00";reload.n("more-details").open=false;assert.equal(reload.writes.length,writes);assert.equal(reload.calls.length,calls);
 const slice=source.slice(source.indexOf('  const scheduleUnavailable'),source.indexOf('  function render()'));
 assert.doesNotMatch(slice,/founder\.|localStorage|TemporalProjection|Agenda|Attention|Radar|CandidateMoveCommitmentSystem|CandidateMoveRoutineSystem|setTimeout|setInterval|dispatchEvent|innerHTML|getScheduleHistory/);
 assert.ok(index.indexOf('systems/candidate-move-schedule.system.js')>index.indexOf('systems/candidate-move.system.js'));assert.ok(index.indexOf('systems/candidate-move-schedule.system.js')<index.indexOf('js/widgets/operating-setup.widget.js'));
 assert.match(index,/Uses this device's local time\./);
});

function performanceGroups(h) { return h.n("performance-records").children; }
function performanceRows(h, retracted = false) { const group = performanceGroups(h).find((section) => section.children[0].textContent === (retracted ? "Retracted performances" : "Reported performances")); return group ? group.children.slice(1) : []; }
function performanceText(node) { return [node.textContent, ...(node.children || []).map(performanceText)].join(" "); }
function reportPerformance(h, time = "2026-09-29T14:00:15") { h.input("performance-time", time); h.fire("performance-form", "submit"); return h.api.CandidateMovePerformanceSystem.getPerformances().records.at(-1); }
function choosePerformanceDraft(h, revision, performedAt) { h.input("performance-action", String(revision)); h.fire("performance-action", "change"); h.input("performance-time", performedAt); h.fire("performance-time", "input"); }
function canonicalPerformanceHistory(h) { return clone(h.api.CandidateMoveSystem.getCandidateMoveHistory()); }

test("Performance section placement, healthy absence, historical selector, and local authoring are explicit", () => {
  assert.ok(index.indexOf('id="operating-schedule-step"') < index.indexOf('id="operating-performance-step"')); assert.ok(index.indexOf('id="operating-performance-step"') < index.indexOf('id="operating-routine-step"'));
  const h = realHarness(); h.establish();
  assert.equal(h.n("performance-status").textContent, "No performances are recorded."); assert.equal(h.n("performance-form").hidden, false); assert.match(index, /id="operating-performance-time" type="datetime-local" step="1"/); assert.match(h.n("performance-time").value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  const move = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: move.revision, action: "Call the recipient." }); h.render();
  const options = h.n("performance-action").children; assert.equal(options.length, 2); assert.equal(h.n("performance-action").value, "2"); assert.equal(options[0].textContent, "Send the package."); assert.equal(options[1].textContent, "Call the recipient.");
  const current = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveSystem.correctCandidateMove({ id: current.id, expectedRevision: current.revision, action: "Send the package." }); h.render();
  assert.match(h.n("performance-action").children.at(-1).textContent, /Action revision 3/); assert.match(h.n("performance-action").children.at(-3).textContent, /Action revision 1/);
});

test("Performance report uses exact historical identity and canonical UTC, permits past/future, and refreshes authoring", () => {
  const h = realHarness(); h.establish(); const first = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveSystem.correctCandidateMove({ id: first.id, expectedRevision: first.revision, action: "Call the recipient." }); h.render();
  h.input("performance-action", "1"); const before = h.n("performance-time").value; reportPerformance(h, "2020-01-02T03:04:05");
  assert.deepEqual(h.calls.at(-1), { name: "CandidateMovePerformanceSystem", method: "reportPerformance", input: { candidateMoveId: first.id, candidateMoveRevision: 1, performedAt: new Date("2020-01-02T03:04:05").toISOString() } }); assert.notEqual(h.n("performance-time").value, "2020-01-02T03:04:05"); assert.match(h.n("performance-time").value, /^\d{4}-\d{2}-\d{2}T/); assert.ok(before);
  reportPerformance(h, "2035-01-02T03:04:05"); assert.equal(h.api.CandidateMovePerformanceSystem.getPerformances().records.length, 2); assert.equal(performanceRows(h).length, 2); assert.equal(performanceRows(h)[0].children[0].textContent, "Send the package."); assert.match(performanceText(performanceRows(h)[0]), /Performed:/); assert.equal(performanceRows(h)[0].children.at(-1).textContent, "Retract report");
});

for (const change of ["withdrawal", "closure"]) test(`Performance historical reporting remains available after ${change}`, () => {
  const h = realHarness(); h.establish(); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  if (change === "withdrawal") h.api.CandidateMoveSystem.withdrawCandidateMove({ id: move.id, expectedRevision: move.revision }); else { const situation = h.api.SituationSystem.getSituation().current; h.api.SituationSystem.closeSituation({ id: situation.id, expectedRevision: situation.revision }); }
  h.render(); assert.equal(h.n("performance-form").hidden, false); assert.equal(h.n("performance-action").children.length, 1); reportPerformance(h); assert.equal(h.calls.at(-1).method, "reportPerformance");
});

test("Performance stale report never rebinds, and unavailable history fails closed without hiding healthy history", () => {
  const h = realHarness(); h.establish(); h.input("performance-time", "2026-09-29T14:00:15"); const original = h.api.CandidateMoveSystem.getCandidateMoveHistory; const history = original.call(h.api.CandidateMoveSystem); h.api.CandidateMoveSystem.getCandidateMoveHistory = () => ({ ...history, revisions: history.revisions.map((revision) => ({ ...revision, action: "Changed action." })) }); const calls = h.calls.length, before = clone(h.api.CandidateMovePerformanceSystem.getPerformances()); h.fire("performance-form", "submit");
  assert.equal(h.calls.length, calls); assert.deepEqual(clone(h.api.CandidateMovePerformanceSystem.getPerformances()), before); assert.match(h.n("setup-error").textContent, /performed action changed/i);
  h.api.CandidateMoveSystem.getCandidateMoveHistory = () => ({ status: "unavailable" }); h.render(); assert.equal(h.n("performance-form").hidden, true); assert.equal(h.n("performance-status").textContent, "Performance information is unavailable right now."); h.api.CandidateMoveSystem.getCandidateMoveHistory = original;
});

test("Performance grouping, terminal history, exact retraction, stale protection, and lifecycle independence", () => {
  const h = realHarness(); h.establish(); const first = reportPerformance(h, "2026-09-29T14:00:15"); const second = reportPerformance(h, "2026-09-29T14:00:15"); assert.notEqual(first.id, second.id); assert.equal(performanceRows(h).length, 2);
  const move = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: move.revision, action: "Call the recipient." }); h.render(); performanceRows(h)[0].children.at(-1).handlers.click({}); assert.deepEqual(h.calls.at(-1), { name: "CandidateMovePerformanceSystem", method: "retractPerformance", input: { id: first.id, expectedRevision: 1 } }); assert.equal(performanceRows(h).length, 1); assert.equal(performanceRows(h, true).length, 1); assert.match(performanceText(performanceRows(h, true)[0]), /Retracted performance: Send the package\./); assert.doesNotMatch(performanceText(h.n("performance-records")), /recordedAt/); assert.equal(performanceText(performanceRows(h, true)[0]).includes("Retract report"), false);
  const live = performanceRows(h)[0].children.at(-1).handlers.click; h.api.CandidateMovePerformanceSystem.retractPerformance({ id: second.id, expectedRevision: 1 }); const calls = h.calls.length; live({}); assert.equal(h.calls.length, calls); assert.match(h.n("setup-error").textContent, /performed action changed/i);
  const current = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveSystem.withdrawCandidateMove({ id: current.id, expectedRevision: current.revision }); h.render(); reportPerformance(h); const reported = performanceRows(h)[0]; reported.children.at(-1).handlers.click({}); assert.equal(h.calls.at(-1).method, "retractPerformance");
  const situation = h.api.SituationSystem.getSituation().current; h.api.SituationSystem.closeSituation({ id: situation.id, expectedRevision: situation.revision }); h.render(); reportPerformance(h); performanceRows(h)[0].children.at(-1).handlers.click({}); assert.equal(h.calls.at(-1).method, "retractPerformance");
});

test("Performance unavailable authority and command failure are bounded and do not mutate other owners", () => {
  const h = realHarness(); h.establish(); const move = clone(h.api.CandidateMoveSystem.getCandidateMove()); const situation = clone(h.api.SituationSystem.getSituation()); const performance = clone(h.api.CandidateMovePerformanceSystem.getPerformances()); const original = h.api.CandidateMovePerformanceSystem.getPerformances;
  for (const reader of [undefined, () => { throw new Error("performance_secret"); }, () => ({ status: "unavailable" }), () => ({ status: "available", records: [{}] })]) { h.api.CandidateMovePerformanceSystem.getPerformances = reader; h.render(); assert.equal(h.n("performance-form").hidden, true); assert.equal(h.n("performance-records").children.length, 0); assert.equal(h.n("performance-status").textContent, "Performance information is unavailable right now."); } h.api.CandidateMovePerformanceSystem.getPerformances = original; h.render();
  h.api.CommanderSystem.save = () => { throw new Error("performance_secret"); }; h.input("performance-time", "2026-09-29T14:00:15"); h.fire("performance-form", "submit"); assert.equal(h.n("setup-error").textContent, "Your change could not be saved. Review the saved information, then try again."); assert.deepEqual(clone(h.api.CandidateMoveSystem.getCandidateMove()), move); assert.deepEqual(clone(h.api.SituationSystem.getSituation()), situation); assert.deepEqual(clone(h.api.CandidateMovePerformanceSystem.getPerformances()), performance);
  for (const pattern of [/setTimeout/, /setInterval/, /CandidateMoveCommitmentSystem/, /CandidateMoveRoutineSystem/, /scheduleOccurrence/]) assert.doesNotMatch(source.slice(source.indexOf("const performanceUnavailable"), source.indexOf("function render()")), pattern);
});

test("Performance same-text historical revisions remain distinct and dispatch their exact identities", () => {
  const h = realHarness(); h.establish(); const first = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.api.CandidateMoveSystem.correctCandidateMove({ id: first.id, expectedRevision: 1, action: "Call Alice." }); const second = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.api.CandidateMoveSystem.correctCandidateMove({ id: second.id, expectedRevision: 2, action: "Send the package." }); h.render();
  const options = h.n("performance-action").children; assert.equal(options.length, 3); assert.match(options[0].textContent, /Send the package\. — Action revision 1/); assert.match(options[2].textContent, /Send the package\. — Action revision 3/);
  choosePerformanceDraft(h, 1, "2024-02-29T04:05:06"); h.fire("performance-form", "submit"); assert.equal(h.calls.at(-1).input.candidateMoveRevision, 1);
  choosePerformanceDraft(h, 3, "2035-01-02T03:04:05"); h.fire("performance-form", "submit"); assert.equal(h.calls.at(-1).input.candidateMoveRevision, 3);
});

test("Performance malformed Candidate Move histories fail closed without aliasing healthy Performance records", () => {
  const h = realHarness(); h.establish(); const record = reportPerformance(h); const history = canonicalPerformanceHistory(h); const savedPerformances = clone(h.api.CandidateMovePerformanceSystem.getPerformances()); const savedPerformance = clone(h.api.CandidateMovePerformanceSystem.getPerformance({ id: record.id }));
  h.api.CandidateMovePerformanceSystem.getPerformances = () => clone(savedPerformances); h.api.CandidateMovePerformanceSystem.getPerformance = () => clone(savedPerformance);
  const malformed = [
    { ...history, revisions: [history.revisions[0], { ...history.revisions[0] }] },
    { ...history, revisions: [{ ...history.revisions[0], revision: 2 }] },
    { ...history, revisions: [{ ...history.revisions[0], revision: 2 }, { ...history.revisions[0], revision: 1 }] },
    { ...history, revisions: [{ ...history.revisions[0], action: "" }] },
    { ...history, revisions: [{ ...history.revisions[0], status: "unexpected" }] },
  ];
  for (const state of malformed) { h.api.CandidateMoveSystem.getCandidateMoveHistory = () => clone(state); h.render(); const calls = h.calls.length; assert.equal(h.n("performance-form").hidden, true); assert.equal(h.n("performance-action").children.length, 0); assert.equal(performanceRows(h).length, 1); assert.equal(performanceRows(h)[0].children.at(-1).textContent, "Retract report"); h.fire("performance-form", "submit"); assert.equal(h.calls.length, calls); }
});

test("Performance ordinary rerenders preserve an authored historical draft, including when a newer revision appears", () => {
  const h = realHarness(); h.establish(); const first = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveSystem.correctCandidateMove({ id: first.id, expectedRevision: 1, action: "Call the recipient." }); h.render();
  choosePerformanceDraft(h, 1, "2020-01-02T03:04:05"); h.render(); assert.equal(h.n("performance-action").value, "1"); assert.equal(h.n("performance-time").value, "2020-01-02T03:04:05");
  const current = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveSystem.correctCandidateMove({ id: current.id, expectedRevision: 2, action: "Send to archive." }); h.render(); assert.equal(h.n("performance-action").value, "1"); assert.equal(h.n("performance-time").value, "2020-01-02T03:04:05");
  h.fire("performance-form", "submit"); assert.deepEqual(h.calls.at(-1), { name: "CandidateMovePerformanceSystem", method: "reportPerformance", input: { candidateMoveId: first.id, candidateMoveRevision: 1, performedAt: new Date("2020-01-02T03:04:05").toISOString() } }); assert.equal(h.n("performance-action").value, "3"); assert.notEqual(h.n("performance-time").value, "2020-01-02T03:04:05");
});

test("Performance stale drafts never rebind after history identity, status, action, or Candidate Move changes", () => {
  for (const mutate of [
    (history) => ({ ...history, revisions: [] }),
    (history) => ({ ...history, revisions: [{ ...history.revisions[0], status: "withdrawn" }] }),
    (history) => ({ ...history, revisions: [{ ...history.revisions[0], action: "Changed action." }] }),
    (history) => ({ ...history, id: "candidate_move_replacement_a" }),
  ]) {
    const h = realHarness(); h.establish(); const history = canonicalPerformanceHistory(h); choosePerformanceDraft(h, 1, "2026-09-29T14:00:15"); h.api.CandidateMoveSystem.getCandidateMoveHistory = () => mutate(clone(history)); h.render(); const calls = h.calls.length;
    assert.equal(h.n("performance-action").value, ""); assert.equal(h.n("performance-time").value, "2026-09-29T14:00:15"); if (h.n("performance-form").hidden) assert.equal(h.n("performance-status").textContent, "Performance information is unavailable right now."); else assert.match(h.n("performance-prerequisite").textContent, /Choose an available action again/); h.fire("performance-form", "submit"); assert.equal(h.calls.length, calls); assert.match(h.n("setup-error").textContent, /performed action changed|unavailable/i);
  }
});

test("Performance exact local datetime accepts browser-normalized zero seconds, rejects invalid boundaries, and preserves a failed-command draft", () => {
  const h = realHarness(); h.establish();
  for (const value of ["2026-09-27T09:10:00", "2026-09-27T09:00:00", "2026-09-27T00:00:00", "2028-02-29T00:00:00"]) {
    choosePerformanceDraft(h, 1, value); assert.equal(h.n("performance-time").value, value.slice(0, -3)); const calls = h.calls.length; h.fire("performance-form", "submit"); assert.equal(h.calls.length, calls + 1); assert.deepEqual(h.calls.at(-1), { name: "CandidateMovePerformanceSystem", method: "reportPerformance", input: { candidateMoveId: h.api.CandidateMoveSystem.getCandidateMove().current.id, candidateMoveRevision: 1, performedAt: new Date(value).toISOString() } });
  }
  for (const value of ["2026-02-30T04:05:06", "2025-02-29T04:05:06", "2026-01-01T24:00:00", "2026-01-01T23:60:00", "2026-01-01T23:59:60"]) { choosePerformanceDraft(h, 1, value); const calls = h.calls.length; h.fire("performance-form", "submit"); assert.equal(h.calls.length, calls); assert.match(h.n("setup-error").textContent, /valid date and time/i); }
  choosePerformanceDraft(h, 1, "2024-02-29T04:05:06"); h.fire("performance-form", "submit"); assert.equal(h.calls.at(-1).input.performedAt, new Date("2024-02-29T04:05:06").toISOString());
  choosePerformanceDraft(h, 1, "2035-01-02T03:04:05"); h.api.CommanderSystem.save = () => { throw new Error("secret"); }; h.fire("performance-form", "submit"); assert.equal(h.n("performance-action").value, "1"); assert.equal(h.n("performance-time").value, "2035-01-02T03:04:05"); assert.equal(h.n("setup-error").textContent, "Your change could not be saved. Review the saved information, then try again.");
});

test("Performance history failure isolates healthy records and stale retraction bindings", () => {
  const h = realHarness(); h.establish(); const record = reportPerformance(h); const healthy = clone(h.api.CandidateMovePerformanceSystem.getPerformances()); const detail = clone(h.api.CandidateMovePerformanceSystem.getPerformance({ id: record.id }));
  h.api.CandidateMovePerformanceSystem.getPerformances = () => clone(healthy); h.api.CandidateMovePerformanceSystem.getPerformance = () => clone(detail); h.api.CandidateMoveSystem.getCandidateMoveHistory = () => ({ status: "unavailable" }); h.render(); assert.equal(h.n("performance-form").hidden, true); assert.equal(performanceRows(h).length, 1); assert.equal(performanceRows(h)[0].children.at(-1).textContent, "Retract report");
  const live = performanceRows(h)[0].children.at(-1).handlers.click;
  for (const current of [
    { ...detail.current, revision: 2, status: "reported" },
    { ...detail.current, performedAt: "2026-09-30T14:00:15.000Z" },
    { ...detail.current, candidateMoveRevision: 2 },
    { ...detail.current, acceptedAction: "Changed action." },
  ]) { h.api.CandidateMoveSystem.getCandidateMoveHistory = canonicalPerformanceHistory.bind(null, h); h.api.CandidateMovePerformanceSystem.getPerformance = () => ({ status: "available", current: clone(current) }); const calls = h.calls.length; live({}); assert.equal(h.calls.length, calls); assert.match(h.n("setup-error").textContent, /performed action changed/i); }
});

function actionResultRows(h) { return h.n("action-result-records").children; }
function actionResultText(node) { return [node.textContent, ...(node.children || []).map(actionResultText)].join(" "); }
function reportActionResult(h, text = "The recipient asked for a revised proposal.", time = "2026-09-29T15:00:00") { h.input("action-result-text", text); h.fire("action-result-text", "input"); h.input("action-result-time", time); h.fire("action-result-time", "input"); h.fire("action-result-form", "submit"); return h.api.ActionResultSystem.getActionResults().records.at(-1); }

test("Action Result placement, healthy absence, and exact reported Performance authoring are explicit", () => {
  assert.ok(index.indexOf('id="operating-performance-step"') < index.indexOf('id="operating-action-result-step"')); assert.ok(index.indexOf('id="operating-action-result-step"') < index.indexOf('id="operating-routine-step"'));
  assert.match(styleSource, /\.operating-setup-step input, \.operating-setup-step select, \.operating-setup-step textarea \{ width: 100%; min-width: 0; max-width: 100%;/); assert.match(styleSource, /#operating-action-result-step, #operating-action-result-form, #operating-action-result-form label, #operating-action-result-records, #operating-action-result-records \.operating-setup-step \{ min-width: 0; \}/); assert.match(styleSource, /#operating-action-result-step p, #operating-action-result-records p \{ overflow-wrap: anywhere; \}/);
  const h = realHarness(); h.establish(); const performance = reportPerformance(h, "2026-09-29T14:00:15");
  assert.equal(h.n("action-result-status").textContent, "No Action Results are recorded."); assert.equal(h.n("action-result-form").hidden, false); assert.equal(h.n("action-result-performance").value, performance.id); assert.match(index, /id="operating-action-result-time" type="datetime-local" step="1"/);
  const result = reportActionResult(h); assert.deepEqual(h.calls.at(-1), { name: "ActionResultSystem", method: "reportActionResult", input: { performanceId: performance.id, text: "The recipient asked for a revised proposal.", occurredAt: new Date("2026-09-29T15:00:00").toISOString() } }); assert.equal(result.performanceId, performance.id); assert.match(actionResultText(actionResultRows(h)[0]), /For: Send the package\./); assert.match(actionResultText(actionResultRows(h)[0]), /Performed:/); assert.match(actionResultText(actionResultRows(h)[0]), /What happened: The recipient asked for a revised proposal\./); assert.equal(actionResultRows(h)[0].children.at(-1).textContent, "Retract report");
});

function actionResultPerformance(id, acceptedAction, performedAt) { return { id, revision: 1, status: "reported", candidateMoveId: "candidate_move_a", candidateMoveRevision: 1, acceptedAction, performedAt }; }
function actionResultOptionSuffixes(h) { return new Map(h.n("action-result-performance").children.map((option) => [option.value, (option.textContent.match(/ — report (.+)$/) || [])[1] || null])); }
function renderActionResultTargets(records) { const h = realHarness(); h.establish(); h.api.CandidateMovePerformanceSystem.getPerformances = () => ({ status: "available", records: clone(records) }); h.render(); return h; }

test("Action Result target suffixes use each collision group's shortest trailing Performance-ID portion", () => {
  const one = [actionResultPerformance("performance_abc_1", "One character.", "2026-09-29T14:00:15.000Z"), actionResultPerformance("performance_abc_2", "One character.", "2026-09-29T14:00:15.000Z")];
  const three = [actionResultPerformance("performance_three_a", "Three targets.", "2026-09-29T15:00:15.000Z"), actionResultPerformance("performance_three_b", "Three targets.", "2026-09-29T15:00:15.000Z"), actionResultPerformance("performance_three_c", "Three targets.", "2026-09-29T15:00:15.000Z")];
  const progressive = [actionResultPerformance("performance_a_zz1", "Progressive.", "2026-09-29T16:00:15.000Z"), actionResultPerformance("performance_b_yz1", "Progressive.", "2026-09-29T16:00:15.000Z"), actionResultPerformance("performance_c_xx2", "Progressive.", "2026-09-29T16:00:15.000Z")];
  const long = [actionResultPerformance("performance_a_abcde1", "Long suffix.", "2026-09-29T17:00:15.000Z"), actionResultPerformance("performance_b_xbcde1", "Long suffix.", "2026-09-29T17:00:15.000Z")];
  const unique = actionResultPerformance("performance_unique_z", "No collision.", "2026-09-29T18:00:15.000Z"); const records = [...one, ...three, ...progressive, ...long, unique]; const h = renderActionResultTargets(records); const suffixes = actionResultOptionSuffixes(h);
  assert.equal(h.n("action-result-performance").children.length, records.length); for (const record of records) assert.ok(suffixes.has(record.id));
  assert.deepEqual([...one.map((record) => suffixes.get(record.id))], ["1", "2"]); assert.deepEqual([...three.map((record) => suffixes.get(record.id))], ["a", "b", "c"]); assert.deepEqual([...progressive.map((record) => suffixes.get(record.id))], ["zz1", "yz1", "xx2"]); assert.deepEqual([...long.map((record) => suffixes.get(record.id))], ["abcde1", "xbcde1"]); assert.equal(suffixes.get(unique.id), null);
  const reversed = actionResultOptionSuffixes(renderActionResultTargets([...records].reverse())); for (const record of records) assert.equal(reversed.get(record.id), suffixes.get(record.id));
});

test("Action Result target presentation rejects malformed or duplicate reported Performance identities", () => {
  const malformed = actionResultPerformance("not-a-performance-id", "Malformed.", "2026-09-29T14:00:15.000Z"); const duplicate = actionResultPerformance("performance_duplicate_a", "Duplicate.", "2026-09-29T15:00:15.000Z");
  for (const records of [[malformed], [duplicate, { ...duplicate }]]) { const h = renderActionResultTargets(records); const calls = h.calls.length; assert.equal(h.n("action-result-form").hidden, true); assert.equal(h.n("action-result-performance").children.length, 0); assert.equal(h.n("action-result-status").textContent, "Performance information is unavailable right now."); h.fire("action-result-form", "submit"); assert.equal(h.calls.length, calls); }
});

for (const change of ["correction", "withdrawal", "closure"]) test(`Action Result creation remains eligible after historical ${change}`, () => {
  const h = realHarness(); h.establish(); const performance = reportPerformance(h);
  if (change === "correction") { const move = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: move.revision, action: "Call the recipient." }); }
  else if (change === "withdrawal") { const move = h.api.CandidateMoveSystem.getCandidateMove().current; h.api.CandidateMoveSystem.withdrawCandidateMove({ id: move.id, expectedRevision: move.revision }); }
  else { const situation = h.api.SituationSystem.getSituation().current; h.api.SituationSystem.closeSituation({ id: situation.id, expectedRevision: situation.revision }); }
  h.render(); assert.equal(h.n("action-result-form").hidden, false); assert.equal(h.n("action-result-performance").value, performance.id); reportActionResult(h); assert.equal(h.calls.at(-1).input.performanceId, performance.id);
});

test("Action Result draft survives ordinary renders and failed commands, but successful reporting resets it", () => {
  const h = realHarness(); h.establish(); const first = reportPerformance(h); const second = reportPerformance(h, "2026-09-29T15:00:15"); h.input("action-result-performance", second.id); h.fire("action-result-performance", "change"); h.input("action-result-text", "  Keep this raw draft.  "); h.fire("action-result-text", "input"); h.input("action-result-time", "2035-01-02T03:04:05"); h.fire("action-result-time", "input"); h.render(); assert.equal(h.n("action-result-performance").value, second.id); assert.equal(h.n("action-result-text").value, "  Keep this raw draft.  "); assert.equal(h.n("action-result-time").value, "2035-01-02T03:04:05");
  h.api.CommanderSystem.save = () => { throw new Error("secret"); }; h.fire("action-result-form", "submit"); assert.equal(h.n("action-result-performance").value, second.id); assert.equal(h.n("action-result-text").value, "  Keep this raw draft.  "); assert.equal(h.n("action-result-time").value, "2035-01-02T03:04:05"); assert.equal(h.api.ActionResultSystem.getActionResults().status, "absent");
  h.api.CommanderSystem.save = (candidate) => { h.values.set("digitalMikeyFounder", JSON.stringify(candidate)); return true; }; h.fire("action-result-form", "submit"); assert.equal(h.api.ActionResultSystem.getActionResults().records.length, 1); assert.equal(h.n("action-result-performance").value, first.id); assert.equal(h.n("action-result-text").value, ""); assert.notEqual(h.n("action-result-time").value, "2035-01-02T03:04:05");
});

test("Action Result stale creation and unavailable detail dispatch nothing or retarget nothing", () => {
  const h = realHarness(); h.establish(); const first = reportPerformance(h); const second = reportPerformance(h, "2026-09-29T15:00:15"); h.input("action-result-performance", first.id); h.fire("action-result-performance", "change"); h.input("action-result-text", "Keep this."); h.fire("action-result-text", "input"); h.input("action-result-time", "2026-09-29T16:00:00"); h.fire("action-result-time", "input"); h.api.CandidateMovePerformanceSystem.retractPerformance({ id: first.id, expectedRevision: 1 });
  const calls = h.calls.length; h.fire("action-result-form", "submit"); assert.equal(h.calls.length, calls); assert.equal(h.n("action-result-performance").value, ""); assert.equal(h.n("action-result-text").value, "Keep this."); assert.equal(h.n("action-result-time").value, "2026-09-29T16:00"); assert.match(h.n("setup-error").textContent, /Choose it again/); h.input("action-result-performance", second.id); h.fire("action-result-performance", "change"); assert.equal(h.n("action-result-text").value, "Keep this."); h.api.CandidateMovePerformanceSystem.getPerformance = () => ({ status: "unavailable" }); h.fire("action-result-form", "submit"); assert.equal(h.calls.length, calls); assert.match(h.n("setup-error").textContent, /Choose it again/);
});

test("Action Result datetime validation accepts minute precision and future values, rejects impossible dates, and has no chronology gate", () => {
  const h = realHarness(); h.establish(); reportPerformance(h, "2030-01-02T03:04:05");
  for (const value of ["2020-01-02T03:04", "2035-01-02T03:04:05"]) { const before = h.calls.length; reportActionResult(h, "Time is explicit.", value); assert.equal(h.calls.length, before + 1); assert.equal(h.calls.at(-1).input.occurredAt, new Date(value.length === 16 ? `${value}:00` : value).toISOString()); }
  for (const value of ["2026-02-30T04:05:06", "2025-02-29T04:05:06", "2026-01-01T24:00:00"]) { h.input("action-result-text", "Time is explicit."); h.fire("action-result-text", "input"); h.input("action-result-time", value); h.fire("action-result-time", "input"); const before = h.calls.length; h.fire("action-result-form", "submit"); assert.equal(h.calls.length, before); assert.match(h.n("setup-error").textContent, /valid date and time/i); }
});

test("Action Result rows remain owner ordered, retraction is stale-safe, and remains usable after Performance retraction", () => {
  const h = realHarness(); h.establish(); const first = reportPerformance(h); const firstResult = reportActionResult(h, "First report."); const second = reportPerformance(h, "2026-09-29T15:00:15"); h.input("action-result-performance", second.id); h.fire("action-result-performance", "change"); const secondResult = reportActionResult(h, "Second report."); assert.match(actionResultText(actionResultRows(h)[0]), /First report/); assert.match(actionResultText(actionResultRows(h)[1]), /Second report/);
  const stale = actionResultRows(h)[0].children.at(-1).handlers.click; h.api.ActionResultSystem.retractActionResult({ id: firstResult.id, expectedRevision: 1 }); const calls = h.calls.length; stale({}); assert.equal(h.calls.length, calls); assert.match(h.n("setup-error").textContent, /That report changed/); assert.match(actionResultText(actionResultRows(h)[0]), /Retracted report for/); assert.ok(actionResultRows(h)[0].children.every((child) => child.textContent !== "Retract report"));
  h.api.CandidateMovePerformanceSystem.retractPerformance({ id: second.id, expectedRevision: 1 }); h.render(); assert.match(actionResultText(actionResultRows(h)[1]), /Second report/); const button = actionResultRows(h)[1].children.at(-1); assert.equal(button.textContent, "Retract report"); button.handlers.click({}); assert.equal(h.api.ActionResultSystem.getActionResult({ id: secondResult.id }).current.status, "retracted");
});

test("Action Result unavailable and malformed owners fail closed without downstream writes", () => {
  const h = realHarness(); h.establish(); reportPerformance(h); const originalResults = h.api.ActionResultSystem.getActionResults; const originalPerformances = h.api.CandidateMovePerformanceSystem.getPerformances;
  for (const reader of [undefined, () => ({ status: "unavailable" }), () => ({ status: "available", records: [{}] })]) { h.api.ActionResultSystem.getActionResults = reader; h.render(); assert.equal(h.n("action-result-form").hidden, true); assert.equal(h.n("action-result-records").children.length, 0); assert.equal(h.n("action-result-status").textContent, "Action Result information is unavailable right now."); }
  h.api.ActionResultSystem.getActionResults = originalResults; h.api.CandidateMovePerformanceSystem.getPerformances = () => ({ status: "unavailable" }); h.render(); assert.equal(h.n("action-result-form").hidden, true); assert.equal(h.n("action-result-status").textContent, "Performance information is unavailable right now."); h.api.CandidateMovePerformanceSystem.getPerformances = originalPerformances;
  for (const pattern of [/founder\.|localStorage|sessionStorage|CommanderSystem\.save|CandidateMoveCommitmentSystem|CandidateMoveRoutineSystem|CandidateMoveScheduleSystem|AttentionSystem|TemporalProjectionSystem|setTimeout|setInterval|dispatchEvent|innerHTML/]) assert.doesNotMatch(source.slice(source.indexOf("const actionResultUnavailable"), source.indexOf("function render()")), pattern);
});
