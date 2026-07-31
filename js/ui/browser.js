import { loadScript } from '../content.js';
import { normalize } from '../match.js';

// showScript는 비동기(loadScript await)이므로, 소스 A를 클릭한 직후 소스 B를 클릭하면
// A의 응답이 나중에 도착해 B의 화면 위에 잘못 그려질 수 있다(핸들러도 A의 sourceId를 클로저).
// drill.js와 동일한 세대 카운터 패턴으로 오래된 응답을 폐기한다.
let generation = 0;

export function renderBrowser(el, ctx) {
  generation += 1;
  const sources = ctx.content.sections.flatMap((sec) => sec.sources.map((id) => ctx.content.sourcesById[id]));
  el.innerHTML = `<section class="card">
    <p class="sub">소스 선택</p>
    <div class="row">${sources.map((s) => `<button class="ghost src" data-id="${s.id}">${s.title}</button>`).join('')}</div>
  </section><div id="script"></div>`;
  el.querySelectorAll('.src').forEach((b) => { b.onclick = () => showScript(el.querySelector('#script'), ctx, b.dataset.id); });
}

async function showScript(el, ctx, sourceId) {
  generation += 1;
  const myGen = generation;
  el.innerHTML = '<p class="sub">스크립트 불러오는 중…</p>';
  const { lines } = await loadScript(sourceId);
  if (myGen !== generation) return; // 다른 소스를 클릭한 뒤 도착한 응답 — 폐기
  // 큐레이션 여부는 커스텀 추가분이 섞이지 않은 원본(baseContent)으로 판정한다.
  // 그래야 직접 추가한 문장이 다음에 열었을 때 "공식 큐레이션"으로 오인되지 않는다.
  const baseSrc = ctx.baseContent.sourcesById[sourceId];
  const curatedSet = new Set(baseSrc.sentences.map((s) => normalize(s.en)));
  // "이미 추가됨" 여부는 텍스트가 아니라 id로 판정한다. 텍스트 매칭은 스크립트 내
  // 반복 대사("Okay." 등)에서 한 곳만 추가해도 다른 모든 동일 대사 줄이 ✓ 처리되는 버그가 있었다.
  const addedIds = new Set((ctx.state.custom[sourceId] || []).map((s) => s.id));
  el.innerHTML = lines.map((line, idx) => {
    const curated = curatedSet.has(normalize(line));
    const added = addedIds.has(`custom-${sourceId}-${idx}`);
    return `<div class="line ${curated ? 'curated' : ''}">
      <span>${line}</span>
      ${curated || added ? '<span class="add sub">✓</span>' : `<button class="add ghost" data-idx="${idx}">＋</button>`}
    </div>`;
  }).join('');
  el.querySelectorAll('button.add').forEach((b) => {
    b.onclick = () => {
      const idx = Number(b.dataset.idx);
      const en = lines[idx];
      const ko = prompt(`이 문장의 한국어 뜻을 입력하세요 (발화 큐로 사용됩니다):\n\n"${en}"`);
      if (!ko) return;
      const custom = ctx.state.custom[sourceId] || (ctx.state.custom[sourceId] = []);
      custom.push({
        id: `custom-${sourceId}-${idx}`,
        en, ko, note: '', situationCue: '',
        contextBefore: lines[idx - 1] || '', contextAfter: lines[idx + 1] || '',
        speaker: 'Unknown', tags: ['직접추가'], curated: false,
      });
      ctx.save();
      ctx.refreshContent();
      b.replaceWith(Object.assign(document.createElement('span'), { className: 'add sub', textContent: '✓' }));
    };
  });
}
