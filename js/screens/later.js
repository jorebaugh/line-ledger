// Tabs that arrive in later builds. Each says plainly what it will do.

import { RULES } from '../../rules.js';
import { todayISO, periodFromISO, ruleAt, formatDate, daysBetween } from '../core.js';
import { esc } from '../ui.js';

const screen = (title, intro, bullets, extra = () => '') => ({
  title,
  render(app) {
    return `
      <h1>${esc(title)}</h1>
      <section class="card soon">
        <div class="row-head"><h2>Coming in the next build</h2><span class="pill">Preview</span></div>
        <p>${esc(intro)}</p>
        <ul class="bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      </section>
      ${extra(app)}`;
  },
});

export const retire = screen('Retirement election', 'Compare the three paths side by side with your own numbers. Arithmetic, not a recommendation.', [
  'Stay in the pension: final average earnings up to $340,000, 2% per year (max 25).',
  'Cash balance plan: pension frozen Dec 31, 2027, 9% then 10% credits, $290,000 cap.',
  'Enhanced 401(k): company contribution 18% in 2028, 19% from 2029.',
  'The company will provide its own modeling tool during the window.',
], () => {
  const r = ruleAt(RULES, 'retirementElection', periodFromISO(todayISO())).value;
  const d = daysBetween(todayISO(), r.window.from);
  return `
    <section class="card">
      <h2>Key dates</h2>
      <p class="countdown"><span class="num">${Math.max(0, d)}</span> days until the window opens</p>
      <ul class="dates">
        <li><span>Packets</span><span>${formatDate(r.packets.from)}–${formatDate(r.packets.to, { year: true })}</span></li>
        <li><span>Election window</span><span>${formatDate(r.window.from)}–${formatDate(r.window.to, { year: true })}</span></li>
        <li><span>Confirmation by</span><span>${formatDate(r.confirmationBy, { year: true })}</span></li>
        <li><span>Pension service frozen (if you leave it)</span><span>${formatDate(r.freezeDate, { year: true })}</span></li>
      </ul>
    </section>`;
});
