// Reads a pasted Trip Recap (or a pairing) into a trip. Pure functions; runs on the phone only.
// Crew names, employee numbers and trip notes in the paste are never read or kept: only the
// header, pay summary, trip details, your seat/assign code and the deadhead fare table are read.

import { parseHours, formatHours as H, MONTHS, isoDate, parseMoney, ruleAt, periodFromISO } from './core.js';
import { calcTrip } from './paymath.js';
import { RULES } from '../rules.js';

// Airports in the contiguous 48 states. Anything else counts as international (Sec. 1, 3.D.1):
// Alaska, Hawaii and US territories are outside the contiguous 48.
const US48 = new Set(`ABE ABI ABQ ABY ACT ACY AEX AFW AGS ALB ALO AMA ASE ATL ATW AUS AVL AVP AZO BDL BFI BFL BFM BGM BGR
BHM BIL BIS BJI BLI BLV BMI BNA BOI BOS BPT BQK BRD BRO BTM BTR BTV BUF BUR BWI BZN CAE CAK CDC CGI CHA CHO CHS CID CKB
CLE CLL CLT CMH CMI COS COU CPR CRP CRW CSG CVG CWA CYS DAB DAL DAY DBQ DCA DEC DEN DFW DHN DLH DRO DSM DTW EAU ECP EGE
ELM ELP ERI ESC EUG EVV EWN EWR EYW FAR FAT FAY FCA FLG FLL FLO FNT FOE FSD FSM FTW FWA GCC GCK GEG GFK GGG GJT GNV GPT
GRB GRI GRK GRR GSO GSP GTF GTR GUC HDN HGR HLN HOB HOU HPN HRL HSV HTS HYS IAB IAD IAG IAH ICT IDA ILM ILN IND IPT ISP
ITH JAN JAX JFK JLN JST LAF LAN LAR LAS LAW LAX LBB LBE LCH LCK LEX LFT LGA LGB LIT LNK LRD LSE LWS LYH MAF MBS MCI MCN
MCO MDT MDW MEI MEM MFE MFR MGM MGW MHR MHT MIA MKE MKG MLB MLI MLU MOB MOT MQT MRY MSN MSO MSP MSY MWH MYR OAK OGD OKC
OMA ONT ORD ORF OTH OWB PAE PAH PBI PDX PHF PHL PHX PIA PIB PIE PIH PIT PKB PNS PRC PSC PSM PSP PVD PWM RAP RDD RDM RDU
RFD RHI RIC RIV RKS RNO ROA ROC ROW RST RSW SAF SAN SAT SAV SBA SBD SBN SBP SBY SCE SCK SDF SEA SFB SFO SGF SGU SHV SJC
SJT SLC SLN SMF SMX SNA SPI SPS SRQ STC STL SUX SWF SYR TBN TLH TOL TPA TRI TTN TUL TUS TVC TWF TXK TYR TYS VLD VPS XNA
YKM YUM`.split(/\s+/));
// 12.D.1.c.i: trips scheduled to domestic parameters (duty rig only; override still applies).
const ALASKA = new Set('ANC FAI JNU KTN SIT ADQ BET OME OTZ BRW CDV DLG AKN ENA HOM KDK SCC'.split(' '));
const MEXICO = new Set('MEX GDL MTY QRO SLP TIJ CUN AGU BJX CUU HMO MID PVR SJD TLC VER NLD CJS MZT ZLO OAX TRC'.split(' '));
const BDA_PR = new Set('BDA SJU BQN PSE'.split(' '));
const isCanada = (a) => /^Y[A-Z]{2}$/.test(a) && !US48.has(a);
export const outside48 = (a) => !US48.has(a);

// Assign codes and how each pays come from rules.js (payCodes). Unknown codes fall back to a line trip with a note.
export function payCode(code, rules = RULES, period = 'JUL26') {
  return code ? ruleAt(rules, 'payCodes', period).value[code] || null : null;
}

function isoFrom(dd, mon, yy) {
  const m = MONTHS.indexOf(mon.toUpperCase()) + 1;
  if (!m) return null;
  const y = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  return isoDate(y, m, Number(dd));
}

