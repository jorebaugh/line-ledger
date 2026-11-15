// Pay math. Pure functions only: rules + inputs in, numbers + the math shown out.
// Every line item carries the text of its own arithmetic and the rules it used,
// so the UI can show "how was this calculated" for any figure.

import {
  payCents, toCents, pctOf, ruleAt, parseHours, parseMoney,
  formatHours as H, formatMoney as $, periodMonth, isoDate, lastDayOfMonth,
  shiftPeriod, periodFromISO, periodIndex, periodName,
} from './core.js';

/* ------------------------------------------------------------- year group and rate */

// Full years of longevity + 1, capped. Dates are ISO strings.
export function yearGroup(dohISO, asOfISO, cap = 15) {
  const [y1, m1, d1] = dohISO.split('-').map(Number);
  const [y2, m2, d2] = asOfISO.split('-').map(Number);
  let years = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years -= 1;
  return Math.max(1, Math.min(cap, years + 1));
}

// A pilot who changes year group during a bid period gets the new rate for the whole
// period (3.B.1.c), so a date of hire is evaluated at the end of the period's month.
export function yearGroupFor(profile, code, rules) {
  const cap = ruleAt(rules, 'yearGroup', code).value.cap;
  if (profile.ygMode === 'doh' && profile.doh) {
    const { year, month } = periodMonth(code);
    const asOf = isoDate(year, month, lastDayOfMonth(year, month));
    return { yg: yearGroup(profile.doh, asOf, cap), asOf, from: 'doh' };
  }
  const n = Math.round(Number(profile.yearGroup));
  return { yg: Math.min(cap, Math.max(1, Number.isFinite(n) ? n : 1)), from: 'pick' };
}

export function payContext(rules, profile, code) {
  const r = (key) => ruleAt(rules, key, code);
  const rule = {
    rates: r('payRates'), ygRule: r('yearGroup'), override: r('intlOverride'), ulr: r('ulrPremium'),
    checks: r('checkSchedule'), minG: r('minGuarantee'), reserve: r('reserveAccrual'), draft: r('draftPct'),
    pmu: r('pmuPct'), cmu: r('cmuPct'), other: r('otherPct'), bko: r('blockOverride'), overage: r('overage'),
    gpe: r('gridPenalty'), gpeBko: r('gridPenaltyOnBko'), perDiem: r('perDiem'),
    tripClass: r('tripClassification'), dues: r('unionDues'), assumptions: r('assumptions'), veba: r('veba'),
    osc: r('overrideScheduledCredit'), oscFloor: r('oscShortLegFloor'), credit: r('creditValues'),
    intlDef: r('internationalDefinition'), overageAch: r('overageFromAch'), role: r('bidPeriodOverride'), roleCheck: r('bidPeriodOverrideCheck'),
    payOnly: r('payOnlyLine'), dayOff: r('instructDayOffPct'),
    disrupt: r('disruptionPay'), disruptRate: r('disruptionRate'), rday: r('rdayValue'),
  };
  const fleet = profile.fleet === 'NB' ? 'narrowbody' : 'widebody';
  const seat = profile.seat === 'CA' ? 'CA' : 'FO';
  const yg = yearGroupFor(profile, code, rules);
  return {
    rules, profile, code, fleet, seat, yg, rule,
    rateCents: toCents(rule.rates.value[fleet][seat][yg.yg - 1]),
    overrideCents: toCents(rule.override.value[seat]),
    ulrCents: toCents(rule.ulr.value[seat]),
    perDiemCents: {
      domestic: toCents(rule.perDiem.value.domestic),
      international: toCents(rule.perDiem.value.international),
    },
    vebaCents: vebaRateCents(rule.veba.value, code),
  };
}

// VEBA per paid CH (27.I.3): starts at $1.00 in Nov 2015, +$0.05 each November bid period after.
export function vebaRateCents(v, code) {
  const { year, month } = periodMonth(code);
  const steps = Math.max(0, (month >= 11 ? year : year - 1) - v.startYear);
  return toCents(v.startPerCH) + steps * toCents(v.stepPerCH);
}

export const seatName = (seat) => (seat === 'CA' ? 'Captain' : 'First Officer');
export const fleetName = (fleet) => (fleet === 'narrowbody' ? 'Narrow body' : 'Wide body');

export const ROLES = {
  ip: 'Instructor Pilot',
  ca: 'Check Airman (PCA/LCA)',
  sca: 'Check Airman, SCA or APD',
  fps: 'FPS / TAA',
};

// Bid period override for an instructor, check airman or FPS/TAA (11.N.25.e, 11.M.17.i, 11.M.29, 9.E.2.a).
export function roleOverride(profile, ctx) {
  const role = profile.role;
  if (!ROLES[role]) return null;
  const v = ctx.rule.role.value;
  const table = role === 'ip' ? v.ip : role === 'fps' ? v.fps : v.ca;
  const y = Math.min(4, Math.max(1, Number(profile.roleYear) || 1));
  const base = table[y - 1];
  const extra = role === 'sca' ? v.scaApdExtra : 0;
  const cents = toCents(base + extra);
  const text = `Year ${y === 4 ? '4 and above' : y} in the program: ${$(toCents(base))}${extra ? ` + ${$(toCents(extra))} SCA/APD` : ''} per bid period`;
  return summarize({ role, label: `${ROLES[role]} override`, items: [item('onTop', `${ROLES[role]} override`, text, cents, [ctx.rule.role, ctx.rule.roleCheck])] });
}

/* --------------------------------------------------------------- line items */

// kind: 'onTop'   paid in addition to BLG/RLG (goes to the next 15th check)
//       'toward'  credit hours that count toward BLG/RLG (no dollars of its own)
//       'perDiem' per diem (also paid on the next 15th, outside the pay base)
const item = (kind, label, text, cents, sources, extra = {}) => ({ kind, label, text, cents, sources: sources.filter(Boolean), ...extra });
const pctText = (pct) => `${pct}%`;

