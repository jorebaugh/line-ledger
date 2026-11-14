// 401(k) cap tracker: year to date (from a pasted stub, typed in, or estimated from your bid periods)
// plus a check-by-check projection to December 31. Arithmetic on plan and IRS limits, not advice.

import { RULES } from '../rules.js';
import { MONTHS, ruleAt, toCents, pctOf, parseMoney, formatMoney as $, formatDate, todayISO } from './core.js';
import { periodView } from './view.js';

export const AGE_BANDS = { u50: 'Under 50', '50to59': '50 to 59', '60to63': '60 to 63', '64plus': '64 and over' };

export function k401Limits(rules, ageBand, year) {
  const code = `JAN${String(year).slice(-2)}`;
  const irs = ruleAt(rules, 'irsLimits', code);
  const plan = ruleAt(rules, 'plan401k', `DEC${String(year).slice(-2)}`);
  const v = irs.value;
  const deferral = ageBand === '60to63' ? v.deferral60to63 : ageBand === '50to59' || ageBand === '64plus' ? v.deferral50 : v.deferral;
  return {
    year,
    deferral: toCents(deferral),
    deferralBase: toCents(v.deferral),
    total: toCents(v.totalAdditions),
    comp: toCents(v.compensationLimit),
    rothCatchUpWages: v.rothCatchUpWages ? toCents(v.rothCatchUpWages) : null,
    irs,
    plan,
    p: {
      companyPct: plan.value.companyPct,
      matchPct: plan.value.matchPct,
      matchOnFirst: toCents(plan.value.matchOnFirst),
      matchMax: toCents(plan.value.matchMax),
      pretaxRothMaxPct: plan.value.pretaxRothMaxPct,
      aftertaxMaxPct: plan.value.aftertaxMaxPct,
    },
  };
}

// Every check in a calendar year from the app's estimates: gross, per diem, and eligible pay
// (gross less non-taxable per diem, the base the stubs use for 401(k) and dues).
export function yearChecks(state, year) {
  const s = JSON.parse(JSON.stringify(state));
  const out = [];
  for (let m = 0; m < 12; m++) {
    const code = `${MONTHS[m]}${String(year).slice(-2)}`;
    const v = periodView(s, code, { whatIf: false });
    for (const which of ['mid', 'end']) {
      const ch = v.checks[which];
      out.push({ date: ch.date, code, which, grossCents: ch.grossCents, perDiemCents: ch.perDiemCents || 0, eligibleCents: Math.max(0, ch.grossCents - (ch.perDiemCents || 0)) });
    }
  }
  return out;
}

// Match: 50% of the first $1,000 of pre-tax + Roth per plan year (28.D.3).
const matchFor = (deferral, p) => Math.min(p.matchMax, pctOf(Math.min(p.matchOnFirst, deferral), p.matchPct));

// Project from a year-to-date starting point through the remaining checks.
//   ytd: { eligible, deferral (pre-tax + Roth), after, company, match } in cents
//   pct: { pretax, roth, after } in percent
export function k401Project({ checks, ytd, pct, limits }) {
  const L = limits;
  const p = L.p;
  let E = ytd.eligible;
  let D = ytd.deferral;
  let A = ytd.after;
  let C = ytd.company;
  let M = ytd.match;
  const dPct = (pct.pretax || 0) + (pct.roth || 0);
  const counted = () => Math.min(D, L.deferralBase) + A + C + M; // catch-up doesn't count toward 415(c)
  const flags = { deferralHit: D >= L.deferral ? 'already' : null, compPass: E >= L.comp ? 'already' : null, totalHit: counted() > L.total ? 'already' : null };
  let futureBase = 0;
  const rows = [];
  for (const ch of checks) {
    const e = ch.eligibleCents;
    const companyBase = Math.max(0, Math.min(e, L.comp - E));
    if (!flags.compPass && E + e > L.comp) flags.compPass = ch.date;
    E += e;
    const want = pctOf(e, dPct);
    const d = Math.min(want, Math.max(0, L.deferral - D));
    D += d;
    if (!flags.deferralHit && want > 0 && D >= L.deferral) flags.deferralHit = ch.date;
    const a = pctOf(e, pct.after || 0);
    A += a;
    const c = pctOf(companyBase, p.companyPct);
    C += c;
    M = Math.max(M, matchFor(D, p));
    futureBase += e;
    if (!flags.totalHit && counted() > L.total) flags.totalHit = ch.date;
    rows.push({ date: ch.date, eligible: e, deferral: d, after: a, company: c, companyBase });
  }
  const end = { eligible: E, deferral: D, after: A, company: C, match: M, catchUp: Math.max(0, D - L.deferralBase), counted: counted() };
  // After-tax % for the rest of the year that lands exactly on the total additions limit.
  const withoutAfter = end.counted - (A - ytd.after);
  const room = L.total - withoutAfter;
  const exactAfterPct = futureBase > 0 ? Math.max(0, Math.round((room / futureBase) * 10000) / 100) : null;
  return { rows, end, flags, futureBase, room, exactAfterPct, overTotal: Math.max(0, end.counted - L.total) };
}

