// Glue between saved state and the pay math, plus the "how was this calculated" text
// for each figure. Used by Home and Pay.

import { RULES } from '../rules.js';
import { shiftPeriod, periodName, formatDate, formatHours as H, formatMoney as $, periodMonth, parseHours, payCents } from './core.js';
import { payContext, calcPeriod, calcChecks, estimateNet, ASSIGNMENTS, ROW_TYPES, seatName, fleetName } from './paymath.js';
import { CHECK_NAME, CHECK_A } from './stub.js';
import { ensurePeriod } from './store.js';

// Compute one bid period and the period before it (whose extras pay on this period's 15th).
// create=false: don't invent the previous period if the user never opened it.
export function periodView(state, code, { create = true, whatIf = true } = {}) {
  const prevCode = shiftPeriod(code, -1);
  const cur = ensurePeriod(state, code);
  const prevP = create ? ensurePeriod(state, prevCode) : state.periods[prevCode] || null;
  const ctx = payContext(RULES, state.profile, code);
  const c = calcPeriod(cur, ctx, { whatIfMin: whatIf ? cur.whatIf || 0 : 0 });
  const pctx = prevP ? payContext(RULES, state.profile, prevCode) : null;
  const p = prevP ? calcPeriod(prevP, pctx) : null;

  // Next bid period's line value, only if the user entered one (so the next 15th can show in full).
  const nextCode = shiftPeriod(code, 1);
  const nextMin = parseHours(state.periods[nextCode]?.guarantee);
  const nctx = nextMin > 0 ? payContext(RULES, state.profile, nextCode) : null;
  const nextG = nctx ? { minutes: nextMin, cents: payCents(nextMin, nctx.rateCents, 100), text: `${H(nextMin)} CH × ${$(nctx.rateCents)}` } : null;

  const checks = calcChecks(c, p, nextG);
  const profile = state.profile;
  // The 15th takes retiree health for the bid period before it, at that period's rate.
  const net = {
    mid: { ...estimateNet(checks.mid.grossCents, checks.mid.perDiemCents, profile, ctx, checks.mid.vebaMin, { which: 'mid', vebaCents: (pctx || ctx).vebaCents }), vebaFor: periodName(prevCode), vebaAssumed: checks.mid.vebaAssumed },
    end: estimateNet(checks.end.grossCents, 0, profile, ctx, 0, { which: 'end' }),
    next: { ...estimateNet(checks.next.grossCents, checks.next.perDiemCents, profile, ctx, checks.next.vebaMin, { which: 'mid' }), vebaFor: periodName(code) },
  };
  return { code, prevCode, nextCode, cur, prevP, ctx, pctx, c, p, nextG, checks, net };
}

export const monthShort = (code) => periodName(code).split(' ')[0];
export const dayLabel = (iso) => formatDate(iso);

/* ----------------------------------------------------------- explanations */

export function rateExplain(ctx) {
  const yg = ctx.yg.from === 'doh'
    ? `Year group ${ctx.yg.yg} as of ${formatDate(ctx.yg.asOf, { year: true })}, from your date of hire`
    : `Year group ${ctx.yg.yg}, as you picked it`;
  return {
    title: 'Hourly rate',
    lines: [
      { label: `${fleetName(ctx.fleet)} ${seatName(ctx.seat)}`, text: yg, cents: ctx.rateCents },
    ],
    sources: [ctx.rule.rates, ctx.rule.ygRule],
  };
}

export function guaranteeExplain(c, ctx) {
  const g = c.guarantee;
  const notes = [];
  if (g.source === 'minimum') notes.push(`Using the minimum guarantee for a ${c.weeks}-week bid period. Enter your awarded ${c.gLabel} to replace it.`);
  if (g.source === 'typical') notes.push(`Using your typical line value from Settings. Enter this bid period's awarded ${c.gLabel} to replace it.`);
  if (g.belowMin) notes.push(`Below the ${H(g.minMinutes)} minimum. That's only right if trips were dropped with reduced or no pay (4.A.2).`);
  return {
    title: `Guarantee (${c.gLabel})`,
    lines: [{ label: c.gLabel, text: g.text, cents: g.cents }],
    notes,
    sources: g.sources,
  };
}