const TOKEN = /[+-]?\d{1,3}h\d{2}|[+-]?\d{1,2}:\d{2}/g;
const signed = (t) => t.startsWith('+') || t.startsWith('-');
const hm = (t) => (t == null ? null : parseHours(t.replace(/^[+-]/, '')));

// A paste can hold several recaps, one after another (a whole month). Each starts at its own header:
// trip number, start date, base, equipment. The same header repeated belongs to the same trip.
const HEADER = /(\d{2,5})\s+(\d{2})([A-Za-z]{3})(\d{4})\s+([A-Z]{3})\s+([A-Z0-9]{2,3})(?:\s*\(([A-Z]+)\))?(?:\s*Rv(\d+))?/g;
export function splitRecaps(text) {
  const s = String(text || '').replace(/\r/g, '');
  const heads = [];
  for (const m of s.matchAll(HEADER)) {
    const key = `${m[1]}/${m[2]}${m[3]}${m[4]}`;
    if (!heads.length || heads[heads.length - 1].key !== key) heads.push({ key, at: m.index });
  }
  if (heads.length <= 1) return [s];
  return heads.map((h, i) => s.slice(i === 0 ? 0 : h.at, i + 1 < heads.length ? heads[i + 1].at : s.length));
}

// Every readable recap in a paste, in the order pasted.
export const parseRecaps = (text) => splitRecaps(text).map((t) => parseRecap(t)).filter((r) => r.ok);

/* ---- The PDF trip sheet: the same trip printed as a table and copied out of a PDF reader. Every cell lands
   on its own line: Flight, Date, Org, Dst, Eq, then the scheduled Dprt, Arrv, Blok, Turn, Lyovr, Duty and the
   actual ones. Empty cells may or may not leave a blank line, so cells are found by what they are. ---- */

const SHEET_TIME = /^\d{1,3}:\d{2}$/;
const SHEET_DATE = /^(\d{2})([A-Za-z]{3})(\d{2})$/;
const SHEET_FLIGHT = /^[A-Z]{0,3}\d{1,5}[A-Z]?$/;
// Signed gap between two clock times, in minutes, taking the short way round midnight.
const clockGap = (a, b) => {
  let d = (a - b) % 1440;
  if (d > 720) d -= 1440;
  if (d <= -720) d += 1440;
  return d;
};

// Split a leg's run of times into scheduled and actual. Scheduled Dprt, Arrv, Blok come first. The actual
// three start where the change in block equals the arrival slip less the departure slip, which holds for
// any flown leg whatever the time zones. No such place: the leg has not been flown, all of it is scheduled.
function splitSheetTimes(t) {
  for (let j = 3; j <= Math.min(6, t.length - 3); j++) {
    const slip = clockGap(t[j + 1], t[1]) - clockGap(t[j], t[0]);
    if (Math.abs((t[j + 2] - t[2]) - slip) <= 2) return { s: t.slice(0, j), a: t.slice(j) };
  }
  return { s: t.slice(0, 6), a: [] };
}

// The cells after Blok are Turn, Lyovr, Duty. Duty shows on the last leg of a duty period, Turn between legs.
function sheetExtras(x, lastOfDuty) {
  if (x.length >= 3) return { turn: x[0], lo: x[1], duty: x[2] };
  if (x.length === 2) return lastOfDuty ? { turn: null, lo: x[0], duty: x[1] } : { turn: x[0], lo: x[1], duty: null };
  if (x.length === 1) return lastOfDuty ? { turn: null, lo: null, duty: x[0] } : { turn: x[0], lo: null, duty: null };
  return { turn: null, lo: null, duty: null };
}

