// =====================================================
// FOUNDEROS
// OPERATING INTELLIGENCE SETUP WIDGET
// UI orchestration for existing Commander authorities only.
// =====================================================

(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const ids = ["operating-setup-status", "operating-setup-error", "operating-situation-current", "operating-situation-subject", "operating-situation-reality", "operating-situation-form", "operating-situation-subject-input", "operating-situation-reality-input", "operating-situation-submit", "operating-situation-edit", "operating-situation-close", "operating-move-current", "operating-move-absent", "operating-move-prerequisite", "operating-move-action", "operating-move-form", "operating-move-action-input", "operating-move-submit", "operating-move-edit", "operating-move-withdraw", "operating-context-current", "operating-context-scoped", "operating-context-open", "operating-context-clear", "operating-policy-clarify", "operating-policy-current", "operating-policy-submit", "operating-policy-clear", "operating-policy-guidance"];
  ids.push(...["state-label", "state-copy", "truth", "truth-lifecycle", "hold-current", "hold-create", "hold-release", "dependency-current", "dependency-form", "dependency-input", "dependency-submit", "dependency-resolution", "dependency-resolve", "availability-current", "availability-form", "availability-review", "availability-input", "availability-guidance", "availability-submit", "availability-withdraw", "policy-actionable", "policy-waiting", "policy-hold", "policy-advanced", "policy-rules", "policy-replace-all", "commitment-current", "commitment-prerequisite", "commitment-form", "commitment-deadline", "commitment-submit", "commitment-complete", "commitment-cancel", "routine-current", "routine-prerequisite", "routine-form", "routine-weekday", "routine-opens", "routine-closes", "routine-submit", "routine-pause", "routine-resume", "routine-retire"].map((id) => `operating-${id}`));
  ids.push(...["status", "prerequisite", "form", "time", "records"].map((id) => `operating-schedule-${id}`));
  let renderedScheduleCreate = null;
  const flows = ["availability", "dependency", "hold", "review"];
  ids.push(...flows.flatMap((flow) => [`operating-choice-${flow}`, `operating-flow-${flow}`]));
  let selectedFlow = null;
  const node = Object.fromEntries(ids.map((id) => [id, $(id)])); if (Object.values(node).some((value) => !value)) return;
  const policyOptions = ["actionable", "waiting", "hold", "clarify"];
  let reviewedBindings = null;
  let reviewRequired = false;
  let displayedPolicyRevision = null;
  let dependencyDraftRevision = null;
  let editingSituation = false; let editingMove = false; let renderedDeadline = null; let renderedRoutineCreate = null; let renderedRoutineCommands = {};
  const owner = (name, method) => { const value = name === "SituationSystem" ? (typeof SituationSystem === "undefined" ? null : SituationSystem) : name === "CandidateMoveSystem" ? (typeof CandidateMoveSystem === "undefined" ? null : CandidateMoveSystem) : name === "CommanderContextSystem" ? (typeof CommanderContextSystem === "undefined" ? null : CommanderContextSystem) : name === "CommanderAttentionPolicySystem" ? (typeof CommanderAttentionPolicySystem === "undefined" ? null : CommanderAttentionPolicySystem) : null; return value && typeof value[method] === "function" ? value : null; };
  const operatingOwner = (name) => ({
    CandidateMoveHoldSystem: typeof CandidateMoveHoldSystem === "undefined" ? null : CandidateMoveHoldSystem,
    CandidateMoveDependencySystem: typeof CandidateMoveDependencySystem === "undefined" ? null : CandidateMoveDependencySystem,
    CandidateMoveAvailabilitySystem: typeof CandidateMoveAvailabilitySystem === "undefined" ? null : CandidateMoveAvailabilitySystem,
    CandidateMoveCommitmentSystem: typeof CandidateMoveCommitmentSystem === "undefined" ? null : CandidateMoveCommitmentSystem,
    CandidateMoveRoutineSystem: typeof CandidateMoveRoutineSystem === "undefined" ? null : CandidateMoveRoutineSystem,
    CandidateMoveScheduleSystem: typeof CandidateMoveScheduleSystem === "undefined" ? null : CandidateMoveScheduleSystem,
    MoveStateSystem: typeof MoveStateSystem === "undefined" ? null : MoveStateSystem,
  })[name];
  const apiFor = (name, method) => { const api = owner(name, method) || operatingOwner(name); return api && typeof api[method] === "function" ? api : null; };
  const read = (name, method) => { const value = apiFor(name, method); if (!value) return { status: "unavailable" }; try { const result = value[method](); return result && typeof result === "object" && (result.status !== "available" || name === "MoveStateSystem" || name === "CandidateMoveCommitmentSystem" || name === "CandidateMoveRoutineSystem" || name === "CandidateMoveScheduleSystem" || result.current) ? result : { status: "unavailable" }; } catch (error) { return { status: "unavailable" }; } };
  const error = (message = "") => { node["operating-setup-error"].textContent = message; };
  const message = (value) => value && typeof value.message === "string" ? value.message.slice(0, 240) : "Your change could not be saved.";
  const current = () => ({ situation: read("SituationSystem", "getSituation"), move: read("CandidateMoveSystem", "getCandidateMove"), hold: read("CandidateMoveHoldSystem", "getHold"), dependency: read("CandidateMoveDependencySystem", "getDependency"), availability: read("CandidateMoveAvailabilitySystem", "getAvailability"), commitments: read("CandidateMoveCommitmentSystem", "getCommitments"), routines: read("CandidateMoveRoutineSystem", "getRoutines"), moveState: read("MoveStateSystem", "getMoveState"), context: read("CommanderContextSystem", "getContext"), policy: read("CommanderAttentionPolicySystem", "getAttentionPolicy") });
  const available = (state) => state && state.status === "available" && state.current;
  const active = (state) => available(state) && (state.current.status === "active" || state.current.carryStatus === "active");
  const commitmentsFor = (state, move) => state && state.status === "available" && Array.isArray(state.records) && move ? state.records.filter((record) => record && record.candidateMoveId === move.id) : [];
  const activeCommitmentFor = (state, move) => commitmentsFor(state, move).find((record) => record.status === "active") || null;
  const routinesFor = (state, move) => state && state.status === "available" && Array.isArray(state.routines) && move ? state.routines.filter((record) => record && record.candidateMoveId === move.id) : [];
  const scheduleText = (schedule) => { const weekdays = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]; return schedule && schedule.kind === "weekly-utc" && weekdays[schedule.weekday] ? `Every ${weekdays[schedule.weekday]}, ${schedule.opensAtUtc}–${schedule.closesAtUtc} UTC.` : "The recorded UTC schedule is unavailable."; };
  const routineState = (id) => { const api = apiFor("CandidateMoveRoutineSystem", "getRoutine"); if (!api) return { status: "unavailable" }; try { const result = api.getRoutine({ id }); return result && typeof result === "object" ? result : { status: "unavailable" }; } catch (failure) { return { status: "unavailable" }; } };
  const deadlineWindow = (value, original = null) => {
    if (typeof value !== "string" || !value) throw new Error("Enter a valid deadline.");
    if (original && value === original.value) return { kind: "deadline", dueAt: original.dueAt };
    const date = new Date(value); if (Number.isNaN(date.getTime())) throw new Error("Enter a valid deadline.");
    const dueAt = date.toISOString(); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(dueAt)) throw new Error("Enter a valid deadline.");
    return { kind: "deadline", dueAt };
  };
  const displayDeadline = (dueAt) => {
    const date = new Date(dueAt); if (Number.isNaN(date.getTime())) return { text: "Recorded deadline is unavailable.", local: false };
    try { return { text: new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(date), local: true }; } catch (failure) { return { text: `${date.toISOString()} (UTC)`, local: false }; }
  };
  const localDeadlineValue = (dueAt) => {
    const date = new Date(dueAt); if (Number.isNaN(date.getTime())) return "";
    const part = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
  };
  const scheduleUnavailable = "Planned times are unavailable right now.";
  const scheduleStale = "This planned time changed. Review the current information, then try again.";
  const scheduleHealthy = (state) => state && (state.status === "absent" || state.status === "available" && Array.isArray(state.records));
  function plannedInstant(value, binding = null) {
    if (!value || typeof value !== "string") throw new Error("Enter a valid date and time.");
    if (binding && value === binding.value) return binding.occursAt;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date and time.");
    const instant = date.toISOString();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(instant)) throw new Error("Enter a valid date and time.");
    return instant;
  }
  function scheduleCommand(method, input) {
    try { return command("CandidateMoveScheduleSystem", method, input); }
    catch (failure) { throw new Error("Your change could not be saved. Review the saved information, then try again."); }
  }
  function requireSchedule(binding, operation) {
    const api = apiFor("CandidateMoveScheduleSystem", "getSchedule");
    let state;
    try { state = api ? api.getSchedule({ id: binding.id }) : null; } catch (failure) { state = null; }
    if (!state || state.status === "unavailable") throw new Error(scheduleUnavailable);
    const record = state.current;
    if (binding.operation !== operation || state.status !== "available" || !record || ["id", "revision", "status", "occursAt", "candidateMoveId", "candidateMoveRevision", "acceptedAction"].some((key) => record[key] !== binding[key])) throw new Error(scheduleStale);
  }
  function renderSchedules(moveState) {
    const state = read("CandidateMoveScheduleSystem", "getSchedules");
    const healthy = scheduleHealthy(state);
    const move = active(moveState) ? moveState.current : null;
    const next = healthy && move ? Object.freeze({ operation: "create", candidateMoveId: move.id, candidateMoveRevision: move.revision, action: move.action, usable: true }) : null;
    if (JSON.stringify(next) !== JSON.stringify(renderedScheduleCreate)) node["operating-schedule-time"].value = "";
    renderedScheduleCreate = next;
    node["operating-schedule-form"].hidden = !next;
    const records = healthy && state.status === "available" ? state.records : [];
    node["operating-schedule-status"].textContent = !healthy ? scheduleUnavailable : !records.length ? "No planned times are recorded." : "";
    node["operating-schedule-prerequisite"].textContent = !healthy || move ? "" : available(moveState) && moveState.current.status === "withdrawn" ? "This action is withdrawn. You can still change or cancel its existing planned times." : "Record an action first to add a planned time.";
    const container = node["operating-schedule-records"];
    container.replaceChildren();
    for (const status of ["scheduled", "canceled"]) {
      const group = records.filter((record) => record.status === status);
      if (!group.length) continue;
      const section = document.createElement("section");
      const heading = document.createElement("h4"); heading.textContent = status === "scheduled" ? "Scheduled planned times" : "Canceled planned times"; section.appendChild(heading);
      for (const record of group) {
        const row = document.createElement("div"); row.className = "operating-setup-step";
        const action = document.createElement("p"); action.textContent = record.acceptedAction; row.appendChild(action);
        const time = document.createElement("p"); time.textContent = `${status === "scheduled" ? "Planned for" : "Canceled planned time"}: ${displayDeadline(record.occursAt).text}`; row.appendChild(time);
        if (status === "scheduled") {
          const form = document.createElement("form"); const label = document.createElement("label"); label.textContent = "Plan for";
          const input = document.createElement("input"); input.type = "datetime-local"; input.step = "1"; input.required = true;
          input.value = localDeadlineValue(record.occursAt); label.appendChild(input); form.appendChild(label);
          const base = { id: record.id, revision: record.revision, status: record.status, occursAt: record.occursAt, candidateMoveId: record.candidateMoveId, candidateMoveRevision: record.candidateMoveRevision, acceptedAction: record.acceptedAction };
          const edit = Object.freeze({ ...base, operation: "reschedule", value: input.value });
          const cancel = Object.freeze({ ...base, operation: "cancel" });
          const save = document.createElement("button"); save.type = "submit"; save.textContent = "Change time"; form.appendChild(save);
          form.addEventListener("submit", (event) => { event.preventDefault(); invoke(() => {
            requireSchedule(edit, "reschedule");
            scheduleCommand("rescheduleOccurrence", { id: edit.id, expectedRevision: edit.revision, occursAt: plannedInstant(input.value, edit) });
          }); });
          const button = document.createElement("button"); button.type = "button"; button.className = "operating-secondary"; button.textContent = "Cancel planned time";
          button.addEventListener("click", () => invoke(() => { requireSchedule(cancel, "cancel"); scheduleCommand("cancelOccurrence", { id: cancel.id, expectedRevision: cancel.revision }); }));
          row.appendChild(form); row.appendChild(button);
        }
        section.appendChild(row);
      }
      container.appendChild(section);
    }
  }
  node["operating-schedule-form"].addEventListener("submit", (event) => {
    event.preventDefault(); invoke(() => {
      const binding = renderedScheduleCreate;
      const moveState = read("CandidateMoveSystem", "getCandidateMove");
      const schedules = read("CandidateMoveScheduleSystem", "getSchedules");
      if (!scheduleHealthy(schedules)) throw new Error(scheduleUnavailable);
      if (available(moveState) && moveState.current.status === "withdrawn") throw new Error("This action is withdrawn. A new planned time cannot be added.");
      if (!binding || binding.operation !== "create" || !binding.usable || !active(moveState) || moveState.current.id !== binding.candidateMoveId || moveState.current.revision !== binding.candidateMoveRevision || moveState.current.action !== binding.action) throw new Error("The action changed. Review it, then add the planned time again.");
      scheduleCommand("scheduleOccurrence", { candidateMoveId: binding.candidateMoveId, expectedCandidateMoveRevision: binding.candidateMoveRevision, occursAt: plannedInstant(node["operating-schedule-time"].value) });
      node["operating-schedule-time"].value = "";
    });
  });
  function render() {
    const state = current(); renderSchedules(state.move); const situationRecord = available(state.situation) ? state.situation.current : null; const moveRecord = available(state.move) ? state.move.current : null; const situation = active(state.situation) ? state.situation.current : null; const move = active(state.move) ? state.move.current : null; const context = active(state.context) ? state.context.current : null; const policy = active(state.policy) ? state.policy.current : null;
    const unavailable = [state.situation, state.move, state.context, state.policy].some((value) => value.status === "unavailable");
    node["operating-setup-status"].textContent = unavailable ? "Unavailable" : situation && move && context && policy ? "Your focus is saved." : context && policy && !move ? "No action is recorded yet." : "Start with what’s going on.";
    node["operating-situation-current"].hidden = !situationRecord; node["operating-situation-form"].hidden = !!situationRecord && !editingSituation;
    if (situationRecord) { node["operating-situation-subject"].textContent = situationRecord.subject; node["operating-situation-reality"].textContent = situationRecord.carryStatus === "closed" ? `${situationRecord.currentReality} (This situation is closed.)` : situationRecord.currentReality; if (editingSituation && situation) { node["operating-situation-reality-input"].value = situation.currentReality; node["operating-situation-submit"].textContent = "Save what’s going on"; } } else { node["operating-situation-submit"].textContent = "Save this situation"; }
    node["operating-situation-edit"].hidden = !situation; node["operating-situation-close"].hidden = !situation;
    node["operating-move-current"].hidden = !moveRecord; node["operating-move-absent"].hidden = !!moveRecord; node["operating-move-prerequisite"].hidden = !!situation || !!moveRecord; node["operating-move-form"].hidden = !!moveRecord && !editingMove || (!moveRecord && !situation);
    if (moveRecord) { node["operating-move-action"].textContent = moveRecord.status === "withdrawn" ? `${moveRecord.action} (This action is withdrawn.)` : moveRecord.action; if (editingMove && move) { node["operating-move-action-input"].value = move.action; node["operating-move-submit"].textContent = "Edit this action"; } } else { node["operating-move-submit"].textContent = "Save this action"; }
    node["operating-move-edit"].hidden = !move; node["operating-move-withdraw"].hidden = !move;
    node["operating-move-submit"].disabled = editingMove ? !move : !situation;
    const linkedCommitments = commitmentsFor(state.commitments, moveRecord); const activeCommitment = activeCommitmentFor(state.commitments, moveRecord); const terminalCommitments = linkedCommitments.filter((record) => record.status !== "active");
    node["operating-commitment-prerequisite"].hidden = (!!move || !!activeCommitment) || state.commitments.status === "unavailable";
    node["operating-commitment-prerequisite"].textContent = !moveRecord ? "Record an action that has not been withdrawn before recording a deadline." : "This action is withdrawn. A new deadline cannot be recorded.";
    node["operating-commitment-form"].hidden = state.commitments.status === "unavailable" || (!move && !activeCommitment);
    node["operating-commitment-complete"].hidden = !activeCommitment;
    node["operating-commitment-cancel"].hidden = !activeCommitment;
    node["operating-commitment-submit"].textContent = activeCommitment ? "Change deadline" : "Record deadline";
    renderedDeadline = null;
    if (activeCommitment) { node["operating-commitment-deadline"].value = localDeadlineValue(activeCommitment.window.dueAt); const value = node["operating-commitment-deadline"].value; if (value) renderedDeadline = { mode: "correct", candidateMoveId: moveRecord.id, id: activeCommitment.id, revision: activeCommitment.revision, value, dueAt: activeCommitment.window.dueAt }; }
    else if (move) renderedDeadline = { mode: "create", candidateMoveId: move.id, candidateMoveRevision: move.revision };
    if (state.commitments.status === "unavailable") node["operating-commitment-current"].textContent = "Deadline commitments are unavailable right now.";
    else if (activeCommitment) { const deadline = displayDeadline(activeCommitment.window.dueAt); const previous = terminalCommitments.length ? ` Previous commitments: ${terminalCommitments.map((record) => { const recordDeadline = displayDeadline(record.window.dueAt); return `${record.status === "completed" ? "Completed" : "Canceled"}. Recorded deadline: ${recordDeadline.text}.${record.acceptedAction !== moveRecord.action ? ` Recorded for: ${record.acceptedAction}.` : ""}${recordDeadline.local ? "" : " Shown in UTC."}`; }).join(" ")}` : ""; node["operating-commitment-current"].textContent = `Active. Recorded deadline: ${deadline.text}.${activeCommitment.acceptedAction !== moveRecord.action ? ` Recorded for: ${activeCommitment.acceptedAction}.` : ""}${deadline.local ? " The recorded deadline is an instant shown in your local time." : " The recorded deadline is shown in UTC."}${previous}`; }
    else if (terminalCommitments.length) node["operating-commitment-current"].textContent = `${terminalCommitments.map((record) => { const deadline = displayDeadline(record.window.dueAt); return `${record.status === "completed" ? "Completed" : "Canceled"}. Recorded deadline: ${deadline.text}.${record.acceptedAction !== moveRecord.action ? ` Recorded for: ${record.acceptedAction}.` : ""}${deadline.local ? "" : " Shown in UTC."}`; }).join(" ")} ${move ? "You can record another deadline for this action." : ""}`;
    else node["operating-commitment-current"].textContent = move ? "No deadline is recorded for this action." : "";
    const linkedRoutines = routinesFor(state.routines, moveRecord); const currentRoutine = linkedRoutines.find((record) => record.lifecycle !== "retired") || null; const retiredRoutines = linkedRoutines.filter((record) => record.lifecycle === "retired");
    node["operating-routine-prerequisite"].hidden = (!!move || !!currentRoutine) || state.routines.status === "unavailable";
    node["operating-routine-prerequisite"].textContent = !moveRecord ? "Record an action that has not been withdrawn before recording a recurring window." : "This action is withdrawn. A new recurring window cannot be recorded.";
    node["operating-routine-form"].hidden = state.routines.status === "unavailable" || !move || !!currentRoutine;
    node["operating-routine-submit"].hidden = false;
    node["operating-routine-pause"].hidden = !currentRoutine || currentRoutine.lifecycle !== "active";
    node["operating-routine-resume"].hidden = !currentRoutine || currentRoutine.lifecycle !== "paused";
    node["operating-routine-retire"].hidden = !currentRoutine;
    renderedRoutineCreate = move && !currentRoutine ? { mode: "create", candidateMoveId: move.id, candidateMoveRevision: move.revision } : null;
    renderedRoutineCommands = currentRoutine ? {
      pause: currentRoutine.lifecycle === "active" ? { mode: "pause", id: currentRoutine.id, revision: currentRoutine.revisions.length, lifecycle: "active" } : null,
      resume: currentRoutine.lifecycle === "paused" ? { mode: "resume", id: currentRoutine.id, revision: currentRoutine.revisions.length, lifecycle: "paused" } : null,
      retire: { mode: "retire", id: currentRoutine.id, revision: currentRoutine.revisions.length, lifecycle: currentRoutine.lifecycle },
    } : {};
    if (state.routines.status === "unavailable") node["operating-routine-current"].textContent = "Recurring windows are unavailable right now.";
    else if (currentRoutine) node["operating-routine-current"].textContent = `${currentRoutine.lifecycle === "active" ? "Active" : "Paused"}. ${scheduleText(currentRoutine.schedule)}${retiredRoutines.length ? ` Previous recurring windows: ${retiredRoutines.map((record) => `Retired. ${scheduleText(record.schedule)}`).join(" ")}` : ""}`;
    else if (retiredRoutines.length) node["operating-routine-current"].textContent = `Previous recurring windows: ${retiredRoutines.map((record) => `Retired. ${scheduleText(record.schedule)}`).join(" ")}${move ? " You can record another recurring window for this action." : ""}`;
    else node["operating-routine-current"].textContent = move ? "No recurring window is recorded for this action." : "";
    node["operating-context-current"].textContent = state.context.status === "absent" ? "You haven’t chosen where this applies." : state.context.status === "unavailable" ? "This setting is unavailable." : state.context.current.status === "cleared" ? "This setting was cleared." : context.scope.mode === "open" ? "Includes situations without narrowing to this one." : "Includes only this situation.";
    node["operating-context-scoped"].disabled = !situation || unavailable; node["operating-context-open"].disabled = unavailable; node["operating-context-clear"].hidden = !available(state.context);
    for (const option of policyOptions) node[`operating-policy-${option}`].checked = !!policy && policy.rules.some((rule) => rule.conditions.length === 1 && rule.conditions[0] === `move.${option}`);
    node["operating-policy-current"].textContent = state.policy.status === "absent" ? "You haven’t saved radar choices yet." : state.policy.status === "unavailable" ? "Radar choices are unavailable." : state.policy.current.status === "cleared" ? "Radar choices were cleared." : policy.rules.length === 0 ? "Your radar is active with no rules." : "Your saved radar choices are selected below.";
    node["operating-policy-advanced"].hidden = !hasAdvancedRules(state.policy);
    node["operating-policy-rules"].textContent = policy ? policy.rules.map((rule) => rule.conditions.join(" AND ")).join("\nOR\n") : "";
    node["operating-policy-replace-all"].checked = false;
    displayedPolicyRevision = available(state.policy) ? state.policy.current.revision : 0;
    node["operating-policy-clear"].hidden = !policy || hasAdvancedRules(state.policy); node["operating-policy-submit"].textContent = "Save radar choices";
    renderOperatingTruth(state);
    showSelectedFlow();
  }
  function hasAdvancedRules(policy) {
    return active(policy) && policy.current.rules.some((rule) => rule.conditions.length !== 1 || !policyOptions.some((option) => rule.conditions[0] === `move.${option}`));
  }
  function bindings(state) {
    return active(state.move) && available(state.situation) ? {
      candidateMoveId: state.move.current.id, candidateMoveRevision: state.move.current.revision,
      situationId: state.situation.current.id, situationRevision: state.situation.current.revision,
    } : null;
  }
  function renderOperatingTruth(state) {
    // Presentation mapping only: source reads never decide the displayed Move State.
    const copies = {
      actionable: "You’ve said you have what you need to do this.",
      waiting: "You’re waiting on something outside your control.",
      hold: "You’ve chosen not to act on this yet.",
      clarify: "Take another look before deciding what to do.",
    };
    const result = state.moveState;
    const known = result.status === "available" && Object.hasOwn(copies, result.state);
    node["operating-state-label"].textContent = "Where things stand";
    node["operating-state-copy"].textContent = known ? result.state === "waiting" && available(state.dependency) ? `You’re waiting on: ${state.dependency.current.description}` : copies[result.state] : result.status === "not-applicable" && result.reason === "candidate-move-absent" ? "You haven’t recorded an action yet." : result.status === "not-applicable" && result.reason === "candidate-move-withdrawn" ? "This action is withdrawn; there is no current status for it." : "Where things stand is unavailable.";
    const moveActive = !!active(state.move);
    node["operating-truth"].hidden = !available(state.move);
    node["operating-truth-lifecycle"].textContent = moveActive ? "Choose what you want to update. Nothing changes until you confirm it." : "This action is withdrawn. You can review past entries or end existing entries below.";
    const hold = available(state.hold) ? state.hold.current : null;
    node["operating-hold-current"].textContent = hold ? hold.status === "active" ? "You’ve chosen not to act on this yet." : "Your choice not to act was ended (released). You cannot record it again for this action." : state.hold.status === "absent" ? "You haven’t recorded a choice not to act." : "Your choice not to act is unavailable.";
    node["operating-hold-create"].hidden = !(moveActive && state.hold.status === "absent");
    node["operating-hold-release"].hidden = !hold || hold.status !== "active";
    const dependency = available(state.dependency) ? state.dependency.current : null;
    node["operating-dependency-current"].textContent = dependency ? `${dependency.status === "unresolved" ? "Unresolved" : "Resolved; another outside condition cannot be recorded"}: ${dependency.description}` : state.dependency.status === "absent" ? "You haven’t recorded anything you’re waiting on." : "What you’re waiting on is unavailable.";
    node["operating-dependency-form"].hidden = !(dependency && dependency.status === "unresolved" || moveActive && state.dependency.status === "absent");
    node["operating-dependency-resolution"].hidden = !dependency || dependency.status !== "unresolved";
    node["operating-dependency-submit"].textContent = dependency ? "Save changes to what I’m waiting on" : "Save what I’m waiting on";
    if (dependencyDraftRevision !== (dependency ? dependency.revision : null)) {
      node["operating-dependency-input"].value = dependency ? dependency.description : "";
      dependencyDraftRevision = dependency ? dependency.revision : null;
    }
    const availability = available(state.availability) ? state.availability.current : null;
    const confirmation = availability && availability.assertion ? availability.assertion.conditionsConfirmed : "";
    node["operating-availability-current"].textContent = availability ? `${availability.status === "withdrawn" ? "Confirmation withdrawn." : availability.isCurrent === true ? "You’ve said you have what you need to do this." : "Something changed after your last readiness check. Take another look."}\n${confirmation ? `Last time, you said you had what you needed because:\n${confirmation}` : ""}` : state.availability.status === "absent" ? "You haven’t confirmed you have what you need yet." : "Your readiness check is unavailable.";
    node["operating-availability-form"].hidden = !(bindings(state) && (availability || state.availability.status === "absent"));
    node["operating-availability-withdraw"].hidden = !availability || availability.status !== "confirmed";
    node["operating-availability-submit"].textContent = availability ? "Reconfirm I have what I need to act" : "Confirm I have what I need to act";
    const nextBindings = bindings(state);
    if (JSON.stringify(reviewedBindings) !== JSON.stringify(nextBindings)) {
      if (reviewedBindings) reviewRequired = true;
      reviewedBindings = nextBindings;
    }
    node["operating-availability-review"].textContent = nextBindings ? `What you’re trying to do now: ${state.move.current.action}\nWhat’s true right now: ${state.situation.current.currentReality}${state.situation.current.carryStatus === "closed" ? " (This situation is closed.)" : ""}` : "";
    node["operating-availability-guidance"].textContent = reviewRequired ? "Something changed after your last readiness check. Take another look." : "";
  }
  function showSelectedFlow() {
    for (const flow of flows) {
      node[`operating-flow-${flow}`].hidden = selectedFlow !== flow;
      node[`operating-choice-${flow}`].checked = selectedFlow === flow;
    }
  }
  for (const flow of flows) node[`operating-choice-${flow}`].addEventListener("change", () => {
    selectedFlow = flow;
    showSelectedFlow();
  });
  function command(name, method, input) {
    const api = apiFor(name, method);
    if (!api) throw new Error("This change is unavailable right now.");
    return api[method](input);
  }
  function requireSource(state, status, label) {
    if (!available(state) || state.current.status !== status) throw new Error(`${label} is unavailable for this operation.`);
    return { id: state.current.id, expectedRevision: state.current.revision };
  }
  function requireMove() {
    const state = read("CandidateMoveSystem", "getCandidateMove");
    if (!active(state)) throw new Error("Record an action that has not been withdrawn first.");
    return state.current;
  }
  function requireCommitment() {
    const move = read("CandidateMoveSystem", "getCandidateMove"); const state = read("CandidateMoveCommitmentSystem", "getCommitments"); const commitment = activeCommitmentFor(state, available(move) ? move.current : null);
    if (!commitment || commitment.status !== "active") throw new Error("An active deadline commitment is unavailable.");
    return commitment;
  }
  function invoke(work) { error(); try { work(); editingSituation = false; editingMove = false; render(); } catch (failure) { error(message(failure)); render(); } }
  node["operating-hold-create"].addEventListener("click", () => invoke(() => command("CandidateMoveHoldSystem", "createHold", { candidateMoveId: requireMove().id })));
  node["operating-hold-release"].addEventListener("click", () => invoke(() => command("CandidateMoveHoldSystem", "releaseHold", requireSource(read("CandidateMoveHoldSystem", "getHold"), "active", "Hold"))));
  node["operating-dependency-form"].addEventListener("submit", (event) => {
    event.preventDefault(); invoke(() => {
      const state = read("CandidateMoveDependencySystem", "getDependency");
      const description = node["operating-dependency-input"].value.trim();
      if (!description || description.length > 2000) throw new Error("Describe what you’re waiting on in 1 to 2000 characters.");
      if (state.status === "absent") command("CandidateMoveDependencySystem", "createDependency", { candidateMoveId: requireMove().id, description });
      else command("CandidateMoveDependencySystem", "correctDependency", { ...requireSource(state, "unresolved", "Dependency"), description });
    });
  });
  node["operating-dependency-resolve"].addEventListener("click", () => invoke(() => command("CandidateMoveDependencySystem", "resolveDependency", requireSource(read("CandidateMoveDependencySystem", "getDependency"), "unresolved", "Dependency"))));
  node["operating-availability-form"].addEventListener("submit", (event) => {
    event.preventDefault(); invoke(() => {
      const state = current(); const fresh = bindings(state);
      if (!fresh) throw new Error("Record what’s going on and what you’re trying to do first.");
      if (reviewRequired || JSON.stringify(fresh) !== JSON.stringify(reviewedBindings)) {
        renderOperatingTruth(state); reviewRequired = false;
        throw new Error("Something changed. Review the updated facts, then submit again to confirm them.");
      }
      const conditionsConfirmed = node["operating-availability-input"].value.trim();
      if (!conditionsConfirmed || conditionsConfirmed.length > 2000) throw new Error("Confirmed conditions must contain 1 to 2000 characters.");
      const input = { expectedCandidateMoveRevision: fresh.candidateMoveRevision, expectedSituationRevision: fresh.situationRevision, conditionsConfirmed };
      if (state.availability.status === "absent") command("CandidateMoveAvailabilitySystem", "confirmAvailability", { candidateMoveId: fresh.candidateMoveId, ...input });
      else {
        if (!available(state.availability)) throw new Error("Your readiness check is unavailable.");
        command("CandidateMoveAvailabilitySystem", "reconfirmAvailability", { id: state.availability.current.id, expectedRevision: state.availability.current.revision, ...input });
      }
    });
  });
  node["operating-availability-withdraw"].addEventListener("click", () => invoke(() => command("CandidateMoveAvailabilitySystem", "withdrawAvailability", requireSource(read("CandidateMoveAvailabilitySystem", "getAvailability"), "confirmed", "Confirmation"))));
  node["operating-commitment-form"].addEventListener("submit", (event) => {
    event.preventDefault(); invoke(() => {
      const move = read("CandidateMoveSystem", "getCandidateMove"); const state = read("CandidateMoveCommitmentSystem", "getCommitments"); const currentMove = active(move) ? move.current : null; const activeCommitment = activeCommitmentFor(state, currentMove); const commitment = renderedDeadline && renderedDeadline.mode === "correct" && state.status === "available" && Array.isArray(state.records) ? state.records.find((record) => record && record.status === "active" && record.id === renderedDeadline.id && record.candidateMoveId === renderedDeadline.candidateMoveId) || null : activeCommitment;
      if (renderedDeadline && renderedDeadline.mode === "correct") { if (!commitment) { render(); throw new Error("The commitment changed before this update. Review the current commitment, then submit again."); } if (commitment.revision !== renderedDeadline.revision || commitment.window.dueAt !== renderedDeadline.dueAt) { render(); throw new Error("The deadline changed before this update. Review the current deadline, then submit again."); } command("CandidateMoveCommitmentSystem", "correctCommitmentWindow", { id: commitment.id, expectedRevision: commitment.revision, window: deadlineWindow(node["operating-commitment-deadline"].value, renderedDeadline) }); }
      else if (renderedDeadline && renderedDeadline.mode === "create") { if (!currentMove) { if (available(move) && move.current.status === "withdrawn") throw new Error("This action has been withdrawn and cannot receive a new deadline."); render(); throw new Error("The commitment changed before this update. Review the current commitment, then submit again."); } if (currentMove.id !== renderedDeadline.candidateMoveId || currentMove.revision !== renderedDeadline.candidateMoveRevision || activeCommitment) { render(); throw new Error("The commitment changed before this update. Review the current commitment, then submit again."); } command("CandidateMoveCommitmentSystem", "createCommitment", { candidateMoveId: currentMove.id, expectedCandidateMoveRevision: currentMove.revision, window: deadlineWindow(node["operating-commitment-deadline"].value) }); }
      else { if (available(move) && move.current.status === "withdrawn") throw new Error("Record an action that has not been withdrawn first."); render(); throw new Error("The commitment changed before this update. Review the current commitment, then submit again."); }
    });
  });
  node["operating-commitment-complete"].addEventListener("click", () => invoke(() => { const commitment = requireCommitment(); command("CandidateMoveCommitmentSystem", "completeCommitment", { id: commitment.id, expectedRevision: commitment.revision }); }));
  node["operating-commitment-cancel"].addEventListener("click", () => invoke(() => { const commitment = requireCommitment(); command("CandidateMoveCommitmentSystem", "cancelCommitment", { id: commitment.id, expectedRevision: commitment.revision }); }));
  node["operating-routine-form"].addEventListener("submit", (event) => {
    event.preventDefault(); invoke(() => {
      const move = read("CandidateMoveSystem", "getCandidateMove"); const routines = read("CandidateMoveRoutineSystem", "getRoutines"); const currentMove = active(move) ? move.current : null; const linked = routinesFor(routines, available(move) ? move.current : null);
      if (!renderedRoutineCreate || !currentMove || renderedRoutineCreate.candidateMoveId !== currentMove.id || renderedRoutineCreate.candidateMoveRevision !== currentMove.revision || linked.some((record) => record.lifecycle !== "retired")) { render(); throw new Error("The action or recurring window changed before this update. Review the current information, then try again."); }
      const weekday = Number(node["operating-routine-weekday"].value); const opens = node["operating-routine-opens"].value; const closes = node["operating-routine-closes"].value;
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !/^\d{2}:\d{2}$/.test(opens) || !/^\d{2}:\d{2}$/.test(closes)) throw new Error("Enter a weekday and valid UTC opening and closing times.");
      command("CandidateMoveRoutineSystem", "createRoutine", { candidateMoveId: currentMove.id, expectedCandidateMoveRevision: currentMove.revision, schedule: { kind: "weekly-utc", weekday, opensAtUtc: `${opens}:00Z`, closesAtUtc: `${closes}:00Z` } });
    });
  });
  function invokeRoutine(operation) { return () => invoke(() => {
    const binding = renderedRoutineCommands[operation]; const state = binding ? routineState(binding.id) : null;
    if (!binding || !state || state.status !== "available" || !state.current || state.current.id !== binding.id || state.current.revision !== binding.revision || state.current.status !== binding.lifecycle) { render(); throw new Error("The recurring window changed before this update. Review the current window, then try again."); }
    command("CandidateMoveRoutineSystem", `${operation}Routine`, { id: binding.id, expectedRevision: binding.revision });
  }); }
  node["operating-routine-pause"].addEventListener("click", invokeRoutine("pause"));
  node["operating-routine-resume"].addEventListener("click", invokeRoutine("resume"));
  node["operating-routine-retire"].addEventListener("click", invokeRoutine("retire"));
  node["operating-situation-form"].addEventListener("submit", (event) => { event.preventDefault(); invoke(() => { const state = read("SituationSystem", "getSituation"); const api = owner("SituationSystem", editingSituation ? "correctSituation" : "createSituation"); if (!api) throw new Error("This situation is unavailable."); if (editingSituation) api.correctSituation({ id: state.current.id, expectedRevision: state.current.revision, currentReality: node["operating-situation-reality-input"].value }); else api.createSituation({ subject: node["operating-situation-subject-input"].value, currentReality: node["operating-situation-reality-input"].value }); }); });
  node["operating-situation-edit"].addEventListener("click", () => { editingSituation = true; render(); });
  node["operating-situation-close"].addEventListener("click", () => invoke(() => { const state = read("SituationSystem", "getSituation"); const api = owner("SituationSystem", "closeSituation"); if (!active(state) || !api) throw new Error("This situation is unavailable."); api.closeSituation({ id: state.current.id, expectedRevision: state.current.revision }); }));
  node["operating-move-form"].addEventListener("submit", (event) => { event.preventDefault(); invoke(() => { const situation = read("SituationSystem", "getSituation"); const move = read("CandidateMoveSystem", "getCandidateMove"); const api = owner("CandidateMoveSystem", editingMove ? "correctCandidateMove" : "createCandidateMove"); if (!api || (editingMove ? !active(move) : !active(situation))) throw new Error("Describe an open situation or edit an existing action first."); if (editingMove) api.correctCandidateMove({ id: move.current.id, expectedRevision: move.current.revision, action: node["operating-move-action-input"].value }); else api.createCandidateMove({ situationId: situation.current.id, action: node["operating-move-action-input"].value }); }); });
  node["operating-move-edit"].addEventListener("click", () => { editingMove = true; render(); });
  node["operating-move-withdraw"].addEventListener("click", () => invoke(() => { const state = read("CandidateMoveSystem", "getCandidateMove"); const api = owner("CandidateMoveSystem", "withdrawCandidateMove"); if (!active(state) || !api) throw new Error("This action is unavailable."); api.withdrawCandidateMove({ id: state.current.id, expectedRevision: state.current.revision }); }));
  function setContext(mode) { invoke(() => { const state = read("CommanderContextSystem", "getContext"); const situation = read("SituationSystem", "getSituation"); const expectedRevision = state.status === "absent" ? 0 : state.current.revision; const api = owner("CommanderContextSystem", mode === "open" ? "setOpenContext" : "setScopedContext"); if (!api || mode !== "open" && !active(situation)) throw new Error("An open situation is needed for this setting."); if (mode === "open") api.setOpenContext({ expectedRevision }); else api.setScopedContext({ situationIds: [situation.current.id], expectedRevision }); }); }
  node["operating-context-open"].addEventListener("click", () => setContext("open")); node["operating-context-scoped"].addEventListener("click", () => setContext("scoped"));
  node["operating-context-clear"].addEventListener("click", () => invoke(() => { const state = read("CommanderContextSystem", "getContext"); const api = owner("CommanderContextSystem", "clearContext"); if (!available(state) || !api) throw new Error("This setting is unavailable."); api.clearContext({ expectedRevision: state.current.revision }); }));
  node["operating-policy-submit"].addEventListener("click", () => {
    const rules = policyOptions.filter((option) => node["operating-policy-" + option].checked).map((option) => ["move." + option]);
    if (!rules.length) { node["operating-policy-guidance"].textContent = "Select at least one kind of update. Nothing was changed."; return; }
    const state = read("CommanderAttentionPolicySystem", "getAttentionPolicy");
    if (hasAdvancedRules(state) && (!node["operating-policy-replace-all"].checked || displayedPolicyRevision !== state.current.revision)) {
      render(); node["operating-policy-guidance"].textContent = "Your detailed rules are preserved. Review them and explicitly choose to replace all rules to remove them."; return;
    }
    node["operating-policy-guidance"].textContent = "";
    invoke(() => {
      if (state.status === "unavailable") throw new Error("Radar choices are unavailable.");
      command("CommanderAttentionPolicySystem", active(state) ? "replaceAttentionPolicy" : "establishAttentionPolicy", { rules, expectedRevision: state.status === "absent" ? 0 : state.current.revision });
    });
  });
  node["operating-policy-clear"].addEventListener("click", () => invoke(() => { const state = read("CommanderAttentionPolicySystem", "getAttentionPolicy"); const api = owner("CommanderAttentionPolicySystem", "clearAttentionPolicy"); if (hasAdvancedRules(state)) throw new Error("Your detailed rules are preserved. Use explicit replacement to change them."); if (!available(state) || !api) throw new Error("Radar choices are unavailable."); api.clearAttentionPolicy({ expectedRevision: state.current.revision }); }));
  window.OperatingSetupWidget = { render };
  if (document.readyState === "loading" && typeof window.addEventListener === "function") window.addEventListener("load", render, { once: true }); else render();
})();
