// Pay estimator: guarantee, trips, quick add-ons, the what-if slider, the checks,
// audit against a stub, and saved history. Inputs render once; figures refresh in place
// (elements marked data-out) so typing never loses focus.

import {
  todayISO, periodFromISO, periodName, periodIndex, shiftPeriod, formatDate, parseHours, parseMoney,
  formatHours as H, formatMoney as $, ruleAt,
} from '../core.js';
import { RULES } from '../../rules.js';
import { ROW_TYPES, ASSIGNMENTS, assignInfo, estimateNet, auditCheck, seatName, fleetName, payContext } from '../paymath.js';
import { parseRecap, recapToTrip, reconcileRecapTrip, fareCredit } from '../recap.js';
import { ensurePeriod, ensureDev, newTrip, newRow, newDutyPeriod } from '../store.js';
import {
  periodView, checkExplain, netExplain, rateExplain, guaranteeExplain, entryExplain, itemExplain, entryTitle,
  extrasLines, annualExplain, earnedExplain, monthShort,
} from '../view.js';
import { feedbackCard } from './feedback.js';
import { esc, seg, confirmPill, openSheet, toast, ICON } from '../ui.js';

const openTrips = new Set();
const viewCode = (app) => app.state.viewCode || periodFromISO(todayISO());

/* ----------------------------------------------------------------- outputs */

function itemsHTML(x, entry) {
  const notes = (entry.notes || []).map((n) => `<p class="note small">${esc(n)}</p>`).join('');
  if (!entry.items.length) return `<p class="muted small">${esc(entry.error || 'Enter hours to see the math.')}</p>${notes}`;
  return `<ul class="math">${entry.items.map((i) => `
    <li>
      <span class="m-label">${esc(i.label)}</span>
      <span class="m-text">${esc(i.text)}</span>
      ${i.kind === 'toward' ? '<span class="m-amt m-toward">toward guarantee</span>' : `<span class="m-amt">${x.money(i.cents, itemExplain(i), { mark: false })}</span>`}
    </li>`).join('')}</ul>${notes}`;
}

function tilesHTML(x, v) {
  const { checks, net, c, code, prevCode } = v;
  const tile = (key, cls, date, amt, n, what) => `
    <button type="button" class="tile ${cls}" data-x="${x.id(checkExplain(v, key))}">
      <span class="t-date">${esc(date)}</span>
      <span class="t-amt">${esc(amt)}</span>
      <span class="t-net">≈ ${esc(n)} net</span>
      <span class="t-what">${esc(what)}</span>
    </button>`;
  const nx = checks.next;
  const nextName = monthShort(shiftPeriod(code, 1));
  return `
    <div class="tiles">
      ${tile('mid', '', formatDate(checks.mid.date), $(checks.mid.grossCents), $(net.mid.netCents), `½ ${c.gLabel} + ${monthShort(prevCode)} extras`)}
      ${tile('end', '', formatDate(checks.end.date), $(checks.end.grossCents), $(net.end.netCents), `½ ${c.gLabel}`)}
      ${nx.full
        ? tile('next', 'tile-next is-full', formatDate(nx.date), $(nx.grossCents), $(net.next.netCents), `½ ${nextName} ${c.gLabel} + ${monthShort(code)} extras`)
        : tile('next', 'tile-next', formatDate(nx.date), $(nx.extrasCents, { sign: true }), $(net.next.netCents, { sign: true }), `${monthShort(code)} extras only`)}
    </div>
    <p class="lag">Anything above guarantee you earn in ${monthShort(code)} (drafts, overage, BKO, override, per diem) pays on the next 15th. So each 15th carries the bid period before it.</p>`;
}

function whatIfHTML(x, v, app) {
  const min = v.cur.whatIf || 0;
  if (!min) return `<div class="wi-amt">$0.00</div><p class="muted small">Slide or type draft hours at 150% and watch the ${formatDate(v.checks.next.date)} check move.</p>`;
  const n = estimateNet(v.c.whatIfCents, 0, app.state.profile, v.ctx, min);
  return `
    <div class="wi-amt">${x.money(v.c.whatIfCents, entryExplain(v.c.whatIf, 'What-if draft'), { sign: true, cls: 'num' })} <small>gross</small></div>
    <p class="wi-sub">≈ ${x.money(n.netCents, netExplain(n, v.c.whatIfCents, 0, 'What-if draft, est. net', v.ctx), { sign: true, mark: false })} net · lands on ${formatDate(v.checks.next.date, { year: true })}</p>`;
}

function guaranteeHTML(x, v) {
  const { c, ctx } = v;
  const notes = [];
  if (c.guarantee.belowMin) notes.push(`Below the ${H(c.guarantee.minMinutes)} minimum (4.A). Only right if trips were dropped with reduced or no pay.`);
  if (c.hasTrips) {
    const line = c.towardMin;
    notes.push(line > c.guarantee.minutes
      ? `Trips entered: ${H(line)} CH toward ${c.gLabel}. The ${H(line - c.guarantee.minutes)} above it pays on the next 15th.`
      : `Trips entered: ${H(line)} of ${H(c.guarantee.minutes)} CH toward ${c.gLabel}.`);
  }
  return `
    <p class="calc">${esc(c.guarantee.text)} = ${x.money(c.guarantee.cents, guaranteeExplain(c, ctx), { cls: 'num' })}</p>
    ${notes.map((n) => `<p class="note small">${esc(n)}</p>`).join('')}`;
}

