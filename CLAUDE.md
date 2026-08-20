# Project rules

Digitales Narkoseprotokoll, built against the Sikant coding challenge
(https://sikant.de/coding-challenge). A web application for anesthesiologists to document
ambulatory procedures on **iPad and desktop**, replacing the paper protocol.

This file is what an agent works against. The requirements below come from the brief and are not
negotiable; the rules after them are corrections folded back in as the build hit them.

---

## Mandatory stack

- **React** and **TypeScript**
- **Ant Design** as the primary component and form system. Theme customisation is expected and
  default styling is called out as a negative, so `src/theme.ts` is deliberate and stays that way.
- **React Router** (chosen over Next.js: no backend, so server rendering and API routes solve
  problems this app does not have. Reasoning in `docs/decisions.md`.)
- **SVG** for the timeline, hand-rolled. No chart library: a library displays a dataset, and the
  graded interaction runs the other way, mapping a pointer position back to a timestamp and a value.
- **Local persistence only**, no backend.
- **Playwright** for automated tests.
- Target browsers: **current Safari on iPad** and **Chrome on desktop**.

## What the app must do (Part 1, mandatory)

1. **Direct value entry into the timeline curve.** Vitals entered by touch, stylus or mouse. Every
   entry timestamped, immediately visible, and precisely correctable. Five-minute intervals as a
   clinical reference grid.
2. **Vital parameters on one shared timeline:** SpO₂, heart rate, non-invasive blood pressure,
   temperature. All four. The shared timeline is the point of the product, not a layout choice.
3. **Case context header:** demo patient, procedure, date, baseline data. Compact.
4. **Medications and fluids:** bolus and continuous dosing with timestamp, dose, unit, and duration
   where applicable.
5. **Phases and events:** Narkosebeginn, Schnitt, Naht, Ausleitungsende, Entlassung.
6. **Editing:** values and events correctable or removable, **with clear audit trails**.
7. **Persistence:** case data survives reload without loss.

## Usability bar (Part 2, graded as heavily as features)

- Large reliable touch targets **and** precise mouse interaction.
- Clear empty, loading and error states.
- Visible save confirmation and safe correction workflows.
- Information density appropriate to each form factor. iPad and desktop are not the same layout.
- **Professional German UI text**, focus management, accessible contrast.
- Pointer event handling that works for stylus.

## Out of scope

**Part 3 is not being built** (completeness check, deployment). Decided 2026-08-16: make Parts 1
and 2 solid instead. Do not let it creep back in.

**Nothing calculates a medical value or recommends treatment.** The brief forbids it. MAD is read
off the monitor and entered, never derived from systolic and diastolic.

**Fictional demo data only.** This is a medical-context app; everything stays obviously synthetic.

---

## Working rules

Read `docs/decisions.md` before proposing anything structural. Every non-obvious choice is recorded
there with what was rejected and why, and several entries supersede earlier ones in place.
`docs/learning.md` holds the bugs whose cause was not obvious.

**Present decisions, do not make them.** Architecture, state model, component boundaries, anything
hard to reverse: explain the options, give the trade-offs, recommend one, then wait. Reversible
calls can be made directly, but say so explicitly rather than burying them.

**No unexplained code.** Code that works but cannot be explained is a defect here. Prefer a smaller
change that is understood to a larger one that is not.

**One commit per coherent unit of work**, with a message giving the reasoning. Commit history is a
graded deliverable. Stage named paths, not `git add -A`, and check `git diff --cached` first.

**Update `docs/decisions.md` in the same session as the work.** When an entry turns out wrong,
supersede it in place and say what it revised.

**Do not overclaim what the brief requires.** Quote the line and separate what it states from what
it implies. "This is a design choice, not a requirement" is the stronger position.

## The timeline

`src/timeline/scales.ts` is the coordinate maths as pure functions, no React and no SVG. The brief
names pointer-coordinate-to-value mapping as critical test coverage, and it is the code most likely
to be subtly wrong, so it is tested directly with numbers in `scales.test.ts`. Changes to the
mapping go there with a test, not into the component.

**The lane surface answers four gestures, each defined by how it ends:** press a point to select,
hold and drag to correct, press the readout to open its sheet, press empty chart to switch how the
lane reads. Anything new on that surface must state what the other four must not do, and must be
proven by a scripted gesture rather than by reading the handler. **"Empty chart" means the plot,
not the whole `<svg>`.** The gutter on the left and the value rail on the right are the lane's
furniture; a press on a parameter's name or on its current value is not a press on the chart.

**Touch requires a deliberate grab.** 250ms hold before a point becomes draggable, released if the
finger moves more than 10px first. Mouse and pen drag immediately, keyed off
`PointerEvent.pointerType`. `touch-action` is `pan-y` on the lane and `none` only while grabbed,
and the lane attaches a non-passive `touchmove` listener because React registers its own passively.
Without this, an ordinary scroll silently rewrites a value.

**The value axes are narrow, fixed, and not the same thing as what can be recorded.** `plotRange`
in `catalog.ts` is what a lane draws; `inputRange` is what the entry control accepts, and it is
wider on purpose. Never widen an axis to fit an unusual value and never auto-fit one to the data:
two cases have to be comparable at a glance. A value outside its band is drawn hollow against the
edge it went past, keeping its real number — **nothing may vanish from a clinical record because of
a drawing choice**, and a lane is its own `<svg>`, so an unclamped point is silently clipped rather
than visibly wrong. Anything that bounds a correction bounds it by `inputRange`, not by the axis.
Each band's midpoint must be round at the metric's precision, because the lane labels its floor,
midpoint and ceiling; `scales.test.ts` asserts this.

**The grid is two weights, and the whole canvas is ruled by it.** A hairline every five minutes in
`--grid-minor`, a rule every fifteen in `--grid-major`, drawn by the lanes *and* by both bands from
the same window and the same plot edges — a dose with no time under it is not on a shared timeline.
Horizontally each lane is ruled every `gridStep`, which is per metric and must divide the half-span,
because the three heavier rules are the floor, the midpoint and the ceiling. A time label only ever
sits on a major rule; thinning them on a narrow canvas multiplies the quarter hour rather than
stepping through the ticks. `--grid-major` is also the lane separator, and it is the ceiling on
chrome: nothing that is not data may be darker.

**Lane colours never carry identity on their own.** Every lane has a permanent visible text label,
and the Blutdruck lane tells its three pressures apart by marker shape. Do not remove either. This
was originally a contrast concession — two of the four traces sat below 3:1 — and it is not one any
more: since the six-value palette the four run 5.95:1 to 7.80:1 against the ground, as `theme.ts`
records. The labels stay regardless, because a hue being legible is not a reason to make it carry a
name.

**The rail on the right is each lane's current value, and it is the newest measurement or nothing.**
Not the selection — a selected point has its own readout — and never clamped to the axis. It says
„zuletzt“ and the time, because this is a record and not a monitor. It is in `--ink`: it carries
the largest numerals on the page, and the numeric contrast target binds them where it does not bind
a trace. Every band shares the plot's right edge with the lanes, so the canvas keeps one time
scale.

## Corrections already folded in

- **Verify by looking and interacting, not by reading.** Several layout defects and the touch
  defect were invisible in the source. Screenshot both form factors after any timeline change.
- **A CSS selector aimed at AntD's own class names is an assertion nothing checks.** The entry
  sheet's height cap was written against `.ant-drawer-content`, AntD 6 renamed that element, and
  the rule silently stopped matching — the sheet then rendered 111px above the top of an iPad
  window. Name the parts through the component's `classNames` prop, as `src/entry/sheet.ts` does.
  AntD also injects its styles *after* this stylesheet, so at equal specificity it wins: qualify
  the rule by an ancestor class rather than wondering why a padding does nothing.
- **A green test can prove nothing.** Ask what would still pass if the feature were deleted. One
  reload test cleared storage on every navigation and watched the app re-seed, so it would have
  passed with persistence entirely broken. Ask also whether its **inputs are rounder than the
  app's**: every `labels.test.ts` case placed points on whole pixels, which is the one arithmetic
  in which the float bug in `cost` cannot occur.
- **The cause is not always the change that revealed it.** A regression that appears the moment you
  touch geometry is usually yours and was twice not. Instrument before narrowing the thing you just
  built.
- **A failing test is not the same claim as a broken app.** Removing an animation to satisfy a test
  is letting the test design the product.
- **`Date.now()` is an input.** Code reading it has a hidden dependency on when it runs. Take `now`
  as a parameter with a default, as `caseNow` and `mutations.ts` do.
- **No loading state exists, on purpose.** `localStorage` is synchronous and the case is read in a
  lazy state initialiser. Adding one back is a regression; the reasoning is in `App.tsx`.
- **Side effects never go in a React state updater.**
- **Keep return types narrow.** `medications()` returning a wide `Entry[]` produced a real compile
  error at the use site.
- **No confirmation dialogs.** Undo instead. Every entry is kept and recoverable.
- **Corrections are non-destructive.** An edit records a new version rather than overwriting.

## German UI text

The interface is German and reads to anesthesiologists, so clinical terms are not decoration. Use
the established vocabulary: Narkoseprotokoll, Vitalparameter, Bolus, Dauerinfusion, Narkosebeginn,
Schnitt, Naht, Ausleitungsende, Entlassung, Mittlerer arterieller Druck (MAD). Do not invent
plausible-sounding clinical German. `Blutdruck Mitteldruck` was wrong and had to be corrected.

## Testing

The brief names four areas as critical coverage:

- Pointer coordinate mapping to timestamp and measured value
- Creating, editing and removing bolus and continuous dosing entries
- Persistence and restoration after reload
- At least one error handling or correction scenario

`tests/stories.spec.ts` records the videos of the main user stories, which are a required
deliverable. Video is on for that file only; elsewhere it is `retain-on-failure`.

```
npm run build     # tsc -b && vite build
npm run lint
npm test          # vitest
npm run e2e       # playwright: desktop-chrome, ipad, ipad-safari
```

**`npm run e2e` builds and serves `dist`, not the dev server.** Safari on an iPad is given the
built artifact, and a font that arrives in dev is not evidence about the one that ships — the dev
server was in fact dropping font requests under the suite's own parallel load. Anything that only
works with HMR or with unbundled modules will not be seen by these tests.

All four green before a commit.

## README

A graded deliverable. It must cover setup, architecture, data model, timeline implementation,
prioritisation decisions, known limitations, and agent usage notes. Known limitations are written
forward, as scope decisions with reasons, never as a list of absences. Do not describe planned
things in present tense.
