// Retirement election comparison: stay in the pension, the cash balance plan (MBCBP), or the enhanced
// 401(k). Arithmetic on Section 28 and the MBCBP/Enhanced PRSP Benefit Implementation LOA, with the
// pilot's own assumptions. Future dollars before tax. Not a recommendation.

import { RULES } from '../rules.js';
import { ruleAt, toCents, pctOf } from './core.js';

export const PATHS = {
  pension: { label: 'Stay in the pension', short: 'Pension' },
  cb: { label: 'Cash balance plan', short: 'Cash bal.' },
  enh: { label: 'Enhanced 401(k)', short: 'Enh. 401(k)' },
};

const yy = (year) => String(year).slice(-2);
const roundTo = (dollars, step) => Math.floor(dollars / step) * step;

// IRS limits for a calendar year: published years as loaded; later years grown at an assumed rate and
// rounded down the way the Code rounds them (402(g) to $500, 415(c) to $1,000, 401(a)(17) to $5,000).
export function irsFor(year, growPct = 0, rules = RULES) {
  const rule = ruleAt(rules, 'irsLimits', `JAN${yy(year)}`);
  const base = Number(`20${rule.effectiveFrom.slice(3)}`);
  const v = rule.value;
  const f = (1 + growPct / 100) ** Math.max(0, year - base);
  const grown = year > base;
  return {
    year,
    projected: grown,
    deferral: toCents(grown ? roundTo(v.deferral * f, 500) : v.deferral),
    total: toCents(grown ? roundTo(v.totalAdditions * f, 1000) : v.totalAdditions),
    comp: toCents(grown ? roundTo(v.compensationLimit * f, 5000) : v.compensationLimit),
    rule,
  };
}

// Present value at retirement of 1 a year paid at the start of each year for n years.
export function annuityFactor(ratePct, years) {
  const d = 1 + ratePct / 100;
  let f = 0;
  for (let k = 0; k < years; k++) f += d ** -k;
  return f;
}

const companyPct = (path, year, R) => {
  if (path === 'enh') {
    const steps = R.enhanced401k.company401k;
    const hit = [...steps].reverse().find((s) => year >= Number(s.from.slice(0, 4)));
    return hit ? hit.pct : R.pension.company401kPct;
  }
  return R.pension.company401kPct;
};

const cbCreditPct = (year, R) => {
  const hit = [...R.cashBalance.credits].reverse().find((s) => year >= Number(s.from.slice(0, 4)));
  return hit ? hit.pct : 0;
};

