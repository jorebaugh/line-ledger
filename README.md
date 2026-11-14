# Line Ledger (preview)

A static, phone-first pay estimator for pilots. No backend, no accounts, no analytics.
Everything a user enters stays in their browser's `localStorage`.

Independent tool. Not affiliated with any airline or union. Estimates only. Not tax, legal, or investment advice.

## What's in this build (steps 1 to 6)

- `rules.js`: every contract number, versioned by bid period, each with a section reference and a `verified` flag.
- Pay math (`js/paymath.js`), bank math (`js/banks.js`), the trip recap reader (`js/recap.js`), the pay stub
  reader (`js/stub.js`), the 401(k) tracker (`js/k401.js`) and the retirement comparison (`js/retire.js`): pure
  functions, integer cents and minutes, with unit tests.
- First-time setup is five questions, one per screen with big buttons (`js/screens/intake.js`); line value,
  instructor/check airman role and deductions have defaults and live in Settings. Home shows the next check,
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
- Deviation and Hotel banks: deadheads and expenses per bid period, carry and expiry by the rule in effect,
  caps, overspend handling, paste of the company Deviation Bank Allocation screen with a side-by-side
  comparison, hotel bank with the company's three numbers for comparison.
- Retirement election: stay in the pension, the cash balance plan or the enhanced 401(k), side by side with
  your age, service, pay and best five years. Sliders (or typed values) for pay growth, returns, cash balance
  interest, the rate used to value the pension, how long it pays and IRS limit growth. Shows the pension a year,
  its lump-sum value, account balances, the difference from staying, and company money paid as cash over the
  IRS caps. Section 28 and the MBCBP/Enhanced PRSP Benefit Implementation LOA; key dates and countdown.
- Settings: edit answers, add a pay stub (PDF or pasted text) or type withholding, other deductions and
  401(k) elections, keep or remove saved stubs, install on the home screen, export and import JSON, reset.
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
   address on purpose: Crewport Car Share's offline worker lived at www.crewport.co/sw.js, and Line Ledger's `sw.js`
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
