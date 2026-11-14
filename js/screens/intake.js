import { blank, ensurePeriod } from '../store.js';
import { sampleState } from '../sample.js';
import { todayISO, periodFromISO, shiftPeriod } from '../core.js';
import { profileFormHTML, readProfile, bindProfileForm, showErrors } from './profile-form.js';

export default {
  title: 'Set up',
  render() {
    return `
      <div class="intro">
        <h1>What does your next check look like?</h1>
        <p class="lede">Six quick answers and you'll have an estimate. Everything stays on this phone.</p>
      </div>
      ${profileFormHTML({}, { mode: 'intake' })}`;
  },
  mount(el, app) {
    const form = el.querySelector('#profile');
    bindProfileForm(form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const { profile, errors } = readProfile(form);
      showErrors(form, errors);
      if (errors.length) return;
      const s = blank();
      s.profile = profile;
      const code = periodFromISO(todayISO());
      s.viewCode = code;
      app.state = s;
      ensurePeriod(s, shiftPeriod(code, -1));
      ensurePeriod(s, code);
      app.save();
      app.go('home');
    });
    form.querySelector('[data-act="sample"]').addEventListener('click', () => {
      app.state = sampleState();
      app.save();
      app.go('home');
    });
  },
};