/* --------------------------------------------------------- quick-estimate rows */

export const ROW_TYPES = {
  draft: { label: 'VLT / DRF / AVA trip', hint: '150% on top of guarantee (4.Q.1)', gpe: true },
  reserve: { label: 'Reserve CH above RLG', hint: 'R-day credit over RLG at 150%' },
  overage: { label: 'Overage', hint: 'More than 2 hrs into days off: first 12 CH 150%, rest 200%' },
  vacation: { label: 'Vacation on a reserve line', hint: 'Each vacation day counts as an R-day toward RLG. No pay of its own (7.G.3.d.vi, 4.H.2)' },
  disrupt: { label: 'Disruption pay', hint: 'Extra landing, layover change, extra duty period, recall from rest and the like (4.W to 4.Z)' },
  pmu: { label: 'PMU / SMU', hint: '125% (PMU up to your OTP eligibility, 4.N.3). General make-up (M/U) is 100%: add it as a trip', gpe: true },
  other: { label: 'Other pay at 100%', hint: 'Sim support, training, misc.', gpe: true },
  dayoff: { label: 'Day-off instruction (150%)', hint: 'R-day value per day at 150%: student contact or seat support on a day off (11.N.25.b.ii)' },
  override: { label: 'International override', hint: 'Per CH of international trip guarantee + overage' },
  ulr: { label: 'Ultra long range premium', hint: 'Per CH of ULR trip guarantee + overage' },
  perdiem: { label: 'Per diem', hint: 'Hours away from base' },
  adjust: { label: 'Other income / deduction', hint: 'Any dollar amount, + or −' },
};

// Hours x rate x percent row (draft, reserve over RLG, PMU, other). Optional 3+ GPE premium.
function hourlyRow(row, ctx, pctRule, label) {
  const min = parseHours(row.hours);
  if (min == null || min <= 0) return { items: [], error: 'Enter credit hours' };
  const base = pctRule.value;
  const gpe = row.gpe && ROW_TYPES[row.type]?.gpe ? ctx.rule.gpe.value.premiumPct : 0;
  const pct = base + gpe;
  const text = `${H(min)} CH × ${$(ctx.rateCents)} × ${pctText(pct)}${gpe ? ` (${base}% + ${gpe}% grid penalty)` : ''}`;
  return { items: [item('onTop', label, text, payCents(min, ctx.rateCents, pct), [ctx.rule.rates, pctRule, gpe && ctx.rule.gpe], { paidMin: min })] };
}

function overageItems(min, ctx, label = 'Overage') {
  const ov = ctx.rule.overage.value;
  const first = Math.min(min, ov.firstHours * 60);
  const excess = min - first;
  const out = [item('onTop', `${label}, first ${ov.firstHours} CH`, `${H(first)} CH × ${$(ctx.rateCents)} × ${ov.firstPct}%`, payCents(first, ctx.rateCents, ov.firstPct), [ctx.rule.rates, ctx.rule.overage], { paidMin: first })];
  if (excess > 0) out.push(item('onTop', `${label}, over ${ov.firstHours} CH`, `${H(excess)} CH × ${$(ctx.rateCents)} × ${ov.excessPct}%`, payCents(excess, ctx.rateCents, ov.excessPct), [ctx.rule.rates, ctx.rule.overage], { paidMin: excess }));
  return out;
}

// Does a disruption pay need a pay log? From the contract text only (rules.disruptionPay).
//   need: 'yes' send one · 'auto' should now pay on its own · 'unsaid' the contract does not say
export function payLogStatus(kindKey, ctx) {
  const d = ctx.rule.disrupt.value;
  const k = d.kinds[kindKey];
  if (!k) return null;
  const auto = periodIndex(ctx.code) >= periodIndex(d.autoFrom);
  const from = periodName(d.autoFrom);
  if (k.payLog === 'always') return { need: 'yes', text: `Paid only when you send a pay log (Sec. ${k.sec}).` };
  if (k.payLog === 'untilAuto') {
    return auto
      ? { need: 'auto', text: `Due to pay on its own from the ${from} bid period (Implementation LOA, Appendix A). If it is missing from your check, send a pay log.` }
      : { need: 'yes', text: `Send a pay log. This is paid by pay log until the ${from} bid period (Implementation LOA, Appendix A).` };
  }
  return { need: 'unsaid', text: `The contract does not say a pay log is needed.${k.logNote && !auto ? ` ${k.logNote}` : ''} Look for it on the 15th after this bid period.` };
}

// Pay logs still to send for one calculated bid period.
export const payLogsDue = (calc) => calc.rows.flatMap((r) => r.items
  .filter((i) => i.payLog?.need === 'yes' && !i.logSent)
  .map((i) => ({ rowId: r.row.id, label: i.label, cents: i.cents })));

