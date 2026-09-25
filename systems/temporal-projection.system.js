// =====================================================
// FOUNDEROS
// TEMPORAL PROJECTION SYSTEM
// Read-only bounded UTC projection of authoritative operating truth.
// =====================================================

const TemporalProjectionSystem = {
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  TIME_PATTERN: /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/,
  MAXIMUM_RANGE_MS: 14 * 86400000,

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  canonicalUtc(value) { const milliseconds = typeof value === "string" && this.UTC_PATTERN.test(value) ? Date.parse(value) : Number.NaN; return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString() === value; },
  range(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { valid: false, reason: "temporal-projection-range-invalid" };
    const { from, to } = input;
    if (!this.canonicalUtc(from) || !this.canonicalUtc(to) || from >= to) return { valid: false, reason: "temporal-projection-range-invalid" };
    return Date.parse(to) - Date.parse(from) > this.MAXIMUM_RANGE_MS ? { valid: false, reason: "temporal-projection-range-too-large" } : { valid: true, from, to };
  },
  source(status, reason = null) { return { status, reason }; },
  envelope(range, commitments, routines, plannedTimes, items = [], reason = null) {
    const unavailable = [commitments, routines, plannedTimes].filter((source) => source.status === "unavailable").length;
    return {
      status: range ? (unavailable === 3 ? "unavailable" : unavailable ? "partial" : "available") : "unavailable",
      range: range ? { from: range.from, to: range.to } : null,
      reason: reason || (unavailable === 3 ? "temporal-projection-sources-unavailable" : unavailable ? "temporal-projection-sources-partial" : null),
      sources: { commitments: { ...commitments }, routines: { ...routines }, plannedTimes: { ...plannedTimes } },
      items: this.clone(items),
    };
  },
  validSchedule(value) { return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 4 && value.kind === "weekly-utc" && Number.isInteger(value.weekday) && value.weekday >= 1 && value.weekday <= 7 && this.TIME_PATTERN.test(value.opensAtUtc) && this.TIME_PATTERN.test(value.closesAtUtc) && value.opensAtUtc < value.closesAtUtc; },
  sameSchedule(left, right) { return left.kind === right.kind && left.weekday === right.weekday && left.opensAtUtc === right.opensAtUtc && left.closesAtUtc === right.closesAtUtc; },
  validCommitment(record) { return record && typeof record === "object" && !Array.isArray(record) && typeof record.id === "string" && record.id.length > 0 && Number.isInteger(record.revision) && record.revision > 0 && record.status && ["active", "completed", "canceled"].includes(record.status) && typeof record.candidateMoveId === "string" && record.candidateMoveId.length > 0 && Number.isInteger(record.candidateMoveRevision) && record.candidateMoveRevision > 0 && typeof record.acceptedAction === "string" && record.window && typeof record.window === "object" && !Array.isArray(record.window) && Object.keys(record.window).length === 2 && record.window.kind === "deadline" && this.canonicalUtc(record.window.dueAt); },
  validPlannedTime(record) { return record && typeof record === "object" && !Array.isArray(record) && typeof record.id === "string" && record.id.length > 0 && Number.isInteger(record.revision) && record.revision > 0 && ["scheduled", "canceled"].includes(record.status) && typeof record.candidateMoveId === "string" && record.candidateMoveId.length > 0 && Number.isInteger(record.candidateMoveRevision) && record.candidateMoveRevision > 0 && typeof record.acceptedAction === "string" && record.acceptedAction.length > 0 && this.canonicalUtc(record.occursAt); },
  validRoutine(record) {
    if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.id !== "string" || record.id.length === 0 || typeof record.candidateMoveId !== "string" || record.candidateMoveId.length === 0 || !Number.isInteger(record.candidateMoveRevision) || record.candidateMoveRevision < 1 || typeof record.action !== "string" || !["active", "paused", "retired"].includes(record.lifecycle) || !this.validSchedule(record.schedule) || !Array.isArray(record.revisions) || record.revisions.length === 0) return null;
    for (let index = 0; index < record.revisions.length; index += 1) {
      const revision = record.revisions[index];
      if (!revision || typeof revision !== "object" || Array.isArray(revision) || revision.revision !== index + 1 || !["active", "paused", "retired"].includes(revision.status) || !this.validSchedule(revision.schedule) || !this.canonicalUtc(revision.recordedAt)) return null;
    }
    const latest = record.revisions[record.revisions.length - 1];
    return record.lifecycle === latest.status && this.sameSchedule(record.schedule, latest.schedule) ? { revision: latest.revision, recordedAt: latest.recordedAt } : null;
  },
  readCommitments() {
    if (typeof CandidateMoveCommitmentSystem === "undefined" || !CandidateMoveCommitmentSystem || typeof CandidateMoveCommitmentSystem.getCommitments !== "function") return { source: this.source("unavailable", "temporal-projection-commitments-reader-missing"), items: [] };
    let response;
    try { response = CandidateMoveCommitmentSystem.getCommitments(); } catch (error) { return { source: this.source("unavailable", "temporal-projection-commitments-reader-threw"), items: [] }; }
    if (!response || typeof response !== "object" || !["available", "absent", "unavailable"].includes(response.status)) return { source: this.source("unavailable", "temporal-projection-commitments-invalid"), items: [] };
    if (response.status === "absent") return { source: this.source("absent"), items: [] };
    if (response.status === "unavailable") return { source: this.source("unavailable", typeof response.reason === "string" ? response.reason : "temporal-projection-commitments-unavailable"), items: [] };
    if (!Array.isArray(response.records)) return { source: this.source("unavailable", "temporal-projection-commitments-invalid"), items: [] };
    const ids = new Set(); const items = [];
    for (const record of response.records) {
      if (!this.validCommitment(record)) return { source: this.source("unavailable", "temporal-projection-commitments-invalid"), items: [] };
      if (ids.has(record.id)) return { source: this.source("unavailable", "temporal-projection-commitments-duplicate"), items: [] };
      ids.add(record.id); items.push(record);
    }
    return { source: this.source("available"), items };
  },
  readRoutines() {
    if (typeof CandidateMoveRoutineSystem === "undefined" || !CandidateMoveRoutineSystem || typeof CandidateMoveRoutineSystem.getRoutines !== "function" || typeof CandidateMoveRoutineSystem.getRoutineOccurrence !== "function") return { source: this.source("unavailable", "temporal-projection-routines-reader-missing"), records: [] };
    let response;
    try { response = CandidateMoveRoutineSystem.getRoutines(); } catch (error) { return { source: this.source("unavailable", "temporal-projection-routines-reader-threw"), records: [] }; }
    if (!response || typeof response !== "object" || !["available", "absent", "unavailable"].includes(response.status)) return { source: this.source("unavailable", "temporal-projection-routines-invalid"), records: [] };
    if (response.status === "absent") return { source: this.source("absent"), records: [] };
    if (response.status === "unavailable") return { source: this.source("unavailable", typeof response.reason === "string" ? response.reason : "temporal-projection-routines-unavailable"), records: [] };
    if (!Array.isArray(response.routines)) return { source: this.source("unavailable", "temporal-projection-routines-invalid"), records: [] };
    const ids = new Set(); const records = [];
    for (const record of response.routines) {
      const current = this.validRoutine(record);
      if (!current) return { source: this.source("unavailable", "temporal-projection-routines-invalid"), records: [] };
      if (ids.has(record.id)) return { source: this.source("unavailable", "temporal-projection-routines-duplicate"), records: [] };
      ids.add(record.id); records.push({ record, current });
    }
    return { source: this.source("available"), records };
  },
  readPlannedTimes() {
    if (typeof CandidateMoveScheduleSystem === "undefined" || !CandidateMoveScheduleSystem || typeof CandidateMoveScheduleSystem.getSchedules !== "function") return { source: this.source("unavailable", "temporal-projection-planned-times-reader-missing"), records: [] };
    let response;
    try { response = CandidateMoveScheduleSystem.getSchedules(); } catch (error) { return { source: this.source("unavailable", "temporal-projection-planned-times-reader-threw"), records: [] }; }
    if (!response || typeof response !== "object" || !["available", "absent", "unavailable"].includes(response.status)) return { source: this.source("unavailable", "temporal-projection-planned-times-invalid"), records: [] };
    if (response.status === "absent") return { source: this.source("absent"), records: [] };
    if (response.status === "unavailable") return { source: this.source("unavailable", typeof response.reason === "string" ? response.reason : "temporal-projection-planned-times-unavailable"), records: [] };
    if (!Array.isArray(response.records)) return { source: this.source("unavailable", "temporal-projection-planned-times-invalid"), records: [] };
    const ids = new Set(); const records = [];
    for (const record of response.records) {
      if (!this.validPlannedTime(record)) return { source: this.source("unavailable", "temporal-projection-planned-times-invalid"), records: [] };
      if (ids.has(record.id)) return { source: this.source("unavailable", "temporal-projection-planned-times-duplicate"), records: [] };
      ids.add(record.id); records.push(record);
    }
    return { source: this.source("available"), records };
  },
  dateStart(value) { const date = new Date(value); date.setUTCHours(0, 0, 0, 0); return date.getTime(); },
  candidate(record, day) {
    const date = new Date(day); const weekday = ((date.getUTCDay() + 6) % 7) + 1;
    if (weekday !== record.schedule.weekday) return null;
    const scheduledDateUtc = date.toISOString().slice(0, 10);
    return { scheduledDateUtc, opensAt: `${scheduledDateUtc}T${record.schedule.opensAtUtc.slice(0, 8)}.000Z`, closesAt: `${scheduledDateUtc}T${record.schedule.closesAtUtc.slice(0, 8)}.000Z` };
  },
  projectRoutines(records, range) {
    const items = [];
    for (const { record, current } of records) {
      if (record.lifecycle !== "active") continue;
      for (let day = this.dateStart(range.from); day <= this.dateStart(range.to); day += 86400000) {
        const candidate = this.candidate(record, day); if (!candidate || candidate.opensAt >= range.to || candidate.closesAt < range.from) continue;
        const witness = [range.from, candidate.opensAt, current.recordedAt].sort().at(-1);
        if (witness >= range.to || witness > candidate.closesAt) continue;
        let occurrence;
        try { occurrence = CandidateMoveRoutineSystem.getRoutineOccurrence({ id: record.id, asOf: witness }); } catch (error) { return { ok: false, reason: "temporal-projection-routines-occurrence-threw", items: [] }; }
        if (!occurrence || typeof occurrence !== "object" || occurrence.status !== "available" || !["none", "current"].includes(occurrence.occurrence)) return { ok: false, reason: occurrence && occurrence.status === "unavailable" && typeof occurrence.reason === "string" ? occurrence.reason : "temporal-projection-routines-occurrence-invalid", items: [] };
        if (occurrence.occurrence === "none") { if (occurrence.id !== record.id || !this.canonicalUtc(occurrence.evaluatedAt) || occurrence.evaluatedAt !== witness) return { ok: false, reason: "temporal-projection-routines-occurrence-inconsistent", items: [] }; continue; }
        if (occurrence.routineId !== record.id || occurrence.occurrenceKey !== `${record.id}:${candidate.scheduledDateUtc}` || occurrence.opensAt !== candidate.opensAt || occurrence.closesAt !== candidate.closesAt || (Object.hasOwn(occurrence, "scheduledDateUtc") && occurrence.scheduledDateUtc !== candidate.scheduledDateUtc)) return { ok: false, reason: "temporal-projection-routines-occurrence-inconsistent", items: [] };
        items.push({ kind: "routine-occurrence", sourceId: record.id, sourceRevision: current.revision, candidateMoveId: record.candidateMoveId, candidateMoveRevision: record.candidateMoveRevision, action: record.action, occurrenceKey: occurrence.occurrenceKey, opensAt: occurrence.opensAt, closesAt: occurrence.closesAt });
      }
    }
    return { ok: true, items };
  },
  sort(items) {
    return items.sort((left, right) => {
      const leftTime = left.kind === "routine-occurrence" ? left.opensAt : left.occursAt; const rightTime = right.kind === "routine-occurrence" ? right.opensAt : right.occursAt;
      if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
      if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
      if (left.sourceId !== right.sourceId) return left.sourceId < right.sourceId ? -1 : 1;
      if (left.sourceRevision !== right.sourceRevision) return left.sourceRevision - right.sourceRevision;
      return (left.occurrenceKey || "") < (right.occurrenceKey || "") ? -1 : (left.occurrenceKey || "") > (right.occurrenceKey || "") ? 1 : 0;
    });
  },
  getProjection(input = {}) {
    const range = this.range(input);
    if (!range.valid) return this.envelope(null, this.source("not-read"), this.source("not-read"), this.source("not-read"), [], range.reason);
    const commitments = this.readCommitments(); const routines = this.readRoutines(); const plannedTimes = this.readPlannedTimes();
    const commitmentItems = commitments.source.status === "available" ? commitments.items.filter((record) => record.status === "active" && record.window.dueAt >= range.from && record.window.dueAt < range.to).map((record) => ({ kind: "commitment-deadline", sourceId: record.id, sourceRevision: record.revision, candidateMoveId: record.candidateMoveId, candidateMoveRevision: record.candidateMoveRevision, action: record.acceptedAction, occursAt: record.window.dueAt })) : [];
    let routineItems = [];
    if (routines.source.status === "available") {
      const projected = this.projectRoutines(routines.records, range);
      if (!projected.ok) { routines.source = this.source("unavailable", projected.reason); }
      else routineItems = projected.items;
    }
    const plannedTimeItems = plannedTimes.source.status === "available" ? plannedTimes.records.filter((record) => record.status === "scheduled" && record.occursAt >= range.from && record.occursAt < range.to).map((record) => ({ kind: "planned-occurrence", sourceId: record.id, sourceRevision: record.revision, candidateMoveId: record.candidateMoveId, candidateMoveRevision: record.candidateMoveRevision, action: record.acceptedAction, occursAt: record.occursAt })) : [];
    return this.envelope(range, commitments.source, routines.source, plannedTimes.source, this.sort([...commitmentItems, ...routineItems, ...plannedTimeItems]));
  },
};