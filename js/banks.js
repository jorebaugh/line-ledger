// Deviation bank and hotel (HAC) bank math. Pure functions only.

import { periodIndex, periodCode, shiftPeriod, ruleAt, parseMoney, toCents } from './core.js';

// Integer division of cents with a rounding mode ('ceil' | 'floor' | 'round').
export function divCents(cents, divisor, mode = 'round') {
  if (mode === 'ceil') return cents >= 0 ? Math.floor((cents + divisor - 1) / divisor) : -Math.floor(-cents / divisor);
  if (mode === 'floor') return Math.floor(cents / divisor);
  return Math.round(cents / divisor);
}

// First bid period in which the new carry-then-hotel rule applies (from rules.js).
export function newRuleStart(rules) {
  const v = rules.deviationBank
    .filter((x) => x.value.model === 'carryThenHotel')
    .sort((a, b) => periodIndex(a.effectiveFrom) - periodIndex(b.effectiveFrom))[0];
  return v ? v.effectiveFrom : null;
}

function newRuleValue(cents, age, rule) {
  if (age <= rule.carryPeriods) {
    return { status: 'intact', availableCents: cents, divisor: 1, periodsLeft: rule.carryPeriods - age + 1, age };
  }
  const toHotelCents = Math.round((cents * rule.toHotelPct) / 100);
  return { status: 'expired', availableCents: 0, toHotelCents, droppedCents: cents - toHotelCents, age };
}

// What a bid period's unused deviation balance is worth in a later bid period.
//   lot: { code: 'FEB26', cents }   leftover at the end of that bid period
// Legacy rule (before the new rule starts): divide by 2 for each bid period it has carried.
// New rule: intact for `carryPeriods` more bid periods, then `toHotelPct` moves to the hotel bank.
export function deviationLotValue(lot, asOfCode, rules) {
  const age = periodIndex(asOfCode) - periodIndex(lot.code);
  if (!(age >= 0)) return { status: 'future', availableCents: 0, age };
  if (age === 0) return { status: 'current', availableCents: lot.cents, divisor: 1, age };

  const earned = ruleAt(rules, 'deviationBank', lot.code);
  if (earned.value.model === 'carryThenHotel') return { ...newRuleValue(lot.cents, age, earned.value), rule: earned };

  const rounding = ruleAt(rules, 'legacyRounding', lot.code).value;
  const start = newRuleStart(rules);
  const conversion = start && periodIndex(asOfCode) >= periodIndex(start)
    ? ruleAt(rules, 'legacyBalanceConversion', asOfCode)
    : null;

  if (!conversion || conversion.value === 'keepHalving') {
    const divisor = 2 ** age;
    return { status: 'halving', availableCents: divCents(lot.cents, divisor, rounding), divisor, age, rule: earned, conversion };
  }

  // 'newTreatment': halve through the last legacy bid period, then treat what is left
  // as a new-rule balance from that period.
  const lastLegacy = shiftPeriod(start, -1);
  const legacyAge = Math.max(0, periodIndex(lastLegacy) - periodIndex(lot.code));
  const base = legacyAge > 0 ? divCents(lot.cents, 2 ** legacyAge, rounding) : lot.cents;
  const newAge = periodIndex(asOfCode) - periodIndex(lastLegacy);
  const newRule = ruleAt(rules, 'deviationBank', start).value;
  return { ...newRuleValue(base, newAge, newRule), convertedFromCents: base, rule: earned, conversion };
}

/* ------------------------------------------------------ company screen paste */

const NUM = /\(?[-−]?\$?\d[\d,]*(?:\.\d+)?\)?/g;

