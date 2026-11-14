// 401(k) cap tracker: where your elections land against the plan and IRS limits by December 31.
// Year to date comes from a pasted pay stub, figures you type, or an estimate from your bid periods.

import { formatMoney as $, formatDate, parseMoney, parsePct } from '../core.js';
import { k401View, AGE_BANDS } from '../k401.js';
import { esc, confirmPill, toast } from '../ui.js';
import { stubSummaryHTML, openStubSheet } from './stub-sheet.js';

const pctW = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const meter = (v, limit, over = false) => `<div class="meter ${over ? 'over' : ''}" role="img" aria-label="${pctW(v, limit)}% of limit"><span style="width:${pctW(v, limit)}%"></span></div>`;

function projExplain(v, key, label, ytd, end, extraNotes = []) {
  const rows = v.proj.rows.filter((r) => r[key]);
  return {
    title: label,
    lines: [
      { label: `Year to date (${v.source === 'stub' ? `stub of ${formatDate(v.stub.adviceDate)}` : v.source === 'typed' ? 'as typed' : 'estimated'})`, cents: ytd },
      ...rows.map((r) => ({ label: `${formatDate(r.date)} check`, text: key === 'company' ? `${v.limits.p.companyPct}% × ${$(r.companyBase)} of counted pay` : `on ${$(r.eligible)} eligible pay`, cents: r[key] })),
    ],
    total: { label: 'December 31', cents: end },
    sources: [v.limits.plan, v.limits.irs],
    notes: extraNotes,
  };
}