// env: { gMin, weeks } of the bid period the row sits in, for rows that depend on the guarantee.
export function calcRow(row, ctx, env = {}) {
  const t = ROW_TYPES[row.type];
  if (!t) return { row, items: [], error: 'Unknown row type' };
  let res;
  switch (row.type) {
    case 'draft': res = hourlyRow(row, ctx, ctx.rule.draft, row.whatIf ? 'What-if draft' : t.label); break;
    case 'pmu': res = hourlyRow(row, ctx, ctx.rule.pmu, t.label); break;
    case 'other': res = hourlyRow(row, ctx, ctx.rule.other, row.label?.trim() || t.label); break;
    case 'dayoff': res = hourlyRow(row, ctx, ctx.rule.dayOff, row.label?.trim() || t.label); break;
    case 'reserve': {
      const min = parseHours(row.hours);
      if (min == null || min <= 0) { res = { items: [], error: 'Enter credit hours' }; break; }
      const pct = ctx.rule.reserve.value.overRlgPct;
      res = { items: [item('onTop', t.label, `${H(min)} CH × ${$(ctx.rateCents)} × ${pct}%`, payCents(min, ctx.rateCents, pct), [ctx.rule.rates, ctx.rule.reserve], { paidMin: min })] };
      break;
    }
    case 'overage': {
      const min = parseHours(row.hours);
      res = min == null || min <= 0 ? { items: [], error: 'Enter overage credit hours' } : { items: overageItems(min, ctx) };
      break;
    }
    case 'vacation': {
      // Reserve line: a vacation day is an R-day. Its R-day value (RLG ÷ R-days on the line) counts toward RLG.
      const days = Math.max(0, Math.round(Number(row.count) || 0));
      const rdays = Math.max(1, Math.round(Number(row.rdays) || ctx.rule.rday.value.rDaysByWeeks[env.weeks || 4] || 15));
      if (!days) { res = { items: [], error: 'Enter the vacation days in this bid period' }; break; }
      if (!(env.gMin > 0)) { res = { items: [], error: 'Enter your RLG first' }; break; }
      const each = Math.round(env.gMin / rdays);
      res = { items: [item('toward', 'Vacation days', `${days} × ${H(each)} R-day value (${H(env.gMin)} RLG ÷ ${rdays} R-days) counts toward RLG`, 0, [ctx.rule.rday], { minutes: days * each })] };
      break;
    }
    case 'disrupt': {
      const k = ctx.rule.disrupt.value.kinds[row.kind];
      const n = Math.max(0, Math.round(Number(row.count) || 0));
      if (!k) { res = { items: [], error: 'Pick the disruption' }; break; }
      if (!n) { res = { items: [], error: `Enter how many (${k.per})` }; break; }
      const min = Math.round((k.tiers ? k.tiers[Math.min(n, k.tiers.length) - 1] : n * k.ch) * 60);
      const how = k.tiers ? `${n} ${n === 1 ? 'change' : 'changes'} on the trip = ${H(min)} CH` : `${n} × ${H(Math.round(k.ch * 60))} CH`;
      const label = row.label?.trim() ? `${k.label}: ${row.label.trim()}` : k.label;
      res = { items: [item('onTop', label, `${how} × ${$(ctx.rateCents)}`, payCents(min, ctx.rateCents, ctx.rule.disruptRate.value),
        [ctx.rule.rates, ctx.rule.disrupt, k.rate === 'normal' ? null : ctx.rule.disruptRate],
        { paidMin: min, disrupt: row.kind, sec: k.sec, payLog: payLogStatus(row.kind, ctx), logSent: !!row.logSent })] };
      break;
    }
    case 'override':
    case 'ulr': {
      const min = parseHours(row.hours);
      if (min == null || min <= 0) { res = { items: [], error: 'Enter credit hours' }; break; }
      const rate = row.type === 'override' ? ctx.overrideCents : ctx.ulrCents;
      const rule = row.type === 'override' ? ctx.rule.override : ctx.rule.ulr;
      res = { items: [item('onTop', t.label, `${H(min)} CH × ${$(rate)}`, payCents(min, rate, 100), [rule])] };
      break;
    }
    case 'perdiem': {
      const dom = parseHours(row.tafbDom) || 0;
      const intl = parseHours(row.tafbIntl) || 0;
      const items = [];
      if (dom > 0) items.push(item('perDiem', 'Per diem, domestic', `${H(dom)} TAFB × ${$(ctx.perDiemCents.domestic)}`, payCents(dom, ctx.perDiemCents.domestic, 100), [ctx.rule.perDiem]));
      if (intl > 0) items.push(item('perDiem', 'Per diem, international', `${H(intl)} TAFB × ${$(ctx.perDiemCents.international)}`, payCents(intl, ctx.perDiemCents.international, 100), [ctx.rule.perDiem]));
      res = { items, error: items.length ? null : 'Enter hours away from base' };
      break;
    }
    case 'adjust': {
      const c = parseMoney(row.amount);
      res = c == null ? { items: [], error: 'Enter a dollar amount' } : { items: [item('onTop', row.label?.trim() || t.label, 'Entered amount', c, [])] };
      break;
    }
    default: res = { items: [] };
  }
  return summarize({ row, ...res });
}

/* --------------------------------------------------------------------- trips */

export const ASSIGNMENTS = {
  line: { label: 'Line trip (100%)', short: 'Line', codes: 'TRP, M/U, PNP, MUS/MUD/MUV, SUB, RAT, TNG, PRO, PDO, AFB' },
  draft: { label: 'VLT / DRF / AVA (150%)', short: '150%', codes: 'VLT, DRF, AVA' },
  cmu: { label: 'CMU (150%)', short: 'CMU', codes: 'CMU' },
  pmu: { label: 'PMU / SMU (125%)', short: '125%', codes: 'PMU, SMU' },
  reserve: { label: 'Reserve', short: 'Reserve', codes: 'RSV' },
};

// On a pay-only line there are no line trips: a 100% trip is make-up flying, paid on top of the BLG.
const PAY_ONLY_LINE = { label: 'M/U (100%)', short: 'M/U', codes: 'M/U, MUS/MUD/MUV' };
export const assignInfo = (assign, payOnly = false) =>
  payOnly && (assign === 'line' || assign === 'reserve' || !ASSIGNMENTS[assign]) ? PAY_ONLY_LINE : ASSIGNMENTS[assign] || ASSIGNMENTS.line;