export function sheetLegs(text) {
  const tok = String(text || '').split(/\s+/).filter(Boolean);
  const raw = [];
  for (let i = 0; i + 3 < tok.length; i++) {
    if (/^HOTEL$/i.test(tok[i]) && raw.length) raw[raw.length - 1].hotel = true;
    const d = SHEET_DATE.exec(tok[i + 1]);
    if (!d || !SHEET_FLIGHT.test(tok[i]) || !/^[A-Z]{3}$/.test(tok[i + 2]) || !/^[A-Z]{3}$/.test(tok[i + 3])) continue;
    let j = i + 4;
    let eq = null;
    if (tok[j] && !SHEET_TIME.test(tok[j]) && /^[A-Z0-9]{2,4}$/.test(tok[j])) eq = tok[j++];
    const times = [];
    while (tok[j] && SHEET_TIME.test(tok[j])) times.push(parseHours(tok[j++]));
    if (times.length < 3) continue;
    raw.push({ flt: tok[i], date: isoFrom(d[1], d[2], d[3]), org: tok[i + 2], dst: tok[i + 3], eq, times, hotel: false });
    i = j - 1;
  }
  return raw.map((l, k) => {
    const { s: sch, a: act } = splitSheetTimes(l.times);
    const lastOfDuty = l.hotel || k === raw.length - 1;
    const xs = sheetExtras(sch.slice(3), lastOfDuty);
    const xa = sheetExtras(act.slice(3), lastOfDuty);
    // A deadhead on another airline carries that airline's flight number; the sheet has no deadhead column.
    const deadhead = /^[A-Z]{2}/.test(l.flt) || l.eq === 'DH';
    const ground = l.org === l.dst;
    return {
      flt: l.flt, deadhead, ground, revenue: !deadhead && !ground, date: l.date, org: l.org, dst: l.dst, eq: l.eq,
      blockS: sch[2] ?? null, blockA: act.length ? act[2] : null,
      dutyS: xs.duty, dutyA: act.length ? xa.duty : null,
      loS: l.hotel ? xs.lo : null, loA: l.hotel && act.length ? xa.lo : null,
      turn: xs.turn, layoverAfter: l.hotel,
    };
  });
}