// Parses the company's "Deviation Bank Allocation" view, copied as plain text.
// One row per bid period: code, optional "No such report", total, divisor, applicable.
// Rows with no amount, or a divisor of 0 or below, are skipped. Runs locally only.
export function parseDeviationPaste(text) {
  const rows = [];
  const skipped = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/\b([A-Za-z]{3})(\d{2})\b/);
    const code = m ? (m[1] + m[2]).toUpperCase() : null;
    if (!code || Number.isNaN(periodIndex(code))) { skipped.push({ line, reason: 'No bid period code' }); continue; }
    const tokens = line.slice(m.index + m[0].length).match(NUM) || [];
    if (tokens.length < 2) { skipped.push({ line, code, reason: 'No amount' }); continue; }
    const totalCents = parseMoney(tokens[0].replace('−', '-'));
    const divisor = Number(tokens[1].replace(/[,$()]/g, ''));
    if (totalCents == null) { skipped.push({ line, code, reason: 'No amount' }); continue; }
    if (!(divisor > 0)) { skipped.push({ line, code, reason: 'Divisor 0 or below' }); continue; }
    const applicableCents = tokens[2] != null ? parseMoney(tokens[2].replace('−', '-')) : null;
    rows.push({ code, totalCents, divisor, applicableCents });
  }
  return { rows, skipped, asOf: inferAsOf(rows) };
}

// The legacy divisor is 2^(periods carried), so each row implies the screen's bid period.
export function inferAsOf(rows) {
  const votes = new Map();
  for (const r of rows) {
    const p = Math.log2(r.divisor);
    if (!Number.isInteger(p)) continue;
    const code = shiftPeriod(r.code, p);
    votes.set(code, (votes.get(code) || 0) + 1);
  }
  let best = null;
  for (const [code, n] of votes) if (!best || n > best.n) best = { code, n };
  return best ? { code: best.code, agree: best.n, of: rows.length } : null;
}

// Company figure next to the app's figure for each pasted row.
export function compareDeviationPaste(parsed, asOfCode, rules) {
  const rows = parsed.rows.map((r) => {
    const app = deviationLotValue({ code: r.code, cents: r.totalCents }, asOfCode, rules);
    const diffCents = r.applicableCents == null ? null : r.applicableCents - app.availableCents;
    return { ...r, app, diffCents };
  });
  const companyTotal = rows.reduce((s, r) => s + (r.applicableCents || 0), 0);
  const appTotal = rows.reduce((s, r) => s + r.app.availableCents, 0);
  return { rows, companyTotalCents: companyTotal, appTotalCents: appTotal, diffCents: companyTotal - appTotal };
}

/* --------------------------------------------------------- expense caps */

// category: 'seatFee' (cap per positioning sequence) | 'surface' (cap per occurrence, another vendor)
export function capDeviationExpense(category, cents, code, rules) {
  const rule = ruleAt(rules, 'deviationBank', code);
  const cap = category === 'seatFee' ? rule.value.seatFeeCap : category === 'surface' ? rule.value.surfaceTransportCap : null;
  if (cap == null) return { allowedCents: cents, cappedCents: 0, capCents: null, rule };
  const capCents = toCents(cap);
  const allowedCents = Math.min(cents, capCents);
  return { allowedCents, cappedCents: cents - allowedCents, capCents, rule };
}

/* --------------------------------------------------------------- hotel bank */

export function hotelRule(code, rules) {
  return ruleAt(rules, 'hotelBank', code);
}

// Credit for one cancelled room. Returns null when the amount isn't known (old agreement).
export function hotelCreditCents(kind, code, rules) {
  const v = hotelRule(code, rules).value;
  const dollars = kind === 'international' ? v.international : v.domestic;
  return dollars == null ? null : toCents(dollars);
}

// Add to the hotel bank without passing the cap.
export function addToHotelBank(balanceCents, addCents, capCents) {
  if (capCents == null) return { balanceCents: balanceCents + addCents, acceptedCents: addCents, overflowCents: 0 };
  const room = Math.max(0, capCents - balanceCents);
  const acceptedCents = Math.min(addCents, room);
  return { balanceCents: balanceCents + acceptedCents, acceptedCents, overflowCents: addCents - acceptedCents };
}