// Year to date: typed-in figures win, then the latest stub this year, then an estimate.
export function k401Ytd(state, year, limits, asOfISO) {
  const k = state.k401 || {};
  const stub = (state.stubs || []).filter((s) => s.adviceDate?.startsWith(String(year))).sort((a, b) => (a.adviceDate < b.adviceDate ? 1 : -1))[0] || null;
  const pr = state.profile || {};
  const pct = { pretax: Number(pr.pretax) || 0, roth: Number(pr.roth) || 0, after: Number(pr.aftertax) || 0 };
  let ytd;
  let source;
  let asOf;
  if (stub) {
    asOf = stub.periodTo && stub.periodTo >= stub.adviceDate ? stub.periodTo : stub.adviceDate; // a 15th check can be paid early
    source = 'stub';
    ytd = {
      eligible: stub.pay.ytd,
      deferral: stub.k401.pretax.ytd + stub.k401.roth.ytd,
      after: stub.k401.after.ytd,
      company: stub.company.ytd,
      match: stub.match.ytd,
    };
  } else {
    asOf = asOfISO;
    source = 'estimate';
    const past = yearChecks(state, year).filter((c) => c.date <= asOfISO);
    const E = past.reduce((s, c) => s + c.eligibleCents, 0);
    const D = Math.min(limits.deferral, pctOf(E, pct.pretax + pct.roth));
    ytd = { eligible: E, deferral: D, after: pctOf(E, pct.after), company: pctOf(Math.min(E, limits.comp), limits.p.companyPct), match: matchFor(D, limits.p) };
  }
  const typed = {};
  for (const key of ['eligible', 'deferral', 'after', 'company', 'match']) {
    const c = parseMoney(k[key]);
    if (c != null && c >= 0) { ytd[key] = c; typed[key] = true; }
  }
  if (Object.keys(typed).length && source === 'estimate') source = 'typed';
  return { ytd, source, asOf, stub, pct, typed };
}

export function k401View(state, { today = todayISO() } = {}) {
  const year = Number(today.slice(0, 4));
  const ageBand = state.profile?.ageBand || 'u50';
  const limits = k401Limits(RULES, ageBand, year);
  const y = k401Ytd(state, year, limits, today);
  const future = yearChecks(state, year).filter((c) => c.date > y.asOf);
  const proj = k401Project({ checks: future, ytd: y.ytd, pct: y.pct, limits });
  return { year, ageBand, limits, ...y, future, proj, flags: k401Flags(proj, limits, y) };
}

const when = (d) => (d === 'already' ? null : formatDate(d));

// Plain-language results. Arithmetic only.
export function k401Flags(proj, L, y) {
  const out = [];
  const f = proj.flags;
  const yr = L.year;
  if (f.deferralHit === 'already') out.push({ tone: 'note', text: `You've reached the ${$(L.deferral)} employee limit for ${yr}. Pre-tax and Roth contributions stop for the rest of the year.` });
  else if (f.deferralHit) out.push({ tone: 'alert', text: `On pace to reach the ${$(L.deferral)} employee limit on the ${when(f.deferralHit)} check. Pre-tax and Roth stop after that.` });
  else out.push({ tone: 'plain', text: `Pre-tax and Roth on pace for ${$(proj.end.deferral, { whole: true })} of the ${$(L.deferral, { whole: true })} employee limit by December 31.` });

  if (f.compPass === 'already') out.push({ tone: 'note', text: `Your eligible pay is past the ${$(L.comp, { whole: true })} compensation limit. The company's ${L.p.companyPct}% stops counting pay above it, so it's done for ${yr} at ${$(proj.end.company)}.` });
  else if (f.compPass) out.push({ tone: 'note', text: `Eligible pay passes the ${$(L.comp, { whole: true })} compensation limit on the ${when(f.compPass)} check. Pay above it doesn't count for the company's ${L.p.companyPct}%.` });

  if (proj.overTotal > 0) out.push({ tone: 'alert', text: `On pace to exceed the ${$(L.total, { whole: true })} total additions limit by ${$(proj.overTotal)}${f.totalHit && f.totalHit !== 'already' ? `, starting on the ${when(f.totalHit)} check` : ''}.` });
  else out.push({ tone: 'plain', text: `Total additions on pace for ${$(proj.end.counted, { whole: true })} of ${$(L.total, { whole: true })}: ${$(L.total - proj.end.counted, { whole: true })} of room.` });

  if (L.deferral > L.deferralBase && L.rothCatchUpWages) out.push({ tone: 'plain', text: `The ${$(L.deferral - L.deferralBase, { whole: true })} catch-up above ${$(L.deferralBase, { whole: true })} has to go in as Roth if your ${yr - 1} FICA wages were over ${$(L.rothCatchUpWages, { whole: true })} (Code 414(v)(7)).` });

  if (proj.exactAfterPct != null) {
    const max = L.p.aftertaxMaxPct;
    if (proj.room <= 0) out.push({ tone: 'plain', text: 'No room left for after-tax contributions this year.' });
    else if (proj.exactAfterPct > max) out.push({ tone: 'plain', text: `Even ${max}% after-tax (the plan maximum) for the rest of ${yr} stays under the total additions limit.` });
    else out.push({ tone: 'plain', text: `An after-tax election of ${proj.exactAfterPct}% for the rest of ${yr} lands right on the ${$(L.total, { whole: true })} limit.` });
  }
  return out;
}
