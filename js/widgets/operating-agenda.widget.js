// =====================================================
// FOUNDEROS
// OPERATING AGENDA WIDGET
// Read-only Eastern-week presentation of temporal projection truth.
// =====================================================

(function () {
  if (typeof window === "undefined" || typeof document === "undefined" || window.__operatingAgendaInitialized) return;
  window.__operatingAgendaInitialized = true;
  const result = document.getElementById("operating-agenda-result"); const rangeNode = document.getElementById("operating-agenda-range"); const checkedAt = document.getElementById("operating-agenda-checked-at"); const previous = document.getElementById("operating-agenda-previous"); const thisWeek = document.getElementById("operating-agenda-this-week"); const next = document.getElementById("operating-agenda-next"); const refresh = document.getElementById("operating-agenda-refresh");
  if (!result || !rangeNode || !checkedAt || !previous || !thisWeek || !next || !refresh) return;
  const ZONE = "America/New_York"; const UTC = "UTC"; const CANONICAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/; const statuses = new Set(["available", "partial", "unavailable"]); const sourceStatuses = new Set(["available", "absent", "unavailable", "not-read"]);
  const easternParts = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timeFormatter = (seconds) => new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), timeZoneName: "short" });
  const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const clear = () => { while (result.firstChild) result.removeChild(result.firstChild); };
  const canonical = (value) => { const milliseconds = typeof value === "string" && CANONICAL.test(value) ? Date.parse(value) : Number.NaN; try { return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString() === value; } catch (error) { return false; } };
  const parts = (value) => { const fields = {}; for (const part of easternParts.formatToParts(new Date(value))) if (["year", "month", "day", "hour", "minute", "second"].includes(part.type)) fields[part.type] = Number(part.value); return fields.year && fields.month && fields.day && Number.isInteger(fields.hour) ? fields : null; };
  const ymd = (value) => { const valueParts = parts(value); return valueParts ? { year: valueParts.year, month: valueParts.month, day: valueParts.day } : null; };
  const sameDate = (left, right) => left.year === right.year && left.month === right.month && left.day === right.day;
  const utcCalendar = (date, hours = 0, minutes = 0, seconds = 0) => { const instant = new Date(0); instant.setUTCFullYear(date.year, date.month - 1, date.day); instant.setUTCHours(hours, minutes, seconds, 0); return instant; };
  const addDays = (date, days) => { const instant = utcCalendar(date); instant.setUTCDate(instant.getUTCDate() + days); return { year: instant.getUTCFullYear(), month: instant.getUTCMonth() + 1, day: instant.getUTCDate() }; };
  const midnight = (date) => {
    const desired = utcCalendar(date).getTime(); let instant = desired;
    for (let attempt = 0; attempt < 3; attempt += 1) { const local = parts(new Date(instant)); if (!local) return null; instant = desired - (utcCalendar(local, local.hour, local.minute, local.second).getTime() - instant); }
    const verified = parts(new Date(instant)); return verified && sameDate(verified, date) && verified.hour === 0 && verified.minute === 0 && verified.second === 0 ? new Date(instant).toISOString() : null;
  };
  const mondayFor = (evaluation) => { const current = ymd(evaluation); if (!current) return null; return addDays(current, -((utcCalendar(current).getUTCDay() + 6) % 7)); };
  const week = (monday) => { const nextMonday = addDays(monday, 7); const from = midnight(monday); const to = midnight(nextMonday); return from && to ? { from, to, monday: { ...monday }, sunday: addDays(nextMonday, -1) } : null; };
  const rangeLabel = (range) => { const month = (date) => new Intl.DateTimeFormat("en-US", { timeZone: UTC, month: "long" }).format(utcCalendar(date, 12)); const sameYear = range.monday.year === range.sunday.year; const sameMonth = sameYear && range.monday.month === range.sunday.month; const first = `${month(range.monday)} ${range.monday.day}${sameYear ? "" : `, ${range.monday.year}`}`; const last = sameMonth ? `${range.sunday.day}, ${range.sunday.year}` : `${month(range.sunday)} ${range.sunday.day}, ${range.sunday.year}`; return `${first}–${last} · Eastern time`; };
  const time = (value) => { const date = new Date(value); const local = parts(date); if (!local) return null; const milliseconds = date.getUTCMilliseconds(); const text = timeFormatter(local.second !== 0 || milliseconds !== 0).format(date); return milliseconds === 0 ? text : text.replace(/ (AM|PM) ([A-Z]{3})$/, `.${String(milliseconds).padStart(3, "0")} $1 $2`); };
  const validSource = (source) => source && typeof source === "object" && !Array.isArray(source) && sourceStatuses.has(source.status) && (source.reason === null || typeof source.reason === "string");
  const validItem = (item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || !["commitment-deadline", "routine-occurrence"].includes(item.kind) || typeof item.action !== "string" || item.action.length === 0) return false;
    if (item.kind === "commitment-deadline") return typeof item.sourceId === "string" && Number.isInteger(item.sourceRevision) && typeof item.candidateMoveId === "string" && Number.isInteger(item.candidateMoveRevision) && canonical(item.occursAt);
    return typeof item.sourceId === "string" && Number.isInteger(item.sourceRevision) && typeof item.candidateMoveId === "string" && Number.isInteger(item.candidateMoveRevision) && typeof item.occurrenceKey === "string" && canonical(item.opensAt) && canonical(item.closesAt) && item.opensAt <= item.closesAt;
  };
  const validProjection = (projection, request) => projection && typeof projection === "object" && !Array.isArray(projection) && statuses.has(projection.status) && projection.range && projection.range.from === request.from && projection.range.to === request.to && validSource(projection.sources && projection.sources.commitments) && validSource(projection.sources && projection.sources.routines) && Array.isArray(projection.items) && projection.items.every(validItem);
  const detail = (item) => {
    if (item.kind === "commitment-deadline") return `Recorded deadline: ${dateFormatter.format(new Date(item.occursAt))} at ${time(item.occursAt)}.`;
    const startDate = ymd(item.opensAt); const endDate = ymd(item.closesAt); const startTime = time(item.opensAt); const endTime = time(item.closesAt); if (!startDate || !endDate || !startTime || !endTime) return null;
    const startZone = startTime.match(/([A-Z]{3})$/); const endZone = endTime.match(/([A-Z]{3})$/); const startPeriod = startTime.match(/\s(AM|PM)\s/); const endPeriod = endTime.match(/\s(AM|PM)\s/);
    if (sameDate(startDate, endDate) && startZone && endZone && startZone[1] === endZone[1] && startPeriod && endPeriod && startPeriod[1] === endPeriod[1]) return `Recurring window: ${startTime.replace(/\s(?:AM|PM)\s[A-Z]{3}$/, "")}–${endTime}.`;
    return `Recurring window: ${dateFormatter.format(new Date(item.opensAt))} at ${startTime}–${dateFormatter.format(new Date(item.closesAt))} at ${endTime}.`;
  };
  const render = (projection, request) => {
    if (!validProjection(projection, request)) return false;
    const next = element("div", "operating-briefing-list");
    if (projection.status === "unavailable") next.appendChild(element("p", "operating-briefing-state", "The selected week's agenda couldn't be checked. Try refreshing."));
    else {
      const groups = []; const groupFor = (key, label) => { let group = groups.find((entry) => entry.key === key); if (!group) { group = { key, label, items: [] }; groups.push(group); } return group; };
      for (const item of projection.items) { const begins = item.kind === "commitment-deadline" ? item.occursAt : item.opensAt; const group = item.kind === "routine-occurrence" && item.opensAt < request.from ? groupFor("continuing", "Continuing into selected week") : (() => { const date = ymd(begins); return date ? groupFor(`${date.year}-${date.month}-${date.day}`, dateFormatter.format(new Date(begins))) : null; })(); if (!group) return false; group.items.push(item); }
      for (const group of groups) { const section = element("section", "operating-briefing-item"); section.appendChild(element("h3", "operating-briefing-action", group.label)); for (const item of group.items) { const record = element("article", "operating-briefing-item"); const factual = detail(item); if (!factual) return false; record.appendChild(element("p", "operating-briefing-action", item.action)); record.appendChild(element("p", "operating-briefing-temporal", factual)); section.appendChild(record); } next.appendChild(section); }
      if (projection.status === "partial") next.appendChild(element("p", "operating-briefing-state", "Some recorded deadlines or recurring windows couldn't be checked. The agenda is incomplete."));
      if (projection.items.length === 0) next.appendChild(element("p", "operating-briefing-state", projection.status === "partial" ? "No items were returned from the information available." : "No recorded deadlines or recurring windows fall in the selected week."));
    }
    clear(); result.appendChild(next); return true;
  };
  const unavailable = () => { clear(); result.appendChild(element("p", "operating-briefing-state", "The selected week's agenda couldn't be checked. Try refreshing.")); };
  let viewedMonday = null;
  const evaluate = ({ reanchor = false, change = 0 } = {}) => {
    const evaluation = new Date().toISOString();
    if (reanchor || !viewedMonday) viewedMonday = mondayFor(evaluation); else if (change) viewedMonday = addDays(viewedMonday, change);
    const selected = viewedMonday && week(viewedMonday); if (!selected) { unavailable(); checkedAt.textContent = ""; rangeNode.textContent = ""; return; }
    rangeNode.textContent = rangeLabel(selected); let projection = null; try { projection = typeof TemporalProjectionSystem !== "undefined" && TemporalProjectionSystem && typeof TemporalProjectionSystem.getProjection === "function" ? TemporalProjectionSystem.getProjection({ from: selected.from, to: selected.to }) : null; } catch (error) { projection = null; }
    if (!render(projection, selected)) unavailable(); checkedAt.textContent = `Checked at ${dateFormatter.format(new Date(evaluation))} at ${time(evaluation)}.`;
  };
  for (const control of [previous, thisWeek, next, refresh]) control.disabled = true;
  previous.addEventListener("click", () => evaluate({ change: -7 })); thisWeek.addEventListener("click", () => evaluate({ reanchor: true })); next.addEventListener("click", () => evaluate({ change: 7 })); refresh.addEventListener("click", () => evaluate());
  const start = () => { if (window.__operatingAgendaStarted) return; window.__operatingAgendaStarted = true; for (const control of [previous, thisWeek, next, refresh]) control.disabled = false; evaluate({ reanchor: true }); };
  window.addEventListener("founderos:startup-complete", start); if (window.FounderOSStartupComplete) start();
})();