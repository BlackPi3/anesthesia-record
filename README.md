# Anesthesia Record

A digital anesthesia record (*Narkoseprotokoll*) for ambulatory (outpatient) procedures — built for
iPad and desktop, for use by an anesthesiologist during a real case.

## Problem

During an outpatient procedure, an anesthesiologist continuously documents vitals, medications,
fluids, and clinical events while managing the patient — under time pressure, with frequent
interruptions. Today that happens on a paper protocol. This project replaces the paper form with
a web app, without changing what the anesthesiologist actually needs to capture:

- **Vitals over time**: SpO₂, heart rate, non-invasive blood pressure (NiBP), and temperature,
  all on one shared timeline so trends and correlations with events stay visible.
- **Medications and fluids**: bolus (single) doses and continuous infusions, each timestamped.
- **Phases and events**: the milestones of a case — anesthesia start, incision, suturing,
  emergence end, patient discharge.

Every entry is timestamped, visible the moment it's entered, and correctable afterward with a
clear trail of what changed. The case survives a page reload without losing anything — the app
persists data locally in the browser; no backend is used, by design (see below).

Built for [Sikant's](https://sikant.de) coding challenge (*Digitales Narkoseprotokoll*).

## Status

Everything the record holds can be written, corrected and removed, and the case survives a reload.

- **Recording** starts on the row being written into: every lane and both bands carry their own
  „Erfassen“ button. A single-metric lane opens straight on its value field; the blood pressure
  lane opens one reading holding all three pressures; the medication and event bands still ask
  which drug or which milestone first.
- **Values are typed**, on a keypad in the sheet — the number is already known from the monitor, so
  the shortest path to the record is its digits. A physical keyboard types into the same field, and
  `−` / `+` move an entered value by one step. The blood pressure sheet has one keypad and three
  rows, and tapping a row points the keypad at it.
- **Vitals** are drawn as one lane per parameter over a shared time axis. A point is corrected by
  dragging it, by arrow keys once selected, or by opening it in the entry sheet from its readout.
  On a touchscreen a swipe scrolls the record and a press and hold is what moves a value.
- **The value axes are narrow and fixed.** Each lane spans the window its parameter is ordinarily
  read in rather than everything a patient could produce, so an ordinary case fills its lane
  instead of drawing a flat line across an empty box. They do not rescale to the data, because two
  cases have to be comparable at a glance. A reading outside its lane is drawn hollow against the
  edge it went past, keeping its own number in the readout and in the written-out values.
- **The current value of each lane** is set large in a rail to the right of the chart, level with
  its own trace: the number, its unit, and the time it was taken. It is the newest measurement on
  that lane and nothing else — not the selection, and never clamped to fit the axis.
- **Reading the numbers**: a tap on the chart clear of any point drops the trend lines and writes
  every value beside its point; tapping again brings the lines back. The button above the axis does
  the same and says which of the two modes is on.
- **Medications, fluids and phase events** are corrected by tapping them in their band, which
  reopens the sheet they were written in. Ending a running infusion is the same sheet.
- **The audit trail** is kept on every entry and shown in the sheet, in front of whoever is about
  to correct the entry again.
- **Undo** takes back the last change, from the header or with `Ctrl`/`Cmd`+`Z`.
- **Saving** is immediate and confirmed in the header. A record with nothing in it says so.

The domain layer holds the case and entry types, the vital/event catalogue with its German labels
and ranges, the local-storage persistence layer, and a fictional demo case.

92 unit tests cover the domain layer, the keypad's typing rules, and the timeline's coordinate and
label-placement maths. 79 Playwright tests run across desktop Chrome, an iPad-sized viewport with
touch, and WebKit — 232 runs in all.

This README grows alongside the build; sections appear as the thing they describe does.

## Data model

`src/domain/types.ts` holds the model, and the reasoning behind each shape is in
[`docs/decisions.md`](docs/decisions.md). In short:

A **case** is a patient, a procedure, a date, a timeline origin, and a flat list of entries.

An **entry** is one of four shapes in a discriminated union, tagged by `type`:

| `type` | records | shape |
|---|---|---|
| `vital` | one measured value | point in time |
| `bolus` | a single dose | point in time |
| `infusion` | a continuous rate | interval, open while running |
| `event` | a phase milestone | point in time |

Blood pressure is three `vital` entries (systolic, mean, diastolic) sharing one timestamp, so
every vital entry carries exactly one number.

Times are epoch milliseconds. Corrections are non-destructive: editing pushes the previous values
onto the entry's `revisions`, and removal sets `deletedAt`, so the record keeps the audit trail
the brief asks for.

`src/domain/catalog.ts` holds the per-vital German labels, units, plotted axis ranges, and the
wider ranges the value control accepts. Both the chart and the entry control read their numbers
from there, which is what keeps the axis and the picker from disagreeing. The two ranges differ on
purpose: the axis spans what a case is ordinarily read in, the control spans everything that can
be documented, and the gap between them is what the off-scale mark is for.

`src/domain/storage.ts` is the only file that touches `localStorage`. Load and save return result
unions rather than throwing, so every caller has to handle the failure cases that local storage
really produces, and the load outcomes map directly onto the empty and error states in the UI.

**Demo data is fictional**, in `src/domain/demoCase.ts`: a placeholder patient (Erika Mustermann)
and invented values, with fixed timestamps so the chart, the screenshots, and the tests all see
the same case on every run.

## Current design decisions

Full reasoning and rejected alternatives are in [`docs/decisions.md`](docs/decisions.md). Summary:

- **One shared timeline** for vitals, medications/fluids, and events — not separate timelines per
  category — so correlations between them (e.g. a vital change right after a dose) stay readable.
- **Entry flow**: each row of the chart carries its own entry button, so what is being written down
  is chosen by pointing at the row rather than by naming it in a list. The value is then typed on a
  keypad — the number is read off a monitor, so digits are both the fastest and the only exact way
  to say it. The entry timestamps to the current time by default: this reflects how documentation
  actually happens in the OR (logged as it happens), rather than the user placing a point at an
  arbitrary spot on the chart.
- **Correction**: tapping an existing point on the timeline reopens it for editing (value and/or
  time), building on the same control used for entry.
- **NiBP (blood pressure)** is entered as one reading holding all three pressures on one shared
  timestamp, because a cuff inflates once and reports all three. Each of the three can be switched
  off for a manual cuff, which gives no mean. They are still *stored* as three ordinary vital
  entries, so correcting one afterwards touches only that one.
- **5-minute gridlines** on the timeline are a visual/clinical reference (matching how vitals are
  conventionally charted), not a constraint — entries can land at any exact time.
- **Local persistence only**, no backend — a mandatory constraint from the challenge brief, and
  also the right scope for what's being evaluated here.

- **App framework: React Router + Vite**, over Next.js. The brief permits either; Next.js's main
  advantages (server rendering, API routes) solve problems this backend-less app doesn't have, so
  React Router keeps the whole app as plain client-side React.

- **Values are typed, not dialled.** A keypad in the sheet, not a slider or a wheel: the number is
  already known when the sheet opens, and a gesture can only approximate it — a pixel is worth more
  than one unit on most of these axes. Typing is exact by construction, and it is the same
  interaction on an iPad and on a desktop keyboard.

## Timeline

`src/timeline/` draws the record as one lane per vital parameter over a shared time axis, with
medications and phase events in bands beneath. It is hand-rolled SVG: charting libraries are
built to display a dataset, and the graded interaction here runs the other way, mapping a pointer
position back to a timestamp and a value.

The coordinate maths lives in [`src/timeline/scales.ts`](src/timeline/scales.ts) as plain
functions with no React and no SVG, so the part most likely to be subtly wrong is tested with
numbers rather than through a rendered component. The SVG y-axis inversion is expressed once, as
a descending pixel range on the value scale, instead of a subtraction repeated wherever y is
touched.

Each lane owns one value scale. That is what keeps the pixel-to-value mapping unambiguous and
scopes hit-testing to a lane instead of guessing between overlapping series. Lanes are declared
as configuration in `src/domain/catalog.ts`, so regrouping them is an edit to that list.

Phase events are drawn as dashed rules through every lane, so the vitals at incision can be read
without leaving the entry layout.

The chart reads two ways. Its normal state is a trace, which is what makes a trend visible; a tap
on the chart itself drops the lines and writes every measured value beside its point, because a
position on an axis is not a number. The labels carry the value alone — the unit is at the lane's
edge and the time is the position they already sit at — and where each one goes is a search, not a
fixed offset, because neighbouring points in a dense series sit closer together than their labels
are wide. [`labels.ts`](src/timeline/labels.ts) gives each label the first of eight candidate
positions that hides nothing and stays inside the lane, avoiding the markers, the labels already
placed, and the readout of a selected point. It is pure geometry, tested with numbers like the
scales are.

The right of the chart is a fixed rail, outside the plot and shared by every band, holding each
lane's current value at 32px. It is what makes the page read as a clinical display rather than as
four charts: before it, the largest text on screen was the patient's name and no measured value
was legible without switching the whole chart into its numbers mode. It says „zuletzt“ and the
time, because this is a record and not a monitor — the number is the last value somebody wrote
down. The pressure lane shows the pair with the mean beneath it, and where a part of a reading has
been removed the rail prints what is recorded rather than deriving the rest.

The blood pressure lane labels a whole reading rather than each of its points: one box, the three
numbers in the order the markers run. Three values eleven pixels apart leave no position that is
nearer one marker than the other two, so a label per point could only be guessed at — and the
guess changed from reading to reading.

Colours are the four categorical slots in fixed order, one per lane, validated for colour-vision
separation against the surface. Two of them fall below 3:1 contrast, so identity never rests on
hue: every lane carries a permanent text label, and within the Blutdruck lane the three pressures
are told apart by marker shape (systolic points up, diastolic down, the mean is a dot) as on the
paper protocol.

## Entering a value

`src/entry/` holds the creation flow. Each row of the chart carries its own „Erfassen“ button, and
that button is what says which entry is being made: a single-metric lane opens straight on the
value field, with no picker in between. `src/entry/target.ts` is the whole of that mapping — what
a lane's button opens, and which two still need a list first.

The value field is a large readout above a keypad. The number is typed: whoever is filling this in
is reading 133 off a monitor and already knows the value, so the shortest path from what they know
to what the record holds is three digits — and typing is exact by construction, which no gesture on
these axes is. The keypad is in the sheet rather than the system's, because the sheet is a drawer at
the bottom of the screen, which is exactly where an iPad's keyboard opens: a focused text input
would cover the form it belongs to. On a desktop the sheet hands its focus to the readout, so the
number is typed the moment the sheet appears; `−` and `+` (and the arrow keys) move an entered value
by the metric's step, which is what most corrections need.

The typing rules live in [`src/entry/digits.ts`](src/entry/digits.ts) as plain functions, tested
with strings and numbers: the first digit replaces the value the sheet opened on, a digit that would
carry the value past the metric's maximum never lands, and a number below its minimum — which
includes the zero left by deleting every digit — reaches the draft and is refused by `isComplete`,
because a value on its way to 45 is 4 first and typing cannot be stopped at the bottom of a range.

The field opens on the last reading for that metric rather than on nothing. Vitals move gradually,
so the previous value is often within a step of the new one and the entry is a tap on `+`; where it
is not, the first digit typed replaces it whole. Where the case holds no reading yet, it falls back
to the pre-operative value in the header for the metrics that have one.

Blood pressure gets its own form (`src/entry/BloodPressureForm.tsx`): all three pressures on one
sheet under one timestamp, with the reading spelled out at the top in the notation a monitor uses
— `120/70 (85)`. Each pressure has a `gemessen` checkbox, because a manual cuff gives no mean, and
only the ones left on are written. There is one keypad for the three, because the three are typed
one after another and never at once: tapping a number points the keypad at it, and typing into a
row that was switched off switches it back on.

The timestamp defaults to now and is adjustable in whole minutes, which is the resolution a
protocol is read at; anything finer is available afterwards by dragging the point along the time
axis. "Now" is resolved against the case rather than the wall clock — the demo case is pinned to a
fixed date for reproducibility, and once that date is past, the wall clock is not a time in the
case (`caseNow` in `src/domain/entries.ts`).

Blood pressure is entered once and stored three times, per the decision above. Where the case holds
nothing to copy, the first reading opens on the patient's pre-operative values from the header, and
the mean — which has no pre-operative counterpart — opens switched off rather than on a number the
app made up.

## Setup

```
npm install
npm run dev
```

Scaffolded with Vite (`react-ts` template), using React Router for navigation and Ant Design as
the component/form system.

```
npm run build     # typecheck and production build
npm run lint
npm test          # Vitest unit tests
npm run e2e       # Playwright, starts the dev server itself
npm run videos    # re-records the user-story videos in docs/videos/
```

Playwright runs three projects: desktop Chrome, an iPad-sized viewport with touch, and the same
iPad viewport under WebKit, the engine Safari uses. Video is recorded for the four user stories and
for any test that fails. `npm run videos` is the only command that rewrites the committed
recordings in `docs/videos/`, so running the suite never leaves them modified in the working tree.

The touch tests (`tests/touch.spec.ts`) drive real gestures through the Chrome DevTools Protocol
and run on Chromium only. Synthetic touch events do not cause real scrolling, so no cross-browser
test can distinguish a page that scrolled from one that did not.

Verification in Safari on physical iPad hardware is a separate step that emulation does not
replace.

## Trying it on an iPad

Pushing to `main` builds the app and publishes it to GitHub Pages, which gives a link that opens on
any device. It exists for one reason: the touch and stylus handling was written for Safari on an
iPad, and emulation cannot confirm it. It is a preview link for testing on hardware, not a
deployment — the completeness and deployment part of the brief is out of scope and stays that way.

Everything is stored in the browser it runs in, so each person who opens the link gets their own
copy of the demo case and nothing is shared between them. „Demodaten zurücksetzen“ in the header
puts the case back the way it ships, discarding whatever was entered while trying it out;
„Rückgängig“ takes the reset back like any other change.

`BASE_PATH` in the workflow must match the repository name, because Pages serves the site under
`/<repo>/`.

## Recorded user stories

`docs/videos/` holds a recording of each main user story, one file per project, produced by
`tests/stories.spec.ts`. They are written to be watched: whole tasks at a pace a person can
follow. They assert as they go, so a recording of a flow that stopped working fails instead of
being filmed.

| Story | Shows |
|---|---|
| `record-and-correct-a-value` | Recording an SpO₂ through the entry sheet, correcting it by dragging the point, and the audit trail behind it |
| `record-a-bolus` | A single dose with its drug, amount and unit, appearing in the medication band |
| `run-an-infusion-stop-it-and-undo` | A continuous infusion documented while it runs, ended from the band, and the ending taken back |
| `scroll-safely-then-move-a-point` | On a touchscreen: a swipe over the timeline scrolls the record, and a press and hold is what moves a value |

## Agent usage

This project is built in collaboration with Claude Code, used deliberately as a design and
implementation partner rather than a generator: architectural decisions (data model, timeline
interaction, framework choice) are discussed and decided here, not made silently by the agent.
Representative work loops will be documented as the build progresses.
