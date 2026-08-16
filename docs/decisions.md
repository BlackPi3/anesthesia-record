# Decisions log

Every non-obvious choice, one or two lines: what, why, what was rejected. Kept as work is done,
not reconstructed at the end.

## 2026-08-07 — One shared timeline, not separate timelines per category

**What:** Vitals, medications/fluids, and phases/events all plot on a single shared timeline.

**Why:** The value of the view is seeing correlation across categories at a glance (e.g. a vital
change right after a dose, or right after an event). Separate timelines would lose exactly that.
Matches the brief's own framing directly.

**Rejected:** Per-category timelines (one for vitals, one for meds, etc.) — easier to build in
isolation but defeats the point of a shared clinical picture.

---

## 2026-08-07 — Entry via "+" button, not tap-anywhere-on-curve

**What:** A prominent "+" button opens a picker: select the metric, then set the value via a
scrollable/rotatable control. Timestamp defaults to "now" at the moment of entry, editable
afterward.

**Why:** Considered tap-on-curve (tap position sets both time and rough value) first, since the
brief's core interaction is literally "enter values directly into the curve." Tap-on-curve is
imprecise on a small chart (fat-finger problem — SpO₂ has ~40px of vertical range to express 100
possible values) and doesn't match how OR documentation actually happens: entries are logged as
events occur in real time, not placed retrospectively at a chart position. A fixed "+" button
with current-time default is both faster and more true to the real workflow.

**Trade-off accepted:** since entry no longer derives time/value from a graphical tap, the
"precise graphical input" requirement from the brief now falls mainly on *correction* (dragging /
adjusting an existing point on the timeline) rather than on creation. Correction interaction needs
to be genuinely precise and direct to compensate.

**Rejected:** Tap directly on the curve to place a point (imprecise for value, retrospective
rather than real-time). Tap anywhere on screen with no curve involvement at all (loses the
graphical-input requirement entirely).

---

## 2026-08-07 — NiBP entered as three separate single-value entries

**What:** Systolic, mean, and diastolic blood pressure are each entered individually, the same
way as any other single-value metric, sharing one timestamp — no combined/compound entry widget.

**Why:** The brief explicitly calls out solving multi-value NiBP entry as an open design problem.
A combined widget was considered but adds complexity without a clear usability win over three
quick, consistent single-value entries using the same control as every other metric.

**Open follow-up:** how three same-timestamp BP points render together on the timeline (e.g. as
one grouped mark vs. three separate dots) is a rendering decision, not yet made.

---

## 2026-08-07 — 5-minute gridlines are a visual reference, not a constraint

**What:** The timeline shows gridlines every 5 minutes for visual/clinical orientation. Entries
are not snapped or restricted to those marks.

**Why:** Matches real paper-chart convention (vitals conventionally checked/recorded roughly
every 5 minutes) without forcing urgent/off-grid events (e.g. a sudden desaturation) into an
inaccurate timestamp.

---

## 2026-08-07 — Local persistence only, no backend

**What:** Case data is saved to the browser's local storage as it's entered; no server is
involved.

**Why:** Mandatory constraint from the challenge brief — a backend is explicitly out of scope.
Also the right scope for what's being evaluated (frontend/timeline skills), and sets up cleanly
for a real backend later without a UI rewrite, since only the persistence layer would change.

---

## 2026-08-07 — App framework: React Router + Vite over Next.js

**What:** Scaffold the app with Vite + React + TypeScript, using React Router for navigation.

**Why:** The brief explicitly permits either Next.js or React Router
("*Verwende wahlweise Next.js oder React Router*") — this is a sanctioned, not improvised, choice.
The app has no backend and never will within this challenge's scope: everything is a browser-side
component saving to local storage. Next.js's main differentiators — server-side rendering, API
routes (a built-in Node-style backend), the server/client component split — solve problems this
app doesn't have. Choosing it would mean learning an extra architectural layer (which files run
"on the server") for zero functional benefit, and would obscure that the whole app is client code.
React Router keeps 100% of the code as plain browser-side React, matching what the app actually
is. React Router's routing model is also conceptually close to Next.js's, so nothing here is a
dead end if a later project needs Next.js.

**Vite specifically:** not named in the brief (only Next.js vs. React Router is), but some build
tool is required since React Router doesn't bundle one the way Next.js does. Vite is the current
standard: fast dev server, minimal config. Alternatives considered: Create React App (effectively
unmaintained at this point, not a reasonable pick today), configuring Webpack directly (far more
manual setup for no benefit here).

**Rejected:** Next.js (App Router) — see above.

---

## 2026-08-11 — Timeline drawn as hand-rolled SVG, not a chart library

**What:** The timeline is written directly as SVG, with the time and value scales (and their
inverses, for pointer input) written by hand rather than taken from a charting library.

