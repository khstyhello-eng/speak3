const KEY = 'speak3.progress';
const DEVICE_KEY = 'speak3.device';
const LS = typeof localStorage !== 'undefined' ? localStorage : null;

export function defaultState() {
  return { version: 1, records: {}, custom: {}, settings: { newPerDay: 5, hideCueText: false }, updatedAt: '', skipped: {} };
}

export function mergeRecords(a, b) {
  const out = { ...a };
  for (const [id, r] of Object.entries(b)) {
    if (!out[id] || (r.updatedAt || '') > (out[id].updatedAt || '')) out[id] = r;
  }
  return out;
}

export function mergeState(local, remote) {
  if (!remote || remote.version !== 1) return local;
  const newer = (remote.updatedAt || '') > (local.updatedAt || '') ? remote : local;
  const custom = {};
  for (const src of new Set([...Object.keys(local.custom), ...Object.keys(remote.custom)])) {
    const seen = new Map();
    for (const s of [...(local.custom[src] || []), ...(remote.custom[src] || [])]) {
      if (!seen.has(s.id)) seen.set(s.id, s);
    }
    custom[src] = [...seen.values()];
  }
  // skipped는 id별 최신 timestamp 승리로 합집합. 주의: 한쪽에서 복원(삭제)해도 다른 쪽이 아직
  // 그 id를 skipped로 갖고 있으면 병합 시 되살아날 수 있음(v1에서는 허용, 해결 안 함).
  const localSkipped = local.skipped || {};
  const remoteSkipped = remote.skipped || {};
  const skipped = { ...localSkipped, ...remoteSkipped };
  for (const id of Object.keys(skipped)) {
    const l = localSkipped[id];
    const r = remoteSkipped[id];
    if (l && r) skipped[id] = l > r ? l : r;
  }
  return {
    version: 1,
    records: mergeRecords(local.records, remote.records),
    custom,
    settings: { ...newer.settings },
    updatedAt: newer.updatedAt,
    skipped,
  };
}

export function loadState() {
  if (!LS) return defaultState();
  try {
    const raw = LS.getItem(KEY);
    return raw ? importJson(raw) : defaultState();
  } catch { return defaultState(); }
}

export function saveState(state) { if (LS) LS.setItem(KEY, JSON.stringify(state)); }

export function loadDevice() {
  if (!LS) return { token: '', gistId: '' };
  try { return { token: '', gistId: '', ...JSON.parse(LS.getItem(DEVICE_KEY) || '{}') }; }
  catch { return { token: '', gistId: '' }; }
}

export function saveDevice(d) { if (LS) LS.setItem(DEVICE_KEY, JSON.stringify(d)); }

export function exportJson(state) { return JSON.stringify(state, null, 2); }

export function importJson(text) {
  const s = JSON.parse(text);
  if (s.version !== 1 || typeof s.records !== 'object' || s.records === null) throw new Error('speak3 진도 파일이 아닙니다');
  return { ...defaultState(), ...s };
}