export function parseRecap(text) {
  const s = String(text || '').replace(/\r/g, '');
  const warnings = [];
  const out = { ok: false, warnings };

  const hdr = s.match(/(\d{2,5})\s+(\d{2})([A-Za-z]{3})(\d{4})\s+([A-Z]{3})\s+([A-Z0-9]{2,3})(?:\s*\(([A-Z]+)\))?(?:\s*Rv(\d+))?/);
  if (hdr) {
    out.tripNo = hdr[1];
    out.startDate = isoFrom(hdr[2], hdr[3], hdr[4]);
    out.base = hdr[5];
    out.equipment = hdr[6];
    out.crewComplement = hdr[7] === 'AUG' ? 'augmented' : hdr[7] && hdr[7] !== 'REG' ? hdr[7] : null;
    out.revision = hdr[8] != null ? Number(hdr[8]) : null;
  }
  const show = s.match(/\bShow\s+(\d{2})([A-Za-z]{3})(\d{2})\s+(\d{1,2}):(\d{2})L/);
  if (show) out.showLBT = Number(show[4]) * 60 + Number(show[5]);

  const sch = s.match(/Scheduled\s*Away\s*(\d+:\d{2})\s*Block\s*(\d+:\d{2})\s*Pay\s*(\d+:\d{2})/i);
  if (sch) {
    out.scheduled = { away: parseHours(sch[1]), block: parseHours(sch[2]), pay: parseHours(sch[3]) };
    const act = s.slice(sch.index + sch[0].length).match(/^\s*Actual\s*(?:Away\s*)?(\d+:\d{2})\s*(?:Block\s*)?(\d+:\d{2})\s*(?:Pay\s*)?(\d+:\d{2})/i);
    if (act) out.actual = { away: parseHours(act[1]), block: parseHours(act[2]), pay: parseHours(act[3]) };
  }

  // Legs live between TRIP DETAILS and CREW DETAILS.
  const start = Math.max(0, s.search(/TRIP DETAILS/i));
  const crewAt = s.search(/CREW DETAILS/i);
  const region = s.slice(start, crewAt > start ? crewAt : s.length);
  // Flight (1234, AA100, STFXOE), optional DH flag (Y or DH), date, ORG-DST.
  const LEG = /(?:^|\n)[ \t]*(DH[ \t]+)?([A-Z0-9]{2,8})\s+(?:(DH|Y)\s+)?(\d{2})([A-Za-z]{3})(\d{2})\s+([A-Z]{3})-([A-Z]{3})\b/g;
  const heads = [...region.matchAll(LEG)];
  out.legs = heads.map((m, i) => {
    const segEnd = i + 1 < heads.length ? heads[i + 1].index : region.length;
    const seg = region.slice(m.index + m[0].length, segEnd);
    const stop = seg.search(/\n\s*(GT|Hotel)\b/);
    const timing = stop >= 0 ? seg.slice(0, stop) : seg;
    const tokens = timing.match(TOKEN) || [];
    const triple = /\bS\s+A\s+Dif\b/.test(timing) || (tokens.length >= 3 && signed(tokens[2]));
    const step = triple ? 3 : 1;
    const g = [];
    for (let k = 0; k + step <= tokens.length; k += step) g.push({ s: hm(tokens[k]), a: triple ? hm(tokens[k + 1]) : null });
    // Dprt, Arrv, Blok, then Turn | Turn, Duty, L/O | Duty (last leg of the trip).
    const rest = g.slice(3);
    const last = i === heads.length - 1;
    let turn = null;
    let duty = null;
    let lo = null;
    if (rest.length >= 3) [turn, duty, lo] = rest;
    else if (rest.length === 2) [duty, lo] = rest;
    else if (rest.length === 1) { if (last) duty = rest[0]; else turn = rest[0]; }
    const org = m[7];
    const dst = m[8];
    const deadhead = !!(m[1] || m[3]);
    const ground = org === dst;
    return {
      flt: m[2],
      deadhead,
      ground,
      revenue: !deadhead && !ground,
      date: isoFrom(m[4], m[5], m[6]),
      org,
      dst,
      blockS: g[2]?.s ?? null,
      blockA: g[2]?.a ?? null,
      dutyS: duty?.s ?? null,
      dutyA: duty?.a ?? null,
      loS: lo?.s ?? null,
      loA: lo?.a ?? null,
      turn: turn?.s ?? null,
      layoverAfter: /\n\s*Hotel\b/.test(seg) || rest.length >= 2,
    };
  });
  if (!out.legs.length) {
    const sheet = sheetLegs(s);
    if (sheet.length) {
      out.legs = sheet;
      out.layout = 'sheet';
      out.startDate = out.startDate || sheet[0].date;
      out.base = out.base || sheet[0].org;
      out.equipment = out.equipment || sheet[0].eq || undefined;
      // Trip totals: the six cells under "Away Block Pay Away Block Pay" (scheduled, then actual when flown).
      const tot = s.match(/Away\s+Block\s+Pay\s+(?:Away\s+Block\s+Pay\s+)?(\d+:\d{2})\s+(\d+:\d{2})\s+(\d+:\d{2})(?:\s+(\d+:\d{2})\s+(\d+:\d{2})\s+(\d+:\d{2}))?/i);
      if (tot && !out.scheduled) {
        out.scheduled = { away: parseHours(tot[1]), block: parseHours(tot[2]), pay: parseHours(tot[3]) };
        if (tot[4]) out.actual = { away: parseHours(tot[4]), block: parseHours(tot[5]), pay: parseHours(tot[6]) };
      }
      // Seat only: the first cell under the crew header. The employee number and name next to it are not read.
      const pos = s.match(/Last\s+Name\s+(CAP|CA|FO|F\/O|RFO|RF2|SO)\b/);
      if (pos) out.seat = pos[1];
    }
  }
  if (!out.legs.length) warnings.push('No flight legs found.');

  // Duty periods end at a layover or at the last leg.
  out.dutyPeriods = [];
  let cur = null;
  out.legs.forEach((l, i) => {
    if (!cur) {
      cur = { legs: [], blockS: 0, blockA: 0, revS: 0, revA: 0, actualMissing: false, intl: false, dutyS: null, dutyA: null, loS: null, loA: null };
      out.dutyPeriods.push(cur);
    }
    cur.legs.push(i);
    if (!l.ground) {
      cur.blockS += l.blockS || 0;
      if (l.blockA == null) cur.actualMissing = true; else cur.blockA += l.blockA;
    }
    if (l.revenue) { cur.revS += l.blockS || 0; cur.revA += l.blockA || 0; }
    if (outside48(l.org) || outside48(l.dst)) cur.intl = true;
    if (l.layoverAfter || i === out.legs.length - 1) Object.assign(cur, { dutyS: l.dutyS, dutyA: l.dutyA, loS: l.loS, loA: l.loA });
    if (l.layoverAfter) cur = null;
  });

  // Seat and assign code: the first crew row that shows an assign code (yours). Nothing else is read.
  if (crewAt >= 0) {
    const after = s.slice(crewAt);
    const cut = after.search(/DEADHEAD FARES|TRIP NOTES|Disclaimer/i);
    const crew = cut > 0 ? after.slice(0, cut) : after;
    const cm = crew.match(/(?:^|\n)[ \t]*(CAP|CA|FO|F\/O|RFO|RF2|SO)[ \t]+([A-Z]{1,3}(?:\/[A-Z]{1,2})?)[ \t]*(?=\n|\t)/);
    if (cm) { out.seat = cm[1]; out.assignCode = cm[2]; }
  }

  // Deadhead fares: route, airline, Baseline and Established Fare.
  out.fares = [];
  const fa = s.search(/DEADHEAD FARES/i);
  if (fa >= 0) {
    const tail = s.slice(fa);
    const endAt = tail.search(/Trip Totals|Disclaimer|TRIP NOTES/i);
    const block = endAt > 0 ? tail.slice(0, endAt) : tail;
    for (const m of block.matchAll(/(?:^|\n)[ \t]*([A-Z]{3})-([A-Z]{3})[ \t]+([A-Z0-9]{2})\b[^\n$]*\$([\d,]+(?:\.\d{1,2})?)[^\n$]*\$([\d,]+(?:\.\d{1,2})?)/g)) {
      const leg = out.legs.find((l) => l.deadhead && l.org === m[1]) || null;
      out.fares.push({ org: m[1], dst: m[2], airline: m[3], baselineCents: parseMoney(m[4]), establishedCents: parseMoney(m[5]), date: leg?.date || null });
    }
  }

  const airports = [...new Set(out.legs.flatMap((l) => [l.org, l.dst]))];
  out.airports = airports;
  out.outside48 = airports.filter(outside48);
  out.international = out.outside48.length > 0;
  out.ok = !!(out.legs.length && (out.scheduled || out.tripNo));
  return out;
}

