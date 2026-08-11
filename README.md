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

The problem scope, the core interaction model, and the data model are settled. The domain layer
exists: case and entry types, the vital/event catalogue with its German labels and ranges, the
local-storage persistence layer, and a fictional demo case. Next is the timeline itself.

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

## Setup

```
npm install
npm run dev
```

Scaffolded with Vite (`react-ts` template), using React Router for navigation and Ant Design as
the component/form system.

## Agent usage

This project is built in collaboration with Claude Code, used deliberately as a design and
implementation partner rather than a generator: architectural decisions (data model, timeline
interaction, framework choice) are discussed and decided here, not made silently by the agent.
Representative work loops will be documented as the build progresses.
