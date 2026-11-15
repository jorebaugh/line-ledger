import { RULES } from '../../rules.js';
import { todayISO, periodFromISO, periodName, formatDate, daysBetween, ruleAt, formatHours as H, formatMoney as $ } from '../core.js';
import { nextCheck, seatName, fleetName, payLogsDue } from '../paymath.js';
import { auditStub, auditSentence, stubCode, stubsFor } from '../audit.js';
import { stubWhich } from '../stub.js';
import { periodView, checkExplain, netExplain, rateExplain, guaranteeExplain, annualExplain, earnedExplain } from '../view.js';
import { esc } from '../ui.js';
import { bankSnapshot } from './banks.js';
import { k401View } from '../k401.js';
import { ensureDev } from '../store.js';
import { feedbackCard } from './feedback.js';
import { installState, promptInstall, INSTALL_HELP } from '../install.js';
import { ICON } from '../ui.js';

export default {
  title: 'Home',
  mount(el, app) {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-install]')) { promptInstall().then(() => app.render({ keepScroll: true })); return; }
      if (e.target.closest('[data-guide-dismiss]')) { app.state.guide = 'dismissed'; app.save(); app.render({ keepScroll: true }); return; }
      if (e.target.closest('[data-install-dismiss]')) { app.state.installHint = 'dismissed'; app.save(); app.render({ keepScroll: true }); return; }
      // A link that opens Pay on a given bid period (and, for a stub, on that check).
      const vc = e.target.closest('[data-view-code]');
      if (vc) {
        app.state.viewCode = vc.dataset.viewCode;
        const per = app.state.periods[vc.dataset.viewCode];
        if (per && vc.dataset.check) per.audit = { ...(per.audit || { actual: '' }), check: vc.dataset.check };
        app.save();
        return;
      }
      const a = e.target.closest('[data-tab-to]');
      if (!a) return;
      const dev = ensureDev(app.state);
      dev.tab = a.dataset.tabTo;
      dev.viewCode = null;
      app.save();
    });
  },
  render(app) {
    const x = app.x;
    const today = todayISO();
    const code = periodFromISO(today);
    const v = periodView(app.state, code);
    app.save();
    const { c, ctx, checks, net } = v;
    const nc = nextCheck(today);
    const which = nc.which;
    const ck = checks[which];
    const n = net[which];
    const days = daysBetween(today, nc.date);
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;

    const ret = ruleAt(RULES, 'retirementElection', code).value;
    const opens = ret.window.from;
    const dOpen = daysBetween(today, opens);
    const p = app.state.profile;
    const eligible = p.ygMode === 'doh' && p.doh ? p.doh < ret.eligibleHiredBefore : null;

    const curP = app.state.periods[code] || {};
    const curStubs = stubsFor(app.state.stubs, code);
    // The newest saved stub, checked line by line against its own bid period.
    const stubs = app.state.stubs || [];
    const last = stubs[stubs.length - 1] || null;
    const lastCode = last ? stubCode(last) : null;
    const la = last ? auditStub(last, lastCode === code ? v : periodView(app.state, lastCode, { create: false, whatIf: false })) : null;
    const stubSub = !la ? 'Add the stub PDF and every line gets checked'
      : la.prevEmpty && la.verdict !== 'match' ? `${formatDate(la.date)} stub saved. Add the bid period before it to check the extras.`
      : esc(auditSentence(la));
    // Pay logs not yet marked sent, this bid period and the one before.
    const logs = [...payLogsDue(c).map((l) => ({ ...l, code })), ...(v.p ? payLogsDue(v.p).map((l) => ({ ...l, code: v.prevCode })) : [])];
    const steps = [
      { done: !!String(curP.guarantee || '').trim(), href: '#/pay?go=line', t: 'Enter your line value', s: `Your ${c.gLabel} from the bid package` },
      { done: (curP.trips || []).length > 0, href: '#/pay?go=trips', t: 'Add your trips', s: 'Paste a trip recap, or type the hours' },
      { done: !!String(curP.audit?.actual || '').trim() || !!(curStubs.mid || curStubs.end), href: '#/pay?go=stub', t: 'Check it against your pay stub', s: 'Add the stub PDF and every line gets checked' },
    ];
    const showGuide = app.state.guide !== 'dismissed' && steps.some((st) => !st.done);
    const act = (href, title, sub, right = '', attrs = '', tone = 'muted') => `
        <a class="act" href="${href}" ${attrs}>
          <span class="act-t"><b>${title}</b><small class="${tone}">${sub}</small></span>
          ${right ? `<span class="act-v num">${right}</span>` : ''}${ICON.right}
        </a>`;

    const sim = bankSnapshot(app.state, code);
    const rec = sim.periods.get(code);
    const expiring = (rec?.balances || []).filter((b) => b.kind === 'new' && b.periodsLeft <= 1);
    const over = rec?.outOfPocketCents || 0;
    const k = k401View(app.state);
    const kAlert = k.flags.find((f) => f.tone === 'alert');

    return `
      <section class="card hero">
        <div class="eyebrow">Your next check · ${formatDate(nc.date, { year: true })} · ${when}</div>
        <div class="hero-amt">${x.money(ck.grossCents, checkExplain(v, which), { cls: 'big', mark: false })}</div>
        <div class="hero-sub">About ${x.money(n.netCents, netExplain(n, ck.grossCents, ck.perDiemCents, `${formatDate(nc.date)} est. net`, ctx), { cls: 'num' })} take-home <span class="muted">(rough)</span></div>
        <div class="pair">
          <div class="mini ${which === 'mid' ? 'is-next' : ''}">
            <span class="mini-label">${formatDate(checks.mid.date)}</span>
            ${x.money(checks.mid.grossCents, checkExplain(v, 'mid'), { cls: 'num', mark: false })}
            <span class="mini-note">½ ${c.gLabel} + ${periodName(v.prevCode).split(' ')[0]} extras</span>
          </div>
          <div class="mini ${which === 'end' ? 'is-next' : ''}">
            <span class="mini-label">${formatDate(checks.end.date)}</span>
            ${x.money(checks.end.grossCents, checkExplain(v, 'end'), { cls: 'num', mark: false })}
            <span class="mini-note">½ ${c.gLabel}</span>
          </div>
        </div>
        <p class="hint">Tap any dollar figure to see how it was worked out.</p>
      </section>

      ${showGuide ? `
      <section class="card guide">
        <div class="row-head"><h2>Three steps to check your pay</h2><button type="button" class="icon-btn" data-guide-dismiss aria-label="Hide these steps">${ICON.close}</button></div>
        ${steps.map((st, i) => `
        <a class="step ${st.done ? 'done' : ''}" href="${st.href}">
          <span class="step-n" aria-hidden="true">${st.done ? '✓' : i + 1}</span>
          <span class="act-t"><b>${esc(st.t)}</b><small class="muted">${st.done ? 'Done' : esc(st.s)}</small></span>
          ${ICON.right}
        </a>`).join('')}
      </section>` : ''}

      <section class="card">
        <h2>Pay</h2>
        <div class="acts">
          ${act('#/pay?go=trips', 'Add a trip', 'Paste a trip recap, or type the hours')}
          ${logs.length ? act('#/pay?go=other', `${logs.length} pay log${logs.length === 1 ? '' : 's'} to send`, esc(logs.map((l) => l.label).join(', ')), $(logs.reduce((sum, l) => sum + l.cents, 0)), `data-view-code="${logs[0].code}"`, 'alert-text') : ''}
          ${act('#/pay?go=whatif', "What's a trip worth?", 'Paste a trip, see the take-home')}
          ${act('#/pay?go=stub', 'Check a pay stub', stubSub, la && la.verdict === 'short' && !la.prevEmpty ? `−${$(Math.abs(la.gross.diff))}` : '', last ? `data-view-code="${lastCode}" data-check="${stubWhich(last)}"` : '', la && la.verdict === 'short' && !la.prevEmpty ? 'alert-text' : 'muted')}
        </div>
      </section>

      <section class="card">
        <h2>Banks and retirement</h2>
        <div class="acts">
          ${act('#/deviation', 'Deviation bank', !rec ? 'Log deadheads and expenses' : expiring.length ? `${$(expiring.reduce((sum, b) => sum + b.valueCents, 0))} expires after this bid period` : 'Nothing expires this bid period', over ? `Over ${$(over)}` : $(rec?.remainingCents || 0), 'data-tab-to="deviation"', over || expiring.length ? 'alert-text' : 'muted')}
          ${act('#/deviation', 'Hotel bank', sim.hotel.rows.length ? `${$(sim.hotel.accruedCents)} accrued, ${$(sim.hotel.usedCents)} used` : 'Log cancelled rooms', $(sim.hotel.remainingCents), 'data-tab-to="hotel"')}
          ${act('#/401k', `401(k) ${k.year}`, kAlert ? esc(kAlert.text) : 'Pre-tax + Roth by Dec 31', $(k.proj.end.deferral, { whole: true }), '', kAlert ? 'alert-text' : 'muted')}
          ${act('#/retire', 'Retirement choice', eligible === false ? 'For pilots hired before June 29, 2026' : `Window opens ${formatDate(opens, { year: true })}`, `${Math.max(0, dOpen)} days`)}
        </div>
      </section>

      <details class="card fold">
        <summary><span class="act-t"><b>Your rate and ${periodName(code)}</b><small class="muted">${esc(fleetName(ctx.fleet))} ${esc(seatName(ctx.seat))} · Year ${ctx.yg.yg} · ${$(ctx.rateCents)}/hr</small></span>${ICON.chevron}</summary>
        <dl class="kv fold-body">
          <div><dt>Hourly rate</dt><dd>${x.money(ctx.rateCents, rateExplain(ctx), { cls: 'num' })}<small>${esc(fleetName(ctx.fleet))} ${esc(seatName(ctx.seat))} · Year ${ctx.yg.yg}</small></dd></div>
          <div><dt>Guarantee</dt><dd>${x.money(c.guarantee.cents, guaranteeExplain(c, ctx), { cls: 'num' })}<small>${H(c.guarantee.minutes)} CH ${c.gLabel}${c.guarantee.source === 'minimum' ? ' (minimum)' : c.guarantee.source === 'typical' ? ' (typical)' : ''}</small></dd></div>
          <div><dt>Bid period earns</dt><dd>${x.money(c.earnedCents, earnedExplain(c, ctx), { cls: 'num', mark: false })}<small>Guarantee + extras</small></dd></div>
          <div><dt>Annualized gross</dt><dd>${x.money(c.annualizedCents, annualExplain(c), { cls: 'num', whole: true })}<small>If every period looks like this</small></dd></div>
        </dl>
      </details>

      ${(() => {
        const s = installState();
        if (app.state.installHint === 'dismissed' || (s !== 'prompt' && s !== 'ios')) return '';
        return `
        <section class="card">
          <div class="row-head"><h2>Put it on your home screen</h2><button type="button" class="icon-btn" data-install-dismiss aria-label="Hide this">${ICON.close}</button></div>
          <p class="small">${esc(INSTALL_HELP[s])}</p>
          ${s === 'prompt' ? '<button type="button" class="btn primary" data-install>Install</button>' : ''}
        </section>`;
      })()}
      ${feedbackCard('Home screen')}
    `;
  },
};