/* ------------------------------------------------------- contract credit math */

function rigWindow(minuteOfDay, cv) {
  const t = ((minuteOfDay % 1440) + 1440) % 1440;
  if (t >= cv.dayFrom && t < cv.nightFrom) return 'day';
  if (t >= cv.criticalFrom && t < cv.dayFrom) return 'critical';
  return 'night';
}

const transitsSort = (legs, list) => legs.some((l, k) => k + 1 < legs.length && list.includes(l.dst) && legs[k + 1].org === l.dst);

// SCH, OSC and ACH from the recap's own times (Sec. 2 defs. 5, 109; Sec. 4.F).
export function recapCredits(r, rules = RULES) {
  const code = r.startDate ? periodFromISO(r.startDate) : 'JUL26';
  const cv = ruleAt(rules, 'creditValues', code).value;
  const oscV = ruleAt(rules, 'overrideScheduledCredit', code).value;
  const dom = ruleAt(rules, 'domesticParameterTrips', code).value;
  const ap = r.airports || [];
  const domesticParams = r.international && (
    (dom.alaskaOnly && ap.every((a) => ALASKA.has(a)))
    || (dom.canadaMexicoBermudaPR && ap.every((a) => US48.has(a) || isCanada(a) || MEXICO.has(a) || BDA_PR.has(a))));
  const hasLayover = r.dutyPeriods.length > 1;
  let showS = r.showLBT ?? null;
  let showA = r.showLBT ?? null;
  const dps = r.dutyPeriods.map((d, i) => {
    const legs = d.legs.map((k) => r.legs[k]);
    const startsAtBase = legs[0].org === r.base;
    const endsAtBase = legs[legs.length - 1].dst === r.base;
    let mpdp = 0;
    let mpdpName = '';
    if (hasLayover) { mpdp = cv.mpdp1; mpdpName = 'MPDP-1'; } else if (startsAtBase && endsAtBase) { mpdp = cv.mpdp2; mpdpName = 'MPDP-2'; }
    if (!startsAtBase && !endsAtBase && transitsSort(legs, cv.sortFacilities) && cv.mpdpE > mpdp) { mpdp = cv.mpdpE; mpdpName = 'MPDP-E'; }
    const intl = d.intl && !domesticParams;
    const kindS = intl ? 'international' : showS == null ? null : rigWindow(showS, cv);
    const kindA = intl ? 'international' : showA == null ? null : rigWindow(showA, cv);
    const rig = (duty, kind) => (duty != null && kind ? Math.round(duty / cv.dutyRig[kind]) : 0);
    const rigS = rig(d.dutyS, kindS);
    const rigA = rig(d.dutyA ?? d.dutyS, kindA);
    const credit = Math.max(mpdp, d.blockS, rigS);
    const floorA = Math.max(mpdp, rigA);
    const ach = d.actualMissing ? null : Math.max(floorA, d.blockA);
    if (showS != null && d.dutyS != null && d.loS != null) showS += d.dutyS + d.loS; else showS = null;
    if (showA != null && (d.dutyA ?? d.dutyS) != null && (d.loA ?? d.loS) != null) showA += (d.dutyA ?? d.dutyS) + (d.loA ?? d.loS); else showA = null;
    const why = credit === d.blockS ? 'block' : credit === rigS ? `${kindS} duty rig` : mpdpName;
    return { ...d, mpdp, mpdpName, kindS, kindA, rigS, rigA, credit, floorA, ach, why };
  });
  const per = oscV.tafbHoursPerCH;
  const rigS = r.scheduled ? Math.round(r.scheduled.away / per) : null;
  const rigA = r.actual ? Math.round(r.actual.away / per) : null;
  const over = (n, key) => dps.reduce((s, d) => s + Math.max(0, (d[key] || 0) - n * 60), 0);
  const creditSum = dps.reduce((s, d) => s + d.credit, 0);
  const schA = rigS != null ? rigS + over(cv.schOverHours, 'revS') : null;
  const sch = Math.max(creditSum, schA ?? 0);
  const haveActual = !!r.actual && dps.every((d) => !d.actualMissing);
  const over8 = haveActual ? over(oscV.blockOverHours, 'revA') : 0;
  const oscA = rigS != null && haveActual ? rigS + over8 : null;
  const osc = haveActual ? Math.max(creditSum, oscA ?? 0) : null;
  const achB = haveActual ? dps.reduce((s, d) => s + d.ach, 0) : null;
  const achA = haveActual && rigA != null ? rigA + over8 : null;
  const ach = haveActual ? Math.max(achB, achA ?? 0) : null;
  return { code, dps, domesticParams, rigS, rigA, creditSum, schA, sch, over8, oscA, osc, achA, achB, ach, haveActual };
}

