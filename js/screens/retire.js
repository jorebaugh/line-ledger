// Retirement election: the three paths side by side with your numbers and assumptions you can move.
// Arithmetic on Section 28 and the implementation LOA. Not a recommendation.

import { RULES } from '../../rules.js';
import { todayISO, periodFromISO, ruleAt, formatDate, daysBetween, formatMoney as $, parseMoney, parsePct } from '../core.js';
import { esc, confirmPill, toast, ICON } from '../ui.js';
import { retireCompare, PATHS, serviceFromDoh } from '../retire.js';
import { k401View } from '../k401.js';

const KEYS = Object.keys(PATHS);

// Slider assumptions: [key, label, min, max, step, rule key, hint]
const SLIDERS = [
  ['growth', 'Pay growth a year', 0, 8, 0.5, 'payGrowthPct', 'Raises, year-group steps and upgrades together.'],
  ['prsp', '401(k) return a year', 0, 10, 0.5, 'prspReturnPct', ''],
  ['cb', 'Cash balance interest a year', 0, 10, 0.5, 'cbInterestPct', 'The plan forecasts at least 6.5% a year over ten years (LOA B.1). Market-based, so it moves.'],
  ['discount', 'Rate used to value the pension', 1, 8, 0.25, 'discountPct', 'Turns the pension into a lump-sum figure so it can sit next to the accounts. Higher rate, smaller figure.'],
  ['payTo', 'Life expectancy (pension paid to age)', 70, 100, 1, 'payToAge', 'The pension pays for life, so this is the age you assume payments stop. It only sets the lump-sum value and the yearly figure. Assumes a single-life pension; joint-and-survivor options pay less a year (28.B.6) and are not modelled.'],
  ['limits', 'IRS limits rise a year after 2027', 0, 5, 0.5, 'limitGrowthPct', ''],
];

// Compact money for a three-column table on a phone; tap for the exact figure.
const short = (c, { sign = false } = {}) => {
  const d = Math.abs(c) / 100;
  const s = c < 0 ? '−' : sign && c > 0 ? '+' : '';
  if (d >= 999500) return `${s}$${(d / 1e6).toFixed(2)}M`;
  if (d >= 1000) return `${s}$${Math.round(d / 1000)}k`;
  return `${s}$${Math.round(d)}`;
};

function model(state) {
  const p = state.profile || {};
  const raw = state.retire || {};
  const A = ruleAt(RULES, 'retireAssumptions', 'JAN00');
  const today = todayISO();
  const year0 = Number(today.slice(0, 4));
  const k = k401View(state, { today });
  const def = {
    retireAge: A.value.retireAge,
    svc: serviceFromDoh(p.ygMode === 'doh' ? p.doh : ''),
    pay: Math.round(k.proj.end.eligible / 100),
    growth: A.value.payGrowthPct, prsp: A.value.prspReturnPct, cb: A.value.cbInterestPct,
    discount: A.value.discountPct, payTo: A.value.payToAge, limits: A.value.limitGrowthPct,
  };
  const num = (key) => (raw[key] !== undefined && String(raw[key]).trim() !== '' ? Number(raw[key]) : def[key]);
  const money = (key, fallback) => {
    const c = raw[key] !== undefined && String(raw[key]).trim() !== '' ? parseMoney(raw[key]) : null;
    return c != null ? c : fallback;
  };
  const payCents = money('pay', def.pay * 100);
  const inp = {
    year0,
    age: raw.age === undefined || String(raw.age).trim() === '' ? NaN : Number(raw.age),
    retireAge: num('retireAge'),
    svc: raw.svc !== undefined && String(raw.svc).trim() !== '' ? Number(raw.svc) : def.svc ?? NaN,
    payCents,
    best5Cents: money('best5', payCents),
    growthPct: num('growth'), prspPct: num('prsp'), cbPct: num('cb'), discountPct: num('discount'),
    payToAge: num('payTo'), limitGrowthPct: num('limits'),
    deferPct: (Number(p.pretax) || 0) + (Number(p.roth) || 0),
    afterPct: Number(p.aftertax) || 0,
  };
  return { raw, def, inp, A, k, view: retireCompare(inp) };
}

