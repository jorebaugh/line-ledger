// Reads a pasted pay stub (earnings statement). Pure functions; runs on the phone only.
// Only lines that are a pay label followed by dollar amounts, and the pay dates, are read.
// Name, address, employee ID, advice and batch numbers and account numbers are never read or kept.

import { parseMoney } from './core.js';

const NUM = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/;
const TOTALS = {
  'TOTAL GROSS PAY': 'gross',
  'TOTAL TAXES': 'taxes',
  'TOTAL DEDUCTIONS': 'deductions',
  'NET PAY': 'net',
  'FED TAX WAGES': 'fedTaxWages',
  'TOTAL ER PD BENEF': 'erTotal',
  'TOTAL TXBLE BENEF': 'txbl',
};
const TAX = /withhold|med\/ee|oasdi|addl med|medicare|fica|state|\bsit\b|\bsdi\b|local|city/i;
const SECTION = /^(Earns-Category|Check Summary|Taxes\b|Deductions\b|Txbl Benefits|ER Paid Benefits|Other Information|For Legal)/i;

const toISO = (mdy) => {
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
};

function splitLine(line) {
  const toks = line.trim().split(/\s+/);
  const nums = [];
  while (toks.length && NUM.test(toks[toks.length - 1])) nums.unshift(parseMoney(toks.pop()));
  const label = toks.join(' ').trim();
  if (!label || !nums.length || /sub-?total/i.test(line)) return null;
  if (!/[A-Za-z]/.test(label)) return null;
  return { label, nums };
}

// Lines with one amount are either "this check" or "year to date". Pick the ones that make the
// section's "this check" total add up; the rest are year to date.
function resolve(lines, totalCur) {
  const two = lines.filter((l) => l.nums.length >= 2);
  const one = lines.filter((l) => l.nums.length === 1);
  const fixedCur = two.reduce((s, l) => s + l.nums[l.nums.length - 2], 0);
  const gap = totalCur == null ? 0 : totalCur - fixedCur;
  let pick = 0;
  if (gap !== 0 && one.length <= 16) {
    for (let mask = 1; mask < 1 << one.length; mask++) {
      let sum = 0;
      for (let i = 0; i < one.length; i++) if (mask & (1 << i)) sum += one[i].nums[0];
      if (sum === gap) { pick = mask; break; }
    }
  }
  return lines.map((l) => {
    if (l.nums.length >= 2) return { label: l.label, cur: l.nums[l.nums.length - 2], ytd: l.nums[l.nums.length - 1], units: l.nums.length >= 3 ? l.nums[0] : null };
    const i = one.indexOf(l);
    return pick & (1 << i) ? { label: l.label, cur: l.nums[0], ytd: null } : { label: l.label, cur: 0, ytd: l.nums[0] };
  });
}

export function deductionKind(label) {
  const l = label.replace(/^[&@\s]+/, '');
  if (/401k|401\(k\)|PRSP/i.test(l)) {
    if (/roth|rth/i.test(l)) return 'roth';
    if (/aft|atx|after/i.test(l)) return 'after';
    return 'pretax';
  }
  if (/dues/i.test(l)) return 'dues';
  if (/prp|veba/i.test(l)) return 'veba';
  if (/devbank|deviation/i.test(l)) return 'devbank';
  return 'other';
}