**Why:** Charting libraries are built to *display* a dataset, not to *author* one by pointer. The
graded core of this challenge is the other direction: mapping a pointer coordinate back to a
(timestamp, value) pair, hit-testing an existing point to correct it, and dragging it precisely.
That inverse mapping is the part a library does not provide, so adopting one would leave the hard
work untouched while adding an abstraction layer between the pointer events and the coordinates.
Writing the scales directly keeps the coordinate maths visible and explainable.

**Rejected:** Recharts or a similar high-level library (owns rendering, fights authoring
interactions). visx (gives scale helpers without owning rendering, so it is the closest
alternative — the scales needed here are two linear maps and their inverses, which is less code
than the dependency). Canvas (best redraw performance, but no DOM nodes means no per-point focus
handling and no accessible markup, which Part 2 grades explicitly).

**Consequence accepted:** coordinate maths is the known failure mode for generated code here, so
the timeline gets verified by interaction and by unit tests on the scale functions, not by
reading the code.

---

## 2026-08-11 — Times stored as epoch milliseconds

**What:** Every point in time in the data model is a `number` (milliseconds since the epoch).
Calendar dates that carry no time of day (birth date, case date) stay ISO `YYYY-MM-DD` strings.

**Why:** The timeline converts time to an x coordinate arithmetically, on every render. A number
needs no parsing and survives the JSON round-trip through local storage unchanged. ISO strings
would be more readable when inspecting stored data by hand, which is the trade accepted.

---

## 2026-08-11 — Entries as a discriminated union; bolus and infusion modelled separately

**What:** One `Entry` union over four shapes, tagged by a `type` field: `vital`, `bolus`,
`infusion`, `event`. Medications are two of those four rather than one type with a mode flag.

**Why:** The four kinds carry genuinely different fields, and the union makes the compiler enforce
which fields exist in which branch instead of scattering optional properties over one wide type.
Bolus and infusion are split because a bolus is a point in time while an infusion is an interval
with a start, an end and a rate: different shape, different rendering, different edit form.

