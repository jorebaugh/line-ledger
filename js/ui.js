// Small DOM helpers: escaping, tappable figures, the bottom sheet, form controls.

import { formatMoney } from './core.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const confirmPill = '<span class="confirm" title="Not yet checked against the source. Confirm before relying on it.">confirm</span>';

/* ------------------------------------------------------------ explainer */

// Every dollar figure registers how it was calculated; tapping it opens that explanation.
//   explanation: { title, lines: [{ label, text, cents }], total: { label, cents }, sources: [rule], notes: [] }
export function createExplainer() {
  const map = new Map();
  let n = 0;
  const unverified = (ex) => (ex.sources || []).some((s) => s && s.verified === false)
    || (ex.lines || []).some((l) => (l.sources || []).some((s) => s && s.verified === false));
  return {
    map,
    reset() { map.clear(); n = 0; },
    id(ex) { const id = `x${++n}`; map.set(id, ex); return id; },
    money(cents, ex, { cls = '', sign = false, whole = false, mark = true } = {}) {
      const id = this.id(ex);
      return `<button type="button" class="money ${cls}" data-x="${id}">${esc(formatMoney(cents, { sign, whole }))}</button>${mark && unverified(ex) ? confirmPill : ''}`;
    },
    unverified,
  };
}

export function explainHTML(ex) {
  const lines = (ex.lines || []).map((l) => `
    <div class="x-line">
      <div class="x-label">${esc(l.label)}</div>
      ${l.text ? `<div class="x-math">${esc(l.text)}</div>` : ''}
      ${l.cents != null ? `<div class="x-amt">${esc(formatMoney(l.cents))}</div>` : ''}
    </div>`).join('');
  const total = ex.total ? `<div class="x-total"><span>${esc(ex.total.label)}</span><span>${esc(formatMoney(ex.total.cents))}</span></div>` : '';
  const seen = new Set();
  const all = [...(ex.sources || []), ...(ex.lines || []).flatMap((l) => l.sources || [])].filter((s) => {
    if (!s || seen.has(s.source)) return false;
    seen.add(s.source);
    return true;
  });
  const sources = all.length ? `
    <h3 class="x-h">Where the numbers come from</h3>
    ${all.map((s) => `
      <div class="x-src">
        <div class="x-src-head">${esc(s.source)} ${s.verified === false ? confirmPill : '<span class="ok-pill">checked</span>'}</div>
        ${s.note ? `<p>${esc(s.note)}</p>` : ''}
        <p class="muted small">In effect from the ${esc(s.effectiveFrom === 'JAN00' ? 'start' : `${s.effectiveFrom} bid period`)}${s.beforeEffective ? '. Note: this bid period is earlier than any loaded version' : ''}</p>
      </div>`).join('')}` : '';
  const notes = (ex.notes || []).map((n) => `<p class="x-note">${esc(n)}</p>`).join('');
  return `<div class="x">${lines}${total}${notes}${sources}</div>`;
}

/* --------------------------------------------------------------- sheet */

let lastFocus = null;
let closing = null; // the timer that empties a closing sheet; a sheet opened right after must not be wiped by it

export function openSheet(title, html, onMount) {
  const root = document.getElementById('sheet');
  if (closing) { clearTimeout(closing); closing = null; }
  lastFocus = document.activeElement;
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-head">
        <h2 id="sheet-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button>
      </div>
      <div class="sheet-body">${html}</div>
    </div>`;
  root.hidden = false;
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => root.classList.add('open'));
  root.querySelector('.sheet [data-close]').focus({ preventScroll: true });
  const body = root.querySelector('.sheet-body');
  if (onMount) onMount(body, closeSheet);
}

export function closeSheet() {
  const root = document.getElementById('sheet');
  if (root.hidden) return;
  root.classList.remove('open');
  document.body.classList.remove('noscroll');
  if (closing) clearTimeout(closing);
  closing = setTimeout(() => { closing = null; root.hidden = true; root.innerHTML = ''; }, 160);
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}

export function initSheet() {
  const root = document.getElementById('sheet');
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
}

/* ------------------------------------------------------- form controls */

// Segmented control built from radio buttons. options: [[value, label, sublabel?], ...]
export function seg(name, options, value, { attrs = '', cls = '' } = {}) {
  return `<div class="seg ${cls}" role="radiogroup">${options.map(([v, label, sub]) => `
    <label class="seg-opt"><input type="radio" name="${esc(name)}" value="${esc(v)}" ${String(v) === String(value) ? 'checked' : ''} ${attrs}>
      <span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`).join('')}</div>`;
}

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 200); }, 2000);
}

/* --------------------------------------------------------------- icons */

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICON = {
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>'),
  pay: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v5M17.5 9.5v5"/>'),
  deviation: svg('<path d="M2.5 15.5 21 9l-2-3-6 2.2L8 4.5 6.5 5l3 4.5-4 1.5L3.5 9 2 9.6l2 3.4z"/><path d="M3 20h18"/>'),
  k401: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  retire: svg('<path d="M3 18h18"/><path d="M5 18a7 7 0 0 1 14 0"/><path d="M12 7V4M5.6 9.6 3.5 7.5M18.4 9.6l2.1-2.1"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  left: svg('<path d="m15 18-6-6 6-6"/>'),
  right: svg('<path d="m9 18 6-6-6-6"/>'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>', 'class="chev"'),
};