// Use the hotel bank to offset deviation expenses in one bid period.
export function hotelOffset({ balanceCents, requestedCents, usedThisPeriodCents = 0 }, maxPerPeriodCents) {
  const periodRoom = maxPerPeriodCents == null ? Infinity : Math.max(0, maxPerPeriodCents - usedThisPeriodCents);
  const usedCents = Math.max(0, Math.min(requestedCents, balanceCents, periodRoom));
  const limitedBy = usedCents === requestedCents ? null : usedCents === balanceCents ? 'balance' : 'perPeriodLimit';
  return { usedCents, balanceCents: balanceCents - usedCents, limitedBy };
}

// Running hotel bank from a list of entries, in order.
//   { code, kind: 'domestic'|'international', cents? }   cancelled room (cents only if rules lack the amount)
//   { code, kind: 'fromDeviation', cents }                 50% of an expired deviation balance
//   { code, kind: 'offset', cents }                        used against deviation expenses
export function hotelLedger(entries, rules) {
  let balance = 0;
  let accrued = 0;
  let used = 0;
  let overflow = 0;
  const usedByPeriod = new Map();
  const rows = entries.map((e) => {
    const v = hotelRule(e.code, rules).value;
    const capCents = v.cap == null ? null : toCents(v.cap);
    if (e.kind === 'offset') {
      const prior = usedByPeriod.get(e.code) || 0;
      const r = hotelOffset({ balanceCents: balance, requestedCents: e.cents, usedThisPeriodCents: prior }, v.maxOffsetPerPeriod == null ? null : toCents(v.maxOffsetPerPeriod));
      usedByPeriod.set(e.code, prior + r.usedCents);
      balance = r.balanceCents;
      used += r.usedCents;
      return { ...e, appliedCents: -r.usedCents, limitedBy: r.limitedBy, balanceCents: balance };
    }
    const amount = e.kind === 'domestic' || e.kind === 'international'
      ? (hotelCreditCents(e.kind, e.code, rules) ?? e.cents ?? 0)
      : e.cents || 0;
    const r = addToHotelBank(balance, amount, capCents);
    balance = r.balanceCents;
    accrued += r.acceptedCents;
    overflow += r.overflowCents;
    return { ...e, appliedCents: r.acceptedCents, overflowCents: r.overflowCents, balanceCents: balance };
  });
  return { rows, accruedCents: accrued, usedCents: used, remainingCents: balance, overflowCents: overflow };
}

/* ------------------------------------------------------- full bank replay */

const LEGACY_MAX_AGE = 30; // a legacy balance this old is worth a cent; stop tracking it

function lotRule(rules, lot) {
  return ruleAt(rules, 'deviationBank', lot.code).value;
}

// What a tracked balance is worth in bid period P.
function lotValue(lot, P, rules) {
  const age = periodIndex(P) - periodIndex(lot.code);
  if (lot.kind === 'legacy') {
    if (age <= 0) return lot.base;
    return divCents(lot.base, 2 ** age, ruleAt(rules, 'legacyRounding', lot.code).value);
  }
  return age <= lotRule(rules, lot).carryPeriods ? lot.base : 0;
}

function consume(lot, cents, P) {
  const age = periodIndex(P) - periodIndex(lot.code);
  if (lot.kind === 'legacy' && age > 0) lot.base -= cents * 2 ** age; // keeps value(P) = old value - cents
  else lot.base -= cents;
}

export function describeLot(lot, P, rules) {
  const age = periodIndex(P) - periodIndex(lot.code);
  const value = lotValue(lot, P, rules);
  const from = lot.convertedFrom || lot.code;
  if (lot.kind === 'legacy') {
    return { fromCode: from, kind: 'legacy', age, valueCents: value, divisor: 2 ** Math.max(0, age), nextValueCents: divCents(lot.base, 2 ** (age + 1), ruleAt(rules, 'legacyRounding', lot.code).value), imported: !!lot.imported };
  }
  const r = lotRule(rules, lot);
  const lastUsable = shiftPeriod(lot.code, r.carryPeriods);
  return {
    fromCode: from, kind: 'new', age, valueCents: value, lastUsable,
    periodsLeft: periodIndex(lastUsable) - periodIndex(P) + 1,
    toHotelCents: Math.round((value * r.toHotelPct) / 100),
    converted: !!lot.convertedFrom, imported: !!lot.imported,
  };
}

