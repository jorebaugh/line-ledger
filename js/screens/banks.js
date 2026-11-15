// Deviation bank and hotel (HAC) bank. One screen, two tabs.

import { RULES } from '../../rules.js';
import {
  todayISO, periodFromISO, periodName, shiftPeriod, ruleAt, parseMoney, formatDate, formatMoney as $,
} from '../core.js';
import { simulateBanks, parseDeviationPaste, compareDeviationPaste } from '../banks.js';
import { ensureDev } from '../store.js';
import { esc, seg, confirmPill, openSheet, toast, ICON } from '../ui.js';

const CATEGORIES = [
  ['airfare', 'Airfare'],
  ['seatFee', 'Seat selection fee'],
  ['surface', 'Surface transport, other vendor'],
  ['hotel', 'Hotel'],
  ['parking', 'Parking'],
  ['other', 'Other'],
];
const catName = (k) => (CATEGORIES.find((c) => c[0] === k) || [k, k])[1];

export function bankSnapshot(state, code) {
  const dev = ensureDev(state);
  return simulateBanks({ entries: dev.entries, imported: dev.imported, hotel: dev.hotel, hotelLegacy: dev.hotelLegacy }, RULES, code);
}

const viewCode = (dev) => dev.viewCode || periodFromISO(todayISO());

const openFolds = new Set(); // folded sections the user opened
const fold = (key, title, sub, body, forceOpen = false) => `
  <details class="card fold" data-fold="${key}" ${forceOpen || openFolds.has(key) ? 'open' : ''}>
    <summary><span class="act-t"><b>${title}</b><small class="muted">${sub}</small></span>${ICON.chevron}</summary>
    <div class="fold-body">${body}</div>
  </details>`;

/* ------------------------------------------------------------- deviation */

function balanceLine(b) {
  if (b.kind === 'legacy') {
    return `<li><span><b>From ${b.fromCode}</b>${b.imported ? ' <span class="pill soft">company</span>' : ''}<small>Halves each bid period: ${$(b.nextValueCents)} next</small></span><span class="num">${$(b.valueCents)}</span></li>`;
  }
  const more = b.age === 0 ? b.periodsLeft - 1 : b.periodsLeft - 1;
  const when = b.age === 0
    ? `Carries into the next ${more} bid period${more === 1 ? '' : 's'}, through ${periodName(b.lastUsable)}`
    : b.periodsLeft <= 1 ? 'Last bid period to use it'
      : `Usable this and ${more} more bid period${more === 1 ? '' : 's'}, through ${periodName(b.lastUsable)}`;
  return `<li class="${b.periodsLeft <= 1 ? 'warn' : ''}"><span><b>From ${b.fromCode}</b>${b.converted ? ' <span class="pill soft">converted</span>' : ''}<small>${when}. Then ${$(b.toHotelCents)} moves to the hotel bank.</small></span><span class="num">${$(b.valueCents)}</span></li>`;
}