function explainers(x, m) {
  const v = m.view;
  const R = v.R;
  const rule = ruleAt(RULES, 'retirementElection', 'JUL26');
  const btn = (cents, ex, opts) => `<button type="button" class="money num" data-x="${x.id(ex)}">${esc(short(cents, opts))}</button>`;
  const cell = {};
  for (const key of KEYS) {
    const r = v.paths[key];
    const elect = key !== 'pension';
    const title = PATHS[key].label;
    cell[key] = {
      annual: btn(r.annual, {
        title: `${title}: pension a year`,
        lines: [
          { label: 'Final average earnings', text: `Best five calendar years ${$(r.faeRaw, { whole: true })}${r.faeRaw > r.faeCap ? `, capped at ${$(r.faeCap, { whole: true })}` : ''}`, cents: r.fae },
          { label: 'Credited years', text: elect ? `${m.inp.svc} on June 1, 2027 + 7/12 for the June 2027 to May 2028 plan year, then frozen` : `${m.inp.svc} on June 1, 2027 + service to the end of ${v.lastYear}${r.credited >= R.pension.maxYears ? `, max ${R.pension.maxYears}` : ''}`, cents: null },
          { label: 'Pension a year', text: `${$(r.fae, { whole: true })} × ${R.pension.multiplierPct}% × ${r.credited.toFixed(2)} years`, cents: r.annual },
        ],
        sources: [rule],
        notes: [
          elect ? 'Electing freezes credited years but final average earnings keep counting your later pay, up to $290,000 (28.B.13, LOA A.1).' : 'Staying: final average earnings up to $340,000 (28.B.3.a).',
          'Starts when you retire. Early retirement reductions are in the pension plan document, not the contract, and are not modelled.',
        ],
      }),
      lump: btn(r.lump, {
        title: `${title}: the pension as a lump sum`,
        lines: [
          { label: 'Pension a year', cents: r.annual },
          { label: 'Years paid', text: `Age ${v.retireAge} to ${m.inp.payToAge} (your life expectancy), at the start of each year`, cents: null },
          { label: 'Value at retirement', text: `${$(r.annual)} × ${v.factor.toFixed(2)} (discounted at ${m.inp.discountPct}%)`, cents: r.lump },
        ],
        sources: [m.A],
        notes: ['For comparison only. The pension pays monthly for life; this is what that stream is worth at the rate you picked.'],
      }),
      prsp: btn(r.prsp, {
        title: `${title}: 401(k) company money`,
        lines: r.byYear.map((b) => ({ label: `${b.year}`, text: `${b.pct}% of ${$(b.pay, { whole: true })}${b.inPlan < Math.round((b.pay * b.pct) / 100) ? ' (capped)' : ''} + match`, cents: b.inPlan + b.match })),
        total: { label: `At retirement, with ${m.inp.prspPct}% a year`, cents: r.prsp },
        sources: [rule, ruleAt(RULES, 'plan401k', 'JUL26'), ruleAt(RULES, 'irsLimits', 'JAN27')],
        notes: [
          'Company money only, from 2027 on. What you already have and your own contributions are the same on every path, so they are left out.',
          'Counts pay up to the compensation limit and stays under the total additions limit after your own pre-tax, Roth and after-tax elections.',
        ],
      }),
      cb: key === 'cb' ? btn(r.cb, {
        title: 'Cash balance account',
        lines: r.byYear.filter((b) => b.credit).map((b) => ({ label: `${b.year}`, text: `${b.year >= 2029 ? 10 : 9}% of ${$(Math.min(b.pay, v.rows.find((w) => w.year === b.year).irs.comp), { whole: true })}`, cents: b.credit })),
        total: { label: `At retirement, with ${m.inp.cbPct}% interest a year`, cents: r.cb },
        sources: [rule],
        notes: ['Credits start Jan 1, 2028: 9% of pay in 2028, 10% from 2029, plus market-based interest. Never pays back less than the credits (28.C.7, 28.C.9.a). Immediately vested for pilots who elect it.', 'Credits here count pay up to the compensation limit (28.E.4). Confirm with the plan.'],
      }) : '<span class="muted">—</span>',
      cash: btn(r.cash + r.bonus, {
        title: `${title}: cash paid over the caps`,
        lines: [
          ...(r.bonus ? [{ label: 'One-time payment, early 2028', text: '7/12 × (18% of 2027 pay − 9% of 2027 pay up to the compensation limit), for 25+ years on June 1, 2027', cents: r.bonus }] : []),
          ...r.byYear.filter((b) => b.cash).map((b) => ({ label: `${b.year}`, text: 'Company money that will not fit under the IRS limits', cents: b.cash })),
        ],
        total: { label: 'Paid to you, taxable as paid', cents: r.cash + r.bonus },
        sources: [rule],
        notes: [elect ? 'Paid through payroll or within 2½ months of year end, and taxed as pay (28.D.4.b, LOA A.1). Not in the total at retirement: it reaches you earlier.' : 'Pilots who stay in the pension get no cash for company money over the limits (28.D.4.b.i).'],
      }),
      total: btn(r.total, {
        title: `${title}: total at retirement`,
        lines: [
          { label: "Pension's lump-sum value", cents: r.lump },
          ...(key === 'cb' ? [{ label: 'Cash balance account', cents: r.cb }] : []),
          { label: '401(k) company money', cents: r.prsp },
        ],
        total: { label: 'Total', cents: r.total },
        sources: [rule, m.A],
        notes: ['Future dollars before tax, not adjusted for inflation.'],
      }),
      perYear: btn(r.perYear, {
        title: `${title}: as yearly income`,
        lines: [{ label: 'Total at retirement', cents: r.total }, { label: 'Spread over', text: `${v.payYears} years at ${m.inp.discountPct}%`, cents: null }],
        total: { label: 'A year', cents: r.perYear },
        sources: [m.A],
      }),
      diff: key === 'pension' ? '<span class="muted">—</span>' : btn(r.diff, {
        title: `${title} compared with staying`,
        lines: [{ label: PATHS[key].label, cents: r.total }, { label: PATHS.pension.label, cents: v.paths.pension.total }],
        total: { label: 'Difference', cents: r.diff },
        sources: [rule, m.A],
        notes: ['Moves with every assumption above. Not a recommendation.'],
      }, { sign: true }),
    };
  }
  return cell;
}