// Trip credit from duty-period block times.
//   dp: { credit: scheduled DP credit (optional, defaults to sched block), sched: scheduled block,
//         actual: actual block, dh: actual deadhead/ground block inside `actual` (optional, recap),
//         floor: MPDP or actual duty rig for this DP (optional, recap) }
// OSC (def. 109) = max(trip rig as scheduled + actual revenue block over 8 in any DP, sum of scheduled DP credit).
// ACH (def. 5)   = max(trip rig as flown + actual revenue block over 8 in any DP, sum of each DP's highest of
//                  MPDP, actual block, actual duty rig). Duty rig beyond on-duty limits isn't modelled; a pasted
//                  recap's Actual Pay is the company's ACH and is used while its block times are unchanged.
export function oscFromDutyPeriods(trip, ctx) {
  const v = ctx.rule.osc.value;
  let creditSum = 0;
  let achB = 0;
  let over = 0;
  let actualSum = 0;
  let anyActual = false;
  let allActual = true;
  const lines = [];
  (trip.dps || []).forEach((d, i) => {
    const sb = parseHours(d.sched);
    const ab = parseHours(d.actual);
    const sc = parseHours(d.credit) ?? sb;
    if (sc == null) return;
    creditSum += sc;
    if (ab == null) {
      allActual = false;
      achB += sc;
      lines.push({ label: `Duty period ${i + 1}: ${H(sc)} scheduled`, text: 'No actual block yet', cents: null });
      return;
    }
    anyActual = true;
    actualSum += ab;
    const rb = Math.max(0, ab - (parseHours(d.dh) || 0));
    const dpOver = Math.max(0, rb - v.blockOverHours * 60);
    over += dpOver;
    const given = parseHours(d.floor);
    const floor = given != null ? given : sb != null && sc > sb ? sc : Math.min(v.mpdpMin, sb ?? sc);
    const ach = Math.max(floor, ab);
    achB += ach;
    const parts = [`scheduled credit ${H(sc)}`, `actual block ${H(ab)}`];
    if (given != null) parts.push(`MPDP or duty rig ${H(given)}`);
    if (dpOver) parts.push(`${H(dpOver)} revenue block over ${v.blockOverHours}:00`);
    lines.push({ label: `Duty period ${i + 1}: actual credit ${H(ach)}`, text: parts.join(', '), cents: null, sources: given == null && ab < (sb ?? sc) && ach === floor ? [ctx.rule.oscFloor] : [] });
  });
  const schedTafb = parseHours(trip.schedTafb);
  const rig = schedTafb ? Math.round(schedTafb / v.tafbHoursPerCH) : null;
  const oscA = rig != null ? rig + over : null;
  const oscB = creditSum;
  const osc = Math.max(oscB, oscA ?? 0);
  const away = parseHours(trip.away);
  const rigA = anyActual && away ? Math.round(away / v.tafbHoursPerCH) : null;
  const achA = rigA != null ? rigA + over : null;
  const achCalc = Math.max(achB, achA ?? 0);
  const rc = trip.recap;
  const useRecap = rc?.actualPay != null && allActual && rc.actualBlock != null && Math.abs(actualSum - rc.actualBlock) <= 1;
  const ach = useRecap ? rc.actualPay : achCalc;
  if (oscA != null) lines.push({ label: `OSC (a): ${H(oscA)}`, text: `Trip rig ${H(rig)} (${H(schedTafb)} scheduled TAFB ÷ 3.75) + ${H(over)} revenue block over ${v.blockOverHours}:00`, cents: null });
  else lines.push({ label: 'OSC (a): not computed', text: 'Enter scheduled TAFB to test the trip rig', cents: null });
  lines.push({ label: `OSC (b): ${H(oscB)}`, text: 'Sum of scheduled duty period credits', cents: null });
  if (anyActual) {
    lines.push(useRecap
      ? { label: `ACH: ${H(ach)} from the recap`, text: `Actual Pay on the recap. App math: ${H(achCalc)}`, cents: null }
      : { label: `ACH: ${H(ach)}`, text: `Higher of ${achA != null ? `trip rig as flown ${H(rigA)} + ${H(over)} over 8:00 = ${H(achA)}, or ` : ''}sum of actual duty period credits ${H(achB)}`, cents: null });
  }
  return { osc, oscA, oscB, rig, over, creditSum, anyActual, allActual, ach, achCalc, achA, achB, rigA, fromRecap: useRecap, lines };
}

// Trip guarantee (SCH): as entered, or the sum of duty-period credits when block times are used.
export function tripSched(trip, ctx) {
  const entered = parseHours(trip.sched);
  if (entered != null) return { min: entered, fromDps: false };
  if (trip.bkoMode === 'block' && (trip.dps || []).length) {
    const o = oscFromDutyPeriods(trip, ctx);
    if (o.creditSum > 0) return { min: o.creditSum, fromDps: true };
  }
  return { min: 0, fromDps: false };
}

// BKO (4.FF) = OSC − SCH. In block mode, ACH above the higher of OSC and SCH is overage (4.BB.5.a).
export function tripBko(trip, ctx) {
  const sched = tripSched(trip, ctx).min;
  if (trip.bkoMode === 'block') {
    const o = oscFromDutyPeriods(trip, ctx);
    if (!o.anyActual) return { min: 0, pending: true, osc: o, overageMin: 0 };
    const min = Math.max(0, o.osc - sched);
    const overageMin = Math.max(0, o.ach - Math.max(o.osc, sched));
    return { min, osc: o, fromOsc: o.osc, belowScheduled: o.osc < sched, overageMin, ach: o.ach };
  }
  if (trip.bkoMode === 'actual') {
    const actual = parseHours(trip.actual);
    if (actual == null) return { min: 0, overageMin: 0 };
    return actual >= sched ? { min: actual - sched, fromOsc: actual, overageMin: 0 } : { min: 0, fromOsc: actual, belowScheduled: true, overageMin: 0 };
  }
  return { min: parseHours(trip.bko) || 0, overageMin: 0 };
}