function lastPeriodHTML(x, v) {
  const { p, prevP, prevCode, checks } = v;
  const presetOnly = prevP && prevP.trips.length === 0 && prevP.rows.length > 0 && prevP.rows.every((r) => r.preset);
  const lines = p ? extrasLines(p) : [];
  return `
    <div class="row-head"><h2>From ${periodName(prevCode)}</h2><span class="muted small">paid ${formatDate(checks.mid.date)}</span></div>
    ${lines.length ? `<ul class="ledger">${lines.map((l) => `<li><span>${esc(l.label)}</span>${x.money(l.cents, { title: l.label, lines: [l] }, { mark: false })}</li>`).join('')}
      <li class="sum"><span>Extras from ${monthShort(prevCode)}</span>${x.money(p.extrasCents, { title: `${periodName(prevCode)} extras`, lines, total: { label: 'Total', cents: p.extrasCents } }, { mark: false })}</li></ul>`
    : `<p class="muted">Nothing above guarantee entered for ${periodName(prevCode)}.</p>`}
    ${presetOnly ? `<p class="note small">This is a typical estimate. Open ${periodName(prevCode)} and enter what you actually flew.</p>` : ''}
    <button type="button" class="btn ghost small" data-act="goto" data-code="${prevCode}">Open ${periodName(prevCode)} ${ICON.right}</button>`;
}

function totalsHTML(x, v) {
  const { c, ctx, checks, net, code } = v;
  const entries = [...c.trips, ...c.rows, ...(c.whatIf ? [c.whatIf] : [])];
  const paidMonth = checks.mid.grossCents + checks.end.grossCents;
  const netMonth = net.mid.netCents + net.end.netCents;
  const bkoMin = c.trips.reduce((s, t) => s + (t.bkoMin || 0), 0);
  const bkoCents = c.trips.reduce((s, t) => s + t.items.filter((i) => i.label.startsWith('Block override') && i.kind === 'onTop').reduce((a, i) => a + i.cents, 0), 0);
  return `
    <h2>${periodName(code)} breakdown</h2>
    <ul class="ledger">
      <li><span>Guarantee (${c.gLabel}) ${H(c.guarantee.minutes)}</span>${x.money(c.guarantee.cents, guaranteeExplain(c, ctx), { mark: false })}</li>
      ${c.excess ? `<li><span>${esc(c.excess.label)}</span>${x.money(c.excess.cents, itemExplain(c.excess), { mark: false })}</li>` : ''}
      ${entries.map((e) => `<li><span>${esc(entryTitle(e))}</span>${e.totalCents || !e.error ? x.money(e.totalCents, entryExplain(e, entryTitle(e)), { mark: false }) : '<span class="muted small">incomplete</span>'}</li>`).join('')}
      <li class="sum"><span>${monthShort(code)} bid period earns</span>${x.money(c.earnedCents, earnedExplain(c, ctx), { mark: false })}</li>
    </ul>
    ${bkoMin ? `<p class="note small">Includes BKO of ${H(bkoMin)} CH across your trips${bkoCents ? ` (${$(bkoCents)} paid on top)` : ''}.</p>` : ''}
    <ul class="ledger">
      <li><span>Paid in ${monthShort(code)} (15th + last day)</span>${x.money(paidMonth, { title: `Paid in ${periodName(code)}`, lines: [{ label: formatDate(checks.mid.date), cents: checks.mid.grossCents }, { label: formatDate(checks.end.date), cents: checks.end.grossCents }], total: { label: 'Total', cents: paidMonth } }, { mark: false })}</li>
      <li><span>Annualized gross</span>${x.money(c.annualizedCents, annualExplain(c), { whole: true, mark: false })}</li>
      <li><span>Est. net, ${monthShort(code)} checks <em class="muted">rough</em></span>${x.money(netMonth, { title: `Est. net, ${periodName(code)} checks`, lines: [{ label: formatDate(checks.mid.date), cents: net.mid.netCents }, { label: formatDate(checks.end.date), cents: net.end.netCents }], total: { label: 'Total', cents: netMonth }, sources: [ctx.rule.dues, ctx.rule.assumptions, ctx.rule.veba] })}</li>
    </ul>`;
}

function auditHTML(x, v) {
  const { cur, c, p, checks, ctx } = v;
  const which = cur.audit?.check === 'end' ? 'end' : 'mid';
  const actual = parseMoney(cur.audit?.actual);
  if (actual == null) return '<p class="muted small">Type the gross from your stub to compare. It stays on this phone.</p>';
  const est = checks[which].grossCents;
  const parts = [{ label: `Half of ${c.gLabel}`, cents: checks[which].halfCents }, ...(which === 'mid' && p ? extrasLines(p) : [])];
  const a = auditCheck(actual, est, parts, ctx);
  if (a.verdict === 'match') return `<p class="good">Matches the estimate (${$(est)}) within $1.</p>`;
  const abs = Math.abs(a.diff);
  const head = `<p class="audit-diff ${a.diff < 0 ? 'alert' : ''}">Your stub is <b>${$(abs)} ${a.diff > 0 ? 'more' : 'less'}</b> than the estimate of ${$(est)}.</p>`;
  if (a.lineMatches.length) {
    const m = a.lineMatches[0];
    return `${head}<p>Likely cause: <b>${esc(m.label)}</b> (${$(m.cents)}). ${a.diff < 0 ? "It may not be on this stub yet, or wasn't paid." : 'It may be paid twice, or you have more of it than you entered.'}</p>`;
  }
  return `${head}<p class="small">No single line matches. The gap is about the same as:</p>
    <ul class="equiv">${a.equivalents.map((e) => `<li><b>${H(e.minutes)}</b> ${esc(e.what)}</li>`).join('')}</ul>`;
}

