// First-time setup: one question per screen, big buttons. Five answers, then the estimate.
// Everything else (line value, 401(k), instructor role, bid period length) has a default and lives in Settings.

import { blank, ensurePeriod } from '../store.js';
import { sampleState } from '../sample.js';
import { todayISO, periodFromISO, shiftPeriod } from '../core.js';
import { esc, ICON } from '../ui.js';

const QUESTIONS = [
  { key: 'seat', q: 'Which seat are you in?', opts: [['CA', 'Captain'], ['FO', 'First Officer']] },
  { key: 'fleet', q: 'What do you fly?', opts: [['WB', 'Wide body'], ['NB', 'Narrow body']] },
  { key: 'line', q: 'Do you hold a line, or are you on reserve?', opts: [['regular', 'I hold a line'], ['reserve', "I'm on reserve"]] },
  { key: 'flying', q: 'What do you mostly fly?', opts: [['domestic', 'Domestic'], ['international', 'International']], note: 'Used for a starting guess at per diem and override. You can change it any time.' },
  { key: 'hire', q: 'When were you hired?' },
];

let step = 0;
let ans = {};

const yearGroups = (sel) => Array.from({ length: 15 }, (_, i) => `<option value="${i + 1}" ${Number(sel) === i + 1 ? 'selected' : ''}>Year group ${i + 1}</option>`).join('');

function hireHTML() {
  const pick = ans.ygMode === 'pick';
  return `
    <div class="wiz-field">
      ${pick
    ? `<label class="f"><span>Your year group</span><select data-hire="yearGroup">${yearGroups(ans.yearGroup || 1)}</select></label>
       <button type="button" class="link" data-act="yg" data-mode="doh">Enter my date of hire instead</button>`
    : `<label class="f"><span>Date of hire</span><input type="date" data-hire="doh" value="${esc(ans.doh || '')}" max="${todayISO()}"></label>
       <button type="button" class="link" data-act="yg" data-mode="pick">I'd rather pick my year group</button>`}
      <p class="form-error" data-out="err" role="alert" hidden></p>
      <button type="button" class="btn primary big wide" data-act="finish">Show my next check</button>
    </div>`;
}

export default {
  title: 'Set up',
  render() {
    const cur = QUESTIONS[step];
    return `
      <div class="wiz">
        <div class="wiz-top">
          ${step > 0 ? `<button type="button" class="btn ghost small" data-act="back">${ICON.left} Back</button>` : '<span></span>'}
          <span class="wiz-count">Question ${step + 1} of ${QUESTIONS.length}</span>
        </div>
        <div class="wiz-bar" aria-hidden="true"><span style="width:${Math.round(((step + 1) / QUESTIONS.length) * 100)}%"></span></div>
        <h1>${esc(cur.q)}</h1>
        ${cur.opts ? `<div class="wiz-opts">${cur.opts.map(([v, label]) => `
          <button type="button" class="wiz-opt ${ans[cur.key] === v ? 'on' : ''}" data-pick="${cur.key}" data-val="${v}">${esc(label)}</button>`).join('')}</div>` : hireHTML()}
        ${cur.note ? `<p class="wiz-note">${esc(cur.note)}</p>` : ''}
        ${step === 0 ? `<p class="wiz-note">Five quick questions, then your next check. Everything stays on this phone.</p>
          <button type="button" class="btn ghost wide" data-act="sample">Just looking? Load a sample pilot</button>` : ''}
      </div>`;
  },
  mount(el, app) {
    el.addEventListener('change', (e) => {
      const k = e.target.dataset.hire;
      if (!k) return;
      ans[k] = e.target.value;
      const err = el.querySelector('[data-out="err"]');
      if (err) err.hidden = true;
    });
    el.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        ans[pick.dataset.pick] = pick.dataset.val;
        step = Math.min(QUESTIONS.length - 1, step + 1);
        app.render();
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'back') { step = Math.max(0, step - 1); app.render(); return; }
      if (a === 'yg') { ans.ygMode = b.dataset.mode; app.render(); return; }
      if (a === 'sample') {
        step = 0; ans = {};
        app.state = sampleState();
        app.save();
        app.go('home');
        return;
      }
      if (a === 'finish') {
        const err = el.querySelector('[data-out="err"]');
        const pickMode = ans.ygMode === 'pick';
        const doh = pickMode ? '' : (el.querySelector('[data-hire="doh"]')?.value || '');
        const yearGroup = pickMode ? Number(el.querySelector('[data-hire="yearGroup"]')?.value) || 1 : 1;
        const problem = pickMode ? '' : !doh ? 'Enter your date of hire, or pick your year group.' : doh > todayISO() ? 'That date is in the future.' : '';
        if (problem) { err.textContent = problem; err.hidden = false; return; }
        const s = blank();
        s.profile = {
          seat: ans.seat, fleet: ans.fleet, ygMode: pickMode ? 'pick' : 'doh', doh, yearGroup,
          weeks: 4, line: ans.line || 'regular', lineValue: '', flying: ans.flying || 'domestic',
          pretax: '', roth: '', aftertax: '', withholding: '', ageBand: 'u50', commuter: 'no', otherDed: '', role: '', roleYear: 1,
        };
        const code = periodFromISO(todayISO());
        s.viewCode = code;
        app.state = s;
        ensurePeriod(s, shiftPeriod(code, -1));
        ensurePeriod(s, code);
        step = 0; ans = {};
        app.save();
        app.go('home');
      }
    });
  },
};
