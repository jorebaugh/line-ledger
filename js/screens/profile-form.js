// The intake questions. Used for first run (Intake) and later edits (Settings).

import { RULES } from '../../rules.js';
import { todayISO, periodFromISO, periodName, formatMoney, parsePct, parseHours, formatHours, parseMoney } from '../core.js';
import { payContext, seatName, fleetName, ROLES } from '../paymath.js';
import { esc, seg } from '../ui.js';

const pctField = (name, label, value, placeholder = '0') => `
  <label class="f">
    <span>${esc(label)}</span>
    <span class="suffix-wrap"><input name="${name}" inputmode="decimal" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(value ?? '')}"><i>%</i></span>
  </label>`;

export function profileFormHTML(p = {}, { mode = 'intake' } = {}) {
  const ygMode = p.ygMode || 'doh';
  const ygOptions = Array.from({ length: 15 }, (_, i) => `<option value="${i + 1}" ${Number(p.yearGroup) === i + 1 ? 'selected' : ''}>Year group ${i + 1}</option>`).join('');
  const settings = mode === 'settings';
  const moreOpen = settings && p.role ? 'open' : '';
  return `
  <form id="profile" class="stack" novalidate autocomplete="off">
    <fieldset class="field"><legend>Seat</legend>
      ${seg('seat', [['CA', 'Captain'], ['FO', 'First Officer']], p.seat)}</fieldset>

    <fieldset class="field"><legend>Fleet</legend>
      ${seg('fleet', [['WB', 'Wide body'], ['NB', 'Narrow body']], p.fleet)}</fieldset>

    <fieldset class="field"><legend>Longevity</legend>
      ${seg('ygMode', [['doh', 'Date of hire'], ['pick', 'Pick year group']], ygMode, { cls: 'seg-small' })}
      <div class="mt" data-show="doh" ${ygMode === 'doh' ? '' : 'hidden'}>
        <input type="date" name="doh" value="${esc(p.doh || '')}" max="${todayISO()}" aria-label="Date of hire">
      </div>
      <div class="mt" data-show="pick" ${ygMode === 'pick' ? '' : 'hidden'}>
        <select name="yearGroup" aria-label="Year group">${ygOptions}</select>
      </div>
      <p class="hint" data-out="yg"></p>
    </fieldset>

    <fieldset class="field"><legend>Bid period length</legend>
      ${seg('weeks', [['4', '4 weeks'], ['5', '5 weeks'], ['6', '6 weeks']], String(p.weeks || 4))}</fieldset>

    <fieldset class="field"><legend>Line</legend>
      ${seg('line', [['regular', 'Regular line'], ['reserve', 'Reserve']], p.line || 'regular')}
      <label class="f mt"><span>Line value, credit hours <span class="muted">(optional)</span></span>
        <input name="lineValue" value="${esc(p.lineValue || '')}" placeholder="Leave blank for the minimum" autocomplete="off" spellcheck="false"></label>
      <p class="hint">What your line is usually worth, like 72:30. Blank starts from the minimum guarantee.</p></fieldset>

    <fieldset class="field"><legend>Typical flying</legend>
      ${seg('flying', [['domestic', 'Mostly domestic'], ['international', 'Mostly international']], p.flying)}
      <p class="hint">Pre-fills typical per diem and override. You can change every number later.</p></fieldset>

    <details class="more" ${moreOpen}>
      <summary>Make it more accurate <span class="muted">(optional)</span></summary>
      ${settings ? '' : `<div class="grid2">
        ${pctField('pretax', 'Pre-tax 401(k)', p.pretax)}
        ${pctField('roth', 'Roth 401(k)', p.roth)}
        ${pctField('aftertax', 'After-tax 401(k)', p.aftertax)}
        ${pctField('withholding', 'Total tax withholding', p.withholding, '30')}
      </div>`}
      <label class="f"><span>Age</span>
        <select name="ageBand">
          ${[['u50', 'Under 50'], ['50to59', '50 to 59'], ['60to63', '60 to 63'], ['64plus', '64+']].map(([v, l]) => `<option value="${v}" ${p.ageBand === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      ${settings ? '' : `<label class="f"><span>Other deductions per check</span>
        <input name="otherDed" inputmode="decimal" value="${esc(p.otherDed || '')}" placeholder="$0.00" autocomplete="off"></label>
      <p class="hint">Insurance, medical, dental and the like: everything except 401(k), dues and taxes. Later you can add a pay stub (PDF or text) in Settings to fill these in.</p>`}
      <div class="grid2">
        <label class="f"><span>Instructor or check airman</span>
          <select name="role"><option value="">No</option>${Object.entries(ROLES).map(([v, l]) => `<option value="${v}" ${p.role === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="f"><span>Year in the program</span>
          <select name="roleYear">${[[1, 'Year 1'], [2, 'Year 2'], [3, 'Year 3'], [4, 'Year 4 and above']].map(([v, l]) => `<option value="${v}" ${Number(p.roleYear || 1) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <p class="hint" data-out="role"></p>
      <fieldset class="field"><legend>Commuter</legend>
        ${seg('commuter', [['yes', 'Yes'], ['no', 'No']], p.commuter || 'no', { cls: 'seg-small' })}</fieldset>
      ${settings ? '' : '<p class="hint">Withholding is your total from a recent stub (federal + state + FICA) as a percent of gross. Leave blank and the estimate assumes 30%.</p>'}
    </details>

    <p class="form-error" data-out="err" role="alert" hidden></p>
    <button class="btn primary big" type="submit">${mode === 'intake' ? 'See my estimate' : 'Save changes'}</button>
    ${mode === 'intake' ? '<button class="btn ghost" type="button" data-act="sample">Just looking? Load a sample pilot</button>' : ''}
  </form>`;
}

// prev: the saved profile. Fields not on this form (Settings keeps deductions in their own card) are kept.
export function readProfile(form, prev = {}) {
  const fd = new FormData(form);
  const g = (k) => (fd.has(k) ? (fd.get(k) ?? '').toString().trim() : String(prev[k] ?? ''));
  const errors = [];
  const p = {
    seat: g('seat'),
    fleet: g('fleet'),
    ygMode: g('ygMode') || 'doh',
    doh: g('doh'),
    yearGroup: Number(g('yearGroup')) || 1,
    weeks: Number(g('weeks')) || 4,
    line: g('line') || 'regular',
    lineValue: g('lineValue'),
    flying: g('flying'),
    pretax: g('pretax'),
    roth: g('roth'),
    aftertax: g('aftertax'),
    withholding: g('withholding'),
    ageBand: g('ageBand') || 'u50',
    commuter: g('commuter') || 'no',
    otherDed: g('otherDed'),
    role: g('role'),
    roleYear: Number(g('roleYear')) || 1,
  };
  if (!p.seat) errors.push('Pick your seat.');
  if (!p.fleet) errors.push('Pick your fleet.');
  if (p.ygMode === 'doh') {
    if (!p.doh) errors.push('Enter your date of hire, or pick a year group.');
    else if (p.doh > todayISO()) errors.push('Date of hire is in the future.');
  }
  if (!p.flying) errors.push('Pick your typical flying.');
  if (p.lineValue) {
    const m = parseHours(p.lineValue);
    if (m == null || m <= 0) errors.push('Line value should be hours, like 72:30 or 72.5.');
    else p.lineValue = formatHours(m);
  }
  if (p.otherDed) {
    const c = parseMoney(p.otherDed);
    if (c == null || c < 0) errors.push('Other deductions should be a dollar amount.');
    else p.otherDed = (c / 100).toFixed(2);
  }
  for (const k of ['pretax', 'roth', 'aftertax', 'withholding']) {
    if (p[k] !== '' && (parsePct(p[k]) == null || parsePct(p[k]) > 100)) errors.push('Percentages should be numbers between 0 and 100.');
    else if (p[k] !== '') p[k] = String(parsePct(p[k]));
  }
  return { profile: p, errors: [...new Set(errors)] };
}

export function bindProfileForm(form) {
  const update = () => {
    const fd = new FormData(form);
    const mode = fd.get('ygMode') || 'doh';
    form.querySelectorAll('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== mode; });
    const hint = form.querySelector('[data-out="yg"]');
    const p = {
      seat: fd.get('seat'), fleet: fd.get('fleet'), ygMode: mode, doh: fd.get('doh'), yearGroup: Number(fd.get('yearGroup')) || 1,
    };
    const roleHint = form.querySelector('[data-out="role"]');
    if (roleHint) {
      const role = fd.get('role');
      const rctx = payContext(RULES, { seat: 'FO', fleet: 'WB', ygMode: 'pick', yearGroup: 1, role, roleYear: fd.get('roleYear') }, periodFromISO(todayISO()));
      const v = role ? rctx.rule.role.value : null;
      const table = role === 'ip' ? v?.ip : role === 'fps' ? v?.fps : v?.ca;
      const y = Math.min(4, Number(fd.get('roleYear')) || 1);
      roleHint.textContent = role ? `${formatMoney(Math.round((table[y - 1] + (role === 'sca' ? v.scaApdExtra : 0)) * 100))} per bid period on top of your line (${role === 'ip' ? 'Sec. 11.N.25.e' : role === 'fps' ? 'Sec. 9.E.2.a' : role === 'sca' ? 'Sec. 11.M.17.i + 11.M.29' : 'Sec. 11.M.17.i'}).` : '';
    }
    if (mode === 'doh' && !p.doh) { hint.textContent = ''; return; }
    const code = periodFromISO(todayISO());
    const ctx = payContext(RULES, { ...p, seat: p.seat || 'FO', fleet: p.fleet || 'WB' }, code);
    const who = p.seat && p.fleet ? `: ${formatMoney(ctx.rateCents)}/hr as a ${fleetName(ctx.fleet).toLowerCase()} ${seatName(ctx.seat)}` : '';
    hint.textContent = `Year group ${ctx.yg.yg} for the ${periodName(code)} bid period${who}.`;
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}

export function showErrors(form, errors) {
  const el = form.querySelector('[data-out="err"]');
  el.hidden = errors.length === 0;
  el.textContent = errors.join(' ');
  if (errors.length) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
