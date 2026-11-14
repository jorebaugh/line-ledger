// The feedback card on Home and Pay, and the footer link on every screen. Both open a pre-filled email.

import { FEEDBACK_EMAIL, APP_VERSION } from '../../config.js';
import { feedbackLink } from '../feedback.js';
import { esc } from '../ui.js';

export const feedbackHref = (where) => esc(feedbackLink(FEEDBACK_EMAIL, APP_VERSION, where));

export const feedbackCard = (where) => `
  <section class="card fb-card">
    <div><h2>Found a bug or a number that's off?</h2>
      <p class="small muted">Email me. It opens with a few boxes to tick, including whether you'd pay for this. Nothing from the app goes with it.</p></div>
    <a class="btn primary" href="${feedbackHref(where)}">Email me</a>
  </section>`;
