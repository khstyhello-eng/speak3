import { mergeState, saveState, loadDevice, importJson } from './store.js';

export const GIST_FILE = 'speak3-progress.json';
const API = 'https://api.github.com';

export function buildCreatePayload(state) {
  return {
    description: 'speak3 progress (자동 생성 — 수정 금지)',
    public: false,
    files: { [GIST_FILE]: { content: JSON.stringify(state) } },
  };
}

export function buildUpdatePayload(state) {
  return { files: { [GIST_FILE]: { content: JSON.stringify(state) } } };
}

export function parseGistState(gistJson) {
  const file = gistJson.files?.[GIST_FILE];
  if (!file || !file.content) return null;
  try { return importJson(file.content); } catch { return null; }
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
}

export async function findGist(token) {
  const res = await fetch(`${API}/gists?per_page=100`, { headers: headers(token) });
  if (!res.ok) throw new Error('gist 목록 조회 실패: ' + res.status);
  const gists = await res.json();
  return gists.find((g) => g.files && g.files[GIST_FILE])?.id || null;
}

export async function createGist(token, state) {
  const res = await fetch(`${API}/gists`, { method: 'POST', headers: headers(token), body: JSON.stringify(buildCreatePayload(state)) });
  if (!res.ok) throw new Error('gist 생성 실패: ' + res.status);
  return (await res.json()).id;
}

export async function pull(token, gistId) {
  const res = await fetch(`${API}/gists/${gistId}`, { headers: headers(token) });
  if (!res.ok) throw new Error('gist 읽기 실패: ' + res.status);
  return parseGistState(await res.json());
}

export async function push(token, gistId, state) {
  const res = await fetch(`${API}/gists/${gistId}`, { method: 'PATCH', headers: headers(token), body: JSON.stringify(buildUpdatePayload(state)) });
  if (!res.ok) throw new Error('gist 쓰기 실패: ' + res.status);
}

function setStatus(text) {
  const n = document.getElementById('sync-status');
  if (n) n.textContent = text;
}

export async function autoSync(ctx) {
  const { token, gistId } = loadDevice();
  if (!token || !gistId) { setStatus(''); return; }
  setStatus('동기화 중…');
  try {
    const remote = await pull(token, gistId);
    ctx.state = mergeState(ctx.state, remote);
    saveState(ctx.state);
    ctx.refreshContent();
    await push(token, gistId, ctx.state);
    setStatus('☁️ 동기화됨');
  } catch (e) {
    setStatus('⚠️ 오프라인 (로컬 저장됨)');
  }
}

let pushTimer = null;
export function schedulePush(ctx) {
  const { token, gistId } = loadDevice();
  if (!token || !gistId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try { await push(token, gistId, ctx.state); setStatus('☁️ 동기화됨'); }
    catch { setStatus('⚠️ 오프라인 (로컬 저장됨)'); }
  }, 2000);
}