export function calcTrip(trip, ctx) {
  const R = ctx.rateCents;
  const payOnly = !!ctx.payOnly;
  // Pay-only line: no reserve, and a 100% trip is make-up (M/U) flown on top of the BLG.
  const a = ASSIGNMENTS[trip.assign] && !(payOnly && trip.assign === 'reserve') ? trip.assign : 'line';
  const makeUp = payOnly && a === 'line';
  const schedInfo = tripSched(trip, ctx);
  const sched = schedInfo.min;
  const bko = tripBko(trip, ctx);
  const typedOvg = parseHours(trip.overage);
  const autoOvg = typedOvg == null ? bko.overageMin || 0 : 0;
  const ovg = typedOvg ?? autoOvg;
  const ovgLong = trip.overageShort !== true; // unticked: more than 2 hours into days off
  const ovgSrc = autoOvg > 0 ? [ctx.rule.overageAch] : [];
  const away = parseHours(trip.away) || 0;
  const intl = !!trip.intl;
  const items = [];
  const notes = [];
  const tripPctRule = a === 'draft' ? ctx.rule.draft : a === 'cmu' ? ctx.rule.cmu : a === 'pmu' ? ctx.rule.pmu : makeUp ? ctx.rule.payOnly : null;
  const tripPct = makeUp ? ctx.rule.payOnly.value.makeUpPct : tripPctRule ? tripPctRule.value : 100;
  const toward = a === 'reserve' ? 'RLG' : 'BLG';

  // CMU pays 150% only up to the pilot's compensatory make-up eligibility; credit hours past it pay
  // 100%, still on top of guarantee (4.Q.7). trip.cmuElig is the eligibility left for this trip; blank
  // means the whole trip is inside it. The trip guarantee uses it first, then block override, then overage.
  // On the stub a CMU hour inside eligibility shows as 1.5 hours on the regular pay line, so its paid
  // hours (which retiree health is charged on) carry the premium too.
  const cmuElig = a === 'cmu' ? parseHours(trip.cmuElig) : null;
  let eligLeft = cmuElig;
  const premiumMin = (min) => (a === 'cmu' ? Math.round((min * tripPct) / 100) : min);
  const payLine = (label, min, how, srcs, extra = {}) => {
    if (eligLeft == null || eligLeft >= min) {
      if (eligLeft != null) eligLeft -= min;
      items.push(item('onTop', label, `${H(min)} CH${how} × ${$(R)} × ${tripPct}%`, payCents(min, R, tripPct), srcs, { paidMin: premiumMin(min), ...extra }));
      return;
    }
    const inside = eligLeft;
    const past = min - inside;
    eligLeft = 0;
    if (inside > 0) items.push(item('onTop', `${label}, inside CMU eligibility`, `${H(inside)} CH × ${$(R)} × ${tripPct}%`, payCents(inside, R, tripPct), srcs, { paidMin: premiumMin(inside), ...extra }));
    items.push(item('onTop', `${label}, past CMU eligibility`, `${H(past)} CH × ${$(R)} × 100%`, payCents(past, R, 100), srcs, { paidMin: past, ...(inside > 0 ? {} : extra) }));
  };

  if (sched <= 0) notes.push('Enter the trip guarantee (scheduled credit hours)');
  if (schedInfo.fromDps) notes.push(`Trip guarantee taken from your duty period credits: ${H(sched)}`);
  if (a === 'cmu' && cmuElig == null) notes.push('Paid at 150% on the whole trip. If your CMU eligibility ran out part way, enter the hours you had left (4.Q.7)');

  // Trip guarantee
  if (sched > 0) {
    if ((a === 'line' && !makeUp) || a === 'reserve') {
      items.push(item('toward', 'Trip guarantee', `${H(sched)} CH counts toward ${toward}`, 0, [a === 'reserve' ? ctx.rule.reserve : ctx.rule.minG], { minutes: sched }));
    } else {
      payLine('Trip guarantee', sched, '', [ctx.rule.rates, tripPctRule]);
    }
  }

  // Block override (4.FF): same form and rate as trip guarantee; cash for a regular trip
  if (bko.pending) notes.push('After block-in, enter actual block for each duty period to compute BKO');
  if (bko.belowScheduled) notes.push(`OSC ${H(bko.fromOsc)} is below SCH ${H(sched)}, so no BKO. Trip guarantee still pays scheduled (4.F)`);
  if (bko.min > 0) {
    const how = bko.fromOsc != null ? ` (OSC ${H(bko.fromOsc)} − SCH ${H(sched)})` : '';
    const detail = bko.osc ? bko.osc.lines : [];
    const srcs = [ctx.rule.bko, bko.osc ? ctx.rule.osc : null];
    if (a === 'reserve') {
      items.push(item('toward', 'Block override (BKO)', `${H(bko.min)} CH${how} credited toward RLG`, 0, srcs, { minutes: bko.min, detail }));
    } else {
      payLine('Block override (BKO)', bko.min, how, [ctx.rule.rates, ...srcs, tripPctRule], { detail });
    }
  }

  // Overage (4.BB)
  if (autoOvg > 0) notes.push(`Overage ${H(autoOvg)}: actual credit (ACH) ${H(bko.ach)} is above ${bko.fromOsc >= sched ? `OSC ${H(bko.fromOsc)}` : `trip guarantee ${H(sched)}`} (4.BB.5). Type an overage figure to replace it`);
  if (ovg > 0) {
    const ov = ctx.rule.overage.value;
    if (a === 'reserve') {
      if (ovgLong) {
        items.push(item('onTop', 'Overage (reserve)', `${H(ovg)} CH × ${$(R)} × ${ov.reserveOverPct}%`, payCents(ovg, R, ov.reserveOverPct), [ctx.rule.rates, ctx.rule.overage, ...ovgSrc], { paidMin: ovg }));
      } else {
        items.push(item('toward', 'Overage (reserve)', `${H(ovg)} CH credited toward RLG at 100%`, 0, [ctx.rule.overage, ...ovgSrc], { minutes: ovg }));
      }
    } else if (ovgLong) {
      items.push(...overageItems(ovg, ctx));
    } else {
      payLine(autoOvg ? 'Overage (actual credit above OSC)' : 'Overage, 2 hrs or less into days off', ovg, '', [ctx.rule.rates, ctx.rule.overage, ...ovgSrc, tripPctRule]);
    }
  }

  // Grid penalty events (4.EE): international trips only
  const gpeCount = Math.max(0, Math.round(Number(trip.gpeCount) || 0));
  if (gpeCount > 0) {
    const g = ctx.rule.gpe.value;
    if (!intl) {
      notes.push('Grid penalties apply to international trips only (4.EE)');
    } else if (trip.gpeSame48) {
      notes.push('All GPEs touch one 48-hour period: no grid penalty due (4.EE.2)');
    } else if (gpeCount <= g.maxEventsForChPay) {
      const ch = gpeCount * g.chPerEvent * 60;
      items.push(item('onTop', 'Grid penalty', `${gpeCount} GPE × ${g.chPerEvent} CH × ${$(R)}`, payCents(ch, R, 100), [ctx.rule.rates, ctx.rule.gpe], { paidMin: ch }));
    } else {
      const withBko = ctx.rule.gpeBko.value && bko.min > 0;
      const base = sched + (withBko ? bko.min : 0);
      const label = withBko ? `(${H(sched)} + ${H(bko.min)} BKO)` : `${H(sched)}`;
      items.push(item('onTop', 'Grid penalty, 3+ GPEs', `${label} CH × ${$(R)} × ${g.premiumPct}%`, payCents(base, R, g.premiumPct), [ctx.rule.rates, ctx.rule.gpe, ctx.rule.gpeBko], { paidMin: Math.round((base * g.premiumPct) / 100) }));
    }
  }

  // International override (3.D) and ULR (3.F): trip guarantee + overage CH, not BKO
  const premBase = sched + ovg;
  const premText = ovg > 0 ? `(${H(sched)} + ${H(ovg)} overage) CH` : `${H(sched)} CH`;
  if (intl && premBase > 0) {
    items.push(item('onTop', 'International override', `${premText} × ${$(ctx.overrideCents)}`, payCents(premBase, ctx.overrideCents, 100), [ctx.rule.override, ctx.rule.tripClass]));
  }
  if (trip.ulr && premBase > 0) {
    items.push(item('onTop', 'Ultra long range premium', `${premText} × ${$(ctx.ulrCents)}`, payCents(premBase, ctx.ulrCents, 100), [ctx.rule.ulr]));
  }

  // Per diem (5.A)
  if (away > 0) {
    const rate = intl ? ctx.perDiemCents.international : ctx.perDiemCents.domestic;
    items.push(item('perDiem', `Per diem, ${intl ? 'international' : 'domestic'}`, `${H(away)} TAFB × ${$(rate)}`, payCents(away, rate, 100), [ctx.rule.perDiem, ctx.rule.tripClass]));
  }

  return summarize({ trip, items, notes, bkoMin: bko.min, schedMin: sched, bkoPending: !!bko.pending, oscMin: bko.fromOsc ?? null, achMin: bko.ach ?? null, autoOverageMin: autoOvg, overageMin: ovg });
}

