// =====================================================
// FOUNDEROS
// OPERATING INTELLIGENCE SETUP WIDGET
// UI orchestration for existing Commander authorities only.
// =====================================================

(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const ids = ["operating-setup-status", "operating-setup-error", "operating-situation-current", "operating-situation-subject", "operating-situation-reality", "operating-situation-form", "operating-situation-subject-input", "operating-situation-reality-input", "operating-situation-submit", "operating-situation-edit", "operating-situation-close", "operating-move-current", "operating-move-absent", "operating-move-prerequisite", "operating-move-action", "operating-move-form", "operating-move-action-input", "operating-move-submit", "operating-move-edit", "operating-move-withdraw", "operating-context-current", "operating-context-scoped", "operating-context-open", "operating-context-clear", "operating-policy-clarify", "operating-policy-current", "operating-policy-submit", "operating-policy-clear", "operating-policy-guidance"];
  ids.push(...["state-label", "state-copy", "truth", "truth-lifecycle", "hold-current", "hold-create", "hold-release", "dependency-current", "dependency-form", "dependency-input", "dependency-submit", "dependency-resolution", "dependency-resolve", "availability-current", "availability-form", "availability-review", "availability-input", "availability-guidance", "availability-submit", "availability-withdraw", "policy-actionable", "policy-waiting", "policy-hold", "policy-advanced", "policy-rules", "policy-replace-all"].map((id) => `operating-${id}`));
  const flows = ["availability", "dependency", "hold", "review"];
  ids.push(...flows.flatMap((flow) => [`operating-choice-${flow}`, `operating-flow-${flow}`]));
  let selectedFlow = null;
  const node = Object.fromEntries(ids.map((id) => [id, $(id)])); if (Object.values(node).some((value) => !value)) return;
  const policyOptions = ["actionable", "waiting", "hold", "clarify"];
  let reviewedBindings = null;
  let reviewRequired = false;
  let displayedPolicyRevision = null;
  let dependencyDraftRevision = null;
  let editingSituation = false; let editingMove = false;
  const owner = (name, method) => { const value = name === "SituationSystem" ? (typeof SituationSystem === "undefined" ? null : SituationSystem) : name === "CandidateMoveSystem" ? (typeof CandidateMoveSystem === "undefined" ? null : CandidateMoveSystem) : name === "CommanderContextSystem" ? (typeof CommanderContextSystem === "undefined" ? null : CommanderContextSystem) : name === "CommanderAttentionPolicySystem" ? (typeof CommanderAttentionPolicySystem === "undefined" ? null : CommanderAttentionPolicySystem) : null; return value && typeof value[method] === "function" ? value : null; };
  const operatingOwner = (name) => ({
    CandidateMoveHoldSystem: typeof CandidateMoveHoldSystem === "undefined" ? null : CandidateMoveHoldSystem,
    CandidateMoveDependencySystem: typeof CandidateMoveDependencySystem === "undefined" ? null : CandidateMoveDependencySystem,
    CandidateMoveAvailabilitySystem: typeof CandidateMoveAvailabilitySystem === "undefined" ? null : CandidateMoveAvailabilitySystem,
    MoveStateSystem: typeof MoveStateSystem === "undefined" ? null : MoveStateSystem,
  })[name];
  const apiFor = (name, method) => { const api = owner(name, method) || operatingOwner(name); return api && typeof api[method] === "function" ? api : null; };
  const read = (name, method) => { const value = apiFor(name, method); if (!value) return { status: "unavailable" }; try { const result = value[method](); return result && typeof result === "object" && (result.status !== "available" || name === "MoveStateSystem" || result.current) ? result : { status: "unavailable" }; } catch (error) { return { status: "unavailable" }; } };
  const error = (message = "") => { node["operating-setup-error"].textContent = message; };
  const message = (value) => value && typeof value.message === "string" ? value.message.slice(0, 240) : "Your change could not be saved.";
  const current = () => ({ situation: read("SituationSystem", "getSituation"), move: read("CandidateMoveSystem", "getCandidateMove"), hold: read("CandidateMoveHoldSystem", "getHold"), dependency: read("CandidateMoveDependencySystem", "getDependency"), availability: read("CandidateMoveAvailabilitySystem", "getAvailability"), moveState: read("MoveStateSystem", "getMoveState"), context: read("CommanderContextSystem", "getContext"), policy: read("CommanderAttentionPolicySystem", "getAttentionPolicy") });
  const available = (state) => state && state.status === "available" && state.current;
  const active = (state) => available(state) && (state.current.status === "active" || state.current.carryStatus === "active");
  function render() {
    const state = current(); const situationRecord = available(state.situation) ? state.situation.current : null; const moveRecord = available(state.move) ? state.move.current : null; const situation = active(state.situation) ? state.situation.current : null; const move = active(state.move) ? state.move.current : null; const context = active(state.context) ? state.context.current : null; const policy = active(state.policy) ? state.policy.current : null;
    const unavailable = [state.situation, state.move, state.context, state.policy].some((value) => value.status === "unavailable");
    node["operating-setup-status"].textContent = unavailable ? "Unavailable" : situation && move && context && policy ? "Your focus is saved." : context && policy && !move ? "No action is recorded yet." : "Start with what’s going on.";
    node["operating-situation-current"].hidden = !situationRecord; node["operating-situation-form"].hidden = !!situationRecord && !editingSituation;
    if (situationRecord) { node["operating-situation-subject"].textContent = situationRecord.subject; node["operating-situation-reality"].textContent = situationRecord.carryStatus === "closed" ? `${situationRecord.currentReality} (This situation is closed.)` : situationRecord.currentReality; if (editingSituation && situation) { node["operating-situation-reality-input"].value = situation.currentReality; node["operating-situation-submit"].textContent = "Save what’s going on"; } } else { node["operating-situation-submit"].textContent = "Save this situation"; }
    node["operating-situation-edit"].hidden = !situation; node["operating-situation-close"].hidden = !situation;
    node["operating-move-current"].hidden = !moveRecord; node["operating-move-absent"].hidden = !!moveRecord; node["operating-move-prerequisite"].hidden = !!situation || !!moveRecord; node["operating-move-form"].hidden = !!moveRecord && !editingMove || (!moveRecord && !situation);
    if (moveRecord) { node["operating-move-action"].textContent = moveRecord.status === "withdrawn" ? `${moveRecord.action} (This action is withdrawn.)` : moveRecord.action; if (editingMove && move) { node["operating-move-action-input"].value = move.action; node["operating-move-submit"].textContent = "Edit this action"; } } else { node["operating-move-submit"].textContent = "Save this action"; }
    node["operating-move-edit"].hidden = !move; node["operating-move-withdraw"].hidden = !move;
    node["operating-move-submit"].disabled = editingMove ? !move : !situation;
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
