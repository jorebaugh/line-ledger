import { refreshPresets, exportJSON, clear, blank, parseImport } from '../store.js';
import { installState, promptInstall, onInstallChange, INSTALL_HELP } from '../install.js';
import { APP_VERSION } from '../../config.js';

let installWatch = false;
import { sampleState } from '../sample.js';
import { profileFormHTML, profileSummaries, readProfile, bindProfileForm } from './profile-form.js';
import { openSheet, toast, esc, ICON } from '../ui.js';
import { formatMoney as $, formatDate, parseMoney, parsePct } from '../core.js';
import { stubSummaryHTML, openStubSheet } from './stub-sheet.js';

const DED_PCT = ['withholding', 'pretax', 'roth', 'aftertax'];
const openFolds = new Set(); // sections the user opened; everything starts closed
let pendingGo = null; // section to open and jump to, from a link like #/settings?go=role

const fold = (key, title, sub, body) => `
  <details class="card fold" data-fold="${key}" data-sec="${key}" ${openFolds.has(key) ? 'open' : ''}>
    <summary><span class="act-t"><b>${title}</b><small class="muted" data-sum="${key}">${sub}</small></span>${ICON.chevron}</summary>
    <div class="fold-body">${body}</div>
  </details>`;

// The one-line summary under "Taxes and deductions".
function dedSummary(p = {}) {
  const bits = [p.withholding ? `${p.withholding}% tax` : '30% tax (estimate)'];
  if (p.pretax) bits.push(`${p.pretax}% pre-tax`);
  if (p.roth) bits.push(`${p.roth}% Roth`);
  if (p.aftertax) bits.push(`${p.aftertax}% after-tax`);
  if (p.otherDed) bits.push(`${$(Math.round(Number(p.otherDed) * 100))} other`);
  return bits.join(' · ');
}

// Deductions used for take-home estimates: typed, or filled from a pasted pay stub.
function deductionsHTML(state) {
  const p = state.profile || {};
  const stubs = [...(state.stubs || [])].sort((a, b) => (a.adviceDate < b.adviceDate ? 1 : -1));
  const latest = stubs[0];
  const pct = (k, label, ph = '0') => `
    <label class="f"><span>${label}</span><span class="suffix-wrap"><input data-ded="${k}" inputmode="decimal" value="${esc(p[k] || '')}" placeholder="${ph}" autocomplete="off"><i>%</i></span></label>`;
  return `
      <button type="button" class="btn primary big wide" data-act="paste-stub">Add a pay stub</button>
      <p class="hint center">Fastest: the app reads these numbers off your stub. Or type them below.</p>
      <div class="stack mt">
        ${pct('withholding', 'Tax withholding', '30')}
        <label class="f"><span>Other deductions per check</span><input data-ded="otherDed" inputmode="decimal" value="${esc(p.otherDed || '')}" placeholder="$0.00" autocomplete="off"></label>
        ${pct('pretax', 'Pre-tax 401(k)')}
        ${pct('roth', 'Roth 401(k)')}
        ${pct('aftertax', 'After-tax 401(k)')}
      </div>
      <p class="hint">Used for take-home estimates and the 401(k) tracker. Withholding is federal + state + FICA as a percent of gross pay less per diem; blank assumes 30%. Other deductions are everything except 401(k), dues and taxes: medical, dental, insurance and the like.</p>
      ${latest ? `
        <details class="more">
          <summary>Latest stub: ${formatDate(latest.adviceDate, { year: true })}</summary>
          ${stubSummaryHTML(latest)}
        </details>
        <h3 class="mt">Saved stubs <span class="muted small">(last 6 kept)</span></h3>
        <ul class="ledger">
          ${stubs.map((st) => `<li><span>${formatDate(st.adviceDate, { year: true })} <small class="muted">${$(st.gross?.cur || 0)} gross · ${$(st.other.cur)} other</small></span>
            <span><button type="button" class="btn ghost small" data-use-stub="${esc(st.adviceDate)}">Use</button> <button type="button" class="btn ghost small" data-del-stub="${esc(st.adviceDate)}" aria-label="Remove the ${esc(formatDate(st.adviceDate))} stub">Remove</button></span></li>`).join('')}
        </ul>` : ''}`;
}

