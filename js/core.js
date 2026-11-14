// Pure helpers shared by the pay and bank math. No DOM, no storage.
// Money is integer cents. Hours are integer minutes. That keeps every result exact.

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------------------------------------------ hours */

// Accepts "42:30", "42.5", "42", ":45", "42h30", and sums like "4:10+3:25".
// Returns minutes, or null if unreadable.
export function parseHours(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? Math.round(input * 60) : null;
  const s = String(input).trim().replace(/\s+/g, '');
  if (s === '') return null;
  if (s.includes('+')) {
    let sum = 0;
    for (const part of s.split('+')) {
      const v = parseHours(part);
      if (v == null || part === '') return null;
      sum += v;
    }
    return sum;
  }
  let m = s.match(/^(\d*)[:hH](\d{2})$/);
  if (m) {
    const mins = parseInt(m[2], 10);
    if (mins >= 60) return null;
    return (m[1] === '' ? 0 : parseInt(m[1], 10)) * 60 + mins;
  }
  if (/^(\d+\.?\d*|\.\d+)$/.test(s)) return Math.round(parseFloat(s) * 60);
  return null;
}

export function formatHours(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const sign = minutes < 0 ? '-' : '';
  const a = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ money */

export const toCents = (dollars) => Math.round(dollars * 100);

// Accepts "$1,234.56", "1234.5", "-50", "(50)". Returns cents, or null.
export function parseMoney(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = String(input).trim().replace(/[$,\s]/g, '');
  if (s === '') return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-') || s.startsWith('−')) { neg = !neg; s = s.slice(1); }
  if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  const cents = parseInt(w || '0', 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
  return neg ? -cents : cents;
}

const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function formatMoney(cents, { sign = false, whole = false } = {}) {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const r = Math.round(cents);
  const neg = r < 0;
  const a = Math.abs(r);
  const body = whole
    ? `$${commas(Math.round(a / 100))}`
    : `$${commas(Math.floor(a / 100))}.${String(a % 100).padStart(2, '0')}`;
  return (neg ? '−' : sign && a > 0 ? '+' : '') + body;
}

export function parsePct(input) {
  if (input == null || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = String(input).trim().replace(/%$/, '').trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return parseFloat(s);
}

export const pctOf = (cents, pct) => Math.round((cents * pct) / 100);

/* --------------------------------------------------------------- pay math */

// minutes x hourly rate (cents) x percent. Rounded once, to the cent.
export const payCents = (minutes, rateCents, pct = 100) => Math.round((minutes * rateCents * pct) / 6000);

/* ------------------------------------------------------------ bid periods */

export function periodIndex(code) {
  const m = /^([A-Z]{3})(\d{2})$/.exec(String(code || '').toUpperCase());
  if (!m) return NaN;
  const mi = MONTHS.indexOf(m[1]);
  if (mi < 0) return NaN;
  return (2000 + parseInt(m[2], 10)) * 12 + mi;
}

export function periodCode(index) {
  const y = Math.floor(index / 12);
  return MONTHS[index - y * 12] + String(y % 100).padStart(2, '0');
}

export const shiftPeriod = (code, n) => periodCode(periodIndex(code) + n);

export function periodMonth(code) {
  const i = periodIndex(code);
  const year = Math.floor(i / 12);
  return { year, month: i - year * 12 + 1 };
}

export function periodFromISO(iso) {
  const [y, m] = iso.split('-').map(Number);
  return MONTHS[m - 1] + String(y % 100).padStart(2, '0');
}

export function periodName(code) {
  const { year, month } = periodMonth(code);
  return `${MONTH_SHORT[month - 1]} ${year}`;
}

/* ------------------------------------------------------------------ dates */

export const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function todayISO(now = new Date()) {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysBetween(aISO, bISO) {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function formatDate(iso, { year = false } = {}) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}${year ? `, ${y}` : ''}`;
}

/* ------------------------------------------------------------------ rules */

// Latest version of a rule in effect for a bid period. If the period is earlier than
// every version, returns the earliest one flagged `beforeEffective`.
export function ruleAt(rules, key, code) {
  const versions = rules[key];
  if (!Array.isArray(versions) || versions.length === 0) throw new Error(`rules.js has no rule "${key}"`);
  const idx = periodIndex(code);
  let pick = null;
  let earliest = versions[0];
  for (const v of versions) {
    const vi = periodIndex(v.effectiveFrom);
    if (vi < periodIndex(earliest.effectiveFrom)) earliest = v;
    if (vi <= idx && (!pick || vi >= periodIndex(pick.effectiveFrom))) pick = v;
  }
  if (!pick) return { ...earliest, key, beforeEffective: true };
  return { ...pick, key };
}