// Turn a parsed recap into trip fields (no ids). Uses the company's SCH and ACH; the app's
// contract math is shown next to them as a check.
export function recapToTrip(r, rules = RULES) {
  const route = r.legs.length ? [r.legs[0].org, ...r.legs.map((l) => l.dst)].join('-') : '';
  const cc = recapCredits(r, rules);
  const pc = payCode(r.assignCode, rules, cc.code);
  const assign = pc ? pc.kind : 'line';
  const notes = [];
  if (r.layout === 'sheet') notes.push('Read from the PDF trip sheet, which has no assign code, so it comes in as a line trip. Set the type of trip if it was something else (CMU, VLT, reserve).');
  if (r.assignCode && !pc) notes.push(`Assign code ${r.assignCode} isn't in the app's list, so it's treated as a line trip. Change it if that's wrong.`);
  else if (pc && r.assignCode !== 'TRP') notes.push(`${r.assignCode}: ${pc.text} (Sec. ${pc.sec}${pc.confirm ? ', confirm' : ''})`);
  if (r.scheduled) {
    notes.push(Math.abs(cc.sch - r.scheduled.pay) <= 1
      ? `Scheduled pay ${H(r.scheduled.pay)} matches the contract math (${cc.schA != null && cc.schA > cc.creditSum ? (cc.schA > cc.rigS ? `trip rig ${H(cc.rigS)} + ${H(cc.schA - cc.rigS)} revenue block over 10:00` : `trip rig ${H(cc.rigS)}`) : 'sum of duty period credits'}).`
      : `Contract math gives a trip guarantee of ${H(cc.sch)}; the recap shows ${H(r.scheduled.pay)}. The recap figure is used.`);
  }
  if (r.actual && cc.ach != null) {
    notes.push(Math.abs(cc.ach - r.actual.pay) <= 1
      ? `Actual pay ${H(r.actual.pay)} matches the contract math for ACH.`
      : `Recap actual pay ${H(r.actual.pay)} vs app ACH ${H(cc.ach)}: the recap figure is used (it can include duty rig beyond on-duty limits).`);
  }
  if (cc.domesticParams) notes.push('Trip is scheduled to domestic parameters (12.D.1.c), so the domestic duty rig is used. It still earns override.');
  const late = r.actual && r.scheduled ? r.actual.away - r.scheduled.away : 0;
  if (late > 120) notes.push(`Trip ended ${H(late)} after scheduled. If that ran more than 2 hours into scheduled days off, untick "2 hrs or less" (4.BB.7).`);
  if (ruleAt(rules, 'payRates', cc.code).beforeEffective) notes.push('This trip is before the July 2026 bid period. The app uses the 2026 contract rates.');
  return {
    label: [r.tripNo, route].filter(Boolean).join(' '),
    assign,
    intl: r.international,
    sched: r.scheduled ? H(r.scheduled.pay) : H(cc.sch),
    away: r.actual ? H(r.actual.away) : r.scheduled ? H(r.scheduled.away) : '',
    schedTafb: r.scheduled ? H(r.scheduled.away) : '',
    bkoMode: 'block',
    dps: cc.dps.map((d) => ({
      credit: H(d.credit),
      sched: H(d.blockS),
      actual: d.actualMissing ? '' : H(d.blockA),
      dh: d.actualMissing ? '' : H(d.blockA - d.revA),
      floor: H(d.floorA),
    })),
    bko: '',
    actual: '',
    overage: '',
    overageShort: true,
    ulr: r.legs.some((l) => l.revenue && l.blockS > 16 * 60),
    gpeCount: 0,
    gpeSame48: false,
    recap: {
      tripNo: r.tripNo || null,
      startDate: r.startDate || null,
      assignCode: r.assignCode || null,
      seat: r.seat || null,
      crew: r.crewComplement || null,
      schedPay: r.scheduled ? r.scheduled.pay : null,
      actualPay: r.actual ? r.actual.pay : null,
      actualBlock: cc.haveActual ? cc.dps.reduce((s, d) => s + d.blockA, 0) : null,
      outside48: r.outside48,
      notes,
    },
  };
}

