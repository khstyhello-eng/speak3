import { loadState, saveState } from './store.js';
import { loadContent, withCustom } from './content.js';
import { renderHome } from './ui/home.js';
import { renderLearn } from './ui/learn.js';
import { renderDrill } from './ui/drill.js';
import { renderBrowser } from './ui/browser.js';
import { renderSettings } from './ui/settings.js';
import { autoSync, schedulePush } from './sync.js';

const routes = { home: renderHome, learn: renderLearn, drill: renderDrill, browser: renderBrowser, settings: renderSettings };

export const ctx = {
  state: null,
  baseContent: null,
  content: null,
  todayStr() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  nowIso() { return new Date().toISOString(); },
  save() {
    this.state.updatedAt = this.nowIso();
    saveState(this.state);
    schedulePush(this);
  },
  refreshContent() { this.content = withCustom(this.baseContent, this.state.custom); },
  go(route) { location.hash = '#' + route; },
};

function render() {
  const route = (location.hash || '#home').slice(1);
  const fn = routes[route] || renderHome;
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + (routes[route] ? route : 'home')));
  fn(document.getElementById('app'), ctx);
}

async function boot() {
  ctx.state = loadState();
  ctx.baseContent = await loadContent('data');
  ctx.refreshContent();
  window.addEventListener('hashchange', render);
  render();
  autoSync(ctx).then(() => {
    const route = (location.hash || '#home').slice(1);
    if (route !== 'drill') render();
  }).catch(() => {});
}

boot();