// inp (numbers; money in cents):
//   year0 the current calendar year · age at the end of year0 · retireAge (retire at the end of that year)
//   svc credited years on June 1, 2027 · payCents this year's pay less per diem · best5Cents average of
//   the best five calendar years so far · growthPct · prspPct 401(k) return · cbPct cash balance interest ·
//   discountPct · payToAge · limitGrowthPct · deferPct pre-tax + Roth · afterPct after-tax
export function retireCompare(inp, rules = RULES) {
  const R = ruleAt(rules, 'retirementElection', 'JUL26').value;
  const plan = ruleAt(rules, 'plan401k', 'JUL26').value;
  const errors = [];
  const age = Number(inp.age);
  const retireAge = Number(inp.retireAge);
  if (!Number.isFinite(age) || age < 21 || age > 64) errors.push('Enter your age (21 to 64).');
  else if (!Number.isFinite(retireAge) || retireAge <= age || retireAge > R.regulatedAge) errors.push(`Pick a retirement age after this year and no later than ${R.regulatedAge}.`);
  if (!Number.isFinite(inp.svc) || inp.svc < 0 || inp.svc > 45) errors.push('Enter your credited years of service on June 1, 2027.');
  if (!(inp.payCents > 0)) errors.push("Enter this year's pay.");
  if (errors.length) return { ok: false, errors };

  const year0 = inp.year0;
  const lastYear = year0 + (retireAge - age); // retire at the end of this year
  const years = [];
  for (let y = year0 + 1; y <= lastYear; y++) years.push(y);
  const pay = (y) => Math.round(inp.payCents * (1 + inp.growthPct / 100) ** (y - year0));
  const best5 = inp.best5Cents > 0 ? inp.best5Cents : inp.payCents;

  // Final average earnings: best five calendar years. Earlier years count at your best-five average so far.
  const history = [best5, best5, best5, best5, best5, ...years.map(pay)];
  const top5 = [...history].sort((a, b) => b - a).slice(0, R.pension.faeYears);
  const faeRaw = Math.round(top5.reduce((s, c) => s + c, 0) / top5.length);

  const servedFrom2027 = Math.max(0, lastYear - 2027) + R.frozen.lastYearFraction; // Jun 1, 2027 to Dec 31 of the last year
  const yearsStay = Math.min(R.pension.maxYears, inp.svc + servedFrom2027);
  const yearsFrozen = Math.min(R.pension.maxYears, inp.svc + R.frozen.lastYearFraction);

  const matchFor = (D) => Math.min(toCents(plan.matchMax), pctOf(Math.min(toCents(plan.matchOnFirst), D), plan.matchPct));
  const payYears = Math.max(0, inp.payToAge - retireAge);
  const factor = annuityFactor(inp.discountPct, payYears);

  const out = {};
  const rows = years.map((y) => ({ year: y, pay: pay(y), irs: irsFor(y, inp.limitGrowthPct, rules) }));
  for (const path of Object.keys(PATHS)) {
    const elect = path !== 'pension';
    const faeCap = toCents(elect ? R.frozen.faeCap : R.pension.faeCap);
    const fae = Math.min(faeRaw, faeCap);
    const credited = elect ? yearsFrozen : yearsStay;
    const annual = Math.round((fae * R.pension.multiplierPct * credited) / 100);

    let prsp = 0;
    let prspIn = 0;
    let cb = 0;
    let cbIn = 0;
    let cash = 0;
    const byYear = [];
    for (const row of rows) {
      const { year: y, pay: P, irs: L } = row;
      const D = Math.min(L.deferral, pctOf(P, inp.deferPct || 0));
      const A = pctOf(P, inp.afterPct || 0);
      const M = matchFor(D);
      const pct = companyPct(path, y, R);
      const want = pctOf(P, pct);
      const byComp = pctOf(Math.min(P, L.comp), pct);
      const room = Math.max(0, L.total - D - A - M); // your own elections are counted first
      const inPlan = Math.min(byComp, room);
      const cashY = elect && y >= Number(R.cashOverCap.from.slice(0, 4)) ? want - inPlan : 0;
      prsp = Math.round(prsp * (1 + inp.prspPct / 100)) + inPlan + M;
      prspIn += inPlan + M;
      cash += cashY;
      let credit = 0;
      if (path === 'cb') {
        credit = pctOf(Math.min(P, L.comp), cbCreditPct(y, R));
        cb = Math.round(cb * (1 + inp.cbPct / 100)) + credit;
        cbIn += credit;
      }
      byYear.push({ year: y, pay: P, pct, inPlan, match: M, cash: cashY, credit, room });
    }
    cb = Math.max(cb, cbIn); // the cash balance plan never pays back less than the credits (28.C.9.a)

    // 25+ credited years on June 1, 2027 and electing: one-time taxable payment early in 2028 (LOA A.1.a.vi, b.iv).
    let bonus = 0;
    const fb = R.fullServiceBonus;
    if (elect && inp.svc >= fb.minYears) {
      const P27 = pay(2027);
      const c27 = irsFor(2027, 0, rules).comp;
      bonus = Math.max(0, Math.round(fb.fraction * (pctOf(P27, fb.highPct) - pctOf(Math.min(P27, c27), fb.lowPct))));
    }

    const lump = Math.round(annual * factor);
    const total = lump + prsp + cb;
    out[path] = {
      path, faeRaw, faeCap, fae, credited, annual, lump, prsp, prspIn, cb, cbIn, cash, bonus, total,
      perYear: factor > 0 ? Math.round(total / factor) : 0,
      byYear,
    };
  }
  for (const k of ['cb', 'enh']) out[k].diff = out[k].total - out.pension.total;
  out.pension.diff = 0;

  return { ok: true, errors: [], year0, lastYear, retireAge, years: years.length, factor, payYears, faeRaw, top5, rows, paths: out, R };
}

// Credited years on June 1, 2027 from a date of hire. Leaves and furloughs make the real figure lower.
export function serviceFromDoh(doh, asOf = '2027-06-01') {
  if (!doh) return null;
  const ms = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${doh}T00:00:00Z`);
  return ms > 0 ? Math.round((ms / (365.25 * 864e5)) * 10) / 10 : 0;
}
