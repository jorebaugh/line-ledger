/**
 * rules.js: every contract number Line Ledger uses lives here, and only here.
 *
 * HOW IT WORKS
 * Each rule is a list of versions. For a given bid period the app uses the latest
 * version whose `effectiveFrom` is on or before that bid period.
 *
 *   effectiveFrom  bid period code, MMMYY ('JUL26'). 'JAN00' means "before the 2026 contract".
 *   value          the number(s)
 *   source         contract section; shown when someone taps a figure
 *   verified       true  = checked against contract text
 *                  false = the app shows a "confirm" marker next to anything that uses it
 *   note           optional plain-language note shown with the source
 *
 * WHEN RATES CHANGE
 * Never edit an old version. Append a new one with a later effectiveFrom, then run `npm test`.
 *
 * Section references are to the 2026 agreement (effective June 29, 2026, the first day
 * of the July 2026 bid period, Sec. 31.C).
 */

// Pay table helper: arrays are year group 1..15, index 0 = year group 1.
const table = (wbCA, wbFO, nbCA, nbFO) => ({
  widebody: { CA: wbCA, FO: wbFO },
  narrowbody: { CA: nbCA, FO: nbFO },
});

export const RULES = {
  contract: { name: '2026 agreement', effectiveDate: '2026-06-29' },

  /* ------------------------------------------------------------------ pay rates */

  payRates: [
    {
      effectiveFrom: 'JUL26',
      source: 'Sec. 3.C.1 Hourly rates, first day of July 2026 bid period',
      verified: true,
      note: 'Dollars per credit hour by year group, wide body and narrow body',
      value: table(
        [386.72, 429.64, 430.51, 432.24, 433.94, 435.71, 437.46, 439.19, 440.92, 446.04, 451.14, 456.35, 459.77, 464.35, 469.0],
        [117.54, 266.7, 267.07, 272.4, 277.86, 283.4, 289.07, 294.82, 300.74, 309.15, 317.82, 326.71, 328.35, 330.02, 332.49],
        [327.84, 364.3, 366.13, 368.15, 370.22, 372.23, 374.27, 376.34, 378.39, 382.74, 387.16, 391.57, 395.51, 399.48, 404.29],
        [113.39, 218.58, 227.47, 232.43, 237.56, 242.82, 248.14, 253.61, 259.18, 268.48, 278.21, 288.21, 289.65, 291.06, 292.53],
      ),
    },
    {
      effectiveFrom: 'JAN28',
      source: 'Sec. 3.C.2 Hourly rates, first day of January 2028 bid period',
      verified: true,
      value: table(
        [398.32, 442.52, 443.42, 445.2, 446.95, 448.78, 450.58, 452.36, 454.14, 459.42, 464.67, 470.04, 473.56, 478.28, 483.07],
        [121.06, 274.7, 275.08, 280.57, 286.19, 291.9, 297.74, 303.66, 309.76, 318.42, 327.35, 336.51, 338.2, 339.92, 342.46],
        [337.67, 375.22, 377.11, 379.19, 381.32, 383.39, 385.49, 387.63, 389.74, 394.22, 398.77, 403.31, 407.37, 411.46, 416.41],
        [116.79, 225.13, 234.29, 239.4, 244.68, 250.1, 255.58, 261.21, 266.95, 276.53, 286.55, 296.85, 298.33, 299.79, 301.3],
      ),
    },
    {
      effectiveFrom: 'JAN29',
      source: 'Sec. 3.C.3 Hourly rates, first day of January 2029 bid period',
      verified: true,
      value: table(
        [410.26, 455.79, 456.72, 458.55, 460.35, 462.24, 464.09, 465.93, 467.76, 473.2, 478.61, 484.14, 487.76, 492.62, 497.56],
        [124.69, 282.94, 283.33, 288.98, 294.77, 300.65, 306.67, 312.76, 319.05, 327.97, 337.17, 346.6, 348.34, 350.11, 352.73],
        [347.8, 386.47, 388.42, 390.56, 392.75, 394.89, 397.05, 399.25, 401.43, 406.04, 410.73, 415.4, 419.59, 423.8, 428.9],
        [120.29, 231.88, 241.31, 246.58, 252.02, 257.6, 263.24, 269.04, 274.95, 284.82, 295.14, 305.75, 307.27, 308.78, 310.33],
      ),
    },
    {
      effectiveFrom: 'JAN30',
      source: 'Sec. 3.C.4 Hourly rates, first day of January 2030 bid period',
      verified: true,
      value: table(
        [422.56, 469.46, 470.42, 472.3, 474.16, 476.1, 478.01, 479.9, 481.79, 487.39, 492.96, 498.66, 502.39, 507.39, 512.48],
        [128.43, 291.42, 291.82, 297.64, 303.61, 309.66, 315.87, 322.14, 328.62, 337.8, 347.28, 356.99, 358.79, 360.61, 363.31],
        [358.23, 398.06, 400.07, 402.27, 404.53, 406.73, 408.96, 411.22, 413.47, 418.22, 423.05, 427.86, 432.17, 436.51, 441.76],
        [123.89, 238.83, 248.54, 253.97, 259.58, 265.32, 271.13, 277.11, 283.19, 293.36, 303.99, 314.92, 316.48, 318.04, 319.63],
      ),
    },
  ],

  yearGroup: [
    {
      effectiveFrom: 'JUL26',
      value: { cap: 15 },
      source: 'Sec. 3.B.1 Longevity',
      verified: true,
      note: 'Year group = full years of longevity + 1, capped at 15. A pilot who changes year group after a bid period starts is paid the new rate for that whole bid period (3.B.1.c)',
    },
  ],

  intlOverride: [
    {
      effectiveFrom: 'JUL26',
      value: { CA: 10.0, FO: 8.0 },
      source: 'Sec. 3.D International override',
      verified: true,
      note: 'Per CH of trip guarantee and overage on a trip with a segment outside the contiguous 48 states. Not paid on BKO',
    },
  ],

  ulrPremium: [
    {
      effectiveFrom: 'JUL26',
      value: { CA: 24.0, FO: 17.0 },
      source: 'Sec. 3.F Ultra long range premium',
      verified: true,
      note: 'Trip contains a segment scheduled over 16 block hours. Per CH of trip guarantee and overage, on top of everything else (BKO, override)',
    },
  ],

  checkSchedule: [
    {
      effectiveFrom: 'JUL26',
      value: { midDay: 15 },
      source: 'Sec. 3.E Checks',
      verified: true,
      note: '15th: half of BLG/RLG + credits above BLG/RLG from the previous bid period + previous bid period per diem + adjustments. Last day: remaining half of BLG/RLG',
    },
  ],

  /* --------------------------------------------------------- guarantees and premiums */

  minGuarantee: [
    {
      effectiveFrom: 'JUL26',
      value: { 4: 68, 5: 85, 6: 102 },
      source: 'Sec. 4.A Minimum bid period guarantee',
      verified: true,
      note: 'Credit hours by bid period length in weeks. BLG = sum of trip guarantees on the line, never less than this (4.B)',
    },
  ],

  reserveAccrual: [
    {
      effectiveFrom: 'JUL26',
      value: { upToRlgPct: 100, overRlgPct: 150 },
      source: 'Sec. 4.H.7 Reserve credit hour accrual',
      verified: true,
      note: 'CH on R-days: 100% up to RLG, 150% over RLG',
    },
  ],

  draftPct: [
    {
      effectiveFrom: 'JUL26',
      value: 150,
      source: 'Sec. 4.Q.1 VLT/DRF pay; AVA is a VLT trip assigned in advance (25.N.4)',
      verified: true,
      note: 'Trip guarantee at 150%, in addition to BLG/RLG',
    },
  ],

  // Assignment codes as they print on a trip recap, and how each one pays. kind is one of the app's
  // trip types: line (100%, toward BLG), draft (150% on top), cmu (150%), pmu (125%), reserve (toward RLG).
  payCodes: [
    {
      effectiveFrom: 'JUL26',
      value: {
        TRP: { kind: 'line', sec: '4.F', text: 'Line trip: trip guarantee at 100%, counts toward BLG.' },
        PRO: { kind: 'line', sec: '11.M.10.c.iii', text: 'Proficiency flying: same pay as TRP.' },
        PDO: { kind: 'line', sec: '11.M.9, 4.BB.6', text: 'PDO flying: pays like a line trip; overage goes to the pilot who flew it.' },
        SON: { kind: 'line', sec: '4.W.1, 4.Y.1', text: 'Optional pickup: pays like TRP.', confirm: true },
        SWP: { kind: 'line', sec: '4.W.1, 4.Y.1', text: 'Swap: pays like TRP.', confirm: true },
        'M/U': { kind: 'line', sec: '4.P.1', text: 'General make-up: trip guarantee at 100%, making up BLG.' },
        PNP: { kind: 'line', sec: '4.T.2', text: 'Priority non-premium: paid like general make-up, 100%.' },
        CIA: { kind: 'line', sec: '25.C.12, 4.P.1', text: 'Make-up for a training phase-in conflict: trip guarantee at 100%.', confirm: true },
        MUS: { kind: 'line', sec: '4.P.2, 4.BB.1.e', text: 'Make-up sick: trip guarantee if you block out; overage goes to your disability sick account.' },
        MUD: { kind: 'line', sec: '4.P.2', text: 'Make-up disability: trip guarantee if you block out.' },
        MUV: { kind: 'line', sec: '4.P.2, 4.BB.1.d', text: 'Make-up vacation: trip guarantee if you block out; overage goes to your vacation bank.' },
        SUB: { kind: 'line', sec: '4.L.1-2', text: 'Substitution trip: the greater of the original trip guarantee or your substitution guarantee.' },
        RAT: { kind: 'line', sec: '4.M.1', text: 'Reassignment trip: the higher of the original trip guarantee at 100% or this trip at 125%. If 125% is higher, add the difference as an adjustment.' },
        TNG: { kind: 'line', sec: '4.I.5.e', text: 'Training (OE): the higher of SCH or ACH at 100%. In the bid period you finish OE, pay is at least your pay-only line; the app does not model that floor.', confirm: true },
        AFB: { kind: 'line', sec: '18.E', text: 'Association fly back: credit offsets union flight pay loss; per diem and override are paid.' },
        PMU: { kind: 'pmu', sec: '4.N.3', text: 'Priority make-up: 125% up to your OTP eligibility, 100% beyond it.' },
        SMU: { kind: 'pmu', sec: '25.C.13.b.ii.(c)', text: 'Student-line make-up: trip guarantee at 125%.' },
        CMU: { kind: 'cmu', sec: '4.Q.6-7', text: 'Compensatory make-up: 150% up to your CMU eligibility, 100% beyond it.' },
        VLT: { kind: 'draft', sec: '4.Q.1', text: 'Volunteer: trip guarantee at 150%, on top of BLG/RLG.' },
        DRF: { kind: 'draft', sec: '4.Q.1', text: 'Draft: trip guarantee at 150%, on top of BLG/RLG.' },
        AVA: { kind: 'draft', sec: '25.N.4, 4.Q.1', text: 'Advance volunteer assignment: a VLT trip assigned early, so 150% on top of BLG/RLG.' },
        RSV: { kind: 'reserve', sec: '4.H', text: 'Reserve trip: credit counts toward RLG.' },
      },
      source: 'Sec. 4 pay by assignment code; 25.G.3, 25.N.4',
      verified: true,
      note: 'SON, SWP, CIA: the contract lists them with TRP but does not state their pay separately. TNG is the recap code for OE; the contract calls it ITU/OE training.',
    },
  ],

  cmuPct: [
    {
      effectiveFrom: 'JUL26',
      value: 150,
      source: 'Sec. 4.Q.6-7 Compensatory make-up (CMU) pay',
      verified: true,
      note: '150% in addition to BLG/RLG, up to your CMU eligibility; CH beyond that eligibility pay 100%',
    },
  ],

  pmuPct: [
    {
      effectiveFrom: 'JUL26',
      value: 125,
      source: 'Sec. 4.N.3 PMU (priority make-up) trip pay',
      verified: true,
      note: '125% up to your OTP eligibility; CH beyond that eligibility pay 100%',
    },
  ],

  otherPct: [
    {
      effectiveFrom: 'JUL26',
      value: 100,
      source: 'Straight hourly rate (sim support, training, misc.)',
      verified: true,
    },
  ],

  bidPeriodOverride: [
    {
      effectiveFrom: 'JUL26',
      value: {
        ip: [1000, 1100, 1200, 1300], // Instructor Pilot, year 1, 2, 3, 4 and above
        ca: [1500, 1600, 1700, 1900], // Check Airman (PCA/LCA/SCA/APD)
        fps: [1500, 1600, 1700, 1900], // FPS / TAA
        scaApdExtra: 600,
      },
      source: 'Sec. 11.N.25.e Instructor Pilot; Sec. 11.M.17.i and 11.M.29 Check Airman; Sec. 9.E.2.a FPS/TAA',
      verified: true,
      note: 'Dollars per bid period, by year in the program (year 4 and above is the top rate), in addition to all other pay. SCA or APD-qualified Check Airmen add $600. FPS extras ($300 for more than one aircraft, or for FPS flight deck duties) aren\'t included',
    },
  ],

  // Instructional bid period on a pay-only line: BLG/RLG of the awarded pay-only line plus other pay under
  // Sec. 3 and 4 (the bid period override). No trips, so no trip per diem or international override.
  payOnlyLine: [
    {
      effectiveFrom: 'JUL26',
      value: { keepRows: ['adjust', 'other', 'dayoff'] },
      source: 'Sec. 11.N.25.b.i (Instructor Pilot), 11.M.13.b (Check Airman)',
      verified: true,
      note: 'Paid the BLG/RLG of your awarded pay-only line as published in the bid package, plus additional pay under Sections 3 and 4. Pay-only carryover CH go to your general make-up bank (11.N.12)',
    },
  ],

  instructDayOffPct: [
    {
      effectiveFrom: 'JUL26',
      value: 150,
      source: 'Sec. 11.N.25.b.ii (Instructor Pilot), 11.M.13.d (Check Airman)',
      verified: true,
      note: 'Instructing on a day off beyond your required work days: R-day value at 150% for student contact and non-instructional seat support, 100% for other events. A check airman\'s line trip assigned by Flight Training on a day off pays 150% of ACH',
    },
  ],

  bidPeriodOverrideCheck: [
    {
      effectiveFrom: 'JUL26',
      value: 'nextMid',
      source: 'App reading of pay stubs',
      verified: false,
      note: 'Shown on the 15th check after the bid period, with other pay above guarantee. Pay stubs show it once a month on the 15th',
    },
  ],

  blockOverride: [
    {
      effectiveFrom: 'JUL26',
      value: { lineTripPaidInCash: true },
      source: 'Sec. 4.FF Block override (BKO)',
      verified: true,
      note: 'BKO = OSC minus SCH. Paid in the same form and at the same rate as trip guarantee: cash for a regular trip, credited toward RLG on a reserve trip, 150% on a VLT/DRF trip',
    },
  ],

  overrideScheduledCredit: [
    {
      effectiveFrom: 'JUL26',
      value: { mpdpMin: 192, blockOverHours: 8, tafbHoursPerCH: 3.75 },
      source: 'Sec. 2 def. 109 Override scheduled credit (OSC); 4.F.2; 4.FF',
      verified: true,
      note: 'OSC is the higher of (a) trip rig as scheduled plus actual revenue block hours over 8 in any duty period, or (b) the sum of the duty periods\' scheduled credit: the highest of MPDP, block hours, or duty rig. BKO = OSC minus SCH. Block that runs long in a short duty period shows up as overage (ACH above OSC), not BKO',
    },
  ],

  oscShortLegFloor: [
    {
      effectiveFrom: 'JUL26',
      value: 'mpdp1',
      source: 'App estimate for duty periods that ran short',
      verified: false,
      note: 'For ACH on a typed-in trip: when block was a duty period\'s binding credit and it came in short, its value can\'t drop below MPDP or duty rig. Without your duty rig, the app floors it at MPDP-1 (3:12). Typed-in actual block is treated as revenue block. A pasted recap supplies all of this',
    },
  ],

  overage: [
    {
      effectiveFrom: 'JUL26',
      value: { firstHours: 12, firstPct: 150, excessPct: 200, reserveOverPct: 150 },
      source: 'Sec. 4.BB Overage',
      verified: true,
      note: 'More than 2 hours into time free from duty: first 12 CH of the trip at 150%, the rest at 200% (4.BB.7). 2 hours or less: at the trip\'s own rate (4.BB.6). Reserve trip more than 2 hours into a non-R-day: 150% on top; 2 hours or less: credited to RLG (4.BB.8)',
    },
  ],

  gridPenalty: [
    {
      effectiveFrom: 'JUL26',
      value: { chPerEvent: 3, maxEventsForChPay: 2, premiumPct: 50 },
      source: 'Sec. 4.EE Grid penalty event (GPE)',
      verified: true,
      note: 'International trips only. If all GPEs touch one 48-hour period, none are due. Two or fewer: 3 CH each. More than two: trip guarantee paid a 50% premium (100 to 150, 125 to 175, 150 to 200). Paid on the 15th after the bid period the trip ended',
    },
  ],

  gridPenaltyOnBko: [
    {
      effectiveFrom: 'JUL26',
      value: false,
      source: 'Sec. 4.EE.3.b and 4.FF read together',
      verified: false,
      note: '4.EE.3.b puts the 50% premium on trip guarantee. 4.FF pays BKO "at the same pay rate as trip guarantee", which could carry it. Default: premium on trip guarantee only',
    },
  ],

  tripRig: [
    {
      effectiveFrom: 'JUL26',
      value: { tafbHoursPerCH: 3.75 },
      source: 'Sec. 4.F.2.a Trip rig',
      verified: true,
      note: '1 CH per 3.75 hours TAFB, rounded to the nearest minute',
    },
  ],

  /* --------------------------------------------------------------------- per diem */

  perDiem: [
    {
      effectiveFrom: 'JUL26',
      value: { domestic: 2.85, international: 3.85 },
      source: 'Sec. 5.A.1-2 Per diem',
      verified: true,
      note: 'Per hour of actual TAFB, prorated minute by minute. Paid on the first check of the following bid period (5.A.8)',
    },
    {
      effectiveFrom: 'JUL28',
      value: { domestic: 3.0, international: 4.05 },
      source: 'Sec. 5.A.1-2 Per diem, July 2028 step',
      verified: true,
      note: 'Per hour of actual TAFB, prorated minute by minute',
    },
  ],

  tripClassification: [
    {
      effectiveFrom: 'JUL26',
      value: 'oneTogglePerTrip',
      source: 'Sec. 5.A.1-3 Per diem; not settled for mixed domestic/international trips',
      verified: false,
      note: 'Each trip is marked all domestic or all international for per diem. The contract says "applicable per diem" without saying how a mixed trip splits its hours',
    },
  ],

  internationalDefinition: [
    {
      effectiveFrom: 'JUL26',
      value: { outside: 'contiguous48', deadheadsCount: true, wholeTrip: true },
      source: 'Sec. 1 Scope (international flights); Sec. 2 def. 81 International deadhead; Sec. 3.D.1; Sec. 12.D.1.a',
      verified: true,
      note: 'International means a segment, deadhead included, that departs, lands or stops outside the contiguous 48 states. Alaska, Hawaii and US territories count as international. Override is earned for the whole trip containing that segment (3.D.1)',
    },
  ],

  domesticParameterTrips: [
    {
      effectiveFrom: 'JUL26',
      value: { alaskaOnly: true, canadaMexicoBermudaPR: true },
      source: 'Sec. 12.D.1.c.i (app reading for duty rig)',
      verified: false,
      note: 'Trips entirely within Alaska, or within or between Canada, Mexico, Bermuda, Puerto Rico and the contiguous 48, are scheduled to domestic parameters. The app uses the domestic duty rig for them. They still earn international override',
    },
  ],

  creditValues: [
    {
      effectiveFrom: 'JUL26',
      value: {
        mpdp1: 192, // trips with a layover
        mpdp2: 384, // out and back to base in one duty period
        mpdpE: 384, // into and out of a sort facility, neither starting nor ending at base
        sortFacilities: ['MEM', 'IND', 'EWR', 'OAK', 'ORD', 'AFW', 'GSO', 'LAX', 'ANC', 'CAN', 'CDG'],
        dutyRig: { day: 2.0, night: 1.5, critical: 1.5, international: 1.73 }, // duty hours per CH
        dayFrom: 5 * 60, nightFrom: 16 * 60, criticalFrom: 1 * 60, // showtime LBT windows
        schOverHours: 10, // trip guarantee: trip rig + revenue block over 10 in any duty period (4.F.1.a)
      },
      source: 'Sec. 4.F.1-2 Trip guarantee, trip rig, MPDP, block hours, duty rig',
      verified: true,
      note: 'Duty period credit is the highest of MPDP, block hours (deadhead block included) or duty rig. Duty rig: domestic day show 0500-1559 LBT 1 CH per 2.0 hrs, night 1600-0059 per 1.5, critical 0100-0459 per 1.5, international per 1.73, rounded to the nearest minute. MPDP-F (9:36) isn\'t modelled',
    },
  ],

  overageFromAch: [
    {
      effectiveFrom: 'JUL26',
      value: { aboveHigherOfOscAndSch: true },
      source: 'Sec. 2 def. 5 ACH; Sec. 4.BB.5.a',
      verified: false,
      note: 'When a trip\'s ACH (the recap\'s Actual Pay) exceeds OSC, the difference is overage. The app counts only ACH above the higher of OSC and trip guarantee, so nothing is paid twice. ACH also adds duty rig beyond scheduled on-duty limits, which the app can\'t compute: the recap figure is used when you paste one',
    },
  ],

  /* ------------------------------------------------------- deviation and hotel banks */

  deviationBank: [
    {
      effectiveFrom: 'JAN00',
      value: { model: 'legacyHalving', surfaceTransportCap: null, seatFeeCap: null },
      source: 'Prior agreement',
      verified: true,
      note: 'Unused balance halves each bid period it carries (divide by 2, then 4, then 8...)',
    },
    {
      effectiveFrom: 'JUL26',
      value: { model: 'legacyHalving', surfaceTransportCap: 150, seatFeeCap: null },
      source: 'Sec. 8.C.3.b; Implementation LOA App. A, Phase 1',
      verified: true,
      note: 'Rental car / surface transport is a deviation expense. Another vendor: $150 per occurrence unless the Fleet Captain authorizes more. Balance rule unchanged until the December 2026 bid period',
    },
    {
      effectiveFrom: 'DEC26',
      value: { model: 'carryThenHotel', carryPeriods: 3, toHotelPct: 50, surfaceTransportCap: 150, seatFeeCap: 100 },
      source: 'Sec. 8.C.2.a.ii-iii, 8.C.3.a.iii; Implementation LOA App. A, Phase 2',
      verified: true,
      note: 'Unused balance stays intact three more bid periods, then 50% moves to the hotel bank and the rest drops. Balances offset an overspend oldest first. Seat fees capped at $100 per positioning sequence',
    },
  ],

  deadheadFareCredit: [
    {
      effectiveFrom: 'JUL26',
      value: { before: 'higher', onOrAfter: 'established', revised: 'higher' },
      source: 'Sec. 8.C.2.b-c Deviation bank credit; Sec. 8.A.4 Baseline and Established Fares',
      verified: true,
      note: 'Bid package deadhead: tell the company you are deviating before the first day of the bid period the trip starts in and the bank gets the higher of the Baseline or Established Fare; on or after that day, the Established Fare. Revised trips and trips built after the package: the higher of the two. A carryover trip\'s deadhead credits the bid period containing the deadhead\'s showtime',
    },
  ],

  legacyBalanceConversion: [
    {
      effectiveFrom: 'DEC26',
      value: 'keepHalving', // or 'newTreatment'
      source: 'Not stated in the agreement',
      verified: false,
      note: 'How pre-December 2026 leftover balances convert. Default: they keep halving',
    },
  ],

  hotelOffsetOrder: [
    {
      effectiveFrom: 'DEC26',
      value: 'afterDeviationBalances',
      source: 'Sec. 8.C.2.h.iii does not set the order',
      verified: false,
      note: 'The app covers an overspend from earlier deviation balances first (oldest first), then from the hotel bank up to $7,500 per bid period',
    },
  ],

  legacyRounding: [
    {
      effectiveFrom: 'JAN00',
      value: 'ceil',
      source: 'Inferred from the company Deviation Bank Allocation screen',
      verified: false,
      note: 'Sample rows match rounding UP to the cent (FEB26 $2,384.52 / 256 shows $9.32; normal rounding gives $9.31)',
    },
  ],

  hotelBank: [
    {
      effectiveFrom: 'JAN00',
      value: { domestic: null, international: null, cap: null, maxOffsetPerPeriod: null, cancelHoursBeforeCheckIn: null },
      source: 'Prior agreement amounts not loaded',
      verified: false,
      note: 'Enter your own figures',
    },
    {
      effectiveFrom: 'DEC26',
      value: { domestic: 50, international: 70, cap: 15000, maxOffsetPerPeriod: 7500, cancelHoursBeforeCheckIn: 26 },
      source: 'Sec. 8.C.2.h Hotel Airfare Cancelation (HAC) bank; Implementation LOA App. A, Phase 2',
      verified: true,
      note: 'Room cancelled at least 26 hours before scheduled check-in, and the pilot operated the trip',
    },
  ],

  /* ---------------------------------------------------------------- 401(k) and dues */

  plan401k: [
    {
      effectiveFrom: 'JUL26',
      value: { matchPct: 50, matchOnFirst: 1000, matchMax: 500, pretaxRothMaxPct: 50, aftertaxMaxPct: 20, companyPct: 9 },
      source: 'Sec. 28.D.3, 28.D.4.a, 28.D.14-15 (PRSP)',
      verified: true,
      note: 'Match: 50% of the first $1,000 of pre-tax + Roth per plan year. Company non-elective contribution 9% of eligible earnings each pay period, subject to Code limits (before Jan 1, 2028). Pre-tax/Roth up to 50% of eligible earnings; after-tax up to 20%',
    },
  ],

  irsLimits: [
    {
      effectiveFrom: 'JAN26',
      value: {
        deferral: 24500,
        deferral50: 32500,
        deferral60to63: 35750,
        totalAdditions: 72000,
        totalAdditions50: 80000,
        totalAdditions60to63: 83250,
        compensationLimit: 360000,
        definedBenefit: 290000,
        rothCatchUpWages: 150000,
      },
      source: 'IRS Notice 2026-66 (the 2026 amounts it increases from)',
      verified: true,
      note: 'Catch-up must be Roth if prior-year FICA wages were over the threshold (Code 414(v)(7))',
    },
    {
      effectiveFrom: 'JAN27',
      value: {
        deferral: 25500,
        deferral50: 34000,
        deferral60to63: 37250,
        totalAdditions: 75000,
        totalAdditions50: 83500,
        totalAdditions60to63: 86750,
        compensationLimit: 375000,
        definedBenefit: 300000,
        rothCatchUpWages: 155000,
      },
      source: 'IRS Notice 2026-66',
      verified: true,
      note: 'Catch-up must be Roth if 2026 FICA wages were over $155,000 (Code 414(v)(7))',
    },
  ],

  payrollTax: [
    {
      effectiveFrom: 'JAN26',
      value: { socialSecurityMaxTax: 11439, addlMedicareSingle: 200000, addlMedicareJoint: 250000 },
      source: 'IRS / SSA 2026',
      verified: false,
    },
  ],

  veba: [
    {
      effectiveFrom: 'JAN00',
      value: { startPerCH: 1.0, startYear: 2015, stepPerCH: 0.05 },
      source: 'Sec. 27.I.3 Premium Reimbursement Plan (PRP/VEBA)',
      verified: true,
      note: 'Pay table rates are book rates. Cash pay is reduced by $1.00 per paid credit hour (from Nov 2, 2015), plus $0.05 on the first day of each November bid period after that: $1.55 from Nov 2026. Shown here as a deduction; how it appears on your stub: confirm',
    },
  ],

  unionDues: [
    {
      effectiveFrom: 'JUL26',
      value: { pct: 1.85 },
      source: 'Union dues rate',
      verified: false,
    },
  ],

  /* ------------------------------------------------------------------- retirement */

  retirementElection: [
    {
      effectiveFrom: 'JUL26',
      value: {
        eligibleHiredBefore: '2026-06-29',
        packets: { from: '2027-04-01', to: '2027-04-15' },
        window: { from: '2027-04-15', to: '2027-05-30' },
        confirmationBy: '2027-06-30',
        freezeDate: '2027-12-31',
        // Pension (28.B.2-3): FAE (best five calendar years) x 2% x credited years, max 25.
        pension: { multiplierPct: 2, maxYears: 25, faeYears: 5, faeCap: 340000, company401kPct: 9 },
        // Electing either new option (28.B.13, LOA A.1): FAE cap drops to $290,000 but FAE keeps counting
        // later earnings; credited years freeze, with the June 1, 2027 to May 31, 2028 plan year at 7/12.
        frozen: { faeCap: 290000, serviceAsOf: '2027-06-01', lastYearFraction: 7 / 12 },
        // Pilots with 25+ credited years on June 1, 2027 who elect either option get a one-time taxable
        // payment: 7/12 x (18% of 2027 pay, no cap - 9% of 2027 pay up to 401(a)(17)) (LOA A.1.a.vi, b.iv).
        fullServiceBonus: { minYears: 25, highPct: 18, lowPct: 9, fraction: 7 / 12 },
        cashBalance: {
          start: '2028-01-01',
          faeCap: 290000,
          credits: [{ from: '2028-01-01', pct: 9 }, { from: '2029-01-01', pct: 10 }],
          company401kPct: 9,
          normalRetirementAge: 62,
          forecastReturnPct: 6.5, // LOA B.1: at least 6.5% on a ten-year projected basis
        },
        enhanced401k: {
          faeCap: 290000,
          company401k: [{ from: '2028-01-01', pct: 18 }, { from: '2029-01-01', pct: 19 }],
        },
        // From 2028, company 401(k) money an electing pilot can't put in because of 401(a)(17) or 415(c)
        // is paid in taxable cash (28.D.4.b.ii-iii). Pilots who stay in the pension get no cash (28.D.4.b.i).
        cashOverCap: { from: '2028-01-01' },
        regulatedAge: 65,
      },
      source: 'Sec. 28.B.2-3, 28.B.13, 28.C.7-8, 28.D.3-4; MBCBP/Enhanced PRSP Benefit Implementation LOA',
      verified: true,
    },
  ],

  /* -------------------------------------------- app assumptions (not contract numbers) */

  assumptions: [
    {
      effectiveFrom: 'JAN00',
      value: {
        // Pre-fills the first estimate. TAFB per 4-week line, scaled for 5- and 6-week periods.
        // International override pre-fills to the whole line value (BLG/RLG) until the user edits it.
        typical: {
          domestic: { tafbDomHours: 200 },
          international: { tafbIntlHours: 250, overrideFollowsGuarantee: true },
        },
        defaultWithholdingPct: 30,
        perDiemInPayBase: false, // per diem left out of the 401(k), dues and withholding math
      },
      source: 'App placeholder, not a contract number',
      verified: false,
      note: 'Typical TAFB and override, default withholding, and per diem kept outside the pay base for deductions',
    },
  ],

  // Starting values for the retirement comparison sliders. Yours to change; none is a forecast.
  retireAssumptions: [
    {
      effectiveFrom: 'JAN00',
      value: {
        retireAge: 65,
        payGrowthPct: 3,
        prspReturnPct: 6,
        cbInterestPct: 6.5, // the LOA B.1 forecast for the cash balance plan's portfolio
        discountPct: 5,
        payToAge: 85,
        limitGrowthPct: 2.5,
      },
      source: 'App starting assumptions, not contract numbers',
      verified: false,
      note: 'Pay growth, returns, the rate used to value the pension as a lump sum, how long it pays, and how fast IRS limits rise after the last published year',
    },
  ],
};