function resultsHTML(app, m) {
  const v = m.view;
  if (!v.ok) return `<section class="card"><h2>Side by side</h2><p class="note small">${v.errors.map(esc).join(' ')}</p></section>`;
  const c = explainers(app.x, m);
  const row = (label, k, cls = '') => `<tr class="${cls}"><th scope="row">${label}</th>${KEYS.map((p) => `<td>${c[p][k]}</td>`).join('')}</tr>`;
  const max = Math.max(...KEYS.map((p) => v.paths[p].total), 1);
  const w = (n) => `${Math.max(0, (n / max) * 100).toFixed(1)}%`;
  return `
    <section class="card">
      <div class="row-head"><h2>Side by side</h2><span class="muted small">retire end of ${v.lastYear}</span></div>
      <table class="k-table r-table">
        <thead><tr><th></th>${KEYS.map((p) => `<th>${esc(PATHS[p].short)}</th>`).join('')}</tr></thead>
        <tbody>
          ${row('Pension a year, for life', 'annual')}
          <tr><th scope="row">Credited years</th>${KEYS.map((p) => `<td class="num">${v.paths[p].credited.toFixed(1)}</td>`).join('')}</tr>
          ${row("Pension's value as a lump sum", 'lump')}
          ${row('Cash balance account', 'cb')}
          ${row('401(k) company money', 'prsp')}
          ${row('Total at retirement', 'total', 'total')}
          ${row('Compared with staying', 'diff')}
          ${row(`As yearly income to age ${m.inp.payToAge}`, 'perYear')}
          ${row('Cash paid over the caps <small>taxable, not in the total</small>', 'cash')}
        </tbody>
      </table>
      <div class="r-bars" aria-hidden="true">
        ${KEYS.map((p) => {
          const r = v.paths[p];
          return `<div class="r-bar"><span class="r-bar-label">${esc(PATHS[p].short)}</span><div class="r-track"><span class="s-pen" style="width:${w(r.lump)}"></span><span class="s-cb" style="width:${w(r.cb)}"></span><span class="s-k" style="width:${w(r.prsp)}"></span></div></div>`;
        }).join('')}
        <div class="r-key"><span><i class="s-pen"></i>Pension</span><span><i class="s-cb"></i>Cash balance</span><span><i class="s-k"></i>401(k) company</span></div>
      </div>
      <p class="small muted mt">Tap any figure to see how it was worked out. Future dollars before tax. Your own 401(k) money and what you've already saved are the same on every path, so they're left out.</p>
    </section>`;
}