function historyHTML(x, app, v) {
  const st = app.state;
  const year = Number(todayISO().slice(0, 4));
  const saved = Object.keys(st.periods).filter((k) => st.periods[k].saved).sort((a, b) => periodIndex(b) - periodIndex(a));
  let ytd = 0;
  const ytdLines = [];
  const rows = saved.map((code) => {
    const pv = periodView(st, code, { create: false, whatIf: false });
    const paid = pv.checks.mid.grossCents + pv.checks.end.grossCents;
    if (Math.floor(periodIndex(code) / 12) === year) { ytd += paid; ytdLines.push({ label: `${periodName(code)} checks`, cents: paid }); }
    return `<li><button type="button" class="link" data-act="goto" data-code="${code}">${periodName(code)}</button>
      <span class="muted small">earned</span>${x.money(pv.c.earnedCents, earnedExplain(pv.c, pv.ctx), { mark: false })}</li>`;
  }).join('');
  const isSaved = v.cur.saved;
  return `
    <div class="row-head"><h2>History</h2>
      <button type="button" class="btn small ${isSaved ? 'ghost' : 'primary'}" data-act="save-period">${isSaved ? 'Saved · remove' : `Save ${periodName(v.code)}`}</button></div>
    ${saved.length ? `
      <p class="ytd">YTD gross ${year}: ${x.money(ytd, { title: `YTD gross ${year}`, lines: ytdLines, total: { label: 'Total', cents: ytd }, notes: ['Both checks of each saved bid period in this calendar year. Unsaved periods are not counted.'] }, { cls: 'num', mark: false })} <span class="muted small">(saved periods)</span></p>
      <ul class="ledger history">${rows}</ul>` : '<p class="muted small">Save bid periods to build a history and a year-to-date total.</p>'}`;
}

function outputs(app, v) {
  const x = app.x;
  x.reset();
  const { c, ctx } = v;
  const out = {
    rate: `${esc(fleetName(ctx.fleet))} ${esc(seatName(ctx.seat))} · Year ${ctx.yg.yg} · ${x.money(ctx.rateCents, rateExplain(ctx), { cls: 'num' })}/hr`,
    guarantee: guaranteeHTML(x, v),
    checks: tilesHTML(x, v),
    whatif: whatIfHTML(x, v, app),
    last: lastPeriodHTML(x, v),
    totals: totalsHTML(x, v),
    audit: auditHTML(x, v),
    history: historyHTML(x, app, v),
    hidden: c.payOnly && c.hiddenRowIds.length ? `<p class="note small">Pay-only bid period: ${c.hiddenRowIds.length === 1 ? 'one row is' : `${c.hiddenRowIds.length} rows are`} set aside: a pay-only line has no line flying of its own. Untick pay-only to bring ${c.hiddenRowIds.length === 1 ? 'it' : 'them'} back.</p>`
      : c.hiddenRowIds.length ? `<p class="note small">Per diem and override now come from your trips, so ${c.hiddenRowIds.length === 1 ? 'one manual row is' : `${c.hiddenRowIds.length} manual rows are`} set aside. Remove every trip to bring ${c.hiddenRowIds.length === 1 ? 'it' : 'them'} back.</p>` : '',
  };
  c.trips.forEach((t) => {
    const id = t.trip.id;
    out[`trip-title-${id}`] = esc(t.trip.label?.trim() || assignInfo(t.trip.assign, c.payOnly).label);
    out[`trip-meta-${id}`] = `${assignInfo(t.trip.assign, c.payOnly).short} · ${t.trip.intl ? 'Intl' : 'Dom'} · ${H(t.schedMin)} CH${t.bkoMin ? ` · BKO ${H(t.bkoMin)}` : ''}${t.overageMin ? ` · OVG ${H(t.overageMin)}` : ''}`;
    out[`trip-bko-${id}`] = `${t.bkoMin ? `BKO ${H(t.bkoMin)}` : t.bkoPending ? 'awaiting block-in' : 'none'}${t.autoOverageMin ? ` · overage ${H(t.autoOverageMin)}` : ''}`;
    out[`trip-sum-${id}`] = `${$(t.totalCents, { sign: true })}`;
    const rc = t.trip.recap;
    const recapNote = rc ? `<p class="note small">From recap${rc.tripNo ? ` ${esc(rc.tripNo)}` : ''}${rc.assignCode ? ` · ${esc(rc.assignCode)}` : ''}${rc.seat ? ` · ${esc(rc.seat)}` : ''}${rc.crew ? ` · ${esc(rc.crew)}` : ''}. ${(rc.notes || []).map(esc).join(' ')}</p>` : '';
    out[`trip-math-${id}`] = `${itemsHTML(x, t)}<p class="subtotal"><span>Adds on top of guarantee</span>${x.money(t.totalCents, entryExplain(t, entryTitle(t)), { mark: false })}</p>${recapNote}`;
  });
  c.rows.forEach((r) => { out[`row-math-${r.row.id}`] = itemsHTML(x, r); });
  return out;
}

/* ------------------------------------------------------------------ inputs */

const hoursInput = (field, value, placeholder, label) => `
  <label class="f"><span>${esc(label)}</span><input data-f="${field}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" inputmode="text" autocomplete="off" spellcheck="false"></label>`;

function periodSelect(code, current) {
  const opts = [[shiftPeriod(code, -1), 'last period'], [code, 'this period'], [shiftPeriod(code, 1), 'next period']];
  return `<label class="f"><span>Bid period</span><select data-f="period">${opts.map(([c, l]) => `<option value="${c}" ${c === current ? 'selected' : ''}>${periodName(c)} · ${l}</option>`).join('')}</select></label>`;
}