// Every line item behind one trip or add-on row.
export function entryExplain(entry, title) {
  return {
    title,
    lines: entry.items.flatMap((i) => [{ label: i.label, text: i.text, cents: i.kind === 'toward' ? null : i.cents, sources: i.sources }, ...(i.detail || [])]),
    total: { label: 'Adds on top of guarantee', cents: entry.totalCents },
    notes: entry.notes || [],
  };
}

export function itemExplain(i) {
  return { title: i.label, lines: [{ label: i.label, text: i.text, cents: i.cents, sources: i.sources }, ...(i.detail || [])] };
}

export function entryTitle(entry) {
  if (entry.role) return entry.label;
  if (entry.trip) return entry.trip.label?.trim() || `${ASSIGNMENTS[entry.trip.assign]?.label || 'Trip'}`;
  if (entry.row?.whatIf) return 'What-if draft';
  const t = ROW_TYPES[entry.row?.type];
  if (entry.row?.type === 'disrupt') return entry.items[0]?.label || t.label;
  return (entry.row?.type === 'other' || entry.row?.type === 'adjust') && entry.row.label?.trim() ? entry.row.label.trim() : t?.label || 'Add-on';
}

// Flat list of every dollar line above guarantee in a calculated period.
export function extrasLines(calc) {
  const out = [];
  if (calc.excess) out.push({ label: calc.excess.label, text: calc.excess.text, cents: calc.excess.cents, sources: calc.excess.sources });
  for (const e of [...calc.trips, ...calc.rows, ...(calc.role ? [calc.role] : []), ...(calc.whatIf ? [calc.whatIf] : [])]) {
    const name = entryTitle(e);
    for (const i of e.items) {
      if (i.kind === 'toward') continue;
      const label = i.label.startsWith(name) ? i.label : e.trip || e.items.length > 1 ? `${name}: ${i.label}` : name;
      out.push({ label, text: i.text, cents: i.cents, sources: i.sources });
    }
  }
  return out;
}

export function checkExplain(v, which) {
  const { c, p, checks, ctx } = v;
  const ck = checks[which];
  const half = { label: `Half of ${c.gLabel}`, text: `${H(c.guarantee.minutes)} CH × ${$(ctx.rateCents)} ÷ 2`, cents: ck.halfCents, sources: c.guarantee.sources };
  if (which === 'end') {
    return { title: `${formatDate(ck.date)} check`, lines: [half], total: { label: 'Gross', cents: ck.grossCents }, sources: [ctx.rule.checks] };
  }
  if (which === 'next') {
    const nextName = monthShort(shiftPeriod(c.code, 1));
    if (ck.full) {
      return {
        title: `${formatDate(ck.date)} check`,
        lines: [{ label: `Half of ${nextName} ${c.gLabel}`, text: `${v.nextG.text} ÷ 2`, cents: ck.halfCents, sources: [ctx.rule.rates] }, ...extrasLines(c)],
        total: { label: 'Gross', cents: ck.grossCents },
        notes: [`Uses the ${nextName} line value you entered.`],
        sources: [ctx.rule.checks, ctx.rule.perDiem],
      };
    }
    return {
      title: `${formatDate(ck.date)} check (this bid period's part)`,
      lines: extrasLines(c),
      total: { label: `${periodName(c.code)} extras paid ${formatDate(ck.date)}`, cents: ck.extrasCents },
      notes: [`The ${formatDate(ck.date)} check will also carry half of the ${nextName} ${c.gLabel}. Enter the ${nextName} line value to see the whole check.`],
      sources: [ctx.rule.checks, ctx.rule.perDiem],
    };
  }
  const lines = [half, ...(p ? extrasLines(p) : [])];
  const presetOnly = v.prevP && v.prevP.trips.length === 0 && v.prevP.rows.length > 0 && v.prevP.rows.every((r) => r.preset);
  const notes = !p
    ? [`Nothing entered for ${periodName(v.prevCode)} yet, so last period's extras show as $0.`]
    : presetOnly ? [`${periodName(v.prevCode)} is a typical estimate (per diem and override pre-filled). Enter what you actually flew on the Pay screen.`] : [];
  return { title: `${formatDate(ck.date)} check`, lines, total: { label: 'Gross', cents: ck.grossCents }, notes, sources: [ctx.rule.checks] };
}