// Replays every bid period from the first one with data through `throughCode`.
//   entries:   [{ code, kind: 'deadhead', fare } | { code, kind: 'expense', amount, category }]
//   imported:  { rows: [{ code, totalCents }] } leftover balances pasted from the company screen
//   hotel:     [{ code, kind: 'domestic'|'international' }] cancelled rooms
//   hotelLegacy: { domestic, international } dollar strings for rooms before the new amounts apply
export function simulateBanks({ entries = [], imported = null, hotel = [], hotelLegacy = {} }, rules, throughCode) {
  const byCode = new Map();
  const group = (c) => { if (!byCode.has(c)) byCode.set(c, { deadheads: [], expenses: [] }); return byCode.get(c); };
  for (const e of entries) (e.kind === 'deadhead' ? group(e.code).deadheads : group(e.code).expenses).push(e);
  const importedRows = new Map((imported?.rows || []).map((r) => [r.code, r]));
  const all = [...byCode.keys(), ...importedRows.keys(), ...hotel.map((h) => h.code), throughCode]
    .map(periodIndex).filter((n) => !Number.isNaN(n));
  const empty = { periods: new Map(), hotel: { rows: [], accruedCents: 0, usedCents: 0, remainingCents: 0, overflowCents: 0 }, lots: [] };
  if (!all.length) return empty;
  const first = Math.min(...all);
  const last = Math.max(...all);

  const start = newRuleStart(rules);
  const lastLegacy = start ? shiftPeriod(start, -1) : null;
  let lots = [];
  let outstanding = { code: null, cents: 0 };
  let hotelBal = 0;
  let accrued = 0;
  let used = 0;
  let overflow = 0;
  const hotelRows = [];
  const periods = new Map();

  for (let i = first; i <= last; i++) {
    const P = periodCode(i);
    const dev = ruleAt(rules, 'deviationBank', P).value;
    const hv = ruleAt(rules, 'hotelBank', P).value;
    const capC = hv.cap == null ? null : toCents(hv.cap);
    const maxOffC = hv.maxOffsetPerPeriod == null ? null : toCents(hv.maxOffsetPerPeriod);
    const rec = { code: P, expired: [], usedFromLots: [], hotelUsedCents: 0, outOfPocketCents: 0, paidBackPriorCents: 0, capped: [], notes: [] };
    const credit = (row, cents) => {
      const r = addToHotelBank(hotelBal, cents, capC);
      hotelBal = r.balanceCents;
      accrued += r.acceptedCents;
      overflow += r.overflowCents;
      hotelRows.push({ ...row, code: P, cents: r.acceptedCents, overflowCents: r.overflowCents, balanceCents: hotelBal });
    };

    // Pre-December balances convert at the new rule's start, if rules.js says they do.
    if (P === start && ruleAt(rules, 'legacyBalanceConversion', P).value === 'newTreatment') {
      lots = lots.map((l) => (l.kind === 'legacy' ? { code: lastLegacy, base: lotValue(l, lastLegacy, rules), kind: 'new', convertedFrom: l.code } : l));
    }

    // Cancelled rooms credited this bid period.
    for (const h of hotel.filter((x) => x.code === P)) {
      const known = hv[h.kind];
      const cents = known != null ? toCents(known) : parseMoney(hotelLegacy[h.kind]) ?? 0;
      credit({ kind: h.kind, id: h.id, date: h.date, legacyAmount: known == null }, cents);
    }

    // New-rule balances past their three extra bid periods: 50% to the hotel bank, rest drops.
    lots = lots.filter((l) => {
      const age = i - periodIndex(l.code);
      if (l.kind === 'legacy') return age <= LEGACY_MAX_AGE;
      const r = lotRule(rules, l);
      if (age <= r.carryPeriods) return true;
      const toHotel = Math.round((l.base * r.toHotelPct) / 100);
      rec.expired.push({ fromCode: l.convertedFrom || l.code, cents: l.base, toHotelCents: toHotel, droppedCents: l.base - toHotel });
      if (toHotel > 0) credit({ kind: 'fromDeviation', fromCode: l.convertedFrom || l.code }, toHotel);
      return false;
    });

    rec.carriedIn = lots.map((l) => describeLot(l, P, rules)).filter((d) => d.valueCents > 0);
    rec.carriedInCents = rec.carriedIn.reduce((s, d) => s + d.valueCents, 0);

    const imp = importedRows.get(P);
    if (imp) {
      rec.imported = true;
      if (byCode.has(P)) rec.notes.push('Using the pasted company balance for this bid period, so deadheads and expenses logged here are not counted.');
      if (imp.totalCents > 0) lots.push({ code: P, base: imp.totalCents, kind: dev.model === 'carryThenHotel' ? 'new' : 'legacy', imported: true });
      rec.leftoverCents = imp.totalCents;
      outstanding = { code: P, cents: 0 };
    } else {
      const g = byCode.get(P) || { deadheads: [], expenses: [] };
      const bank = g.deadheads.reduce((s, d) => s + Math.max(0, parseMoney(d.fare) || 0), 0);
      let spend = 0;
      for (const e of g.expenses) {
        const amt = Math.max(0, parseMoney(e.amount) || 0);
        const c = e.category === 'seatFee' || e.category === 'surface' ? capDeviationExpense(e.category, amt, P, rules) : { allowedCents: amt, cappedCents: 0 };
        if (c.cappedCents > 0) rec.capped.push({ id: e.id, category: e.category, cents: amt, allowedCents: c.allowedCents, capCents: c.capCents });
        spend += c.allowedCents;
      }
      rec.bankCents = bank;
      rec.spendCents = spend;
      if (spend <= bank) {
        let left = bank - spend;
        const prevCode = shiftPeriod(P, -1);
        if (outstanding.code === prevCode && outstanding.cents > 0 && left > 0) {
          const pay = Math.min(left, outstanding.cents);
          left -= pay;
          outstanding.cents -= pay;
          rec.paidBackPriorCents = pay;
          const pr = periods.get(prevCode);
          if (pr) pr.paidBackLaterCents = pay;
        }
        if (left > 0) lots.push({ code: P, base: left, kind: dev.model === 'carryThenHotel' ? 'new' : 'legacy' });
        rec.leftoverCents = left;
        outstanding = { code: P, cents: 0 };
      } else {
        let over = spend - bank;
        for (const l of [...lots].sort((a, b) => periodIndex(a.code) - periodIndex(b.code))) {
          if (over <= 0) break;
          if (l.code === P) continue;
          const v = lotValue(l, P, rules);
          if (v <= 0) continue;
          const take = Math.min(v, over);
          consume(l, take, P);
          over -= take;
          rec.usedFromLots.push({ fromCode: l.convertedFrom || l.code, cents: take });
        }
        if (over > 0 && maxOffC != null && hotelBal > 0) {
          const r = hotelOffset({ balanceCents: hotelBal, requestedCents: over, usedThisPeriodCents: 0 }, maxOffC);
          hotelBal = r.balanceCents;
          used += r.usedCents;
          over -= r.usedCents;
          rec.hotelUsedCents = r.usedCents;
          hotelRows.push({ kind: 'offset', code: P, cents: -r.usedCents, balanceCents: hotelBal, limitedBy: r.limitedBy });
        }
        rec.outOfPocketCents = over;
        rec.leftoverCents = 0;
        outstanding = { code: P, cents: over };
      }
      lots = lots.filter((l) => lotValue(l, P, rules) > 0);
    }
    rec.balances = lots.map((l) => describeLot(l, P, rules));
    rec.remainingCents = rec.balances.reduce((s, d) => s + d.valueCents, 0);
    periods.set(P, rec);
  }
  return {
    periods,
    hotel: { rows: hotelRows, accruedCents: accrued, usedCents: used, remainingCents: hotelBal, overflowCents: overflow },
    lots,
  };
}