export function parseStub(text) {
  const s = String(text || '').replace(/\r/g, '');
  const out = { ok: false };
  const pp = s.match(/Pay Period:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*-?\s*(\d{1,2}\/\d{1,2}\/\d{4})?/i);
  const sal = s.match(/Salaried Period\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  out.periodFrom = toISO(pp?.[1] || sal?.[1] || '') || null;
  out.periodTo = toISO(pp?.[2] || sal?.[2] || '') || null;
  const ad = s.match(/Advice Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  out.adviceDate = ad ? toISO(ad[1]) : out.periodTo;

  const totals = {};
  const earn = [];
  const tax = [];
  const ded = [];
  const er = [];
  let section = '';
  for (const raw of s.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const sec = line.match(SECTION);
    if (sec) { section = sec[1].toLowerCase(); continue; }
    const p = splitLine(line);
    if (!p) continue;
    const key = TOTALS[p.label.toUpperCase().replace(/\s+/g, ' ')];
    if (key) {
      if (!totals[key]) totals[key] = { cur: p.nums.length >= 2 ? p.nums[p.nums.length - 2] : p.nums[0], ytd: p.nums[p.nums.length - 1] };
      continue;
    }
    if (/^@/.test(p.label)) { if (/prsp|match|401k/i.test(p.label)) er.push(p); continue; }
    if (TAX.test(p.label)) { tax.push(p); continue; }
    if (section.startsWith('deductions')) { ded.push(p); continue; }
    if (section.startsWith('txbl') || section.startsWith('er paid')) continue;
    earn.push(p);
  }

  out.gross = totals.gross || null;
  out.taxes = totals.taxes || null;
  out.deductions = totals.deductions || null;
  out.net = totals.net || null;
  out.fedTaxWages = totals.fedTaxWages || null;
  out.earnings = resolve(earn, out.gross?.cur).map((e) => ({ ...e, perDiem: /N\/T PD|per ?diem/i.test(e.label) }));
  out.taxLines = resolve(tax, out.taxes?.cur);
  out.deductionLines = resolve(ded, out.deductions?.cur).map((d) => ({ ...d, kind: deductionKind(d.label) }));
  out.employer = er.map((p) => ({ label: p.label.replace(/^[@&\s]+/, ''), cur: p.nums.length >= 2 ? p.nums[p.nums.length - 2] : 0, ytd: p.nums[p.nums.length - 1] }));
  out.ok = !!(out.gross && (out.deductionLines.length || out.taxLines.length));
  return out;
}

// Turn a parsed stub into the numbers the app keeps. Nothing personal is in here.
export function summarizeStub(st) {
  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const kind = (k) => st.deductionLines.filter((d) => d.kind === k);
  const pair = (arr) => ({ cur: sum(arr, 'cur'), ytd: sum(arr, 'ytd') });
  const pd = st.earnings.filter((e) => e.perDiem);
  const perDiem = { cur: sum(pd, 'cur'), ytd: pd.reduce((s, e) => s + (e.ytd ?? e.cur ?? 0), 0) };
  const pay = { cur: (st.gross?.cur || 0) - perDiem.cur, ytd: (st.gross?.ytd || 0) - perDiem.ytd };
  const company = st.employer.filter((e) => /prsp|emplr|non.?elect/i.test(e.label) && !/match/i.test(e.label));
  const match = st.employer.filter((e) => /match/i.test(e.label));
  const other = kind('other');
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 10000) / 100 : null);
  const k = { pretax: pair(kind('pretax')), roth: pair(kind('roth')), after: pair(kind('after')) };
  return {
    adviceDate: st.adviceDate,
    periodFrom: st.periodFrom,
    periodTo: st.periodTo,
    gross: st.gross,
    taxes: st.taxes,
    net: st.net,
    perDiem,
    pay, // gross less non-taxable per diem: the 401(k) and dues base on these stubs
    k401: k,
    dues: pair(kind('dues')),
    veba: pair(kind('veba')),
    company: pair(company),
    match: pair(match),
    other: { cur: sum(other, 'cur'), lines: other.filter((d) => d.cur).map((d) => ({ label: d.label.replace(/^[&@\s]+/, ''), cur: d.cur })) },
    rates: {
      taxCur: pct(st.taxes?.cur || 0, pay.cur),
      taxYtd: pct(st.taxes?.ytd || 0, pay.ytd),
      pretax: pct(k.pretax.cur, pay.cur),
      roth: pct(k.roth.cur, pay.cur),
      after: pct(k.after.cur, pay.cur),
      dues: pct(sum(kind('dues'), 'cur'), pay.cur),
    },
  };
}