export default {
  title: '401(k)',
  render(app) {
    const v = k401View(app.state);
    const x = app.x;
    const L = v.limits;
    const irsMark = L.irs.verified ? '' : confirmPill;
    const y = v.ytd;
    const e = v.proj.end;
    const p = app.state.profile;
    const k = app.state.k401 || {};
    const src = v.source === 'stub' ? `Year to date from your ${formatDate(v.stub.adviceDate, { year: true })} stub`
      : v.source === 'typed' ? 'Year to date as you typed it' : 'Year to date estimated from your bid periods. Add a pay stub for real numbers.';
    const notes = [
      'Projection uses the app\'s estimate of each check left this year, less per diem.',
      'Pre-tax and Roth come out of all eligible pay, as the stubs show, even after the company contribution hits the compensation limit.',
    ];
    const row = (label, key, ytdC, endC, limitC, exNotes) => `
      <tr><th scope="row">${label}</th><td class="num">${$(ytdC, { whole: true })}</td>
        <td>${x.money(endC, projExplain(v, key, label, ytdC, endC, exNotes), { cls: 'num', whole: true, mark: false })}</td>
        <td class="num muted">${limitC != null ? $(limitC, { whole: true }) : ''}</td></tr>`;
    const ytdInput = (key, label, value) => `
      <label class="f"><span>${label}</span><input data-ytd="${key}" inputmode="decimal" value="${esc(k[key] || '')}" placeholder="${esc($(value))}" autocomplete="off"></label>`;
    return `
      <h1>401(k) ${v.year}</h1>
      <section class="card hero">
        <div class="row-head"><h2>Pre-tax + Roth by Dec 31</h2><span class="muted small">limit ${$(L.deferral, { whole: true })}${irsMark}</span></div>
        <div class="hero-amt">${x.money(e.deferral, projExplain(v, 'deferral', 'Pre-tax + Roth', y.deferral, e.deferral, notes), { cls: 'big', whole: true, mark: false })}</div>
        ${meter(e.deferral, L.deferral)}
        <div class="row-head mt"><span class="muted small">Total additions (415(c))</span><span class="num small">${$(e.counted, { whole: true })} of ${$(L.total, { whole: true })}</span></div>
        ${meter(e.counted, L.total, v.proj.overTotal > 0)}
        <ul class="flags">${v.flags.map((f) => `<li class="${f.tone === 'alert' ? 'alert' : ''}">${esc(f.text)}</li>`).join('')}</ul>
        <p class="small muted mt">${esc(src)}</p>
      </section>

      <section class="card">
        <h2>Year to date and December 31</h2>
        <table class="k-table">
          <thead><tr><th></th><th>So far</th><th>Dec 31</th><th>Limit</th></tr></thead>
          <tbody>
            ${row('Pre-tax + Roth', 'deferral', y.deferral, e.deferral, L.deferral, notes)}
            ${row('After-tax', 'after', y.after, e.after, null, notes)}
            ${row(`Company ${L.p.companyPct}%`, 'company', y.company, e.company, null, ['The company contribution counts pay up to the compensation limit (Code 401(a)(17)).'])}
            ${row('Company match', 'match', y.match, e.match, L.p.matchMax, ['50% of the first $1,000 of pre-tax + Roth per plan year.'])}
            <tr class="total"><th scope="row">Total additions</th><td class="num">${$(Math.min(y.deferral, L.deferralBase) + y.after + y.company + y.match, { whole: true })}</td><td class="num">${$(e.counted, { whole: true })}</td><td class="num muted">${$(L.total, { whole: true })}</td></tr>
          </tbody>
        </table>
        ${e.catchUp ? `<p class="small muted">${$(e.catchUp)} of that is catch-up, which doesn't count toward total additions.</p>` : ''}
        <p class="small muted">Eligible pay by Dec 31: ${$(e.eligible, { whole: true })} (compensation limit ${$(L.comp, { whole: true })}${irsMark}).</p>
      </section>

      <section class="card">
        <div class="row-head"><h2>Your numbers</h2><button type="button" class="btn small primary" data-act="paste-stub">Add pay stub</button></div>
        <div class="grid3">
          <label class="f"><span>Pre-tax</span><span class="suffix-wrap"><input data-prof="pretax" inputmode="decimal" value="${esc(p.pretax || '')}" placeholder="0"><i>%</i></span></label>
          <label class="f"><span>Roth</span><span class="suffix-wrap"><input data-prof="roth" inputmode="decimal" value="${esc(p.roth || '')}" placeholder="0"><i>%</i></span></label>
          <label class="f"><span>After-tax</span><span class="suffix-wrap"><input data-prof="aftertax" inputmode="decimal" value="${esc(p.aftertax || '')}" placeholder="0"><i>%</i></span></label>
        </div>
        <label class="f"><span>Age this year</span><select data-prof="ageBand">${Object.entries(AGE_BANDS).map(([val, l]) => `<option value="${val}" ${v.ageBand === val ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <details class="more" ${Object.keys(v.typed).length ? 'open' : ''}>
          <summary>Year to date figures <span class="muted">(${v.source === 'stub' ? 'from your stub' : 'type to override'})</span></summary>
          <div class="grid2">
            ${ytdInput('eligible', 'Eligible pay', y.eligible)}
            ${ytdInput('deferral', 'Pre-tax + Roth', y.deferral)}
            ${ytdInput('after', 'After-tax', y.after)}
            ${ytdInput('company', 'Company contribution', y.company)}
            ${ytdInput('match', 'Company match', y.match)}
          </div>
          ${Object.keys(v.typed).length ? '<button type="button" class="btn ghost small" data-act="clear-ytd">Clear typed figures</button>' : ''}
        </details>
      </section>

      ${v.stub ? `<section class="card"><div class="row-head"><h2>Latest stub</h2><span class="muted small">${(app.state.stubs || []).length} saved</span></div>${stubSummaryHTML(v.stub)}</section>` : ''}

      <section class="card">
        <h2>The rules used</h2>
        <ul class="bullets small">
          <li>Pre-tax and Roth up to ${L.p.pretaxRothMaxPct}% of eligible pay; after-tax up to ${L.p.aftertaxMaxPct}% (Sec. 28.D.14-15).</li>
          <li>Company contribution ${L.p.companyPct}% of eligible pay each pay period, subject to Code limits (Sec. 28.D.4.a, through 2027).</li>
          <li>Company match 50% of the first $1,000 of pre-tax + Roth, ${$(L.p.matchMax, { whole: true })} max (Sec. 28.D.3).</li>
          <li>IRS limits for ${v.year}: employee ${$(L.deferral, { whole: true })}, total additions ${$(L.total, { whole: true })}, compensation ${$(L.comp, { whole: true })} (${esc(L.irs.source)})${irsMark}.</li>
          <li>From 2028, company money a pilot in the cash balance plan or enhanced 401(k) can't put in because of the Code limits is paid in cash (Sec. 28.D.4.b).</li>
        </ul>
      </section>`;
  },
  mount(el, app) {
    const st = app.state;
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.prof) {
        const val = t.value.trim();
        if (t.dataset.prof !== 'ageBand' && val !== '' && (parsePct(val) == null || parsePct(val) > 100)) { toast('Enter a percentage'); return; }
        st.profile[t.dataset.prof] = t.dataset.prof === 'ageBand' ? val : val === '' ? '' : String(parsePct(val));
      } else if (t.dataset.ytd) {
        st.k401 = st.k401 || {};
        const c = parseMoney(t.value);
        if (t.value.trim() !== '' && (c == null || c < 0)) { toast('Enter a dollar amount'); return; }
        st.k401[t.dataset.ytd] = t.value.trim() === '' ? '' : (c / 100).toFixed(2);
      } else return;
      app.save();
      app.render({ keepScroll: true });
    });
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'paste-stub') openStubSheet(app);
      if (a === 'clear-ytd') { st.k401 = {}; app.save(); app.render({ keepScroll: true }); }
    });
  },
};
