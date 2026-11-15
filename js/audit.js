// Line-by-line check of a saved pay stub against what the app expected for that check.
// Pure functions: a stub summary (js/stub.js) and a period view (js/view.js) in, a comparison out.
// The app's side is only as good as what the pilot entered, so every verdict says so.

import { periodFromISO, periodName, formatDate, formatHours as H, formatMoney as $ } from './core.js';
import { stubWhich } from './stub.js';

// The bid period a stub's check belongs to: its pay period, or its date when that is missing.
export const stubCode = (s) => periodFromISO(s.periodTo || s.adviceDate);

// The saved stubs for one bid period's two checks.
export function stubsFor(stubs, code) {
  const list = (stubs || []).filter((s) => stubCode(s) === code);
  return { mid: list.find((s) => stubWhich(s) === 'mid') || null, end: list.find((s) => stubWhich(s) === 'end') || null };
}

// Which of the app's lines a stub earnings code belongs to. Only codes seen on real stubs are named;
// every other code is pay above guarantee, compared as one total.
export function earnKind(label) {
  const l = String(label).replace(/^[&@\s]+/, '');
  if (/\b(BLG|RLG)\b/i.test(l)) return 'guarantee';
  if (/N\/T PD|per ?diem/i.test(l)) return 'perDiem';
  if (/intl|int'l/i.test(l)) return 'intl';
  if (/instr|chk ?air|check ?air|\bLCA\b|\bPCA\b|\bFPS\b/i.test(l)) return 'role';
  return 'other';
}

export const AUDIT_ROWS = [
  ['guarantee', 'Half of guarantee'],
  ['other', 'Pay above guarantee'],
  ['intl', 'International override'],
  ['role', 'Instructor or check airman override'],
  ['perDiem', 'Per diem'],
];

// What the app expects on one check, line by line, each tagged with the row it belongs to.
// The 15th carries half of this period's guarantee plus everything above guarantee from the period before.
export function expectedLines(v, which) {
  const ck = v.checks[which];
  const out = [{ kind: 'guarantee', label: `Half of ${v.c.gLabel}`, text: `${H(v.c.guarantee.minutes)} CH × ${$(v.ctx.rateCents)} ÷ 2`, cents: ck.halfCents, sources: v.c.guarantee.sources }];
  const p = which === 'mid' ? v.p : null;
  if (!p) return out;
  if (p.excess) out.push({ kind: 'other', label: p.excess.label, text: p.excess.text, cents: p.excess.cents, sources: p.excess.sources });
  for (const e of [...p.trips, ...p.rows, ...(p.role ? [p.role] : [])]) {
    const name = e.role ? null : e.trip ? e.trip.label?.trim() || 'Trip' : null;
    for (const i of e.items) {
      if (i.kind === 'toward') continue;
      const kind = i.kind === 'perDiem' ? 'perDiem' : e.role ? 'role' : /^International override/.test(i.label) ? 'intl' : 'other';
      out.push({
        kind, label: name ? `${name}: ${i.label}` : i.label, text: i.text, cents: i.cents, sources: i.sources,
        sec: i.sec || null, payLog: i.payLog || null, logSent: !!i.logSent,
      });
    }
  }
  return out;
}

const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);

