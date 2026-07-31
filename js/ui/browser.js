import { loadScript } from '../content.js';
import { normalize } from '../match.js';

export function renderBrowser(el, ctx) {
  const sources = ctx.content.sections.flatMap((sec) => sec.sources.map((id) => ctx.content.sourcesById[id]));
  el.innerHTML = `<section class="card">
    <p class="sub">소스 선택</p>
    <div class="row">${sources.map((s) => `<button class="ghost src" data-id="${s.id}">${s.title}</button>`).join('')}</div>
  </section><div id="script"></div>`;
  el.querySelectorAll('.src').forEach((b) => { b.onclick = () => showScript(el.querySelector('#script'), ctx, b.dataset.id); });
}

async function showScript(el, ctx, sourceId) {
  el.innerHTML = '<p class="sub">스크립트 불러오는 중…</p>';
  const { lines } = await loadScript(sourceId);
  const src = ctx.content.sourcesById[sourceId];
  const curatedSet = new Set(src.sentences.map((s) => normalize(s.en)));
  const inList = new Set(src.sentences.map((s) => normalize(s.en)));
  el.innerHTML = lines.map((line, idx) => {
    const mark = curatedSet.has(normalize(line));
    return `<div class="line ${mark ? 'curated' : ''}">
      <span>${line}</span>
      ${mark || inList.has(normalize(line)) ? '<span class="add sub">✓</span>' : `<button class="add ghost" data-idx="${idx}">＋</button>`}
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
