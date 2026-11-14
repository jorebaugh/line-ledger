// Your answers, edited in Settings: three folded sections (You, Your line, Instructor or check airman)
// inside one form. Settings saves on every change. First-time setup has its own screen (intake.js).

import { RULES } from '../../rules.js';
import { todayISO, periodFromISO, periodName, formatMoney, parsePct, parseHours, formatHours, parseMoney } from '../core.js';
import { payContext, seatName, fleetName, ROLES } from '../paymath.js';
import { esc, seg, ICON } from '../ui.js';

// One line under each section's title, so the answer shows without opening it.
export function profileSummaries(p = {}) {
  const ctx = payContext(RULES, { ...p, seat: p.seat || 'FO', fleet: p.fleet || 'WB' }, periodFromISO(todayISO()));
  return {
    you: `${seatName(ctx.seat)} · ${fleetName(ctx.fleet)} · Year group ${ctx.yg.yg}`,
    line: `${p.line === 'reserve' ? 'Reserve' : 'Regular line'} · ${p.lineValue ? `${p.lineValue} CH` : 'minimum guarantee'} · mostly ${p.flying === 'international' ? 'international' : 'domestic'}`,
    role: p.role ? `${ROLES[p.role]} · Year ${Math.min(4, Number(p.roleYear) || 1)}${Number(p.roleYear) >= 4 ? '+' : ''}` : 'No',
  };
}

export function profileFormHTML(p = {}, openFolds = new Set()) {
  const ygMode = p.ygMode || 'doh';
  const ygOptions = Array.from({ length: 15 }, (_, i) => `<option value="${i + 1}" ${Number(p.yearGroup) === i + 1 ? 'selected' : ''}>Year group ${i + 1}</option>`).join('');
  const sum = profileSummaries(p);
  const fold = (key, title, body) => `
    <details class="card fold" data-fold="${key}" data-sec="${key}" ${openFolds.has(key) ? 'open' : ''}>
      <summary><span class="act-t"><b>${title}</b><small class="muted" data-sum="${key}">${esc(sum[key])}</small></span>${ICON.chevron}</summary>
      <div class="fold-body stack">${body}</div>
    </details>`;
  return `
  <form id="profile" novalidate autocomplete="off">
    ${fold('you', 'You', `
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
      <label class="f"><span>Age</span>
        <select name="ageBand">
          ${[['u50', 'Under 50'], ['50to59', '50 to 59'], ['60to63', '60 to 63'], ['64plus', '64+']].map(([v, l]) => `<option value="${v}" ${p.ageBand === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      <p class="hint">Age sets your 401(k) catch-up limit.</p>
      <fieldset class="field"><legend>Commuter</legend>
        ${seg('commuter', [['yes', 'Yes'], ['no', 'No']], p.commuter || 'no', { cls: 'seg-small' })}</fieldset>`)}

    ${fold('line', 'Your line', `
      <fieldset class="field"><legend>Line or reserve</legend>
        ${seg('line', [['regular', 'Regular line'], ['reserve', 'Reserve']], p.line || 'regular')}</fieldset>
      <label class="f"><span>Usual line value, in credit hours <span class="muted">(optional)</span></span>
        <input name="lineValue" value="${esc(p.lineValue || '')}" placeholder="Leave blank for the minimum" autocomplete="off" spellcheck="false"></label>
      <p class="hint">What your line is usually worth, like 72:30. Blank starts from the minimum guarantee.</p>
      <fieldset class="field"><legend>Usual bid period length</legend>
        ${seg('weeks', [['4', '4 weeks'], ['5', '5 weeks'], ['6', '6 weeks']], String(p.weeks || 4))}</fieldset>
      <fieldset class="field"><legend>Typical flying</legend>
        ${seg('flying', [['domestic', 'Mostly domestic'], ['international', 'Mostly international']], p.flying)}
        <p class="hint">A starting guess for per diem and override until you add trips.</p></fieldset>`)}

    ${fold('role', 'Instructor or check airman', `
      <label class="f"><span>Role</span>
        <select name="role"><option value="">No</option>${Object.entries(ROLES).map(([v, l]) => `<option value="${v}" ${p.role === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="f" data-role-year ${p.role ? '' : 'hidden'}><span>Year in the program</span>
        <select name="roleYear">${[[1, 'Year 1'], [2, 'Year 2'], [3, 'Year 3'], [4, 'Year 4 and above']].map(([v, l]) => `<option value="${v}" ${Number(p.roleYear || 1) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="hint" data-out="role"></p>`)}
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
      roleHint.textContent = role ? `${formatMoney(Math.round((table[y - 1] + (role === 'sca' ? v.scaApdExtra : 0)) * 100))} per bid period on top of your line (${role === 'ip' ? 'Sec. 11.N.25.e' : role === 'fps' ? 'Sec. 9.E.2.a' : role === 'sca' ? 'Sec. 11.M.17.i + 11.M.29' : 'Sec. 11.M.17.i'}). The Pay screen also gets a pay-only line option.` : 'Adds your bid period override and a pay-only line option on the Pay screen.';
      const yr = form.querySelector('[data-role-year]');
      if (yr) yr.hidden = !role;
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