const field = (key, label, value, { suffix = '', ph = '', mode = 'decimal' } = {}) => `
  <label class="f"><span>${label}</span>${suffix ? `<span class="suffix-wrap"><input data-r="${key}" inputmode="${mode}" value="${esc(value ?? '')}" placeholder="${esc(ph)}" autocomplete="off"><i>${suffix}</i></span>` : `<input data-r="${key}" inputmode="${mode}" value="${esc(value ?? '')}" placeholder="${esc(ph)}" autocomplete="off">`}</label>`;

const slider = (key, label, min, max, step, value, hint, unit = '%') => `
  <div class="slide">
    <div class="row-head"><span class="slide-label">${label}</span>${unit ? `<span class="suffix-wrap slide-num"><input data-r="${key}" inputmode="decimal" value="${esc(value)}" aria-label="${esc(label)}" autocomplete="off"><i>${unit}</i></span>` : `<span class="slide-num"><input data-r="${key}" inputmode="numeric" value="${esc(value)}" aria-label="${esc(label)}" autocomplete="off"></span>`}</div>
    <input type="range" data-r="${key}" min="${min}" max="${max}" step="${step}" value="${esc(value)}" aria-label="${esc(label)}">
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
  </div>`;

const openFolds = new Set(); // folded sections the user opened

