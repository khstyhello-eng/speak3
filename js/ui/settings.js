import { loadDevice, saveDevice, exportJson, importJson, saveState } from '../store.js';
import { findGist, createGist, autoSync } from '../sync.js';

export function renderSettings(el, ctx) {
  const device = loadDevice();
  el.innerHTML = `
  <section class="card">
    <p class="big">동기화 (GitHub Gist)</p>
    <p class="sub" style="margin:8px 0">GitHub 토큰(gist 권한)을 넣으면 맥↔폰 진도가 자동으로 이어집니다.</p>
    <input id="token" type="password" placeholder="GitHub 토큰 (ghp_...)" value="${device.token}">
    <div class="row">
      <button id="connect">연결 (기존 Gist 찾기/새로 만들기)</button>
      <button id="sync-now" class="ghost">지금 동기화</button>
    </div>
    <p class="sub" id="gist-info" style="margin-top:8px">${device.gistId ? 'Gist 연결됨: ' + device.gistId : '아직 연결 안 됨'}</p>
  </section>
  <section class="card">
    <p class="big">학습 설정</p>
    <p class="sub" style="margin:8px 0">하루 새 문장 개수</p>
    <input id="new-per-day" type="number" min="1" max="50" value="${ctx.state.settings.newPerDay}">
  </section>
  <section class="card">
    <p class="big">백업</p>
    <div class="row">
      <button id="export" class="ghost">내보내기 (JSON)</button>
      <label class="btn ghost">가져오기<input id="import" type="file" accept=".json" hidden></label>
    </div>
  </section>
  <section class="card">
    <p class="big">음성인식 복구</p>
    <p class="sub" style="margin:8px 0">자기평가로 전환된 문장을 음성인식 모드로 되돌립니다</p>
    <div class="row">
      <button id="reset-selfassess" class="ghost">음성인식 다시 시도</button>
    </div>
  </section>
  ${skippedCardHtml(ctx)}`;

  el.querySelector('#connect').onclick = async () => {
    const token = el.querySelector('#token').value.trim();
    if (!token) { alert('토큰을 입력하세요'); return; }
    const info = el.querySelector('#gist-info');
    info.textContent = '연결 중…';
    try {
      let gistId = await findGist(token);
      if (!gistId) gistId = await createGist(token, ctx.state);
      saveDevice({ token, gistId });
      info.textContent = 'Gist 연결됨: ' + gistId;
      await autoSync(ctx);
    } catch (e) { info.textContent = '실패: ' + e.message; }
  };
  el.querySelector('#sync-now').onclick = () => autoSync(ctx);
  el.querySelector('#new-per-day').onchange = (e) => {
    const clamped = Math.min(50, Math.max(1, Number(e.target.value) || 5));
    ctx.state.settings.newPerDay = clamped;
    e.target.value = String(clamped);
    ctx.save();
  };
  el.querySelector('#export').onclick = () => {
    const blob = new Blob([exportJson(ctx.state)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'speak3-progress.json' });
    a.click();
  };
  el.querySelector('#import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      ctx.state = importJson(await file.text());
      saveState(ctx.state);
      ctx.refreshContent();
      alert('가져오기 완료');
    } catch (err) { alert('가져오기 실패: ' + err.message); }
  };
  el.querySelector('#reset-selfassess').onclick = () => {
    let count = 0;
    for (const record of Object.values(ctx.state.records)) {
      if (record.selfAssess) {
        record.selfAssess = false;
        record.recFails = 0;
        record.updatedAt = ctx.nowIso();
        count += 1;
      }
    }
    ctx.save();
    alert(`${count}개 문장을 음성인식 모드로 되돌렸어요`);
  };
  el.querySelectorAll('[data-restore]').forEach((b) => {
    b.onclick = () => {
      delete ctx.state.skipped[b.dataset.restore];
      ctx.save();
      renderSettings(el, ctx);
    };
  });
}

// 스킵한 문장 카드. skipped가 비어있으면 아무것도 렌더링하지 않는다.
function skippedCardHtml(ctx) {
  const ids = Object.keys(ctx.state.skipped);
  if (!ids.length) return '';
  const rows = ids.map((id) => {
    const s = ctx.content.sentenceById[id];
    const label = s ? s.en.slice(0, 40) : id;
    return `<div class="row" style="justify-content:space-between; align-items:center">
      <span class="sub">${label}</span>
      <button class="ghost" data-restore="${id}">복원</button>
    </div>`;
  }).join('');
  return `<section class="card">
    <p class="big">스킵한 문장</p>
    <p class="sub" style="margin:8px 0">${ids.length}개</p>
    ${rows}
  </section>`;
}