function dutyPeriodsHTML(t) {
  const dp = (d, i) => `
    <div class="dp" data-dp="${d.id}">
      <span class="dp-n">${i + 1}</span>
      <input data-dpf="credit" value="${esc(d.credit)}" placeholder="credit" aria-label="Duty period ${i + 1} scheduled credit" autocomplete="off" spellcheck="false">
      <input data-dpf="sched" value="${esc(d.sched)}" placeholder="sched" aria-label="Duty period ${i + 1} scheduled block" autocomplete="off" spellcheck="false">
      <input data-dpf="actual" value="${esc(d.actual)}" placeholder="actual" aria-label="Duty period ${i + 1} actual block" autocomplete="off" spellcheck="false">
      <button type="button" class="icon-btn dp-x" data-act="del-dp" aria-label="Remove duty period ${i + 1}">${ICON.close}</button>
    </div>`;
  return `
    <div class="dps">
      ${t.dps?.length ? `<div class="dp dp-head" aria-hidden="true"><span></span><span>Sched credit</span><span>Sched block</span><span>Actual block</span><span></span></div>` : ''}
      ${(t.dps || []).map(dp).join('')}
      <button type="button" class="btn small" data-act="add-dp">+ Duty period</button>
      <p class="hint">After block-in, enter actual block for each duty period. Add legs with +, e.g. 4:10+3:25. Sched credit is the duty period's credit from the pairing (leave blank if it equals block).</p>
      ${hoursInput('schedTafb', t.schedTafb, 'optional', 'Scheduled TAFB, for the trip-rig test (optional)')}
    </div>`;
}

