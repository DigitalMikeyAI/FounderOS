// =====================================================
// FOUNDEROS
// OPERATING BRIEFING WIDGET
// Read-only Dashboard rendering for returned radar truth.
// =====================================================

(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const result = document.getElementById("operating-briefing-result");
  const checkedAt = document.getElementById("operating-briefing-checked-at");
  const refresh = document.getElementById("operating-briefing-refresh");
  if (!result || !checkedAt || !refresh) return;
  const conditionCopy = {
    "move.actionable": "You chose to include actions you've said you have what you need to do.",
    "move.waiting": "You chose to include actions that are waiting on something.",
    "move.hold": "You chose to include actions you've chosen not to act on yet.",
    "move.clarify": "You chose to include actions that need another look.",
    "commitment.active": "You chose to include active commitments.",
    "commitment.deadline.open": "You chose to include commitments within their recorded window.",
    "commitment.deadline.passed": "You chose to include commitments whose recorded deadline has passed.",
    "routine.current": "You chose to include recurring items in their current recorded window.",
  };
  const element = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; };
  const format = (value, options) => new Intl.DateTimeFormat(undefined, { timeZone: "UTC", ...options }).format(new Date(value));
  const dateTime = (value) => format(value, { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const date = (value) => format(value, { month: "long", day: "numeric", year: "numeric" });
  const temporalFacts = (bases) => {
    const facts = [];
    for (const basis of bases || []) {
      if (basis.kind === "commitment" && typeof basis.dueAt === "string") facts.push(`The deadline you recorded was ${date(basis.dueAt)}.`);
      if (basis.kind === "routine-occurrence" && typeof basis.opensAt === "string" && typeof basis.closesAt === "string") facts.push(`Your recurring window is ${date(basis.opensAt)}, ${format(basis.opensAt, { hour: "numeric", minute: "2-digit" })}–${format(basis.closesAt, { hour: "numeric", minute: "2-digit" })}.`);
    }
    return facts;
  };
  const undeterminedCopy = (reason) => ({
    "attention-policy-absent": "You haven't saved your radar choices yet.",
    "attention-policy-cleared": "Your radar choices were cleared. Radar results aren't determined.",
    "context-absent": "You haven't chosen which situations your radar should include.",
    "context-cleared": "Your choice of situations was cleared. Radar results aren't determined.",
  })[reason] || "Radar results couldn't be checked.";
  const clear = () => { while (result.firstChild) result.removeChild(result.firstChild); };
  const render = (briefing) => {
    clear();
    const radar = briefing && briefing.sections && briefing.sections.radar;
    if (!radar || radar.status === "unavailable") { result.appendChild(element("p", "operating-briefing-state", "Radar results couldn't be checked.")); return; }
    if (radar.status === "undetermined") { result.appendChild(element("p", "operating-briefing-state", undeterminedCopy(radar.reason))); return; }
    if (radar.status !== "available" || !radar.data || !Array.isArray(radar.data.items)) { result.appendChild(element("p", "operating-briefing-state", "Radar results couldn't be checked.")); return; }
    if (radar.data.items.length === 0) { result.appendChild(element("p", "operating-briefing-state", "No recorded items match your radar choices within the situations you've included.")); return; }
    const list = element("div", "operating-briefing-list");
    for (const item of radar.data.items) {
      const record = element("article", "operating-briefing-item");
      record.appendChild(element("p", "operating-briefing-action", item.candidate.action));
      const explanations = [];
      for (const rule of item.matchingRules) for (const condition of rule.conditions) if (conditionCopy[condition] && !explanations.includes(conditionCopy[condition])) explanations.push(conditionCopy[condition]);
      for (const explanation of explanations) record.appendChild(element("p", "operating-briefing-explanation", explanation));
      for (const fact of temporalFacts(item.candidate.bases)) record.appendChild(element("p", "operating-briefing-temporal", fact));
      list.appendChild(record);
    }
    result.appendChild(list);
  };
  const evaluate = () => {
    const asOf = new Date().toISOString();
    let briefing;
    try { briefing = typeof OperatingBriefingSystem !== "undefined" && OperatingBriefingSystem && typeof OperatingBriefingSystem.getBriefing === "function" ? OperatingBriefingSystem.getBriefing({ asOf }) : null; } catch (error) { briefing = null; }
    render(briefing);
    checkedAt.textContent = `Checked at ${dateTime(asOf)}.`;
  };
  refresh.addEventListener("click", evaluate);
  const start = () => { if (!window.__operatingBriefingStarted) { window.__operatingBriefingStarted = true; evaluate(); } };
  window.addEventListener("founderos:startup-complete", start, { once: true });
  if (window.FounderOSStartupComplete) start();
})();