export function netExplain(n, grossCents, perDiemCents, title, ctx) {
  const lines = [
    { label: 'Gross', cents: grossCents },
    ...(perDiemCents ? [{ label: 'Per diem (left out of deductions)', text: `${$(perDiemCents)} is not in the pay base`, cents: null }] : []),
    { label: '401(k) elections', text: `${n.kPct}% × ${$(n.baseCents)}`, cents: -n.k401 },
    { label: 'Union dues', text: `${n.duesPct}% × ${$(n.baseCents)}`, cents: -n.dues },
    { label: `Withholding${n.whAssumed ? ' (assumed)' : ''}`, text: `${n.whPct}% × ${$(n.baseCents)}`, cents: -n.tax },
    ...(n.veba ? [{ label: 'Retiree health (PRP/VEBA)', text: `${H(n.vebaMin)} CH paid${n.vebaFor ? ` for ${n.vebaFor}` : ''} × ${$(n.vebaCents)}`, cents: -n.veba, sources: [ctx.rule.veba] }] : []),
    ...(n.other ? [{ label: 'Other deductions', text: `Insurance, medical and the like on ${CHECK_NAME[n.which]} checks, from Settings`, cents: -n.other }] : []),
  ];
  const other = n.which === 'end' ? 'mid' : 'end';
  return {
    title,
    lines,
    total: { label: 'Est. net (rough)', cents: n.netCents },
    notes: [
      'Rough on purpose: your own withholding percentage, not a tax calculation. Elections stop when you hit an annual limit, which this ignores.',
      ...(n.whAssumed ? ['Withholding is assumed. Set yours in Settings › Taxes and deductions.'] : []),
      ...(n.borrowed ? [`No ${CHECK_NAME[n.which]} figures yet, so this uses your ${CHECK_NAME[other]} check's. The two checks differ: add ${CHECK_A[n.which]} stub in Settings › Taxes and deductions.`] : []),
      ...(n.which === 'end' ? ['Retiree health (PRP/VEBA) is not taken from this check. It comes off the 15th, for the whole bid period before.'] : []),
      ...(n.vebaAssumed ? ['Last bid period is not entered, so retiree health uses this period\'s guarantee hours.'] : []),
    ],
    sources: [ctx.rule.dues, ctx.rule.assumptions],
  };
}

export function annualExplain(c) {
  return {
    title: 'Annualized gross',
    lines: [
      { label: `${periodName(c.code)} earns`, text: `Guarantee + everything above it`, cents: c.earnedCents },
      { label: 'Scaled to a year', text: `× 52 weeks ÷ ${c.weeks}-week bid period`, cents: c.annualizedCents },
    ],
    notes: ['Assumes every bid period looks like this one. Includes per diem.'],
  };
}

export function earnedExplain(c, ctx) {
  const lines = [
    { label: `Guarantee (${c.gLabel})`, text: c.guarantee.text, cents: c.guarantee.cents, sources: c.guarantee.sources },
    ...extrasLines(c),
  ];
  return { title: `${periodName(c.code)} earns`, lines, total: { label: 'Total', cents: c.earnedCents }, sources: [ctx.rule.checks] };
}

export const monthOf = (code) => periodMonth(code);