function tripCard(t, code, payOnly = false) {
  const id = t.id;
  const open = openTrips.has(id);
  const bkoField = t.bkoMode === 'actual' ? 'actual' : 'bko';
  return `
  <article class="trip ${open ? 'open' : ''}" data-trip="${id}">
    <div class="trip-head" data-act="toggle-trip" role="button" tabindex="0" aria-expanded="${open}">
      <span class="trip-name"><span class="trip-title" data-out="trip-title-${id}"></span><span class="trip-meta" data-out="trip-meta-${id}"></span></span>
      <span class="trip-sum num" data-out="trip-sum-${id}"></span>
      ${ICON.chevron}
    </div>
    <div class="trip-body" ${open ? '' : 'hidden'}>
      <label class="f"><span>Label</span><input data-f="label" value="${esc(t.label)}" placeholder="e.g. MEM–ANC–HKG" autocomplete="off"></label>
      <div class="f"><span>Assignment</span>${payOnly
        ? seg(`assign-${id}`, [['line', 'M/U'], ['draft', 'VLT/DRF/AVA'], ['cmu', 'CMU'], ['pmu', 'PMU/SMU']], t.assign === 'reserve' ? 'line' : t.assign, { attrs: 'data-f="assign"', cls: 'seg-small' })
        : seg(`assign-${id}`, [['line', 'Line'], ['draft', 'VLT/DRF/AVA'], ['cmu', 'CMU'], ['pmu', 'PMU/SMU'], ['reserve', 'Rsv']], t.assign, { attrs: 'data-f="assign"', cls: 'seg-small' })}
        <p class="hint">${esc(assignInfo(t.assign, payOnly).label)}: ${esc(assignInfo(t.assign, payOnly).codes)}${payOnly ? '. Paid on top of your pay-only line.' : ''}</p></div>
      <div class="f"><span>Flying ${confirmPill}</span>${seg(`intl-${id}`, [['0', 'Domestic'], ['1', 'International']], t.intl ? '1' : '0', { attrs: 'data-f="intl"', cls: 'seg-small' })}</div>
      <div class="grid2">
        ${hoursInput('sched', t.sched, '30:00', 'Trip guarantee CH')}
        ${hoursInput('away', t.away, '96:00', 'Time away (TAFB)')}
      </div>
      <div class="f"><span>Block override (4.FF) <b class="bko-val" data-out="trip-bko-${id}"></b></span>
        ${seg(`bkoMode-${id}`, [['block', 'Block times'], ['actual', 'Actual credit'], ['bko', 'BKO hours']], t.bkoMode || 'bko', { attrs: 'data-f="bkoMode"', cls: 'seg-small' })}
        ${t.bkoMode === 'block' ? dutyPeriodsHTML(t) : `<input class="mt" data-f="${bkoField}" value="${esc(t[bkoField] ?? '')}" placeholder="${bkoField === 'actual' ? 'Actual credit (OSC), e.g. 32:15' : 'BKO CH, e.g. 2:15'}" autocomplete="off" spellcheck="false" aria-label="${bkoField === 'actual' ? 'Actual credit hours' : 'BKO credit hours'}">`}
      </div>
      <div class="grid2 align-end">
        ${hoursInput('overage', t.overage, '0:00', 'Overage CH')}
        <label class="check"><input type="checkbox" data-f="overageShort" ${t.overageShort ? 'checked' : ''}><span>2 hrs or less into days off</span></label>
      </div>
      <label class="check"><input type="checkbox" data-f="ulr" ${t.ulr ? 'checked' : ''}><span>ULR: a segment scheduled over 16 block hours</span></label>
      <div class="f" ${t.intl ? '' : 'hidden'}><span>Grid penalty events (4.EE)</span>
        <select data-f="gpeCount">${[[0, 'None'], [1, '1'], [2, '2'], [3, '3 or more']].map(([v, l]) => `<option value="${v}" ${Number(t.gpeCount) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="check mt"><input type="checkbox" data-f="gpeSame48" ${t.gpeSame48 ? 'checked' : ''}><span>All of them touch one 48-hour period</span></label>
      </div>
      ${periodSelect(code, code)}
      <div data-out="trip-math-${id}"></div>
      <div class="actions"><button type="button" class="btn ghost small" data-act="dup-trip">Duplicate</button><button type="button" class="btn ghost small danger" data-act="del-trip">Remove</button></div>
    </div>
  </article>`;
}

function rowCard(r, code, gMin) {
  const t = ROW_TYPES[r.type];
  let fields = '';
  const follows = r.auto === 'guarantee' && !(parseHours(r.hours) > 0);
  if (r.type === 'perdiem') fields = `<div class="grid2">${hoursInput('tafbDom', r.tafbDom, '0:00', 'Domestic TAFB')}${hoursInput('tafbIntl', r.tafbIntl, '0:00', 'International TAFB')}</div>`;
  else if (r.type === 'adjust') fields = `<div class="grid2"><label class="f"><span>Label</span><input data-f="label" value="${esc(r.label)}" placeholder="e.g. LCA pay" autocomplete="off"></label><label class="f"><span>Amount</span><input data-f="amount" value="${esc(r.amount)}" inputmode="decimal" placeholder="$0.00 or -50" autocomplete="off"></label></div>`;
  else if (r.type === 'other') fields = `<div class="grid2"><label class="f"><span>Label</span><input data-f="label" value="${esc(r.label)}" placeholder="e.g. Sim support" autocomplete="off"></label>${hoursInput('hours', r.hours, '0:00', 'Credit hours')}</div>`;
  else fields = hoursInput('hours', r.hours, r.auto === 'guarantee' ? `${H(gMin)} = your line value` : '0:00', 'Credit hours');
  return `
  <article class="addon" data-row="${r.id}">
    <div class="addon-head">
      <div><b>${esc(t?.label || r.type)}</b>${follows ? ' <span class="pill soft">Whole line</span>' : r.preset ? ' <span class="pill soft">Typical estimate</span>' : ''}<div class="muted small">${esc(follows ? 'Follows your line value. Type hours to change it.' : t?.hint || '')}</div></div>
      <button type="button" class="icon-btn" data-act="del-row" aria-label="Remove ${esc(t?.label || 'row')}">${ICON.close}</button>
    </div>
    ${fields}
    ${t?.gpe ? `<label class="check"><input type="checkbox" data-f="gpe" ${r.gpe ? 'checked' : ''}><span>3+ grid penalty events (+50%)</span></label>` : ''}
    <div data-out="row-math-${r.id}"></div>
    ${periodSelect(code, code)}
  </article>`;
}

const WHEN = [['before', 'Before day one', 'higher fare'], ['after', 'On or after', 'Established'], ['revised', 'Revised trip', 'higher fare']];

function faresHTML(r) {
  if (!r.fares?.length) return '';
  return `
    <div class="fares mt">
      <b>Deadhead fares</b>
      <p class="small muted">Tick the deadheads you're deviating from to credit your deviation bank.</p>
      ${r.fares.map((f, i) => `
        <label class="check fare"><input type="checkbox" data-fare="${i}">
          <span><b>${esc(f.org)}-${esc(f.dst)}</b> ${esc(f.airline)}${f.date ? ` · ${formatDate(f.date)}` : ''}<br>
          <small>Baseline ${$(f.baselineCents)} · Established ${$(f.establishedCents)}</small></span>
          <b class="num" data-fare-credit="${i}">${$(fareCredit(f, 'before'))}</b></label>`).join('')}
      <div class="f mt"><span>When you tell the company you're deviating</span>${seg('fare-when', WHEN, 'before', { attrs: 'data-fare-when', cls: 'seg-small' })}</div>
      <p class="hint">Sec. 8.C.2.b. Bid package deadhead: tell the company before the first day of the bid period the trip starts in and the bank gets the higher of the Baseline and Established Fare. On or after that day, the Established Fare. A revised trip, or one built after the package: the higher of the two.</p>
    </div>`;
}

function recapPreviewHTML(r, code) {
  const t = recapToTrip(r);
  const startCode = r.startDate ? periodFromISO(r.startDate) : code;
  const options = [...new Set([startCode, shiftPeriod(code, -1), code, shiftPeriod(code, 1)])];
  const trio = (o) => (o ? `${H(o.away)} / ${H(o.block)} / ${H(o.pay)}` : '—');
  const dh = r.legs.filter((l) => l.deadhead).length;
  return `
    <div class="recap-card">
      <b>${esc(t.label || 'Trip')}</b>
      <div class="muted small">${[r.startDate ? `Started ${formatDate(r.startDate, { year: true })}` : '', r.crewComplement, r.assignCode ? (ASSIGNMENTS[t.assign].label.includes(r.assignCode) ? ASSIGNMENTS[t.assign].label : `${r.assignCode} → ${ASSIGNMENTS[t.assign].label}`) : '', r.seat].filter(Boolean).map(esc).join(' · ')}</div>
      <ul class="ledger">
        <li><span>Legs</span><span>${r.legs.length}${dh ? ` (${dh} deadhead)` : ''} · ${r.dutyPeriods.length} duty period${r.dutyPeriods.length === 1 ? '' : 's'}</span></li>
        <li><span>Flying</span><span>${r.international ? `International (${esc(r.outside48.join(', '))})` : 'Domestic'}</span></li>
        <li><span>Scheduled away / block / pay</span><span class="num">${trio(r.scheduled)}</span></li>
        <li><span>Actual away / block / pay</span><span class="num">${trio(r.actual)}</span></li>
      </ul>
      <ul class="checks small">${t.recap.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      ${faresHTML(r)}
      <label class="f mt"><span>Add to bid period</span>
        <select data-recap-period>${options.map((c) => `<option value="${c}" ${c === startCode ? 'selected' : ''}>${periodName(c)}${c === startCode ? ' · trip start' : c === code ? ' · viewing' : ''}</option>`).join('')}</select></label>
      <button type="button" class="btn primary big mt" data-add-recap>Add trip</button>
    </div>`;
}

/* ------------------------------------------------------------------ screen */

export default {
  title: 'Pay',
  render(app) {
    const code = viewCode(app);
    const v = periodView(app.state, code);
    app.save();
    const out = outputs(app, v);
    const o = (k, tag = 'div', cls = '') => `<${tag} class="${cls}" data-out="${k}">${out[k] ?? ''}</${tag}>`;
    const cur = v.cur;
    const shownRows = cur.rows.filter((r) => !v.c.hiddenRowIds.includes(r.id));
    const isToday = code === periodFromISO(todayISO());

    const html = `
      <div class="period-nav">
        <button type="button" class="icon-btn" data-act="shift" data-n="-1" aria-label="Previous bid period">${ICON.left}</button>
        <div class="period-label">
          <div class="period-code">${code}</div>
          <div class="muted small">${periodName(code)} bid period${isToday ? ' · current' : ''}${cur.saved ? ' · saved' : ''}</div>
        </div>
        <button type="button" class="icon-btn" data-act="shift" data-n="1" aria-label="Next bid period">${ICON.right}</button>
      </div>
      ${o('rate', 'p', 'rate-line')}

      <section class="card">${o('checks')}
        <label class="f mt"><span>${periodName(v.nextCode)} line value <span class="muted">(optional, shows the whole ${formatDate(v.checks.next.date)} check)</span></span>
          <input data-p="nextGuarantee" value="${esc(app.state.periods[v.nextCode]?.guarantee || '')}" placeholder="e.g. 72:30" autocomplete="off" spellcheck="false"></label>
      </section>

      <section class="card whatif">
        <div class="row-head"><h2>What if I pick up a draft?</h2>
          <label class="wi-hours"><span>+</span><input class="wi-input num" data-p="whatIfTyped" inputmode="decimal" autocomplete="off" spellcheck="false" value="${cur.whatIf ? H(cur.whatIf) : ''}" placeholder="0:00" aria-label="Draft credit hours"><span>CH</span></label></div>
        <input type="range" min="0" max="2400" step="30" value="${Math.min(2400, cur.whatIf || 0)}" data-p="whatIf" aria-label="Draft hours to add">
        <div class="range-scale"><span>0</span><span>10</span><span>20</span><span>30</span><span>40 CH</span></div>
        ${o('whatif')}
      </section>

      <section class="card">
        <div class="row-head"><h2>Guarantee (${v.c.gLabel})</h2>${seg('weeks-p', [['4', '4 wk'], ['5', '5 wk'], ['6', '6 wk']], String(v.c.weeks), { attrs: 'data-p="weeks"', cls: 'seg-small seg-inline' })}</div>
        ${app.state.profile.role || cur.payOnly ? `<label class="check"><input type="checkbox" data-p="payOnly" ${cur.payOnly ? 'checked' : ''}><span>Pay-only line this bid period <small>instructional bid period</small></span></label>
        ${cur.payOnly ? `<p class="hint">Paid the ${v.c.gLabel} of your awarded pay-only line plus your instructor override. Trips you pick up (M/U, VLT/DRF/AVA, CMU, PMU) pay on top, with their per diem. Last bid period's per diem and extras still pay on the ${formatDate(v.checks.mid.date)} check (Sec. 11.N.25.b.i, 11.M.13.b).</p>` : ''}` : '<p class="hint">Instructor or check airman? <a href="#/settings">Turn it on in Settings</a> for your override and the pay-only line option.</p>'}
        <label class="f"><span>Your awarded ${cur.payOnly ? 'pay-only line ' : ''}${v.c.gLabel} (credit hours)</span>
          <input data-p="guarantee" value="${esc(cur.guarantee)}" placeholder="${v.c.guarantee.source === 'typical' ? `${esc(app.state.profile.lineValue)} typical` : `${H(v.c.guarantee.minMinutes)} minimum`}" autocomplete="off" spellcheck="false"></label>
        ${o('guarantee')}
      </section>

      <section class="card">
        <div class="row-head"><h2>Trips</h2>
          <span class="btn-pair"><button type="button" class="btn small" data-act="paste-recap">Paste recap</button><button type="button" class="btn small primary" data-act="add-trip">+ Add trip</button></span></div>
        <p class="muted small">${cur.payOnly ? 'Trips you pick up on top of your pay-only line: M/U, VLT/DRF/AVA, CMU, PMU/SMU.' : 'Optional, for exact math.'} Once you add a trip, per diem and override come from your trips.</p>
        <div class="trips">${cur.trips.map((t) => tripCard(t, code, !!cur.payOnly)).join('')}</div>
      </section>

      <section class="card">
        <div class="row-head"><h2>Quick add-ons</h2><button type="button" class="btn small" data-act="add-row">+ Add</button></div>
        <div class="addons">${shownRows.map((r) => rowCard(r, code, v.c.guarantee.minutes)).join('') ||'<p class="muted small">Drafts, reserve, overage, PMU, per diem, override and more.</p>'}</div>
        ${o('hidden')}
      </section>

      <section class="card">${o('last')}</section>
      <section class="card">${o('totals')}</section>

      <section class="card">
        <h2>Check a pay stub</h2>
        ${seg('audit-check', [['mid', `${formatDate(v.checks.mid.date)} check`], ['end', `${formatDate(v.checks.end.date)} check`]], cur.audit?.check || 'mid', { attrs: 'data-a="check"', cls: 'seg-small' })}
        <label class="f mt"><span>Gross on your stub</span><input data-a="actual" value="${esc(cur.audit?.actual || '')}" inputmode="decimal" placeholder="$0.00" autocomplete="off"></label>
        ${o('audit')}
      </section>

      <section class="card">${o('history')}</section>
      ${feedbackCard('Pay screen')}`;

    // Fill trip and row outputs (keys created per entry).
    return html.replace(/data-out="([^"]+)"><\/(\w+)>/g, (m, k, tag) => `data-out="${k}">${out[k] ?? ''}</${tag}>`);
  },

  mount(el, app) {
    const state = app.state;
    const code = viewCode(app);
    const period = () => ensurePeriod(state, code);
    const findTrip = (id) => period().trips.find((t) => String(t.id) === String(id));
    const findRow = (id) => period().rows.find((r) => String(r.id) === String(id));

    const refresh = () => {
      const v = periodView(state, code);
      const out = outputs(app, v);
      el.querySelectorAll('[data-out]').forEach((n) => { if (n.dataset.out in out) n.innerHTML = out[n.dataset.out]; });
      app.save();
    };
    const rerender = (focusSel) => {
      app.save();
      app.render({ keepScroll: true });
      if (focusSel) {
        const f = document.querySelector(focusSel);
        if (f) { f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      }
    };
    const moveTo = (kind, id, target) => {
      const p = period();
      const list = kind === 'trip' ? p.trips : p.rows;
      const i = list.findIndex((e) => String(e.id) === String(id));
      if (i < 0 || target === code) return;
      const [entry] = list.splice(i, 1);
      if (kind === 'row') entry.preset = false;
      const dest = ensurePeriod(state, target);
      (kind === 'trip' ? dest.trips : dest.rows).push(entry);
      toast(`Moved to ${periodName(target)}`);
      rerender();
    };

    const onField = (e, structural) => {
      const t = e.target;
      const f = t.dataset.f;
      const tripEl = t.closest('[data-trip]');
      const rowEl = t.closest('[data-row]');
      const dpEl = t.closest('[data-dp]');
      if (t.dataset.dpf && dpEl && tripEl) {
        const trip = findTrip(tripEl.dataset.trip);
        const d = trip?.dps?.find((x) => String(x.id) === dpEl.dataset.dp);
        if (d) { d[t.dataset.dpf] = t.value; refresh(); }
        return;
      }
      if (f && (tripEl || rowEl)) {
        const kind = tripEl ? 'trip' : 'row';
        const id = (tripEl || rowEl).dataset[kind];
        if (f === 'period') { moveTo(kind, id, t.value); return; }
        const entry = kind === 'trip' ? findTrip(id) : findRow(id);
        if (!entry) return;
        let val = t.type === 'checkbox' ? t.checked : t.value;
        if (f === 'intl') val = t.value === '1';
        if (f === 'gpeCount') val = Number(t.value);
        entry[f] = val;
        if (kind === 'row') entry.preset = false;
        if (['assign', 'intl', 'bkoMode'].includes(f)) { if (structural) rerender(); return; }
        refresh();
        return;
      }
      const pf = t.dataset.p;
      if (pf) {
        const p = period();
        if (pf === 'nextGuarantee') { ensurePeriod(state, shiftPeriod(code, 1)).guarantee = t.value; refresh(); return; }
        if (pf === 'payOnly') { p.payOnly = t.checked; if (structural) rerender(); return; }
        if (pf === 'whatIf') {
          p.whatIf = Number(t.value) || 0;
          const typed = el.querySelector('[data-p="whatIfTyped"]');
          if (typed) { typed.value = p.whatIf ? H(p.whatIf) : ''; typed.classList.remove('invalid'); }
        } else if (pf === 'whatIfTyped') {
          // Type any amount, H:MM or decimal; the slider follows up to its 40 CH end.
          const m = t.value.trim() === '' ? 0 : parseHours(t.value);
          const bad = m == null || m < 0;
          t.classList.toggle('invalid', bad);
          if (bad) return;
          p.whatIf = m;
          const slider = el.querySelector('[data-p="whatIf"]');
          if (slider) slider.value = String(Math.min(2400, m));
          if (structural) t.value = m ? H(m) : '';
        }
        else if (pf === 'weeks') { p.weeks = Number(t.value); if (structural) rerender(); return; }
        else p[pf] = t.value;
        refresh();
        return;
      }
      const af = t.dataset.a;
      if (af) {
        const p = period();
        p.audit = p.audit || { check: 'mid', actual: '' };
        p.audit[af] = t.value;
        refresh();
      }
    };
    el.addEventListener('input', (e) => onField(e, false));
    el.addEventListener('change', (e) => onField(e, true));
    el.addEventListener('focusout', (e) => {
      const t = e.target;
      if (!t.matches('input[data-f], input[data-dpf], input[data-p="guarantee"]') || ['label', 'amount'].includes(t.dataset.f)) return;
      const bad = t.value.trim() !== '' && parseHours(t.value) == null;
      t.classList.toggle('invalid', bad);
      t.setAttribute('aria-invalid', bad ? 'true' : 'false');
    });

    const act = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !el.contains(b)) return;
      const a = b.dataset.act;
      const p = period();
      if (a === 'shift') {
        state.viewCode = shiftPeriod(code, Number(b.dataset.n));
        app.save();
        app.render();
      } else if (a === 'goto') {
        state.viewCode = b.dataset.code;
        app.save();
        app.render();
      } else if (a === 'toggle-trip') {
        if (e.target.closest('.money')) return;
        const id = Number(b.closest('[data-trip]').dataset.trip);
        if (openTrips.has(id)) openTrips.delete(id); else openTrips.add(id);
        const card = b.closest('.trip');
        card.classList.toggle('open', openTrips.has(id));
        card.querySelector('.trip-body').hidden = !openTrips.has(id);
        b.setAttribute('aria-expanded', String(openTrips.has(id)));
      } else if (a === 'add-trip') {
        const t = newTrip(state, state.profile);
        p.trips.push(t);
        openTrips.add(t.id);
        rerender(`[data-trip="${t.id}"] input[data-f="label"]`);
      } else if (a === 'paste-recap') {
        openSheet('Paste a trip recap', `
          <p class="small muted">Copy the whole Trip Recap (or pairing) page and paste it here. It's read on this phone only. Names and employee numbers are ignored and never saved.</p>
          <textarea class="paste" rows="7" placeholder="Paste the recap text" aria-label="Recap text"></textarea>
          <div class="recap-preview"></div>`, (body, close) => {
          const ta = body.querySelector('textarea');
          const pv = body.querySelector('.recap-preview');
          let parsed = null;
          ta.addEventListener('input', () => {
            if (!ta.value.trim()) { pv.innerHTML = ''; return; }
            parsed = parseRecap(ta.value);
            if (!parsed.ok) { pv.innerHTML = '<p class="note small">No flight legs found in that text. Paste the full recap page.</p>'; return; }
            pv.innerHTML = recapPreviewHTML(parsed, code);
          });
          const when = () => pv.querySelector('[data-fare-when]:checked')?.value || 'before';
          pv.addEventListener('change', (ev) => {
            if (!ev.target.matches('[data-fare-when]') || !parsed?.fares) return;
            parsed.fares.forEach((f, i) => { const el = pv.querySelector(`[data-fare-credit="${i}"]`); if (el) el.textContent = $(fareCredit(f, when())); });
          });
          pv.addEventListener('click', (ev) => {
            if (!ev.target.closest('[data-add-recap]') || !parsed?.ok) return;
            const target = pv.querySelector('[data-recap-period]').value;
            const fields = reconcileRecapTrip(recapToTrip(parsed), payContext(RULES, state.profile, target));
            const trip = { ...fields, id: state.nextId++, dps: fields.dps.map((d) => ({ ...d, id: state.nextId++ })) };
            ensurePeriod(state, target).trips.push(trip);
            // Ticked deadhead fares go to the deviation bank, in the bid period of the deadhead's showtime (8.C.2.c).
            const dev = ensureDev(state);
            const w = when();
            let banked = 0;
            pv.querySelectorAll('[data-fare]:checked').forEach((cb) => {
              const f = parsed.fares[Number(cb.dataset.fare)];
              const cents = fareCredit(f, w);
              dev.entries.push({
                id: state.nextId++, kind: 'deadhead', code: f.date ? periodFromISO(f.date) : target, date: f.date || '',
                route: `${f.org}-${f.dst}`, fare: (cents / 100).toFixed(2), changed: false,
                baseline: (f.baselineCents / 100).toFixed(2), established: (f.establishedCents / 100).toFixed(2), notified: w,
                fromTrip: trip.recap?.tripNo || null,
              });
              banked += cents;
            });
            openTrips.add(trip.id);
            state.viewCode = target;
            close();
            app.save();
            toast(`Added ${trip.label || 'trip'} to ${periodName(target)}${banked ? `, ${$(banked)} to your deviation bank` : ''}`);
            app.render();
          });
        });
        setTimeout(() => document.querySelector('.sheet textarea')?.focus(), 50);
      } else if (a === 'add-dp') {
        const trip = findTrip(b.closest('[data-trip]').dataset.trip);
        trip.dps = trip.dps || [];
        const d = newDutyPeriod(state);
        trip.dps.push(d);
        rerender(`[data-dp="${d.id}"] input[data-dpf="credit"]`);
      } else if (a === 'del-dp') {
        const trip = findTrip(b.closest('[data-trip]').dataset.trip);
        const id = b.closest('[data-dp]').dataset.dp;
        trip.dps = (trip.dps || []).filter((d) => String(d.id) !== id);
        rerender();
      } else if (a === 'dup-trip') {
        const src = findTrip(b.closest('[data-trip]').dataset.trip);
        const t = { ...src, id: state.nextId++, label: src.label ? `${src.label} (copy)` : '', dps: (src.dps || []).map((d) => ({ ...d, id: state.nextId++ })) };
        p.trips.splice(p.trips.indexOf(src) + 1, 0, t);
        openTrips.add(t.id);
        rerender(`[data-trip="${t.id}"] input[data-f="label"]`);
      } else if (a === 'del-trip') {
        const id = b.closest('[data-trip]').dataset.trip;
        p.trips = p.trips.filter((t) => String(t.id) !== String(id));
        rerender();
      } else if (a === 'del-row') {
        const id = b.closest('[data-row]').dataset.row;
        p.rows = p.rows.filter((r) => String(r.id) !== String(id));
        rerender();
      } else if (a === 'add-row') {
        const list = Object.entries(ROW_TYPES)
          .filter(([k]) => !(p.trips.length && (k === 'perdiem' || k === 'override')))
          .filter(([k]) => !(p.payOnly && ruleAt(RULES, 'payOnlyLine', code).value.setAsideRows.includes(k)) && (k !== 'dayoff' || state.profile.role))
          .map(([k, t]) => `<button type="button" class="pick" data-type="${k}"><b>${esc(t.label)}</b><span class="muted small">${esc(t.hint)}</span></button>`).join('');
        openSheet('Add to this bid period', `<div class="picks">${list}</div>`, (body, close) => {
          body.addEventListener('click', (ev) => {
            const pick = ev.target.closest('[data-type]');
            if (!pick) return;
            const r = newRow(state, pick.dataset.type);
            p.rows.push(r);
            close();
            const first = r.type === 'perdiem' ? 'tafbDom' : r.type === 'adjust' || r.type === 'other' ? 'label' : 'hours';
            rerender(`[data-row="${r.id}"] input[data-f="${first}"]`);
          });
        });
      } else if (a === 'save-period') {
        p.saved = !p.saved;
        toast(p.saved ? `${periodName(code)} saved to history` : `${periodName(code)} removed from history`);
        refresh();
        el.querySelector('.period-label .muted').textContent = `${periodName(code)} bid period${code === periodFromISO(todayISO()) ? ' · current' : ''}${p.saved ? ' · saved' : ''}`;
      }
    };
    el.addEventListener('click', act);
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act="toggle-trip"]')) { e.preventDefault(); act(e); }
    });
  },
};