function flags(rec, code, devRule) {
  const out = [];
  if (!rec) return out;
  if (rec.imported) out.push(['', `Balance for ${code} comes from the pasted company screen.`]);
  for (const e of rec.expired) out.push(['alert', `${e.fromCode} balance of ${$(e.cents)} ran past three extra bid periods: ${$(e.toHotelCents)} moved to the hotel bank, ${$(e.droppedCents)} dropped.`]);
  if (rec.usedFromLots.length) out.push(['', `Over this period's bank by ${$(rec.spendCents - rec.bankCents)}. Covered from earlier balances, oldest first: ${rec.usedFromLots.map((u) => `${u.fromCode} ${$(u.cents)}`).join(', ')}.`]);
  if (rec.hotelUsedCents) out.push(['', `${$(rec.hotelUsedCents)} came from the hotel bank (up to $7,500 a bid period).`]);
  if (rec.outOfPocketCents) out.push(['alert', `${$(rec.outOfPocketCents)} is above everything available. That's on you${rec.paidBackLaterCents ? `, though ${$(rec.paidBackLaterCents)} was paid back by the next bid period's leftover` : ' unless next bid period\'s leftover covers it'}.`]);
  if (rec.paidBackPriorCents) out.push(['', `${$(rec.paidBackPriorCents)} of this period's leftover paid back last bid period's overspend first (8.C.2.a.ii).`]);
  for (const c of rec.capped) out.push(['', `${catName(c.category)} of ${$(c.cents)} counts as ${$(c.allowedCents)}: capped at ${$(c.capCents)} ${c.category === 'seatFee' ? 'per positioning sequence' : 'per occurrence'}.`]);
  for (const n of rec.notes) out.push(['', n]);
  if (!out.length && (rec.bankCents || rec.carriedInCents)) {
    out.push(['', devRule.model === 'carryThenHotel'
      ? 'Unused balance stays intact three more bid periods, then 50% moves to the hotel bank.'
      : 'Old rule for this bid period: unused balance halves each bid period it carries.']);
  }
  return out;
}

function deviationTab(app, dev, code, sim) {
  const x = app.x;
  const rec = sim.periods.get(code);
  const devRule = ruleAt(RULES, 'deviationBank', code);
  const mine = dev.entries.filter((e) => e.code === code);
  const dhs = mine.filter((e) => e.kind === 'deadhead');
  const exps = mine.filter((e) => e.kind === 'expense');
  const bank = rec?.bankCents ?? 0;
  const carried = rec?.carriedInCents ?? 0;
  const spent = rec?.spendCents ?? 0;
  const remaining = rec?.remainingCents ?? 0;
  const over = rec?.outOfPocketCents ?? 0;
  const capOf = (id) => rec?.capped.find((c) => c.id === id);

  const ex = (title, lines, total, note) => ({ title, lines, total, notes: note ? [note] : [], sources: [devRule] });
  const bankEx = ex('Bank this bid period', dhs.map((d) => ({ label: d.route || 'Deadhead', text: d.date ? formatDate(d.date, { year: true }) : '', cents: parseMoney(d.fare) || 0 })), { label: 'Bank', cents: bank }, 'Fares for scheduled commercial deadheads credited to this bid period (8.C.2.a.i).');
  const carriedEx = ex('Carried in', (rec?.carriedIn || []).map((b) => ({ label: `From ${b.fromCode}`, text: b.kind === 'legacy' ? `÷ ${b.divisor}` : `usable through ${b.lastUsable}`, cents: b.valueCents })), { label: 'Carried in', cents: carried });
  const spentEx = ex('Spent', exps.map((e) => ({ label: e.desc || catName(e.category), text: catName(e.category) + (capOf(e.id) ? `, capped at ${$(capOf(e.id).capCents)}` : ''), cents: capOf(e.id)?.allowedCents ?? (parseMoney(e.amount) || 0) })), { label: 'Spent', cents: spent });
  const remEx = ex('Remaining', (rec?.balances || []).map((b) => ({ label: `From ${b.fromCode}`, cents: b.valueCents })), { label: 'Remaining', cents: remaining });
  // Warnings stay up top with the number; the plain "how the rules applied" notes go in the fold.
  const allFlags = flags(rec, code, devRule.value);
  const alerts = allFlags.filter(([c]) => c === 'alert');
  const notes = allFlags.filter(([c]) => c !== 'alert');

  return `
    <div class="period-nav">
      <button type="button" class="icon-btn" data-act="shift" data-n="-1" aria-label="Previous bid period">${ICON.left}</button>
      <div class="period-label"><div class="period-code">${code}</div><div class="muted small">${periodName(code)} bid period</div></div>
      <button type="button" class="icon-btn" data-act="shift" data-n="1" aria-label="Next bid period">${ICON.right}</button>
    </div>
    <p class="rate-line">${devRule.value.model === 'carryThenHotel' ? 'New rule: balance stays 3 more bid periods, then 50% to hotel bank' : 'Old rule: unused balance halves each bid period'}</p>

    <section class="card hero">
      <div class="eyebrow">${over ? 'Over your bank this bid period' : 'Left to spend this bid period'}</div>
      <div class="hero-amt">${over ? `<span class="money big alert-text" style="text-decoration:none;cursor:default">${$(over)}</span>` : x.money(remaining, remEx, { cls: 'big', mark: false })}</div>
      <p class="hero-sub">${over ? 'Above your bank, earlier balances and the hotel bank.' : `Bank ${$(bank)} + carried in ${$(carried)} − spent ${$(spent)}`}</p>
      ${alerts.length ? `<ul class="flags">${alerts.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul>` : ''}
      <button type="button" class="btn primary big wide mt" data-act="add-dh">Add a deadhead</button>
      <p class="hint center">A scheduled commercial deadhead puts its fare in your bank.</p>
      <button type="button" class="btn wide" data-act="add-ex">Add an expense</button>
      <p class="hint center">What you spent getting to or from the trip.</p>
    </section>

    <section class="card">
      <h2>Deadheads</h2>
      ${dhs.length ? `<ul class="entries">${dhs.map((d) => `
        <li data-entry="${d.id}">
          <span><b>${esc(d.route || 'Deadhead')}</b><small>${d.date ? formatDate(d.date, { year: true }) : ''}</small>
          ${d.notified ? `<small class="note-inline">${d.notified === 'after' ? 'Established Fare: told the company on or after day one of the bid period' : d.notified === 'revised' ? 'Higher of Baseline and Established: revised trip' : 'Higher of Baseline and Established: told the company before day one'}${d.fromTrip ? ` · trip ${esc(d.fromTrip)}` : ''} (8.C.2.b)</small>` : ''}
          ${d.changed ? '<small class="note-inline">Company changed or cancelled this deadhead: the bank money stays (8.C.2.d).</small>' : ''}</span>
          <span class="num">${$(parseMoney(d.fare) || 0)}</span>
          <button type="button" class="icon-btn" data-act="del-entry" aria-label="Remove">${ICON.close}</button>
        </li>`).join('')}</ul>` : '<p class="muted small">None added for this bid period.</p>'}
    </section>

    <section class="card">
      <h2>Expenses</h2>
      ${exps.length ? `<ul class="entries">${exps.map((e) => {
        const c = capOf(e.id);
        return `<li data-entry="${e.id}">
          <span><b>${esc(e.desc || catName(e.category))}</b><small>${esc(catName(e.category))}${e.date ? ` · ${formatDate(e.date, { year: true })}` : ''}</small>
          ${c ? `<small class="note-inline">Counts as ${$(c.allowedCents)} (cap ${$(c.capCents)})</small>` : ''}</span>
          <span class="num">${$(parseMoney(e.amount) || 0)}</span>
          <button type="button" class="icon-btn" data-act="del-entry" aria-label="Remove">${ICON.close}</button>
        </li>`;
      }).join('')}</ul>` : '<p class="muted small">None added for this bid period. Airfare, seat fees, surface transport, hotel and parking all count.</p>'}
    </section>

    ${fold('math', 'How the number adds up', 'Bank, carried in, spent', `
      <dl class="kv">
        <div><dt>Bank this bid period</dt><dd>${x.money(bank, bankEx, { cls: 'num' })}<small>${dhs.length} deadhead${dhs.length === 1 ? '' : 's'} credited</small></dd></div>
        <div><dt>Carried in</dt><dd>${x.money(carried, carriedEx, { cls: 'num' })}<small>From earlier bid periods</small></dd></div>
        <div><dt>Spent</dt><dd>${x.money(spent, spentEx, { cls: 'num' })}<small>Allowable, after caps</small></dd></div>
        <div class="${over ? 'is-alert' : ''}"><dt>${over ? 'Over, on you' : 'Remaining'}</dt><dd>${over ? `<span class="num alert-text">${$(over)}</span>` : x.money(remaining, remEx, { cls: 'num' })}<small>${over ? 'Above bank, balances and hotel bank' : 'Bank + carried − spent'}</small></dd></div>
      </dl>
      ${notes.length ? `<ul class="flags">${notes.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul>` : ''}`)}

    ${rec?.balances?.length ? fold('balances', 'What carries forward', `${rec.balances.length} balance${rec.balances.length === 1 ? '' : 's'} after ${code}`, `<ul class="ledger bal">${rec.balances.map(balanceLine).join('')}</ul>`) : ''}

    ${fold('paste', 'Check against the company screen', dev.imported ? `Using ${dev.imported.rows.length} pasted balance${dev.imported.rows.length === 1 ? '' : 's'}` : 'Paste the Deviation Bank Allocation view', `
      ${dev.imported ? `<p class="note small">Using ${dev.imported.rows.length} pasted balance${dev.imported.rows.length === 1 ? '' : 's'} (company screen as of ${dev.imported.asOf || 'unknown'}). <button type="button" class="link" data-act="clear-import">Clear</button></p>` : ''}
      <p class="muted small">Copy the Deviation Bank Allocation view and paste it here. Read on this phone only.</p>
      <textarea class="paste" data-paste rows="5" placeholder="FEB26  $2,384.52  256  $9.32" aria-label="Company deviation screen text"></textarea>
      <div data-out="paste"></div>`)}`;
}

function pasteResult(text, code) {
  if (!text.trim()) return '';
  const parsed = parseDeviationPaste(text);
  if (!parsed.rows.length) return `<p class="note small">No rows with an amount found.${parsed.skipped.length ? ` Skipped ${parsed.skipped.length}.` : ''}</p>`;
  const asOf = parsed.asOf?.code || code;
  const cmp = compareDeviationPaste(parsed, asOf, RULES);
  return `
    <p class="small">${parsed.asOf ? `Divisors put the company screen at <b>${periodName(asOf)}</b> (${parsed.asOf.agree} of ${parsed.asOf.of} rows agree).` : `Compared as of ${periodName(asOf)}.`}</p>
    <table class="cmp">
      <thead><tr><th>Period</th><th>÷</th><th>Company</th><th>App</th><th>Diff</th></tr></thead>
      <tbody>${cmp.rows.map((r) => `<tr>
        <td><b>${r.code}</b><small>${$(r.totalCents)}</small></td>
        <td>${r.divisor}${r.app.divisor && r.app.divisor !== r.divisor ? `<small class="alert-text">app ${r.app.divisor}</small>` : ''}</td>
        <td>${r.applicableCents == null ? '—' : $(r.applicableCents)}</td>
        <td>${$(r.app.availableCents)}</td>
        <td class="${r.diffCents ? 'alert-text' : 'ok-text'}">${r.diffCents == null ? '—' : r.diffCents ? $(r.diffCents, { sign: true }) : '✓'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td></td><td>${$(cmp.companyTotalCents)}</td><td>${$(cmp.appTotalCents)}</td><td class="${cmp.diffCents ? 'alert-text' : 'ok-text'}">${cmp.diffCents ? $(cmp.diffCents, { sign: true }) : '✓'}</td></tr></tfoot>
    </table>
    ${parsed.skipped.length ? `<p class="muted small">Skipped: ${parsed.skipped.map((s) => `${esc(s.code || 'line')} (${esc(s.reason.toLowerCase())})`).join(', ')}.</p>` : ''}
    <p class="muted small">Rounding up to the cent matches the company screen ${confirmPill}</p>
    <button type="button" class="btn primary" data-act="use-import">Use these as my balances</button>`;
}

/* ----------------------------------------------------------------- hotel */

const HOTEL_KIND = { domestic: 'Cancelled room, domestic', international: 'Cancelled room, international', fromDeviation: 'From expired deviation balance', offset: 'Used against deviation expenses' };

function hotelTab(app, dev, code, sim) {
  const x = app.x;
  const h = sim.hotel;
  const hv = ruleAt(RULES, 'hotelBank', code);
  const co = dev.company || {};
  const row = (key, label, app$) => {
    const c = parseMoney(co[key]);
    const diff = c == null ? null : c - app$;
    return `<tr><th scope="row">${label}</th><td class="num">${$(app$)}</td>
      <td><input data-co="${key}" value="${esc(co[key] || '')}" inputmode="decimal" placeholder="$0.00" aria-label="Company ${label}" autocomplete="off"></td>
      <td class="num ${diff ? 'alert-text' : 'ok-text'}" data-out="co-${key}">${diff == null ? '' : diff ? $(diff, { sign: true }) : '✓'}</td></tr>`;
  };
  const anyLegacy = h.rows.some((r) => r.legacyAmount);
  const totalEx = { title: 'Hotel bank', lines: h.rows.map((r) => ({ label: `${r.code}: ${HOTEL_KIND[r.kind] || r.kind}`, text: r.overflowCents ? `${$(r.overflowCents)} over the cap was lost` : '', cents: r.cents })), total: { label: 'Remaining', cents: h.remainingCents }, sources: [hv] };
  return `
    <section class="card hero">
      <div class="eyebrow">Your hotel bank, through ${code}</div>
      <div class="hero-amt">${x.money(h.remainingCents, totalEx, { cls: 'big' })}</div>
      <p class="hero-sub">Cap $15,000. Up to $7,500 a bid period can cover deviation expenses.</p>
      ${h.overflowCents ? `<p class="note small alert">${$(h.overflowCents)} of credits were lost to the $15,000 cap.</p>` : ''}
      <button type="button" class="btn primary big wide mt" data-act="add-room">Add a cancelled room</button>
      <p class="hint center">Counts when you cancel at least 26 hours before check-in and still fly the trip (8.C.2.h). $50 domestic, $70 international from the Dec 2026 bid period.</p>
    </section>

    <section class="card">
      <h2>Hotel bank entries</h2>
      ${h.rows.length ? `<ul class="entries">${h.rows.slice().reverse().map((r) => `
        <li ${r.id != null ? `data-room="${r.id}"` : ''}>
          <span><b>${esc(HOTEL_KIND[r.kind] || r.kind)}</b><small>${r.code}${r.date ? ` · ${formatDate(r.date, { year: true })}` : ''}${r.fromCode ? ` · from ${r.fromCode}` : ''}${r.legacyAmount ? ` · old-agreement amount ${confirmPill}` : ''}</small></span>
          <span class="num ${r.cents < 0 ? 'alert-text' : ''}">${$(r.cents, { sign: true })}<small>bal ${$(r.balanceCents)}</small></span>
          ${r.id != null ? `<button type="button" class="icon-btn" data-act="del-room" aria-label="Remove">${ICON.close}</button>` : '<span></span>'}
        </li>`).join('')}</ul>` : '<p class="muted small">No entries yet.</p>'}
    </section>

    ${fold('hotel-check', 'Check against the company\'s numbers', 'Type the three figures the company shows', `
      <table class="cmp hotel-cmp">
        <thead><tr><th></th><th>App</th><th>Company</th><th>Diff</th></tr></thead>
        <tbody>${row('accrued', 'Total accrued', h.accruedCents)}${row('used', 'Total used', h.usedCents)}${row('remaining', 'Remaining', h.remainingCents)}</tbody>
      </table>
      <p class="muted small">A difference shows which entries are missing here.</p>`)}

    ${fold('hotel-legacy', `Rooms before the Dec 2026 bid period ${confirmPill}`, 'Old-agreement per-room amounts', `
      <p class="small">The old agreement's per-room amounts aren't loaded. Enter yours to count rooms cancelled before December 2026.</p>
      <div class="grid2">
        <label class="f"><span>Domestic room</span><input data-legacy="domestic" value="${esc(dev.hotelLegacy.domestic)}" inputmode="decimal" placeholder="$" autocomplete="off"></label>
        <label class="f"><span>International room</span><input data-legacy="international" value="${esc(dev.hotelLegacy.international)}" inputmode="decimal" placeholder="$" autocomplete="off"></label>
      </div>`, anyLegacy)}`;
}

/* ------------------------------------------------------------------ forms */

function periodOptions(code) {
  return [shiftPeriod(code, -1), code, shiftPeriod(code, 1)].map((c) => `<option value="${c}" ${c === code ? 'selected' : ''}>${periodName(c)}</option>`).join('');
}

function defaultDate(code) {
  const t = todayISO();
  return periodFromISO(t) === code ? t : '';
}

function entrySheet(kind, code, onSave) {
  const forms = {
    deadhead: `
      <label class="f"><span>Route</span><input name="route" placeholder="e.g. MEM-ATL-CDG" autocomplete="off"></label>
      <label class="f"><span>Fare credited to your bank</span><input name="fare" inputmode="decimal" placeholder="$0.00" autocomplete="off"></label>
      <p class="hint">Which fare (8.C.2.b): tell the company you're deviating before the first day of the bid period the trip starts in, and the bank gets the higher of the Baseline and Established Fare. On or after that day, the Established Fare only. A revised trip, or one built after the package: the higher of the two. Both fares are on the trip recap.</p>
      <label class="check"><input type="checkbox" name="changed"><span>The company changed or cancelled this deadhead</span></label>`,
    expense: `
      <label class="f"><span>Category</span><select name="category">${CATEGORIES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <p class="hint" data-cat-hint></p>
      <label class="f"><span>Description</span><input name="desc" placeholder="e.g. DL 1234 ATL-CDG" autocomplete="off"></label>
      <label class="f"><span>Amount</span><input name="amount" inputmode="decimal" placeholder="$0.00" autocomplete="off"></label>`,
    room: `
      <div class="f"><span>Reservation</span>${seg('kind', [['domestic', 'Domestic'], ['international', 'International']], 'international')}</div>
      <p class="hint">Cancelled at least 26 hours before scheduled check-in, and you operated the trip.</p>`,
  };
  const titles = { deadhead: 'Add a deadhead', expense: 'Add an expense', room: 'Add a cancelled room' };
  openSheet(titles[kind], `
    <form class="stack" data-entry-form novalidate>
      <div class="grid2">
        <label class="f"><span>Bid period</span><select name="code">${periodOptions(code)}</select></label>
        <label class="f"><span>Date</span><input type="date" name="date" value="${defaultDate(code)}"></label>
      </div>
      ${forms[kind]}
      <p class="form-error" data-err hidden></p>
      <button type="submit" class="btn primary big">Save</button>
    </form>`, (body, close) => {
    const form = body.querySelector('form');
    const hint = form.querySelector('[data-cat-hint]');
    const setHint = () => {
      if (!hint) return;
      const c = form.category.value;
      hint.textContent = c === 'seatFee' ? 'From the Dec 2026 bid period, seat fees count up to $100 per positioning sequence (front-end, mid-trip or back-end). Enter one sequence\'s fees as one expense. Charge them to the company card.'
        : c === 'surface' ? 'Another vendor: counts up to $150 per occurrence unless your Fleet Captain authorized more.' : '';
    };
    form.category?.addEventListener('change', setHint);
    setHint();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      const err = form.querySelector('[data-err]');
      const money = kind === 'deadhead' ? fd.fare : kind === 'expense' ? fd.amount : '0';
      if (kind !== 'room' && (parseMoney(money) == null || parseMoney(money) < 0)) { err.hidden = false; err.textContent = 'Enter a dollar amount.'; return; }
      onSave({ ...fd, changed: !!fd.changed });
      close();
    });
    setTimeout(() => form.querySelector('input[name="route"], input[name="desc"], input[name="amount"]')?.focus(), 60);
  });
}

/* ----------------------------------------------------------------- screen */

export default {
  title: 'Banks',
  render(app) {
    const dev = ensureDev(app.state);
    const code = viewCode(dev);
    const sim = bankSnapshot(app.state, code);
    const tab = dev.tab === 'hotel' ? 'hotel' : 'deviation';
    return `
      ${seg('bank-tab', [['deviation', 'Deviation'], ['hotel', 'Hotel']], tab, { attrs: 'data-tab', cls: 'tabs-top' })}
      ${tab === 'hotel' ? hotelTab(app, dev, code, sim) : deviationTab(app, dev, code, sim)}`;
  },
  mount(el, app) {
    const state = app.state;
    const dev = ensureDev(state);
    const code = viewCode(dev);
    const rerender = () => { app.save(); app.render({ keepScroll: true }); };
    // <details> toggles don't bubble: listen on the way down, and remember what's open across re-renders.
    el.addEventListener('toggle', (e) => {
      const k = e.target.dataset?.fold;
      if (k) { if (e.target.open) openFolds.add(k); else openFolds.delete(k); }
    }, true);

    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-tab]')) { dev.tab = e.target.value; app.save(); app.render(); }
    });
    el.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('[data-paste]')) {
        el.querySelector('[data-out="paste"]').innerHTML = pasteResult(t.value, code);
        return;
      }
      if (t.dataset.co) {
        dev.company[t.dataset.co] = t.value;
        app.save();
        const sim = bankSnapshot(state, code);
        const appVal = { accrued: sim.hotel.accruedCents, used: sim.hotel.usedCents, remaining: sim.hotel.remainingCents }[t.dataset.co];
        const c = parseMoney(t.value);
        const out = el.querySelector(`[data-out="co-${t.dataset.co}"]`);
        out.className = `num ${c != null && c !== appVal ? 'alert-text' : 'ok-text'}`;
        out.textContent = c == null ? '' : c === appVal ? '✓' : $(c - appVal, { sign: true });
        return;
      }
      if (t.dataset.legacy) { dev.hotelLegacy[t.dataset.legacy] = t.value; app.save(); }
    });
    el.addEventListener('focusout', (e) => { if (e.target.dataset.legacy) rerender(); });

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'shift') { dev.viewCode = shiftPeriod(code, Number(b.dataset.n)); app.save(); app.render(); }
      if (a === 'add-dh' || a === 'add-ex') {
        const kind = a === 'add-dh' ? 'deadhead' : 'expense';
        entrySheet(kind, code, (f) => {
          dev.entries.push(kind === 'deadhead'
            ? { id: state.nextId++, kind, code: f.code, date: f.date, route: f.route.trim(), fare: f.fare, changed: f.changed }
            : { id: state.nextId++, kind, code: f.code, date: f.date, desc: f.desc.trim(), amount: f.amount, category: f.category });
          toast(f.code === code ? 'Added' : `Added to ${periodName(f.code)}`);
          rerender();
        });
      }
      if (a === 'add-room') {
        entrySheet('room', code, (f) => {
          dev.hotel.push({ id: state.nextId++, code: f.code, date: f.date, kind: f.kind || 'international' });
          toast('Room added');
          rerender();
        });
      }
      if (a === 'del-entry') {
        const id = b.closest('[data-entry]').dataset.entry;
        dev.entries = dev.entries.filter((x) => String(x.id) !== id);
        rerender();
      }
      if (a === 'del-room') {
        const id = b.closest('[data-room]').dataset.room;
        dev.hotel = dev.hotel.filter((x) => String(x.id) !== id);
        rerender();
      }
      if (a === 'use-import') {
        const parsed = parseDeviationPaste(el.querySelector('[data-paste]').value);
        dev.imported = { asOf: parsed.asOf?.code || null, rows: parsed.rows };
        toast(`Using ${parsed.rows.length} company balance${parsed.rows.length === 1 ? '' : 's'}`);
        rerender();
      }
      if (a === 'clear-import') { dev.imported = null; rerender(); }
    });
  },
};