// What one trip is worth if you pick it up: what it adds on top of guarantee, the rough take-home
// of that, and the take-home per hour and per day away from base.
//   as: 'draft' (VLT/DRF/AVA 150%), 'pmu' (125%) or 'makeup' (100%, paid on top)
export function tripWorth(trip, ctx, profile, as = 'draft') {
  const makeUp = as === 'makeup';
  const c = calcTrip({ ...trip, assign: makeUp ? 'line' : as }, makeUp ? { ...ctx, payOnly: true } : ctx);
  const net = estimateNet(c.totalCents, c.perDiemCents, profile, ctx, c.paidMin, { which: 'mid', marginal: true });
  const awayMin = parseHours(trip.away) || 0;
  return {
    as, calc: c, grossCents: c.totalCents, payCents: c.onTopCents, perDiemCents: c.perDiemCents, net, awayMin, schedMin: c.schedMin,
    perAwayHourCents: awayMin > 0 ? Math.round((net.netCents * 60) / awayMin) : null,
    perDayCents: awayMin > 0 ? Math.round((net.netCents * 1440) / awayMin) : null,
  };
}

function summarize(res) {
  const items = res.items || [];
  const sum = (k) => items.filter((i) => i.kind === k).reduce((s, i) => s + i.cents, 0);
  const onTopCents = sum('onTop');
  const perDiemCents = sum('perDiem');
  const towardMin = items.filter((i) => i.kind === 'toward').reduce((s, i) => s + (i.minutes || 0), 0);
  const paidMin = items.filter((i) => i.kind === 'onTop').reduce((s, i) => s + (i.paidMin || 0), 0);
  const label = (re) => items.filter((i) => re.test(i.label)).reduce((s, i) => s + i.cents, 0);
  return {
    ...res,
    items,
    onTopCents,
    perDiemCents,
    towardMin,
    paidMin,
    overrideCents: label(/^International override/),
    totalCents: onTopCents + perDiemCents, // dollars this entry adds above the guarantee
  };
}

/* --------------------------------------------------------------- typical rows */

// Pre-fill for a first estimate, from rules.assumptions. Scaled by bid period length.
export function typicalRows(profile, rules, code, weeks = 4) {
  const t = ruleAt(rules, 'assumptions', code).value.typical;
  const s = weeks / 4;
  const h = (hours) => H(Math.round(hours * 60 * s));
  if (profile.flying === 'international') {
    const out = [{ type: 'perdiem', tafbDom: '', tafbIntl: h(t.international.tafbIntlHours), preset: true }];
    if (t.international.overrideFollowsGuarantee) out.unshift({ type: 'override', hours: '', auto: 'guarantee', preset: true });
    return out;
  }
  return [{ type: 'perdiem', tafbDom: h(t.domestic.tafbDomHours), tafbIntl: '', preset: true }];
}