// Compare a saved stub with the app's figures for the same check.
//   verdict: 'match' every line within the tolerance · 'short' the stub paid less · 'over' it paid more ·
//            'split' the total agrees but the lines are divided differently
export function auditStub(s, v, { tolerance = 100 } = {}) {
  const which = stubWhich(s);
  const app = expectedLines(v, which);
  const gross = { stub: s.gross?.cur || 0, app: v.checks[which].grossCents };
  gross.diff = gross.stub - gross.app;
  const rate = (which === 'mid' && v.pctx ? v.pctx : v.ctx).rateCents;
  const hoursAt = (cents, pct) => Math.round((Math.abs(cents) * 6000) / (rate * pct));
  const prevP = v.prevP;
  // Nothing real entered for the bid period this 15th pays out: the app has no basis for the extras.
  const prevEmpty = which === 'mid' && (!prevP || (prevP.trips.length === 0 && prevP.rows.every((r) => r.preset)));
  const base = { which, date: s.adviceDate, code: stubCode(s), gross, prevEmpty, rate };
  const grossVerdict = Math.abs(gross.diff) <= tolerance ? 'match' : gross.diff < 0 ? 'short' : 'over';
  if (!Array.isArray(s.earn)) return { ...base, lineByLine: false, rows: [], verdict: grossVerdict, shortCents: Math.max(0, -gross.diff), logsDue: [] };

  const rows = AUDIT_ROWS.map(([kind, label]) => {
    const stubLines = s.earn.filter((e) => earnKind(e.label) === kind);
    const appLines = app.filter((a) => a.kind === kind);
    const stubCents = sum(stubLines, 'cur');
    const appCents = sum(appLines, 'cents');
    const diff = stubCents - appCents;
    const status = Math.abs(diff) <= tolerance ? 'match' : diff < 0 ? 'short' : 'over';
    // A short line that is about the size of one of the app's own lines: that line is the likely one.
    const likely = status === 'short'
      ? appLines.find((a) => a.cents > 0 && Math.abs(a.cents + diff) <= Math.max(tolerance, a.cents * 0.01)) || null
      : null;
    return {
      kind, label: kind === 'guarantee' ? `Half of ${v.c.gLabel}` : label, stubCents, appCents, diff, status, stubLines, appLines, likely,
      hours: status === 'match' || kind === 'perDiem' || kind === 'intl' || kind === 'role' ? null : { at100: hoursAt(diff, 100), at150: hoursAt(diff, 150) },
    };
  }).filter((r) => r.kind === 'guarantee' || r.stubCents || r.appCents);

  const off = rows.filter((r) => r.status !== 'match');
  const verdict = !off.length ? 'match' : grossVerdict === 'match' ? 'split' : grossVerdict;
  const logsDue = app.filter((a) => a.payLog?.need === 'yes' && !a.logSent);
  return { ...base, lineByLine: true, rows, verdict, shortCents: rows.filter((r) => r.status === 'short').reduce((t, r) => t - r.diff, 0), logsDue };
}

// One sentence for a result. Used on Pay and Home.
export function auditSentence(a) {
  const d = formatDate(a.date);
  if (a.verdict === 'match') return a.lineByLine ? `Every line on the ${d} check matches within $1.` : `The ${d} gross matches within $1.`;
  if (a.verdict === 'split') return `The ${d} total matches, but the lines are split differently.`;
  const abs = $(Math.abs(a.gross.diff));
  return a.verdict === 'short' ? `The ${d} check is ${abs} less than your entries add up to.` : `The ${d} check is ${abs} more than your entries add up to.`;
}

// A plain-text note for a pay question: the short lines, what was expected and why. The pilot sends it.
export function claimNote(a, v) {
  const prev = periodName(v.prevCode);
  const out = [`Pay question: check dated ${formatDate(a.date, { year: true })}`, ''];
  // The rule the line rests on: its own section, else the first source that is not the pay table.
  const src = (l) => (l.sec ? `Sec. ${l.sec}` : (l.sources || []).find((x) => x && x.key !== 'payRates')?.source || '');
  for (const r of a.rows.filter((x) => x.status === 'short')) {
    out.push(`${r.label}${r.kind === 'guarantee' ? '' : ` (${prev} bid period)`}`);
    out.push(`Paid: ${$(r.stubCents)}`);
    out.push(`Expected: ${$(r.appCents)}`);
    out.push(`Short: ${$(-r.diff)}${r.hours ? ` (about ${H(r.hours.at100)} CH at 100%)` : ''}`);
    if (r.likely) out.push(`Looks like this line is missing: ${r.likely.label}, ${$(r.likely.cents)}`);
    out.push('', 'What I expected:');
    for (const l of r.appLines) out.push(`- ${l.label}: ${l.text} = ${$(l.cents)}${src(l) ? ` (${src(l)})` : ''}`);
    if (r.stubLines.length) {
      out.push('', 'What the stub shows:');
      for (const l of r.stubLines) out.push(`- ${l.label}${l.units != null ? ` ${(l.units / 100).toFixed(2)} units` : ''}: ${$(l.cur)}`);
    }
    out.push('');
  }
  return out.join('\n').trim();
}