export default {
  title: 'Retirement',
  render(app) {
    const st = app.state;
    const p = st.profile || {};
    const today = todayISO();
    const ret = ruleAt(RULES, 'retirementElection', periodFromISO(today)).value;
    const dOpen = daysBetween(today, ret.window.from);
    const hiredAfter = p.ygMode === 'doh' && p.doh && p.doh >= ret.eligibleHiredBefore;
    const m = model(st);
    const raw = m.raw;
    const val = (k) => (raw[k] !== undefined && String(raw[k]).trim() !== '' ? raw[k] : m.def[k] ?? '');

    return `
      <h1>Retirement election</h1>
      <section class="card">
        <div class="row-head"><h2>Key dates</h2>${hiredAfter ? '<span class="pill">Hired after Jun 29, 2026</span>' : ''}</div>
        <p class="countdown"><span class="num">${Math.max(0, dOpen)}</span> days until the window opens</p>
        <ul class="dates">
          <li><span>Packets</span><span>${formatDate(ret.packets.from)}–${formatDate(ret.packets.to, { year: true })}</span></li>
          <li><span>Election window</span><span>${formatDate(ret.window.from)}–${formatDate(ret.window.to, { year: true })}</span></li>
          <li><span>Confirmation by</span><span>${formatDate(ret.confirmationBy, { year: true })}</span></li>
          <li><span>Pension service frozen (if you leave it)</span><span>${formatDate(ret.freezeDate, { year: true })}</span></li>
        </ul>
        <p class="note small mt">The company will provide its own modeling tool during the window. This is a rough preview of the trade-offs, not a recommendation.</p>
        ${hiredAfter ? '<p class="small">Hired on or after June 29, 2026: you\'re in the cash balance plan from the start (28.C.6.b), so there\'s no election to make. The comparison below is for pilots hired before that date.</p>' : '<p class="small muted">No choice made means you stay in the pension (LOA A.1).</p>'}
      </section>

      <section class="card">
        <h2>Your numbers</h2>
        <div class="grid2">
          ${field('age', 'Your age now', raw.age, { ph: 'e.g. 48', mode: 'numeric' })}
          ${field('svc', 'Credited years on Jun 1, 2027', val('svc'), { ph: 'e.g. 18.5' })}
        </div>
        ${m.def.svc != null ? `<p class="hint">${raw.svc ? 'Yours as typed.' : `From your date of hire: ${m.def.svc} years.`} Leaves and furloughs make credited service lower; your pension statement has the real figure.</p>` : ''}
        ${slider('retireAge', 'Retire at age', 50, ret.regulatedAge, 1, val('retireAge'), `Retire at the end of the year you reach this age. ${ret.regulatedAge} is the regulated age.`, '')}
        <div class="grid2">
          ${field('pay', `${m.inp.year0} pay, less per diem`, raw.pay ? raw.pay : '', { ph: $(m.def.pay * 100, { whole: true }) })}
          ${field('best5', 'Best five-year average so far', raw.best5 || '', { ph: $(m.inp.payCents, { whole: true }) })}
        </div>
        <p class="hint">Pay is pre-filled from the 401(k) tracker's ${m.k.source === 'stub' ? 'stub-based' : ''} estimate for ${m.inp.year0}. The best five-year average is your five highest calendar years; blank uses this year's pay. Your 401(k) elections (${m.inp.deferPct}% pre-tax + Roth, ${m.inp.afterPct}% after-tax) come from Settings.</p>
      </section>

      <div id="ret-out">${resultsHTML(app, m)}</div>

      <details class="card fold" data-fold="assume" ${openFolds.has('assume') ? 'open' : ''}>
        <summary><span class="act-t"><b>Change the assumptions</b><small class="muted">Pay growth, returns, life expectancy</small></span>${ICON.chevron}</summary>
        <div class="fold-body">
        ${SLIDERS.map(([k, label, min, max, step, , hint]) => slider(k, label, min, max, step, val(k), hint, k === 'payTo' ? '' : '%')).join('')}
        <button type="button" class="btn ghost small" data-act="reset-ret">Back to the starting assumptions</button>
        </div>
      </details>

      <details class="card fold" data-fold="how" ${openFolds.has('how') ? 'open' : ''}>
        <summary><span class="act-t"><b>How it's worked out</b><small class="muted">The contract sections behind each number</small></span>${ICON.chevron}</summary>
        <ul class="bullets small fold-body">
          <li><b>Stay in the pension:</b> final average earnings (best five calendar years, up to $340,000) × 2% × credited years, max 25 (28.B.2-3). Company 401(k) 9%, subject to IRS limits, with no cash over them (28.D.4.b.i).</li>
          <li><b>Electing either new option:</b> credited years freeze; the June 2027 to May 2028 plan year counts 7/12. Final average earnings keep counting later pay, up to $290,000 (28.B.13, LOA A.1).</li>
          <li><b>Cash balance plan:</b> from Jan 1, 2028, 9% of pay in 2028 and 10% from 2029, plus market-based interest. Normal retirement age 62 (28.C.7-8). Credits counted on pay up to the compensation limit ${confirmPill}. Company 401(k) stays 9%.</li>
          <li><b>Enhanced 401(k):</b> company 401(k) 18% in 2028, 19% from 2029 (28.D.4.b.iii).</li>
          <li>If you elect, company 401(k) money that won't fit under the compensation limit or the total additions limit is paid to you as taxable cash (28.D.4.b.ii-iii). Your own elections are counted first against total additions ${confirmPill}.</li>
          <li>25 or more credited years on June 1, 2027 and electing: a one-time payment of 7/12 × (18% of 2027 pay − 9% of 2027 pay up to the compensation limit), early in 2028 (LOA A.1.a.vi).</li>
          <li>IRS limits are the published ${m.inp.year0 >= 2027 ? m.inp.year0 : 2027} figures (IRS Notice 2026-66), then grown at your assumption.</li>
          <li>Not modelled: early retirement reductions, the pre-2006 multipliers (28.B.4), the flat-dollar formula, Flying Tiger benefits, taxes and inflation.</li>
        </ul>
      </details>`;
  },

  mount(el, app) {
    el.addEventListener('toggle', (e) => {
      const k = e.target.dataset?.fold;
      if (k) { if (e.target.open) openFolds.add(k); else openFolds.delete(k); }
    }, true);
    const st = app.state;
    const refresh = () => {
      const out = el.querySelector('#ret-out');
      if (out) out.innerHTML = resultsHTML(app, model(st));
    };
    const onField = (e, final) => {
      const t = e.target;
      const k = t.dataset.r;
      if (!k) return;
      st.retire = st.retire || {};
      let v = t.value.trim();
      const isMoney = k === 'pay' || k === 'best5';
      if (v !== '') {
        const n = isMoney ? parseMoney(v) : parsePct(v);
        const bad = n == null || n < 0;
        t.classList.toggle('invalid', bad);
        if (bad) { if (final) toast(isMoney ? 'Enter a dollar amount' : 'Enter a number'); return; }
        v = isMoney ? (n / 100).toFixed(0) : String(n);
      } else t.classList.remove('invalid');
      st.retire[k] = v;
      // Keep the slider and its number box together.
      el.querySelectorAll(`[data-r="${k}"]`).forEach((n) => { if (n !== t && v !== '') n.value = v; });
      refresh();
      if (final) app.save();
    };
    el.addEventListener('input', (e) => onField(e, false));
    el.addEventListener('change', (e) => onField(e, true));
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="reset-ret"]')) {
        const keep = st.retire || {};
        st.retire = { age: keep.age, svc: keep.svc, pay: keep.pay, best5: keep.best5 };
        app.save();
        app.render({ keepScroll: true });
      }
    });
  },
};