/* ------------------------------------------------------------------ periods */

// One bid period: guarantee plus everything above it.
// extrasCents = everything above BLG/RLG (paid on the NEXT period's 15th check).
export function calcPeriod(period, ctx, { whatIfMin = 0 } = {}) {
  const weeks = Number(period.weeks || ctx.profile.weeks || 4);
  const minHours = ctx.rule.minG.value[weeks];
  const minMin = (minHours ?? 68) * 60;
  const entered = parseHours(period.guarantee);
  const typical = parseHours(ctx.profile.lineValue);
  const gSource = entered > 0 ? 'entered' : typical > 0 ? 'typical' : 'minimum';
  const gMin = gSource === 'entered' ? entered : gSource === 'typical' ? typical : minMin;
  // Regular or reserve line: this bid period's own setting, else the one in Settings.
  const reserveLine = (period.line || ctx.profile.line) === 'reserve';
  const gLabel = reserveLine ? 'RLG' : 'BLG';
  const R = ctx.rateCents;

  // Pay-only line (instructional bid period): BLG of the pay-only line, the bid period override, and
  // anything picked up on top: M/U, VLT/DRF/AVA, CMU and PMU trips with their per diem, day-off
  // instruction, other pay (11.N.25.b.i, 11.M.13.b). The line's typical-estimate rows are set aside,
  // since a pay-only line has no line flying of its own.
  const payOnly = !!period.payOnly;
  const trips = (period.trips || []).map((t) => calcTrip(t, payOnly ? { ...ctx, payOnly: true } : ctx));
  const hasTrips = trips.length > 0;
  const allRows = period.rows || [];
  const setAside = ctx.rule.payOnly.value.setAsideRows;
  const replaced = (r) => (payOnly && (setAside.includes(r.type) || r.preset || r.auto === 'guarantee'))
    || (hasTrips && (r.type === 'perdiem' || r.type === 'override'));
  // An override row set to follow the guarantee uses the line value until the user types hours.
  const resolve = (r) => (r.auto === 'guarantee' && !(parseHours(r.hours) > 0) ? { ...r, hours: gMin / 60 } : r);
  const rows = allRows.filter((r) => !replaced(r)).map((r) => calcRow(resolve(r), ctx, { gMin, weeks }));
  const hiddenRowIds = allRows.filter(replaced).map((r) => r.id);
  const whatIf = whatIfMin > 0 ? calcRow({ id: 'whatif', type: 'draft', hours: whatIfMin / 60, whatIf: true }, ctx) : null;

  const guaranteeCents = payCents(gMin, R, 100);
  const towardMin = trips.reduce((s, t) => s + t.towardMin, 0) + rows.reduce((s, r) => s + r.towardMin, 0);
  const excessMin = Math.max(0, towardMin - gMin);
  const excessPct = reserveLine ? ctx.rule.reserve.value.overRlgPct : 100;
  const excess = excessMin > 0
    ? item('onTop', `Trip credit above ${gLabel}`, `(${H(towardMin)} − ${H(gMin)}) CH × ${$(R)} × ${excessPct}%`, payCents(excessMin, R, excessPct), [ctx.rule.rates, reserveLine ? ctx.rule.reserve : ctx.rule.minG], { paidMin: excessMin })
    : null;

  const roleE = roleOverride(ctx.profile, ctx);
  const entries = [...trips, ...rows, ...(roleE ? [roleE] : []), ...(whatIf ? [whatIf] : [])];
  const onTopCents = entries.reduce((s, e) => s + e.onTopCents, 0) + (excess ? excess.cents : 0);
  const paidExtraMin = entries.reduce((s, e) => s + e.paidMin, 0) + excessMin;
  const perDiemCents = entries.reduce((s, e) => s + e.perDiemCents, 0);
  const extrasCents = onTopCents + perDiemCents;
  const earnedCents = guaranteeCents + extrasCents;

  return {
    code: ctx.code, weeks, gLabel, reserveLine,
    guarantee: {
      minutes: gMin, minMinutes: minMin, source: gSource, isDefault: gSource === 'minimum', belowMin: gMin < minMin, cents: guaranteeCents,
      text: `${H(gMin)} CH × ${$(R)}`,
      sources: [ctx.rule.rates, ctx.rule.minG, payOnly ? ctx.rule.payOnly : null].filter(Boolean),
    },
    trips, rows, whatIf, role: roleE, hasTrips, hiddenRowIds, payOnly,
    towardMin, excess,
    onTopCents, perDiemCents, extrasCents, earnedCents, paidExtraMin,
    whatIfCents: whatIf ? whatIf.totalCents : 0,
    annualizedCents: Math.round((earnedCents * 52) / weeks),
  };
}

/* ------------------------------------------------------------------- checks */

export function checkDates(code) {
  const { year, month } = periodMonth(code);
  const nx = periodMonth(shiftPeriod(code, 1));
  return {
    mid: isoDate(year, month, 15),
    end: isoDate(year, month, lastDayOfMonth(year, month)),
    next: isoDate(nx.year, nx.month, 15),
  };
}