export default {
  title: 'Settings',
  render(app) {
    const go = new URLSearchParams(location.hash.split('?')[1] || '').get('go');
    if (go) {
      pendingGo = go;
      openFolds.add(go);
      history.replaceState(null, '', '#/settings');
    }
    const inst = installState();
    return `
      <h1>Settings</h1>
      <p class="lede">Tap a row to change it. Changes save as you make them.</p>
      ${profileFormHTML(app.state.profile || {}, openFolds)}
      ${fold('deductions', 'Taxes and deductions', esc(dedSummary(app.state.profile || {})), deductionsHTML(app.state))}
      ${fold('install', 'Put it on your phone', inst === 'installed' ? 'Installed' : 'Add it to your home screen', `
        <p>${INSTALL_HELP[inst]}</p>
        ${inst === 'prompt' ? '<button type="button" class="btn primary wide" data-act="install">Install Line Ledger</button>' : ''}`)}
      ${fold('data', 'Your data', 'Back up, move to a new phone, or start over', `
        <p class="muted small">Everything you enter is stored only in this browser on this device. Nothing is sent anywhere. Export a copy to move it to a new phone or keep a backup.</p>
        <div class="stack">
          <button type="button" class="btn" data-act="export">Export my data (JSON)</button>
          <label class="btn file-btn">Import a saved copy<input type="file" accept="application/json,.json" data-import></label>
          <button type="button" class="btn" data-act="sample">Load the sample pilot</button>
          <button type="button" class="btn danger" data-act="reset">Reset all data</button>
        </div>`)}
      ${fold('about', 'About', `Version ${esc(APP_VERSION)}`, `
        <p class="small">Line Ledger is a preview. Contract figures come from one rules file, each with its section reference. Anything marked <span class="confirm">confirm</span> hasn't been checked against its source yet.</p>`)}`;
  },
  mount(el, app) {
    const form = el.querySelector('#profile');
    bindProfileForm(form);
    const setSum = (key, text) => { const n = el.querySelector(`[data-sum="${key}"]`); if (n) n.textContent = text; };
    // Save on every change. The one-line summaries update in place, so nothing jumps while you tap.
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', () => {
      const { profile, errors } = readProfile(form, app.state.profile || {});
      if (errors.length) { toast(errors[0]); return; }
      app.state.profile = { ...app.state.profile, ...profile };
      refreshPresets(app.state);
      app.save();
      const sum = profileSummaries(app.state.profile);
      Object.keys(sum).forEach((k) => setSum(k, sum[k]));
      toast('Saved');
    });
    // <details> toggles don't bubble: listen on the way down, and remember what's open.
    el.addEventListener('toggle', (e) => {
      const k = e.target.dataset?.fold;
      if (k) { if (e.target.open) openFolds.add(k); else openFolds.delete(k); }
    }, true);
    if (pendingGo) {
      const want = pendingGo;
      pendingGo = null;
      setTimeout(() => {
        const sec = el.querySelector(`[data-sec="${want}"]`);
        if (!sec) return;
        sec.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -64);
        sec.classList.add('flash');
        setTimeout(() => sec.classList.remove('flash'), 1600);
      }, 0);
    }

    const confirmSheet = (title, body, label, onYes) => openSheet(title, `
      <p>${body}</p>
      <div class="stack mt"><button type="button" class="btn danger big" data-yes>${label}</button>
      <button type="button" class="btn ghost" data-close>Cancel</button></div>`, (b, close) => {
      b.querySelector('[data-yes]').addEventListener('click', () => { close(); onYes(); });
    });

    if (!installWatch) {
      installWatch = true;
      onInstallChange(() => { if (location.hash === '#/settings') app.render({ keepScroll: true }); });
    }

    el.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.matches('[data-import]')) {
        const f = t.files?.[0];
        t.value = '';
        if (!f) return;
        const next = parseImport(await f.text());
        if (!next) { toast("That file isn't a Line Ledger export"); return; }
        confirmSheet('Replace what\'s on this device?', 'The imported copy replaces everything entered here. Export first if you want to keep this device\'s data.', 'Replace with the import', () => {
          app.state = next;
          app.save();
          toast('Imported');
          app.go('home');
        });
        return;
      }
      const k = t.dataset.ded;
      if (!k) return;
      const val = t.value.trim();
      const p = app.state.profile;
      if (k === 'otherDed') {
        const c = parseMoney(val);
        if (val !== '' && (c == null || c < 0)) { toast('Enter a dollar amount'); return; }
        p.otherDed = val === '' ? '' : (c / 100).toFixed(2);
        t.value = p.otherDed;
      } else if (DED_PCT.includes(k)) {
        const n = parsePct(val);
        if (val !== '' && (n == null || n > 100)) { toast('Enter a percentage'); return; }
        p[k] = val === '' ? '' : String(n);
        t.value = p[k];
      }
      app.save();
      setSum('deductions', dedSummary(p));
      toast('Saved');
    });

    el.addEventListener('click', (e) => {
      const useD = e.target.closest('[data-use-stub]')?.dataset.useStub;
      const delD = e.target.closest('[data-del-stub]')?.dataset.delStub;
      if (useD || delD) {
        const st = (app.state.stubs || []).find((x) => x.adviceDate === (useD || delD));
        if (!st) return;
        if (useD) {
          const p = app.state.profile;
          const r = (n) => (n ? String(Math.round(n * 10) / 10) : '');
          if (st.rates.taxCur != null) p.withholding = String(st.rates.taxCur);
          p.otherDed = (st.other.cur / 100).toFixed(2);
          p.pretax = r(st.rates.pretax);
          p.roth = r(st.rates.roth);
          p.aftertax = r(st.rates.after);
          app.save();
          toast(`Using the ${formatDate(st.adviceDate)} stub`);
          app.render({ keepScroll: true });
        } else {
          confirmSheet('Remove this stub?', `The ${formatDate(st.adviceDate, { year: true })} stub comes off this device. Your deduction figures stay as they are.`, 'Remove stub', () => {
            app.state.stubs = (app.state.stubs || []).filter((x) => x.adviceDate !== st.adviceDate);
            app.save();
            app.render({ keepScroll: true });
          });
        }
        return;
      }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'paste-stub') openStubSheet(app);
      if (a === 'install') promptInstall();
      if (a === 'export') exportJSON(app.state);
      if (a === 'sample') {
        confirmSheet('Load the sample pilot?', 'This replaces what you have entered with demo data for a year-6 wide-body First Officer. Export first if you want to keep your data.', 'Replace with sample', () => {
          app.state = sampleState();
          app.save();
          app.go('home');
        });
      }
      if (a === 'reset') {
        confirmSheet('Reset all data?', 'This erases your answers, bid periods and history from this device. It cannot be undone.', 'Erase everything', () => {
          clear();
          app.state = blank();
          app.go('intake');
        });
      }
    });
  },
};