**Rejected:** A single flat entry type with optional fields (compiles, but pushes every "does this
entry have a dose?" question to runtime).

---

## 2026-08-11 — Corrections are non-destructive

**What:** Editing an entry pushes the previous values onto a `revisions` array on that entry.
Removing an entry sets `deletedAt` rather than dropping it from the record.

**Why:** The brief requires corrections and removals to leave a clear audit trail, which is only
possible if the earlier state is still stored. Keeping the trail on the entry itself means showing
it is a local read, with no join back to a separate log.

**Rejected:** A separate append-only journal of create/update/delete operations. Closer to how a
real clinical system would do it and better if multiple users ever edit one case, but it needs
more code and a lookup to answer "what changed about *this* point", which is the only question
the UI asks here.

---

## 2026-08-11 — Storage failures are returned, not thrown

**What:** `loadCase()` and `saveCase()` return result unions (`empty` / `loaded` / `error`,
`saved` / `error`) instead of throwing or returning `null`.

**Why:** Local storage genuinely fails: Safari private windows deny access, quota can be
exceeded, and the stored string can be truncated or hand-edited. Returning the outcome forces
every caller to handle failure, and the three load outcomes map one-to-one onto the empty and
error states Part 2 requires the UI to show. A persisted schema version is stored alongside, so
data from an older shape is reported rather than guessed at.

**Scope decision:** the shape check on loaded data is a hand-written type guard covering the
fields the app dereferences, not full runtime validation. A schema validator (zod) is the right
answer for a format that outlives the code and is the natural next step if the model grows.

---

## 2026-08-11 — Timeline laid out as one lane per vital parameter

**What:** Four horizontal lanes sharing one time axis — SpO₂, Herzfrequenz, Blutdruck,
Temperatur — with medications and events in a band beneath. Blood pressure's three kinds share
the Blutdruck lane, since the brief counts non-invasive blood pressure as one parameter.

**Why:** Writing and reading the record pull in opposite directions. Entry is per-parameter, one
value at a time, usually while the anesthesiologist's hands are on the patient; reading is
cross-parameter and happens when something has gone wrong. Lanes serve entry and correction,
which is the graded interaction: one scale per lane means the pixel-to-value map is unambiguous,
and hit-testing a point to correct it is scoped to a lane instead of guessing between overlapping
series. Each parameter also gets an honest range, so temperature shows a trend instead of the flat
line it becomes on a scale sized for blood pressure.

**Rejected:** Overlaying all vitals on one plot area. Densest, closest to the paper protocol, and
better value resolution per series since each maps across the full height. Rejected because a y
pixel would mean four different things, hit-testing collides where series cross, temperature
becomes unreadable, and per-series axis labelling works against the contrast and focus
requirements in Part 2.

**Lanes are configuration, not structure.** The lane list declares which vital kinds share a
scale, so regrouping (six lanes, one per kind, or three with heart rate and blood pressure
combined on their shared 40–220 grid) is a change to that list rather than to the component.

---

## 2026-08-11 — Merged reading view deferred, not dropped

**What:** A second, read-only view that brings all lanes together into one overlaid plot for
reading. Parked deliberately, to be built only if Parts 1 and 2 are finished.

**Why it is worth building eventually:** the layout that is best for entry is not the layout that
is best for reading, because they happen at different moments and answer different questions.
Lanes answer "what is this parameter doing"; an overlay answers the question people actually put
to the chart, which is "the pressure is falling, since when, and what did I give before it
started". That question spans medications, pressure and heart rate at once.

**Why it is deferred:** a second layout is close to a second timeline, and the timeline is the
part of the budget most likely to overrun. The cost falls sharply if the merged view is strictly
read-only — no pointer mapping, no hit-testing, no editing — which is the expensive half. So the
deferred version is explicitly a viewing mode, and entry and correction stay in the lanes.

**Cheaper step to take first:** a shared vertical time cursor across all lanes, showing every
parameter's value at one timestamp in a single gesture. That recovers most of the correlation
value without a second layout or a mode the user can get lost in. If it turns out to be enough,
the merged view stays unbuilt on purpose.

**Risk noted:** a view you have to switch into is a view you are not in when it matters. Any
merged view added later needs to be reachable in one action from the entry layout.

---

## 2026-08-16 — Value control: large readout, stepper buttons, coarse track

**What:** The value step of the entry flow is a large numeric readout above a row of
`−` / track / `+`. The buttons move by the metric's `step` from `catalog.ts`; the track covers its
whole `inputRange` for coarse movement. The readout names the exact value at all times.

**Why:** This follows directly from what the drag correction taught. A pixel is worth more than
one unit on most of these axes, so no continuous gesture is precise by itself; what makes a
gesture exact is pairing something coarse to get close with something discrete to land, and
naming the number throughout. That pairing is the design, and the same reasoning already governs
the timeline (drag plus arrow keys plus readout). Being exact by construction also means no
separate precision fallback has to be invented.

The `−` / `+` buttons are 64 × 56 px and the slider handle and rail are themed up from AntD's
defaults, which are mouse-era sizes. The readout is the largest element in the sheet because it is
the only one that promises what will actually be stored.

**Why the track is AntD's `Slider` and not hand-rolled:** the graded pointer work is the timeline,
where the inverse mapping genuinely does not exist off the shelf. A one-dimensional value track is
exactly what a slider is, and hand-rolling it would have meant rebuilding keyboard support and ARIA
semantics that already work. `clamp` and `snapToStep` still come from `timeline/scales.ts` rather
than being written again, so a value entered here and a value dragged on the chart round
identically — otherwise correcting a point could change it without the user asking.

**Rejected:** A rotating wheel (closest to the original sketch and the best-feeling option, but
momentum and snapping are real pointer work, it is the hardest to make accessible, and it still
needs steppers or keys as the precision path — strictly more work, not less). Tapping the lane to
place a point and then dragging it (cheapest by far and the most literal reading of "enter values
directly into the curve", but every stray tap on a lane would create an entry, which is wrong in
an OR, and the Blutdruck lane holds three kinds so a tap there cannot say which was meant).

**Two steps, not one form:** the sheet opens on the metric grid and replaces it with the value
control. Picking the metric is a glance-and-tap decision and setting the value is a careful one;
showing both at once makes the careful half compete with a choice already finished with.

---

## 2026-08-16 — "Now" is resolved against the case, not the wall clock

**What:** A new entry's timestamp defaults to `caseNow(record)`: the wall clock while it falls
inside the case, and otherwise the end of what has already been documented.

**Why:** The demo case is pinned to a fixed date so the chart, the screenshots and the Playwright
assertions see the same case every run. Once that date is in the past, `Date.now()` is not a time
in this case at all. Defaulting to it would place a new entry days after everything else, and
`caseTimeWindow` would stretch the axis to reach it, squashing the whole record against the left
edge. This only decides where the control opens; the timestamp is adjustable either way.

**Rejected:** Making the demo case relative to `Date.now()` (would have cost the reproducibility
the fixed dates exist for). Silently clamping the entry into the case window (would store a time
the user did not choose, which is the one thing a record must never do).

---

## Open decisions (not yet made)

- **NiBP grouped rendering** on the timeline (see above). Entry is settled: the three pressures
  are three trips through the same flow, sharing nothing but a timestamp the user sets.
