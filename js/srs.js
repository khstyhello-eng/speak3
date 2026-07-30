export const GROWTH = 2.2;

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nextInterval(interval) {
  if (interval < 1) return 1;
  if (interval === 1) return 3;
  if (interval === 3) return 7;
  return Math.round(interval * GROWTH);
}

export function newRecord(todayStr, nowIso) {
  return { interval: 0, due: todayStr, stage: 1, reps: 0, lapses: 0, introducedOn: todayStr, recFails: 0, selfAssess: false, updatedAt: nowIso };
}

export function review(record, result, todayStr, nowIso) {
  const r = { ...record };
  if (result === 'fail') { r.interval = 1; r.lapses += 1; }
  else if (result === 'hard') { r.interval = Math.max(1, r.interval); }
  else { r.interval = nextInterval(r.interval); }
  r.reps += 1;
  r.due = addDays(todayStr, r.interval);
  if (r.interval >= 7) r.stage = 2;
  r.updatedAt = nowIso;
  return r;
}

export function countIntroducedToday(records, todayStr) {
  return Object.values(records).filter((r) => r.introducedOn === todayStr).length;
}
