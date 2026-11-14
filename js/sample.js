// Demo data: a year-6 wide-body First Officer flying mostly international.
// Built relative to today's bid period so it always looks current.

import { todayISO, periodFromISO, shiftPeriod } from './core.js';
import { blank, newId } from './store.js';

export function sampleState() {
  const s = blank();
  s.sample = true;
  s.profile = {
    seat: 'FO', fleet: 'WB', ygMode: 'doh', doh: '2021-09-09', yearGroup: 6, weeks: 4, line: 'regular',
    flying: 'international', pretax: '8', roth: '', aftertax: '', withholding: '27', ageBand: 'u50', commuter: 'yes',
  };
  s.retire = { age: '41' };
  const cur = periodFromISO(todayISO());
  const trip = (o) => ({
    id: newId(s), label: '', assign: 'line', intl: true, sched: '', away: '', bkoMode: 'bko', dps: [], schedTafb: '', bko: '', actual: '',
    overage: '', overageShort: true, ulr: false, gpeCount: 0, gpeSame48: false, ...o,
  });
  const row = (o) => ({ id: newId(s), type: 'draft', hours: '', tafbDom: '', tafbIntl: '', label: '', amount: '', gpe: false, ...o });
  const period = (o) => ({ guarantee: '', weeks: 4, rows: [], trips: [], whatIf: 0, saved: false, audit: { check: 'mid', actual: '' }, ...o });

  // Three earlier bid periods, quick-estimate style, saved to history.
  for (let i = 4; i >= 2; i--) {
    s.periods[shiftPeriod(cur, -i)] = period({
      guarantee: ['71:20', '69:45', '72:05'][i - 2],
      saved: true,
      rows: [
        row({ type: 'override', hours: ['62:10', '58:40', '64:30'][i - 2] }),
        row({ type: 'perdiem', tafbIntl: ['241:30', '228:15', '256:40'][i - 2], tafbDom: '18:20' }),
        ...(i === 3 ? [row({ type: 'draft', hours: '14:30' })] : []),
      ],
    });
  }

  // Last bid period: trip by trip. Its extras pay on this period's 15th.
  s.periods[shiftPeriod(cur, -1)] = period({
    guarantee: '72:10',
    saved: true,
    trips: [
      trip({
        label: 'MEM–ANC–HKG', sched: '33:05', away: '118:40', schedTafb: '118:25', bkoMode: 'block',
        dps: [
          { id: newId(s), credit: '6:10', sched: '6:10', actual: '6:32' },
          { id: newId(s), credit: '9:25', sched: '9:25', actual: '9:48' },
          { id: newId(s), credit: '8:05', sched: '7:40', actual: '7:52' },
          { id: newId(s), credit: '9:25', sched: '9:25', actual: '4:40+4:45' },
        ],
      }),
      trip({ label: 'MEM–CDG–CGN', sched: '27:15', away: '96:10' }),
      trip({ label: 'MEM–IND–OAK', intl: false, sched: '11:50', away: '41:30' }),
      trip({ label: 'Draft: MEM–DXB', assign: 'draft', sched: '21:00', away: '71:20', overage: '3:30', overageShort: false }),
    ],
  });

  // This bid period: partly entered.
  s.periods[cur] = period({
    guarantee: '70:40',
    trips: [
      trip({ label: 'MEM–ANC–NRT', sched: '31:40', away: '104:15', bko: '1:05' }),
      trip({ label: 'MEM–CDG–DXB', sched: '24:40', away: '88:30', gpeCount: 3 }),
      trip({ label: 'MEM–IND–OAK', intl: false, sched: '14:20', away: '52:00' }),
    ],
  });

  // Deviation and hotel bank activity (made-up figures).
  const p2 = shiftPeriod(cur, -2);
  const p1 = shiftPeriod(cur, -1);
  const e = (o) => ({ id: newId(s), date: '', ...o });
  s.dev.entries = [
    e({ code: p2, kind: 'deadhead', route: 'MEM-ANC', fare: '612.40' }),
    e({ code: p2, kind: 'deadhead', route: 'CDG-MEM', fare: '1184.00' }),
    e({ code: p2, kind: 'expense', desc: 'ATL-CDG', amount: '980.00', category: 'airfare' }),
    e({ code: p2, kind: 'expense', desc: 'Car to airport', amount: '95.00', category: 'surface' }),
    e({ code: p1, kind: 'deadhead', route: 'MEM-HKG', fare: '1420.00' }),
    e({ code: p1, kind: 'expense', desc: 'DEN-SEA-HKG', amount: '1610.00', category: 'airfare' }),
    e({ code: cur, kind: 'deadhead', route: 'MEM-CGN', fare: '930.50', changed: true }),
    e({ code: cur, kind: 'expense', desc: 'DEN-ORD-CGN', amount: '640.00', category: 'airfare' }),
    e({ code: cur, kind: 'expense', desc: 'Airport parking', amount: '48.00', category: 'parking' }),
  ];
  s.dev.hotel = [
    { id: newId(s), code: p2, date: '', kind: 'international' },
    { id: newId(s), code: p1, date: '', kind: 'domestic' },
    { id: newId(s), code: cur, date: '', kind: 'international' },
  ];

  s.viewCode = cur;
  return s;
}
