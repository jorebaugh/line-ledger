import { RULES } from '../../rules.js';
import { todayISO, periodFromISO, periodName, formatDate, daysBetween, ruleAt, formatHours as H, formatMoney as $ } from '../core.js';
import { nextCheck, seatName, fleetName } from '../paymath.js';
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
      if (e.target.closest('[data-install-dismiss]')) { app.state.installHint = 'dismissed'; app.save(); app.render({ keepScroll: true }); return; }
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

    return `
      <section class="card hero">
        <div class="eyebrow">Next check · ${formatDate(nc.date, { year: true })} · ${when}</div>
        <div class="hero-amt">${x.money(ck.grossCents, checkExplain(v, which), { cls: 'big', mark: false })}</div>
        <div class="hero-sub">≈ ${x.money(n.netCents, netExplain(n, ck.grossCents, ck.perDiemCents, `${formatDate(nc.date)} est. net`, ctx), { cls: 'num' })} est. net <span class="muted">(rough)</span></div>
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
        <a class="btn primary" href="#/pay">Open the pay estimator</a>
      </section>

      <section class="card">
        <div class="row-head"><h2>${periodName(code)} bid period</h2><span class="muted small">${c.weeks} weeks</span></div>
        <dl class="kv">
          <div><dt>Hourly rate</dt><dd>${x.money(ctx.rateCents, rateExplain(ctx), { cls: 'num' })}<small>${esc(fleetName(ctx.fleet))} ${esc(seatName(ctx.seat))} · Year ${ctx.yg.yg}</small></dd></div>
          <div><dt>Guarantee</dt><dd>${x.money(c.guarantee.cents, guaranteeExplain(c, ctx), { cls: 'num' })}<small>${H(c.guarantee.minutes)} CH ${c.gLabel}${c.guarantee.source === 'minimum' ? ' (minimum)' : c.guarantee.source === 'typical' ? ' (typical)' : ''}</small></dd></div>
          <div><dt>Bid period earns</dt><dd>${x.money(c.earnedCents, earnedExplain(c, ctx), { cls: 'num', mark: false })}<small>Guarantee + extras</small></dd></div>
          <div><dt>Annualized gross</dt><dd>${x.money(c.annualizedCents, annualExplain(c), { cls: 'num', whole: true })}<small>If every period looks like this</small></dd></div>
        </dl>
      </section>

      <section class="card">
        <div class="row-head"><h2>Retirement election</h2>${eligible === false ? '<span class="pill">Hired after Jun 29, 2026</span>' : ''}</div>
        <p class="countdown"><span class="num">${Math.max(0, dOpen)}</span> days until the window opens ${formatDate(opens, { year: true })}</p>
        <ul class="dates">
          <li><span>Packets</span><span>${formatDate(ret.packets.from)}–${formatDate(ret.packets.to, { year: true })}</span></li>
          <li><span>Election window</span><span>${formatDate(ret.window.from)}–${formatDate(ret.window.to, { year: true })}</span></li>
          <li><span>Confirmation by</span><span>${formatDate(ret.confirmationBy, { year: true })}</span></li>
        </ul>
        <p class="muted small">One-time choice for pilots hired before June 29, 2026: stay in the pension, cash balance plan, or enhanced 401(k).</p>
        <a class="btn" href="#/retire">Compare the three side by side</a>
      </section>

      ${(() => {
        const sim = bankSnapshot(app.state, code);
        const rec = sim.periods.get(code);
        const expiring = (rec?.balances || []).filter((b) => b.kind === 'new' && b.periodsLeft <= 1);
        const expHotel = expiring.reduce((s, b) => s + b.toHotelCents, 0);
        const over = rec?.outOfPocketCents || 0;
        return `
        <a class="card card-link" href="#/deviation" data-tab-to="deviation">
          <div class="row-head"><h2>Deviation bank</h2><span class="muted small">${periodName(code)}</span></div>
          <div class="link-amt num ${over ? 'alert-text' : ''}">${over ? `Over by ${$(over)}` : $(rec?.remainingCents || 0)}</div>
          <p class="muted small">${!rec ? 'Log deadheads and expenses, or paste the company screen.' : expiring.length ? `${$(expiring.reduce((s, b) => s + b.valueCents, 0))} expires after this bid period; ${$(expHotel)} would move to the hotel bank.` : `${(rec.balances || []).length} balance${(rec.balances || []).length === 1 ? '' : 's'} carrying. Nothing expires this bid period.`}</p>
        </a>
        <a class="card card-link" href="#/deviation" data-tab-to="hotel">
          <div class="row-head"><h2>Hotel bank</h2><span class="muted small">cap $15,000</span></div>
          <div class="link-amt num">${$(sim.hotel.remainingCents)}</div>
          <p class="muted small">${sim.hotel.rows.length ? `${$(sim.hotel.accruedCents)} accrued, ${$(sim.hotel.usedCents)} used.` : 'Log cancelled rooms: $50 domestic, $70 international.'}</p>
        </a>`;
      })()}
      ${(() => {
        const k = k401View(app.state);
        const alert = k.flags.find((f) => f.tone === 'alert');
        return `
        <a class="card card-link" href="#/401k">
          <div class="row-head"><h2>401(k) ${k.year}</h2><span class="muted small">limit ${$(k.limits.deferral, { whole: true })}</span></div>
          <div class="link-amt num">${$(k.proj.end.deferral, { whole: true })} <small class="muted">pre-tax + Roth by Dec 31</small></div>
          <div class="meter ${k.proj.overTotal ? 'over' : ''}"><span style="width:${Math.min(100, Math.round((k.proj.end.deferral / k.limits.deferral) * 100))}%"></span></div>
          <p class="small ${alert ? 'alert-text' : 'muted'}">${esc((alert || k.flags[1] || k.flags[0]).text)}</p>
        </a>`;
      })()}
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
