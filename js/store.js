// State and persistence. Everything lives in this browser's localStorage. Nothing is sent anywhere.

import { RULES } from '../rules.js';
import { typicalRows } from './paymath.js';

const KEY = 'lineLedger.v1';

export function blankDev() {
  return {
    tab: 'deviation',
    viewCode: null,
    entries: [], // { id, code, kind: 'deadhead', date, route, fare, changed } | { id, code, kind: 'expense', date, desc, amount, category }
    imported: null, // { asOf, rows: [{ code, totalCents, divisor, applicableCents }] }
    hotel: [], // { id, code, date, kind: 'domestic' | 'international' }
    hotelLegacy: { domestic: '', international: '' },
    company: { accrued: '', used: '', remaining: '' },
  };
}

export function blank() {
  return { v: 1, sample: false, profile: null, periods: {}, nextId: 1, viewCode: null, dev: blankDev() };
}

export function ensureDev(state) {
  if (!state.dev) state.dev = blankDev();
  return state.dev;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v === 1 && typeof s.periods === 'object' ? s : null;
  } catch {
    return null;
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

export const newId = (state) => state.nextId++;

function presetFor(state, code, weeks) {
  return typicalRows(state.profile, RULES, code, weeks).map((r) => ({ id: newId(state), ...r }));
}

// Get a bid period, creating it (with typical pre-fill) if it doesn't exist yet.
export function ensurePeriod(state, code) {
  if (!state.periods[code]) {
    const weeks = Number(state.profile?.weeks) || 4;
    state.periods[code] = {
      guarantee: '',
      weeks,
      rows: presetFor(state, code, weeks),
      trips: [],
      whatIf: 0,
      saved: false,
      audit: { check: 'mid', actual: '' },
    };
  }
  return state.periods[code];
}

// After the profile changes, refresh any period that still holds only the untouched pre-fill.
export function refreshPresets(state) {
  for (const [code, p] of Object.entries(state.periods)) {
    const untouched = !p.saved && p.trips.length === 0 && p.rows.every((r) => r.preset) && !p.guarantee;
    if (untouched) {
      p.weeks = Number(state.profile.weeks) || 4;
      p.rows = presetFor(state, code, p.weeks);
    }
  }
}

export function newTrip(state, profile) {
  return {
    id: newId(state),
    label: '',
    assign: profile.line === 'reserve' ? 'reserve' : 'line',
    intl: profile.flying === 'international',
    sched: '',
    away: '',
    bkoMode: 'block',
    dps: [],
    schedTafb: '',
    bko: '',
    actual: '',
    overage: '',
    overageShort: true,
    ulr: false,
    gpeCount: 0,
    gpeSame48: false,
  };
}

export function newDutyPeriod(state) {
  return { id: newId(state), credit: '', sched: '', actual: '' };
}

export function newRow(state, type) {
  return { id: newId(state), type, hours: '', tafbDom: '', tafbIntl: '', label: '', amount: '', gpe: false };
}

export function exportJSON(state) {
  const data = { app: 'Line Ledger', exportedAt: new Date().toISOString(), ...state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `line-ledger-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

// Read an exported file back in. Returns the state, or null if it isn't a Line Ledger export.
export function parseImport(text) {
  try {
    const d = JSON.parse(text);
    if (!d || d.v !== 1 || typeof d.periods !== 'object' || !d.profile) return null;
    const { app: _app, exportedAt: _at, ...state } = d;
    if (!state.dev) state.dev = blankDev();
    if (!Number.isFinite(state.nextId)) state.nextId = 1000;
    return state;
  } catch {
    return null;
  }
}
