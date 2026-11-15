# Crewport Pay (preview)

A static, phone-first pay estimator for pilots. No backend, no accounts, no analytics.
Everything a user enters stays in their browser's `localStorage`.

Independent tool. Not affiliated with any airline or union. Estimates only. Not tax, legal, or investment advice.

## What's in this build (steps 1 to 6)

- `rules.js`: every contract number, versioned by bid period, each with a section reference and a `verified` flag.
- Pay math (`js/paymath.js`), bank math (`js/banks.js`), the trip recap reader (`js/recap.js`), the pay stub
  reader (`js/stub.js`), the 401(k) tracker (`js/k401.js`) and the retirement comparison (`js/retire.js`): pure
  functions, integer cents and minutes, with unit tests.
- First-time setup is six questions (seven for an instructor or check airman), one per screen with big buttons
  (`js/screens/intake.js`). Settings is a list of folded rows that save on change. Line value,
  bid period length and deductions have defaults and live in Settings. Home shows the next check,
  three numbered steps and a short action list. Pay shows the checks, your line, your trips and other pay; the
  what-if slider, last period, breakdown, stub check and history are folded sections. A trip shows four fields,
  with the rest under "More". Home,
  Pay estimator: guarantee, trips (line 100%, VLT/DRF/AVA 150%, CMU 150%, PMU/SMU 125%, reserve) with OSC,
  BKO and overage from duty-period block times, paste a Trip Recap, quick add-ons, what-if draft (slider or
  typed hours), 15th / last-day / next-15th checks (next month's line value optional), stub audit, history
  with YTD. Instructors and check airmen can mark a bid period pay-only: BLG of the pay-only line plus the
  bid period override and day-off instruction at 150%, with trips and their per diem left out (11.N.25.b).
- Trip Recap paste: reads legs, deadheads, duty periods and the deadhead fare table. Rebuilds SCH (Sec. 4.F)
  and ACH (def. 5) from the recap's own times as a check, computes OSC (def. 109), BKO (4.FF) and overage
  (4.BB.5), and can credit chosen deadhead fares to the deviation bank by when you told the company (8.C.2.b).
  Assign codes (TRP, M/U, PNP, MUS/MUD/MUV, SUB, RAT, TNG, PRO, PDO, AFB, PMU, SMU, CMU, VLT, DRF, AVA, RSV)
  map to how they pay, each with its section, from `payCodes` in `rules.js`.
  International means any segment touching a point outside the contiguous 48 (Alaska and Hawaii included).
- 401(k): year to date from a pasted pay stub (or typed, or estimated), projected check by check to
  December 31 against the employee, total additions and compensation limits, with the after-tax % that
  lands on the limit. A pasted stub can also set withholding, other deductions and elections.
- Check a pay stub, line by line (`js/audit.js`): a saved stub (PDF or paste) is lined up against the app's
  figures for that check. The 15th is half of this bid period's guarantee plus everything above guarantee from
  the bid period before; the last-day check is the other half. Rows: half of guarantee, pay above guarantee,
  international override, instructor override, per diem. Each row opens to show the stub's pay codes next to
  the app's lines. A short row names the line that looks missing, or sizes the gap in credit hours, and
  "Write up the short lines" builds a plain-text pay question with the contract section for each line (copied
  by the pilot; nothing is sent). Only pay codes seen on real stubs are mapped one to one (BLG, per diem,
  Intl, InstrPilot); every other code is compared as one "pay above guarantee" total.
- Disruption pay (`disruptionPay` in `rules.js`): 4.W landing, duty period, layover, crew designation,
  out-and-back, single layover and day-to-critical disruptions; 4.X FAR extension; 4.Y extra duty period; 4.Z
  recall from rest; 4.AA.3 base replacement; 4.CC weather replacement; 4.GG and 4.HH critical period and
  intermediate stop events; 4.U taxi pay; the two reserve disruption pays in 25.M. Each row says whether a
  pay log is needed: always (4.U.2), until the December 2026 bid period for the new 4.W triggers (Implementation
  LOA, Appendix A), or "the contract does not say". Rows not marked sent show on Home as pay logs to send.
- A whole month of Trip Recaps in one paste: recaps pasted one after another are split at each trip header,
  listed with tick boxes, and each goes to the bid period it started in. Trips already added are unticked.
- Any paste box takes any paste: a trip recap pasted into the pay stub box (or a stub pasted into a trip box)
  is recognised, says what it is, and opens in the right place with the paste carried over.
- Reserve or regular line by bid period: "This bid period you hold a" on Pay overrides the line type in Settings
  for that bid period (RLG, and credit over RLG at 150%, 4.H.7). Vacation on a reserve line (`rdayValue`): each
  vacation day counts as an R-day, one R-day value (RLG ÷ R-days on the line) toward RLG, with no pay of its own
  (4.C, 7.G.3.b, 7.G.3.d.vi, 4.H.2).
- CMU with eligibility running out part way: a CMU trip takes "CMU credit you had left". Credit hours up to it
  pay 150%, hours past it pay 100%, all on top of guarantee (4.Q.7). The trip guarantee uses the eligibility
  first, then block override, then overage. A CMU hour inside eligibility counts as 1.5 paid hours, the way the
  stub's regular pay line carries it, so retiree health on the next 15th follows.
- What's a trip worth: paste a trip (open time, draft offer or recap) and see what it adds on top of guarantee
  at 150%, 125% or 100%, the rough take-home, the take-home per hour and per day away, and the check it lands on.
- Take-home by check: the 15th and the end-of-month check keep their own withholding percentage and other
  deductions (`withholding`/`otherDed` and `withholdingEnd`/`otherDedEnd`; a blank one borrows the other's).
  A stub fills in the check it belongs to, by its pay period. Retiree health (PRP/VEBA) comes off the 15th
  only, on every credit hour paid for the bid period before, at that period's rate.
- Deviation and Hotel banks: deadheads and expenses per bid period, carry and expiry by the rule in effect,
  caps, overspend handling, paste of the company Deviation Bank Allocation screen with a side-by-side
  comparison, hotel bank with the company's three numbers for comparison.
- Retirement election: stay in the pension, the cash balance plan or the enhanced 401(k), side by side with
  your age, service, pay and best five years. Sliders (or typed values) for pay growth, returns, cash balance
  interest, the rate used to value the pension, how long it pays and IRS limit growth. Shows the pension a year,
  its lump-sum value, account balances, the difference from staying, and company money paid as cash over the
  IRS caps. Section 28 and the MBCBP/Enhanced PRSP Benefit Implementation LOA; key dates and countdown.
- Settings: edit answers, add a pay stub (PDF or pasted text) or type each check's withholding and other
  deductions and your 401(k) elections, keep or remove saved stubs, install on the home screen, export and import JSON, reset.
- Pay stub PDFs are read on the phone with no library (`js/pdftext.js`): standard-font statements with plain or
  compressed page text. The text goes through the same stub reader as a paste.
- "Would you use this?" on Home and at the bottom of Pay: three questions, sent only when the user taps Send.
- Installable (PWA): `manifest.webmanifest`, icons in `icons/`, and `sw.js`, which caches the whole app as one
  version so it opens with no signal.

Pasted recaps, pay stubs and company screens are read in the browser only. Crew names, employee numbers,
trip notes, addresses and account numbers are never read or stored. Fonts are the device's own system fonts,
so nothing loads from a third party.

## Run it

Any static file server works. ES modules don't load from `file://`, so open it through a server:

```bash
python3 -m http.server 8731
```

Then open http://localhost:8731

## Test it

Node 20 or later, no installs:

```bash
npm test
```

## Deploy to GitHub Pages

The public repository holds only the app. `tests/` and `.claude/` stay on this computer (`.gitignore`),
so the tests run here before every push, not on GitHub. A local `pre-push` hook runs them and refuses the push
if they fail or if anything under `tests/` is tracked.

1. Push this folder to the repository's `main` branch.
2. Repository Settings, then Pages: deploy from branch `main`, folder `/ (root)`. `.nojekyll` serves files as-is.
3. The site is served at https://www.crewport.co (the `CNAME` file; GoDaddy DNS: `@` A record to GitHub Pages,
   `www` CNAME to `jorebaugh.github.io`). crewport.co and the github.io address forward there. www is the main
   address on purpose: Crewport Car Share's offline worker lived at www.crewport.co/sw.js, and Crewport Pay's `sw.js`
   replaces it there. All paths are relative.

Saved data is per web address. Moving the app to a different address later leaves everyone's entries behind
at the old one (they can bring them over with Settings, Export and Import).

## Feedback

Same approach as the Mint schedule page: the cards on Home and Pay and the "Send feedback" link in every
footer open an email to `FEEDBACK_EMAIL` (`config.js`), pre-filled with boxes to tick, including what they'd pay.
The only thing the app adds is its version and the screen it came from. No form service, nothing sent by the app.
The address is public in the page.

## Releasing a new version

The service worker serves the cached app until a new version arrives, so every deploy needs a new version:

1. Bump `APP_VERSION` in `config.js` and `VERSION` in `sw.js` to match (`npm test` fails if they differ).
2. If you add a file the app loads, add it to `FILES` in `sw.js` (`npm test` checks the import graph).
3. Push. Phones download the new version in the background and show "A new version is ready. Reload."

On `localhost` the service worker is off so edits show up right away. Add `?sw` to the address to test it.

## Updating contract numbers

All figures live in `rules.js`. Each rule is a list of versions:

```js
perDiem: [
  { effectiveFrom: 'JUL26', value: { domestic: 2.85, international: 3.85 }, source: 'Sec. 5.A', verified: true },
  { effectiveFrom: 'JUL28', value: { domestic: 3.00, international: 4.05 }, source: 'Sec. 5.A', verified: true },
],
```

- The app uses the latest version whose `effectiveFrom` bid period is on or before the period being estimated.
- Don't edit an old version when a rate changes. Add a new one with the new `effectiveFrom`.
- `verified: false` puts a "confirm" marker in the UI wherever that number is used.
- Run `npm test` after any change. The tests check that every rule has a source and flag, and that every
  pay table has 15 year groups per seat and fleet.

Pay tables for July 2026, January 2028, January 2029 and January 2030 (Sec. 3.C) are loaded. They
were cross-checked against the agreement text.

## Files

```
index.html          shell
rules.js            all contract numbers
config.js           FEEDBACK_EMAIL (where feedback emails go), APP_VERSION
css/app.css         styles
js/core.js          hours/money parsing, bid period codes, rule lookup
js/paymath.js       pay, trip, BKO/OSC, checks, net, audit
js/recap.js         Trip Recap / pairing paste reader, contract credit math (SCH, OSC, ACH)
js/stub.js          pay stub paste reader
js/audit.js         line-by-line check of a saved stub against the app's figures, and the pay question text
js/k401.js          401(k) year to date and projection
js/retire.js        retirement election comparison
js/pdftext.js       pay stub PDF to text, on the phone
js/feedback.js      the pre-filled feedback email (mailto link)
js/install.js       home-screen install and offline updates
sw.js               offline cache
manifest.webmanifest, icons/   home-screen app
js/banks.js         deviation bank replay, company-screen paste parser, hotel bank
js/view.js          figures + "how was this calculated" text
js/store.js         localStorage state
js/sample.js        demo pilot
js/screens/*.js     intake, home, pay, banks, 401(k), retire, settings, the shared stub sheet
                    (later.js is no longer used)
tests/              node:test unit tests and fixtures (local only, not in the public repository)
```

## Names and icon

The app is called Crewport Pay. The repository, the folder, the saved-data key (`lineLedger.v1`) and the offline
cache prefix (`line-ledger-`) keep the earlier name on purpose: changing them would drop saved data or strand the
old cache. The icon set is drawn by `python3 tools/make-icons.py icons` (pure Python, no image library).
