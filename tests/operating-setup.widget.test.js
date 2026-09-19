const test = require("node:test"); const assert = require("node:assert/strict"); const fs = require("node:fs"); const path = require("node:path"); const vm = require("node:vm");
const root = path.resolve(__dirname, ".."); const source = fs.readFileSync(path.join(root, "js/widgets/operating-setup.widget.js"), "utf8"); const index = fs.readFileSync(path.join(root, "index.html"), "utf8"); const styleSource = fs.readFileSync(path.join(root, "style.css"), "utf8"); const clone = (value) => JSON.parse(JSON.stringify(value)); const ownerFiles = ["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js", "systems/commander-context.system.js", "systems/commander-attention-policy.system.js"];
function element() { return { value: "", checked: false, textContent: "", hidden: false, disabled: false, handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } }; }
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
  const runtime = vm.createContext({ window: {}, document: { getElementById(id) { return nodes.get(id) || null; } }, SituationSystem, CandidateMoveSystem, CommanderContextSystem, CommanderAttentionPolicySystem, console: { warn() {}, error() {} } }); vm.runInContext(source, runtime); const fire = (id, type = "click") => nodes.get(id).handlers[type]({ preventDefault() {} }); return { nodes, calls, fire, state: () => ({ situation, move, context, policy }), widget: runtime.window.OperatingSetupWidget }; }

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
function realHarness(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  const storage = { get length() { return values.size; }, key(i) { return [...values.keys()][i] || null; }, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { writes.push([key, String(value)]); values.set(key, String(value)); }, removeItem(key) { values.delete(key); } };
  const nodes = new Map([...index.matchAll(/id="(operating-[^"]+)"/g)].map((match) => [match[1], { ...element(), open: false }]));
  const context = vm.createContext({ Date, Math, JSON, localStorage: storage, sessionStorage: storage, window: {}, document: { getElementById(id) { return nodes.get(id) || null; } }, console: { log() {}, warn() {}, error() {} } });
  const extra = ["candidate-move-hold", "candidate-move-dependency", "candidate-move-availability", "move-state"];
  for (const file of [...ownerFiles, ...extra.map((name) => `systems/${name}.system.js`)]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  vm.runInContext("loadFounder(); globalThis.api = { SituationSystem, CandidateMoveSystem, CandidateMoveHoldSystem, CandidateMoveDependencySystem, CandidateMoveAvailabilitySystem, MoveStateSystem, CommanderContextSystem, CommanderAttentionPolicySystem, CommanderSystem };", context);
  const calls = [];
  for (const [name, api] of Object.entries(context.api)) for (const method of Object.keys(api)) {
    if (!/^(create|correct|close|release|resolve|confirm|reconfirm|withdraw|establish|replace|clear)/.test(method) || typeof api[method] !== "function") continue;
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

test("real Hold create/release uses exact fresh inputs and terminal UI cannot recreate", () => {
  const h = realHarness(); h.establish(); h.state("clarify"); const move = h.api.CandidateMoveSystem.getCandidateMove().current;
  h.fire("hold-create"); h.state("hold"); assert.deepEqual(h.calls.at(-1), { name: "CandidateMoveHoldSystem", method: "createHold", input: { candidateMoveId: move.id } });
  assert.equal(h.n("hold-create").hidden, true); assert.equal(h.n("hold-release").hidden, false);
  const hold = h.api.CandidateMoveHoldSystem.getHold().current;
  h.fire("hold-release"); h.state("clarify"); assert.deepEqual(h.calls.at(-1).input, { id: hold.id, expectedRevision: hold.revision });
  assert.equal(h.n("hold-create").hidden, true); assert.equal(h.n("hold-release").hidden, true); assert.match(h.n("hold-current").textContent, /released/);
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
  for (const pattern of [/innerHTML/, /founder\./, /localStorage/, /sessionStorage/, /CommanderSystem\.save/, /getAttention\(/, /setTimeout/, /setInterval/, /dispatchEvent/, /\.state\s*=(?!=)/, /\.moveState\s*=/]) assert.doesNotMatch(source, pattern);
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
