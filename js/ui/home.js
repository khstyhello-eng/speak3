import { countIntroducedToday } from '../srs.js';

const MY_SENTENCE_MIN = 15;

export function renderHome(el, ctx) {
  const today = ctx.todayStr();
  const due = Object.entries(ctx.state.records).filter(([id, r]) => r.due <= today && ctx.content.sentenceById[id]).length;
  const newRemaining = Math.max(0, ctx.state.settings.newPerDay - countIntroducedToday(ctx.state.records, today));
  const sections = ctx.content.sections.map((sec) => {
    let total = 0, mine = 0, learning = 0;
    for (const srcId of sec.sources) for (const s of ctx.content.sourcesById[srcId].sentences) {
      total += 1;
      const r = ctx.state.records[s.id];
      if (r && r.interval >= MY_SENTENCE_MIN) mine += 1;
      else if (r) learning += 1;
    }
    return `<section class="card"><p class="big">${sec.title}</p>
      <p class="sub">내 문장 ${mine} · 학습 중 ${learning} · 전체 ${total}</p></section>`;
  }).join('');
  el.innerHTML = `
    <section class="card">
      <p class="sub">오늘 발화할 문장</p>
      <p class="count">${due}</p>
      <div class="row">
        <button id="go-drill" ${due ? '' : 'disabled'}>발화 시작</button>
        <button id="go-learn" class="ghost">새 문장 학습 (오늘 ${newRemaining}개 남음)</button>
      </div>
    </section>
    ${sections}`;
  el.querySelector('#go-drill').onclick = () => ctx.go('drill');
  el.querySelector('#go-learn').onclick = () => ctx.go('learn');
}