// Adds the app's BKO / overage result to the trip's notes.
export function reconcileRecapTrip(trip, ctx) {
  const c = calcTrip(trip, ctx);
  const parts = [];
  if (c.bkoPending) parts.push('BKO waits for actual block times.');
  else {
    parts.push(c.bkoMin ? `BKO ${H(c.bkoMin)} (OSC ${H(c.oscMin)} − SCH ${H(c.schedMin)}).` : 'No BKO: OSC is not above the trip guarantee.');
    if (c.autoOverageMin) parts.push(`Overage ${H(c.autoOverageMin)}: actual pay above OSC.`);
  }
  return { ...trip, recap: { ...trip.recap, notes: [...trip.recap.notes, ...parts] } };
}

// Bank credit for a deadhead fare by when you tell the company you're deviating (8.C.2.b).
//   when: 'before' (before day one of the bid period the trip starts in), 'after' (on or after), 'revised'
export function fareCredit(fare, when, rules = RULES, code = 'JUL26') {
  const v = ruleAt(rules, 'deadheadFareCredit', code).value;
  const pick = when === 'after' ? v.onOrAfter : when === 'revised' ? v.revised : v.before;
  const b = fare.baselineCents ?? 0;
  const e = fare.establishedCents ?? 0;
  return pick === 'established' ? e : Math.max(b, e);
}
