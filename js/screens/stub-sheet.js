// Pay stub paste: shared by Settings and the 401(k) tab. The stub is read on the phone only; names,
// addresses, employee numbers and account numbers are never read or saved (see js/stub.js).

import { formatMoney as $, formatDate, parseMoney } from '../core.js';
import { parseStub, summarizeStub } from '../stub.js';
import { pdfText } from '../pdftext.js';
import { esc, openSheet, toast } from '../ui.js';

export function stubSummaryHTML(s) {
  const pct = (n) => (n == null ? '—' : `${n}%`);
  return `
    <ul class="ledger">
      <li><span>Check</span><span>${formatDate(s.adviceDate, { year: true })}${s.periodFrom ? ` · ${formatDate(s.periodFrom)}–${formatDate(s.periodTo)}` : ''}</span></li>
      <li><span>Gross</span><span class="num">${$(s.gross?.cur || 0)}</span></li>
      <li><span>Per diem (not taxed)</span><span class="num">${$(s.perDiem.cur)}</span></li>
      <li><span>Taxes</span><span class="num">${$(s.taxes?.cur || 0)} · ${pct(s.rates.taxCur)} of pay</span></li>
      <li><span>401(k) pre-tax / Roth / after-tax</span><span class="num">${pct(s.rates.pretax)} / ${pct(s.rates.roth)} / ${pct(s.rates.after)}</span></li>
      <li><span>Union dues</span><span class="num">${$(s.dues.cur)} · ${pct(s.rates.dues)}</span></li>
      ${s.veba.cur ? `<li><span>Retiree health (PRP)</span><span class="num">${$(s.veba.cur)}</span></li>` : ''}
      <li><span>Other deductions</span><span class="num">${$(s.other.cur)}</span></li>
      <li><span>Net</span><span class="num">${$(s.net?.cur || 0)}</span></li>
    </ul>
    ${s.other.lines.length ? `<p class="small muted">Other: ${s.other.lines.map((l) => `${esc(l.label)} ${$(l.cur)}`).join(' · ')}</p>` : ''}
    <ul class="ledger mt">
      <li><span>Year to date: pay less per diem</span><span class="num">${$(s.pay.ytd)}</span></li>
      <li><span>Pre-tax + Roth</span><span class="num">${$(s.k401.pretax.ytd + s.k401.roth.ytd)}</span></li>
      <li><span>After-tax</span><span class="num">${$(s.k401.after.ytd)}</span></li>
      <li><span>Company contribution</span><span class="num">${$(s.company.ytd)}</span></li>
      <li><span>Company match</span><span class="num">${$(s.match.ytd)}</span></li>
    </ul>`;
}

export function openStubSheet(app) {
  openSheet('Add a pay stub', `
    <p class="small muted">Pick the PDF of your earnings statement, or open it, select all, copy and paste the text. It's read on this phone only. Only pay lines and dates are read: your name, address, employee number and account are ignored and never saved.</p>
    <label class="btn primary file-btn">Choose the stub PDF<input type="file" accept="application/pdf,.pdf" data-stub-file></label>
    <textarea class="paste mt" rows="5" placeholder="Or paste the stub text" aria-label="Pay stub text"></textarea>
    <div class="stub-preview"></div>`, (body, close) => {
    const ta = body.querySelector('textarea');
    const pv = body.querySelector('.stub-preview');
    const file = body.querySelector('[data-stub-file]');
    let s = null;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      pv.innerHTML = '<p class="small muted">Reading the PDF…</p>';
      try {
        const text = await pdfText(new Uint8Array(await f.arrayBuffer()));
        ta.value = '';
        show(text, 'the PDF');
      } catch {
        s = null;
        pv.innerHTML = '<p class="note small">That PDF couldn\'t be read here. Open it, select all, copy, and paste the text instead.</p>';
      }
      file.value = '';
    });
    ta.addEventListener('input', () => show(ta.value, 'the paste'));
    function show(text, from) {
      if (!text.trim()) { pv.innerHTML = ''; return; }
      const st = parseStub(text);
      if (!st.ok) { s = null; pv.innerHTML = `<p class="note small">No pay lines found in ${esc(from)}. ${from === 'the paste' ? 'Paste the whole statement.' : 'Try pasting the text instead.'}</p>`; return; }
      s = summarizeStub(st);
      const p = app.state.profile;
      pv.innerHTML = `
        <div class="recap-card">
          ${stubSummaryHTML(s)}
          <b class="mt block">Also use it for your estimates</b>
          ${s.rates.taxCur != null ? `<label class="check"><input type="checkbox" data-use="wh" checked><span>Withholding: <select data-wh>
            <option value="${s.rates.taxCur}">${s.rates.taxCur}% (this check)</option>
            ${s.rates.taxYtd != null ? `<option value="${s.rates.taxYtd}">${s.rates.taxYtd}% (year to date)</option>` : ''}
          </select> <small>now ${esc(p.withholding || 'assumed 30')}%</small></span></label>` : ''}
          <label class="check"><input type="checkbox" data-use="other" checked><span>Other deductions per check: ${$(s.other.cur)} <small>now ${p.otherDed ? $(parseMoney(p.otherDed)) : 'none'}</small></span></label>
          <label class="check"><input type="checkbox" data-use="elections" checked><span>401(k) elections: ${s.rates.pretax ?? 0}% pre-tax, ${s.rates.roth ?? 0}% Roth, ${s.rates.after ?? 0}% after-tax <small>now ${esc(p.pretax || '0')} / ${esc(p.roth || '0')} / ${esc(p.aftertax || '0')}</small></span></label>
          <p class="hint">The elections are read off this check, so they come out as rough percentages. Fix them below if your election is a round number.</p>
          <button type="button" class="btn primary big mt" data-save-stub>Save stub</button>
        </div>`;
    }
    pv.addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-save-stub]') || !s) return;
      const st = app.state;
      st.stubs = [...(st.stubs || []).filter((x) => x.adviceDate !== s.adviceDate), s].sort((a, b) => (a.adviceDate < b.adviceDate ? -1 : 1)).slice(-6);
      const use = (k) => pv.querySelector(`[data-use="${k}"]`)?.checked;
      if (use('wh')) st.profile.withholding = String(pv.querySelector('[data-wh]').value);
      if (use('other')) st.profile.otherDed = (s.other.cur / 100).toFixed(2);
      if (use('elections')) {
        const r = (n) => (n ? String(Math.round(n * 10) / 10) : '');
        st.profile.pretax = r(s.rates.pretax);
        st.profile.roth = r(s.rates.roth);
        st.profile.aftertax = r(s.rates.after);
      }
      close();
      app.save();
      toast(`Saved the ${formatDate(s.adviceDate)} stub`);
      app.render({ keepScroll: true });
    });
  });
}
