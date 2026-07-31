import { newRecord, countIntroducedToday } from '../srs.js';
import { support, speakSentence } from '../speech.js';

export function renderLearn(el, ctx) {
  const filter = ctx.state.settings.learnSection || 'all';
  const today = ctx.todayStr();
  const remaining = ctx.state.settings.newPerDay - countIntroducedToday(ctx.state.records, today);
  if (remaining <= 0) {
    renderScreen(el, ctx, filter, `<section class="card"><p class="big">오늘 새 문장 학습량을 채웠어요 ✨</p>
      <div class="row"><a class="btn" href="#drill">발화 연습으로</a></div></section>`);
    return;
  }
  // filter가 'all'이 아니면 해당 섹션의 소스만 후보로 모은다. (하루 학습량 한도는 전역 그대로 유지)
  const sections = filter === 'all' ? ctx.content.sections : ctx.content.sections.filter((sec) => sec.id === filter);
  const candidates = [];
  for (const sec of sections) for (const srcId of sec.sources) {
    for (const s of ctx.content.sourcesById[srcId].sentences) {
      if (!ctx.state.records[s.id] && !ctx.state.skipped[s.id]) candidates.push(s);
    }
  }
  if (!candidates.length) {
    const activeSection = ctx.content.sections.find((sec) => sec.id === filter);
    const label = activeSection ? ` (${activeSection.title})` : '';
    renderScreen(el, ctx, filter, `<section class="card"><p class="big">학습할 새 문장이 없어요${label}. 문장 브라우저에서 추가해보세요.</p>
      <div class="row"><a class="btn" href="#browser">문장 브라우저</a></div></section>`);
    return;
  }
  // 커스텀(직접추가) 문장을 먼저 학습하도록 안정 정렬: curated=false가 앞으로,
  // curated 여부가 같은 항목끼리는 기존 순서를 그대로 유지한다.
  candidates.sort((a, b) => (a.curated === b.curated) ? 0 : (a.curated ? 1 : -1));
  showCard(el, ctx, filter, candidates[0], remaining);
}

// 학습 화면 최상단에 표시할 섹션 필터 칩 행(전체 + 섹션별). 활성 칩은 solid(.btn), 나머지는 ghost(.btn .ghost).
function chipsHtml(ctx, filter) {
  const items = [{ id: 'all', title: '전체' }, ...ctx.content.sections.map((sec) => ({ id: sec.id, title: sec.title }))];
  return `<div class="row">${items.map((it) => `<button class="${filter === it.id ? 'btn' : 'btn ghost'}" data-filter="${it.id}">${it.title}</button>`).join('')}</div>`;
}

function bindChips(el, ctx) {
  el.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => {
      ctx.state.settings.learnSection = b.dataset.filter;
      ctx.save();
      renderLearn(el, ctx);
    };
  });
}

// 카드 없는 상태(오늘 학습량 채움 / 새 문장 없음)에서 칩+본문을 그리고 칩 클릭을 바인딩한다.
function renderScreen(el, ctx, filter, bodyHtml) {
  el.innerHTML = chipsHtml(ctx, filter) + bodyHtml;
  bindChips(el, ctx);
}

function showCard(el, ctx, filter, s, remaining) {
  el.innerHTML = `${chipsHtml(ctx, filter)}<section class="card">
    <p class="sub">오늘 남은 새 문장 ${remaining}개 · ${s.speaker}</p>
    ${s.contextBefore ? `<p class="sub">↰ ${s.contextBefore}</p>` : ''}
    <p class="big" style="margin:8px 0">${s.en}</p>
    ${s.contextAfter ? `<p class="sub">↳ ${s.contextAfter}</p>` : ''}
    <p style="margin:12px 0">${s.ko}</p>
    <p class="sub">${s.note || ''}</p>
    <p class="row">${(s.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}</p>
    <div class="row">
      <button id="listen" class="ghost">🔊 듣기</button>
      <button id="done">학습 완료 → 오늘 발화 목록에 추가</button>
      <button id="skip" class="ghost">스킵</button>
    </div>
  </section>`;
  bindChips(el, ctx);
  if (support.tts) speakSentence(s); else el.querySelector('#listen').style.display = 'none';
  el.querySelector('#listen').onclick = () => speakSentence(s);
  el.querySelector('#done').onclick = () => {
    ctx.state.records[s.id] = newRecord(ctx.todayStr(), ctx.nowIso());
    ctx.save();
    renderLearn(el, ctx); // 다음 후보 or 완료 화면(→발화 연습 링크)
  };
  el.querySelector('#skip').onclick = () => {
    ctx.state.skipped[s.id] = ctx.nowIso();
    ctx.save();
    renderLearn(el, ctx); // records를 건드리지 않으므로 오늘 학습량은 그대로, 다음 후보가 바로 나온다
  };
}
