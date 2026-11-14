// App shell: routing, header, tab bar, footer, and the tap-to-explain sheet.

import * as store from './store.js';
import { createExplainer, explainHTML, openSheet, closeSheet, initSheet, ICON, esc } from './ui.js';
import intake from './screens/intake.js';
import home from './screens/home.js';
import pay from './screens/pay.js';
import settings from './screens/settings.js';
import banks from './screens/banks.js';
import k401 from './screens/k401.js';
import retire from './screens/retire.js';
import { feedbackHref } from './screens/feedback.js';
import { registerOffline } from './install.js';

const SCREENS = { intake, home, pay, deviation: banks, '401k': k401, retire, settings };
const TABS = [
  ['home', 'Home', ICON.home],
  ['pay', 'Pay', ICON.pay],
  ['deviation', 'Deviation', ICON.deviation],
  ['401k', '401(k)', ICON.k401],
  ['retire', 'Retire', ICON.retire],
];
const FOOTER = 'Independent tool. Not affiliated with any airline or union. Estimates only. Not tax, legal, or investment advice.';

const root = document.getElementById('app');
let lastRoute = null;

const app = {
  state: store.load() || store.blank(),
  x: createExplainer(),
  save() { store.save(this.state); },
  go(route) {
    if (location.hash === `#/${route}`) render();
    else location.hash = `#/${route}`;
  },
  render: (opts) => render(opts),
};

function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  return r || 'home';
}

function render({ keepScroll = false } = {}) {
  let route = currentRoute();
  if (!app.state.profile && route !== 'intake') {
    history.replaceState(null, '', '#/intake');
    route = 'intake';
  }
  if (!SCREENS[route]) route = 'home';
  const screen = SCREENS[route];
  const y = window.scrollY;
  app.x.reset();
  const body = screen.render(app);
  const tabs = route === 'intake' ? '' : `
    <nav class="tabs" aria-label="Main">
      ${TABS.map(([r, label, icon]) => `<a href="#/${r}" class="tab ${route === r ? 'active' : ''}" ${route === r ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`).join('')}
    </nav>`;
  root.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/home"><span class="logo" aria-hidden="true">LL</span><span>Line Ledger</span></a>
      ${app.state.sample ? '<span class="pill pill-sample">Sample data</span>' : ''}
      ${route === 'intake' ? '' : `<a class="icon-btn" href="#/settings" aria-label="Settings">${ICON.settings}</a>`}
    </header>
    <main id="screen" class="screen screen-${esc(route)}">${body}</main>
    <footer class="disclaimer">${FOOTER}<br><a class="foot-link" href="${feedbackHref(`${screen.title} screen`)}">Send feedback</a></footer>
    ${tabs}`;
  document.body.classList.toggle('has-tabs', route !== 'intake');
  document.title = `${screen.title} · Line Ledger`;
  if (screen.mount) screen.mount(root.querySelector('#screen'), app);
  if (keepScroll) window.scrollTo(0, y);
  else if (route !== lastRoute || !keepScroll) window.scrollTo(0, 0);
  lastRoute = route;
}

// Tap any figure to see how it was calculated.
root.addEventListener('click', (e) => {
  const b = e.target.closest('[data-x]');
  if (!b) return;
  const ex = app.x.map.get(b.dataset.x);
  if (ex) openSheet(ex.title || 'How this was calculated', explainHTML(ex));
});

window.addEventListener('hashchange', () => { closeSheet(); render(); });
initSheet();
render();

// Offline cache. When a new version has downloaded, offer to switch to it.
registerOffline((apply) => {
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>A new version is ready.</span><button type="button" class="btn small primary">Reload</button>';
  bar.querySelector('button').addEventListener('click', apply);
  document.body.appendChild(bar);
});