// The two checks in a bid period's month (3.E):
//   15th     = half of BLG/RLG + last period's extras (credits above guarantee, per diem, adjustments)
//   last day = the other half of BLG/RLG
// This period's extras land on next month's 15th.
// Retiree health (PRP/VEBA, 27.I.3) comes off the 15th only, on every credit hour paid for the bid
// period before it: vebaMin. With no previous period entered, this period's guarantee stands in.
// nextG (optional): { cents, minutes } of NEXT period's guarantee, so the next 15th can show in full.
export function calcChecks(cur, prev, nextG = null) {
  const dates = checkDates(cur.code);
  const half = Math.floor(cur.guarantee.cents / 2);
  const prevExtras = prev ? prev.extrasCents : 0;
  const prevPerDiem = prev ? prev.perDiemCents : 0;
  const nextHalf = nextG ? Math.floor(nextG.cents / 2) : 0;
  const paidCH = (p) => p.guarantee.minutes + p.paidExtraMin;
  return {
    mid: { date: dates.mid, grossCents: half + prevExtras, halfCents: half, prevExtrasCents: prevExtras, perDiemCents: prevPerDiem, hasPrev: !!prev, vebaMin: prev ? paidCH(prev) : cur.guarantee.minutes, vebaAssumed: !prev },
    end: { date: dates.end, grossCents: cur.guarantee.cents - half, halfCents: cur.guarantee.cents - half, perDiemCents: 0, vebaMin: 0 },
    next: {
      date: dates.next, extrasCents: cur.extrasCents, perDiemCents: cur.perDiemCents,
      full: !!nextG, halfCents: nextHalf, nextGMinutes: nextG ? nextG.minutes : 0,
      grossCents: nextHalf + cur.extrasCents,
      // Shown in full: the whole period's hours. Shown as extras only: just the extra hours.
      vebaMin: nextG ? paidCH(cur) : cur.paidExtraMin,
    },
  };
}

export function nextCheck(todayIso) {
  const [y, m, d] = todayIso.split('-').map(Number);
  const code = periodFromISO(todayIso);
  if (d <= 15) return { which: 'mid', date: isoDate(y, m, 15), code };
  return { which: 'end', date: isoDate(y, m, lastDayOfMonth(y, m)), code };
}

/* ---------------------------------------------------------------------- net */

// The month's two checks don't take the same deductions, so each keeps its own withholding
// percentage and its own "other deductions": withholding / otherDed for the 15th ('mid'),
// withholdingEnd / otherDedEnd for the last day ('end'). A blank one borrows the other check's figure.
export function checkDeductions(profile = {}, which = 'mid', defaultWhPct = 30) {
  const set = (v) => v != null && String(v).trim() !== '';
  const end = which === 'end';
  const [wh, whAlt] = end ? [profile.withholdingEnd, profile.withholding] : [profile.withholding, profile.withholdingEnd];
  const [od, odAlt] = end ? [profile.otherDedEnd, profile.otherDed] : [profile.otherDed, profile.otherDedEnd];
  const whUse = set(wh) ? wh : set(whAlt) ? whAlt : null;
  const odUse = set(od) ? od : set(odAlt) ? odAlt : null;
  return {
    whPct: whUse == null ? defaultWhPct : Number(whUse),
    whAssumed: whUse == null,
    otherCents: odUse == null ? 0 : Math.max(0, parseMoney(odUse) || 0),
    borrowed: (!set(wh) && set(whAlt)) || (!set(od) && set(odAlt)),
  };
}

// Rough net: arithmetic on the user's own percentages. Not a tax engine.
// vebaMin: the credit hours the retiree-health deduction (27.I.3) is taken on in this check.
// which: 'mid' (the 15th) or 'end' (the last day), for that check's own withholding and deductions.
// vebaCents: the per-hour rate when it belongs to another bid period (the 15th carries the one before).
// marginal: what one more trip adds, so the flat per-check deductions are left out.
export function estimateNet(grossCents, perDiemCents, profile, ctx, vebaMin = 0, { which = 'mid', vebaCents = ctx.vebaCents, marginal = false } = {}) {
  const a = ctx.rule.assumptions.value;
  const base = Math.max(0, a.perDiemInPayBase ? grossCents : grossCents - perDiemCents);
  const kPct = (Number(profile.pretax) || 0) + (Number(profile.roth) || 0) + (Number(profile.aftertax) || 0);
  const d = checkDeductions(profile, which, a.defaultWithholdingPct);
  const { whPct, whAssumed } = d;
  const duesPct = ctx.rule.dues.value.pct;
  const k401 = pctOf(base, kPct);
  const dues = pctOf(base, duesPct);
  const tax = pctOf(base, whPct);
  const veba = payCents(Math.max(0, vebaMin), vebaCents, 100);
  const other = grossCents > 0 && !marginal ? d.otherCents : 0;
  return { netCents: grossCents - k401 - dues - tax - veba - other, baseCents: base, k401, dues, tax, veba, other, vebaMin, vebaCents, which, borrowed: d.borrowed, kPct, whPct, duesPct, whAssumed };
}

/* -------------------------------------------------------------------- audit */

// Compare a pay stub's gross to the estimate and suggest what the gap looks like.
export function auditCheck(actualCents, estimateCents, parts, ctx) {
  const diff = actualCents - estimateCents;
  const abs = Math.abs(diff);
  if (abs <= 100) return { diff, verdict: 'match', lineMatches: [], equivalents: [] };
  const lineMatches = parts
    .filter((p) => p.cents && Math.abs(Math.abs(p.cents) - abs) <= Math.max(100, Math.abs(p.cents) * 0.01))
    .map((p) => ({ label: p.label, cents: p.cents }));
  const R = ctx.rateCents;
  const toMin = (pct) => Math.round((abs * 6000) / (R * pct));
  const equivalents = [
    { what: 'credit hours at 150% (draft, reserve over RLG, overage)', minutes: toMin(150) },
    { what: 'credit hours at 125% (PMU)', minutes: toMin(125) },
    { what: 'credit hours at 100%', minutes: toMin(100) },
    { what: 'of line value (each check carries half)', minutes: Math.round((abs * 2 * 60) / R) },
    { what: 'TAFB of international per diem', minutes: Math.round((abs * 60) / ctx.perDiemCents.international) },
  ];
  return { diff, verdict: diff > 0 ? 'over' : 'under', lineMatches, equivalents };
}
