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

Vitals can be recorded, drawn, corrected and removed, and the record survives a reload. The domain
layer holds the case and entry types, the vital/event catalogue with its German labels and ranges,
the local-storage persistence layer, and a fictional demo case. The timeline draws one lane per
vital parameter with medications and events beneath, and a point can be dragged to correct its
value and time. Entry runs through the "+" sheet described below.

Next: entering medications and phase events through the same flow, and a list view that surfaces
the audit trail.

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
from there, which is what keeps the axis and the picker from disagreeing.

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
- **Entry flow**: a prominent "+" button opens a picker — select which metric, then dial in the
  value via a scrollable/rotatable control (touch swipe, mouse drag, or scroll wheel, with
  keyboard as a desktop alternative). The entry timestamps to the current time by default: this
  reflects how documentation actually happens in the OR (logged as it happens), rather than the
  user placing a point at an arbitrary spot on the chart.
- **Correction**: tapping an existing point on the timeline reopens it for editing (value and/or
  time), building on the same control used for entry.
- **NiBP (blood pressure)** is entered as three separate single-value entries (systolic, mean,
  diastolic) sharing one timestamp, rather than a combined multi-value widget — kept deliberately
  simple. How these three render together on the timeline is a rendering decision, still open.
- **5-minute gridlines** on the timeline are a visual/clinical reference (matching how vitals are
  conventionally charted), not a constraint — entries can land at any exact time.
- **Local persistence only**, no backend — a mandatory constraint from the challenge brief, and
  also the right scope for what's being evaluated here.

- **App framework: React Router + Vite**, over Next.js. The brief permits either; Next.js's main
  advantages (server rendering, API routes) solve problems this backend-less app doesn't have, so
  React Router keeps the whole app as plain client-side React.

**Open, not yet decided:** the value-selection control itself (a scroll/rotate "wheel" vs. a
plain tappable list of values), the desktop/mouse input mapping in detail, and a precision
fallback for landing exact numbers.

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

Colours are the four categorical slots in fixed order, one per lane, validated for colour-vision
separation against the surface. Two of them fall below 3:1 contrast, so identity never rests on
hue: every lane carries a permanent text label, and within the Blutdruck lane the three pressures
are told apart by marker shape (systolic points up, diastolic down, the mean is a dot) as on the
paper protocol.

## Entering a value

`src/entry/` holds the creation flow. A floating "+ Wert erfassen" button opens a sheet in two
steps: the six metrics as a grid of large tiles, then the value control for the one chosen. Each
tile carries the colour of the lane the point will be drawn in, as an edge rather than a fill, so
the choice made here and the mark that appears on the chart are visibly the same thing.

The value control is a large readout above `−` / track / `+`. The buttons move by the metric's
step, the track spans its whole input range for coarse movement, and the readout names the exact
value throughout. That pairing is deliberate and comes from the drag correction: a pixel is worth
more than one unit on most of these axes, so a continuous gesture cannot promise a specific
number on its own. Something coarse to get close, something discrete to land, and the number
spelled out the whole time is what makes either interaction exact. `clamp` and `snapToStep` are
shared with the timeline's scale maths, so a value entered and a value dragged round identically.

The value opens on the last reading for that metric rather than the middle of the scale. Vitals
move gradually, so the previous value is usually a step or two from the new one.

The timestamp defaults to now and is adjustable in whole minutes, which is the resolution a
protocol is read at; anything finer is available afterwards by dragging the point along the time
axis. "Now" is resolved against the case rather than the wall clock — the demo case is pinned to a
fixed date for reproducibility, and once that date is past, the wall clock is not a time in the
case (`caseNow` in `src/domain/entries.ts`).

Blood pressure stays three separate entries, each its own trip through the flow, per the data
model decision above.

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
iPad viewport under WebKit, the engine Safari uses. Video is recorded for every run.

The touch tests (`tests/touch.spec.ts`) drive real gestures through the Chrome DevTools Protocol
and run on Chromium only. Synthetic touch events do not cause real scrolling, so no cross-browser
test can distinguish a page that scrolled from one that did not.

Verification in Safari on physical iPad hardware is a separate step that emulation does not
replace.

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
