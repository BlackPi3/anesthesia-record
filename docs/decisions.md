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

**Revised on 2026-08-16:** the reasoning holds, the single button does not. Entry starts from a
button per row rather than one prominent "+", which keeps the button-with-current-time shape while
letting the row rather than a picker say what is being entered.

---

## 2026-08-07 — NiBP entered as three separate single-value entries

**What:** Systolic, mean, and diastolic blood pressure are each entered individually, the same
way as any other single-value metric, sharing one timestamp — no combined/compound entry widget.

**Why:** The brief explicitly calls out solving multi-value NiBP entry as an open design problem.
A combined widget was considered but adds complexity without a clear usability win over three
quick, consistent single-value entries using the same control as every other metric.

**Open follow-up:** how three same-timestamp BP points render together on the timeline (e.g. as
one grouped mark vs. three separate dots) is a rendering decision, not yet made.

**Superseded on 2026-08-16** for entry — see below. The storage half stands unchanged: three
single-value entries is still what a reading becomes.

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

> **Superseded on 2026-08-17** — the track is gone and values are typed on a keypad. The reasoning
> below is kept because the part of it that held up is what the keypad inherited: the readout, the
> steppers, and shared rounding with the chart. See the entry at the end of this log.

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

## 2026-08-16 — A touch has to be held before it can move a value

**What:** On the timeline, a mouse or a stylus grabs the point it lands on immediately, as before.
A touch has to rest on the point for 250 ms first. Until that hold completes the gesture belongs to
the browser and the page scrolls normally; moving before it completes releases the point entirely.
The lane carries `touch-action: pan-y` by default and `none` only while a grab is live.

**Why:** The gesture that corrects a value and the gesture that scrolls the record are the same
gesture on an iPad, and the timeline fills most of the screen. With `touch-action: none` on the
lane, every touch was handed to the app: a swipe that started within 22 px of any point dragged it
instead of scrolling, and the page did not move at all. Verified on the emulated iPad by scripting
the swipe — a heart rate went from 81 to 180, silently. A correction is reversible through the
audit trail, but an unnoticed one is not, and nothing about a swipe suggests a value was rewritten.

Branching on `PointerEvent.pointerType` is what lets both devices be right at once. The brief asks
for precise mouse interaction by name, and a hold would make the desktop and the Apple Pencil worse
for no gain, so only `touch` pays for it. The hold is acknowledged visibly — the selection ring
grows and thickens the moment the point is actually held — because a delay with no feedback reads
as the app failing to respond.

**Rejected:** Raising the drag threshold (a swipe travels far past any threshold that still lets a
deliberate drag start, so this trades one failure for another). Dragging only from a direct hit on
the marker rather than the hit radius (loses the 44 px touch target the brief asks for, and the
reported swipe started on the marker anyway).

**Note:** `touch-action` is settled by the browser when a touch begins, so flipping it to `none`
mid-gesture cannot reclaim a scroll already in flight. The lane therefore also attaches a
non-passive `touchmove` listener while grabbed and calls `preventDefault`. React registers its own
touch listeners passively, where `preventDefault` does nothing, which is why this one listener is
attached by hand instead of as a JSX prop.

---

## 2026-08-16 — One entry flow for three kinds of entry, in three steps

**Superseded the same day by the per-row entry buttons below.** The two picker steps are gone; what
survives is everything from *Amounts open on the last one recorded* onward, which the row buttons
inherited unchanged.

**What:** The "+" opens a three-way choice (Wert / Medikament / Ereignis), then the picker for that
kind, then the form. Medications choose Bolus or Dauerinfusion before the drug, since that decides
whether the form asks for a dose or a rate.

**Why the extra step:** a single flat chooser holding six metrics, eleven drugs and five milestones
is one screen the user has to read rather than aim at, and it grows every time the catalog does.
Splitting it keeps the first screen at three large targets and lets each picker look like what it
is picking — metrics carry their lane colour, drugs do not. The cost is one tap per entry, paid on
every entry including the time-critical ones. Parham chose this over the flat grid after both were
laid out.

**Rejected:** One sectioned grid, everything at today's depth (shorter for the user, longer to read,
and the sections would have to be scrolled past on an iPad). Three separate floating buttons
(fewest taps, but three permanent buttons over the record in the corner where a thumb rests).

**Amounts open on the last one recorded for the same metric or drug**, which is the same rule the
vitals already used, extended to doses. Where the case holds nothing to copy, the amount opens at
zero and the sheet will not save it. **No default dose is invented** — a plausible starting number
is a dosing suggestion, which the brief rules out, and the disabled save button says so honestly.

**Units are never converted with the unit picker.** 200 mg and 200 µg are different doses, and
rescaling one into the other would be the app changing a documented dose on the user's behalf.

---

## 2026-08-16 — Medications and events are corrected in a sheet, not by dragging

**What:** Tapping a bolus, an infusion or a milestone in the bands reopens it in the entry sheet,
prefilled, with `Entfernen` in the footer. Vitals keep the drag gesture.

**Why:** a drag can only express time. A medication is a drug, a dose, a unit and a time, and three
of those four have no position on a chart, so extending the drag would have solved a quarter of the
problem and still needed a sheet for the rest. Reopening the form the entry was written in also
means creating and correcting look the same, which is one interaction to learn rather than two.

Ending an infusion falls out of this for free: it is the same sheet, setting the end time. That is
also why `correctInfusion` handles stopping rather than a separate `endInfusion` — the record then
shows when the end was documented as well as when it happened.

**The hit targets are the whole row**, not the drawn mark. A bolus is a 10px dot on a five-hour
axis; the row it sits in is the width of the screen and belongs to exactly one entry.

**They use `onClick`, not `onPointerDown`,** which is why the bands needed no equivalent of the
lanes' press-and-hold. A browser withholds the click when a touch turns into a scroll, so a swipe
starting on a medication row scrolls and opens nothing. The ambiguity the lanes had to resolve by
hand is already resolved for a tap.

**The audit trail is shown here**, under the form, listing what the entry was before each
correction. The brief asks for a *clear* trail, and this is where it is most useful and least
intrusive: in front of someone about to change the entry again.

---

## 2026-08-16 — The readout over a selected value is also the way into its sheet

**What:** tapping a point on a lane selects it and shows the dark readout, as before. The readout is
now a button, with a chevron saying so, and it opens that value in the same entry sheet the
medications and events use.

**Why:** three things a vital needs had no route on a chart. **Removing one** was `Delete` on a
selected point and nothing else, so a mandatory item was unreachable on the mandatory device — an
iPad has no `Delete` key. **The revisions** were stored on every correction and shown for
medications and events only, which made the audit trail clear for two thirds of the record.
**An exact number** was a matter of aiming as long as the drag and the arrow keys were the only
controls: the drag is coarse by nature and the arrow keys move one step at a time.

**Why the readout rather than a panel beside the chart:** it is already where the eye is once a
point is selected, and it already names the entry it belongs to. A separate panel would be a second
place to look and a second thing to keep in sync with the selection.

**The drag stays exactly as it was.** This is the precise path alongside it, not a replacement, and
it is for every device: on a desktop the sheet is how a value is set to a specific number without
aiming, and `Enter` on a selected point is the keyboard's way in — the first keyboard route into the
entry flow the app has had.

**Not a new sheet.** `EditEntry` already handled a vital draft, already offered `Entfernen` and
already listed the revisions, because a vital was always one of the four drafts the form knows. What
was missing was a caller.

---

## 2026-08-16 — Undo is a list of previous cases, not an inverse of every mutation

**What:** `useCase` keeps the last 25 cases that were replaced. Undo pops one, makes it current and
writes it. `Rückgängig` sits in the header beside the save confirmation, with `Ctrl+Z` / `Cmd+Z`.

**Why it is this cheap:** every mutation already returns a whole new case rather than editing the
one it was given, so the case that was replaced is still a complete, valid object that nothing has
touched. Keeping a reference to it is the entire mechanism. The alternative — an inverse for every
mutation, so that undoing an `addBolus` performs a removal and undoing a removal performs a restore
— is more code, and more code that can disagree with the forward direction.

**Considered and rejected: a "Rückgängig" toast** that appears after a change and fades. It looks
like undo and is not: it is only reachable in the seconds after the action, which is the opposite of
what an OR needs, where the interruption is the reason the mistake goes unnoticed in the first
place.

**Decided by Parham: undo restores the audit trail too.** The revisions live inside the case, so
the restored case carries the revision list it had before the change. A correction that has been
undone therefore leaves no trace, rather than appearing as "changed to 90, changed back to 81". The
reasoning: an undo pressed seconds later is someone who had not finished writing the entry, not a
record being altered after the fact. Everything that survives the session — every correction that
was allowed to stand — is still in the trail in full.

**Undo is not persisted, deliberately.** It holds the cases in memory only, so a reload starts with
nothing to undo. A reload is where the record stands as documented.

---

## 2026-08-16 — An empty record keeps its chart and says it is empty

**What:** a record with no visible entries draws the lanes exactly as it always does, with a short
message written across the middle: *Noch keine Einträge*, and where to start.

**Why the lanes stay:** the axis, the four parameter names and their value ranges are what this
record is going to be. A blank grid with a caption reads as ready. A panel that replaced the chart
would read as a different screen, and the transition to the first entry would be a jump rather than
a value appearing where the message said it would.

**Why over the chart and not beside it:** four empty lanes and no words is the shape a failed load
has, and someone deciding which of the two they are looking at is someone not documenting. The
message goes where the eye lands.

**Not AntD's `Empty`.** Its illustration would announce the component library on the emptiest screen
in the app, which is the one place there is nothing else to look at.

**It carries its own surface.** Written directly onto the chart the text crossed gridlines and the
boundary between two lanes, and a deliberate message that overlaps the furniture reads as a layout
accident. It also passes the pointer through: nothing in it is pressable, and the control it names
is the entry button.

---

## 2026-08-16 — The chart reads two ways: trend lines, or every value written out

**What:** a tap on the chart anywhere that is not a point drops the trend lines and writes each
measured value beside its own point. Tapping again brings the lines back. The same state has a
button above the axis (*Zahlen anzeigen* / *Zahlen ausblenden*), and selecting a point still shows
the readout and still opens the entry sheet, in either mode.

**Why:** a position on an axis is not a number. The lanes were readable as shape — the saturation
held, the pressure fell after minute 20 — and unreadable as record: the only way to learn that a
reading was 98 and not 99 was to select that one point and read the box, one point at a time. Both
readings are needed, and a protocol is read for the numbers at exactly the moments the trend has
already done its job.

**Why the lines go when the numbers come.** They are the one mark on the chart that carries no
value of its own: they say how the record moved between two measurements, which is precisely what
is not being asked for when someone asks what the measurements were. They also cross the labels,
and 51 numbers read across a stroke of the same colour is worse than either view alone. The blood
pressure lane keeps its vertical systolic–diastolic stroke, which is not a trend: it is the
notation for one measurement, and it is what groups three numbers into one reading.

**Why a tap on the chart, and a button as well.** The gesture is where the eye and the finger
already are, and it is the one part of the chart that meant nothing until now. But nobody finds it
unaided and a keyboard cannot perform it, so the button carries the same state, says which of the
two modes is on, and is what makes the mode discoverable at all. On touch it is a `click`, not a
pointer-down, for the reason the bands' hit areas are: a browser withholds the click when a touch
turns into a scroll, so a swipe across the timeline scrolls the record and changes nothing.

**The labels carry the value and nothing else** — no unit, no time. The unit is at the lane's edge
and is the same for every point in it; the time is the position on the axis the label is already
sitting at, and the five-minute grid it sits between. Printing either beside every point would
roughly double the label width and halve how many fit, in order to repeat what the chart already
says. The exact minute is a question about one entry, and the one entry's readout answers it.

**Placement is a search, not an offset** (`src/timeline/labels.ts`). Always-above breaks on a dense
series, which puts neighbouring points closer together than their labels are wide. Each label takes
the first of eight candidate positions that hides nothing and stays inside the lane, avoiding the
labels already placed, the markers, and the readout box when a point is selected. Where the lane is
too crowded for a clean arrangement, it takes the least bad position
rather than being dropped: a value drawn over a gridline is still legible, and a value silently
omitted is a hole in a clinical record. Placement runs left to right so a lane redrawn after a
correction reads the way it did before.

The other thing that broke always-above — three blood pressures a few pixels apart on one timestamp
— turned out not to be a placement problem at all, and is settled below by labelling the reading
rather than its points.

**Relation to the deferred merged view:** this is not it, and it does not replace it. This makes
one lane readable as numbers; the merged view is about reading *across* lanes, and the cheap step
noted there — a shared time cursor — is still the cheap step.

---

## 2026-08-16 — The row is the button: one „Erfassen“ per lane and band

**What:** The floating "+" is gone, and with it the screen that asked what kind of entry this was
and the picker that asked which metric. Every lane and both bands carry their own „Erfassen“
button. A single-metric lane opens straight on its value control; the medication and event bands
open on their picker, because a drug and a milestone are lists rather than rows on the chart.

**Why:** the two steps the "+" needed were both asking the user to name something already drawn on
the screen. Pointing at the saturation lane says "a saturation" more directly than reading `Wert`,
then `SpO₂`, off a list — and it is the same act as pointing at a point to correct one, which the
chart already teaches. It takes the common entry from three taps to one. The decision of
2026-08-16 above, which bought a shorter first screen with one extra tap on every entry, is
superseded: the cost it accepted is gone, and so is the screen it was paying for.

**Where the buttons sit:** a lane's button is in its own gutter, under the lane name and unit. The
gutter already belongs to the lane and holds nothing below the label, so a row costs no height,
where six buttons stacked in the flow would have added roughly half an iPad screen to a chart that
already fills one. Pinned under the label rather than at the foot of the lane: a lane is taller
than its name, and a button at the bottom of one sits nearer the *next* lane's name than its own.
The bands' gutters hold their rows' drug names, so their buttons go beneath them instead.

**The bands now render when empty**, down to their heading, because the heading is what names the
button under it — and on a record with nothing in it the six headings are the six things this
protocol can hold.

**Naming:** all six read „+ Erfassen“ / „+ Medikament“ / „+ Ereignis“, and each carries an
accessible name that includes its row („Sauerstoffsättigung erfassen“). The row above says which
one this is; a list of controls read aloud has no row above it, so the spoken name carries it.

**Rejected:** buttons in the flow beneath each lane (unambiguous, but the height). One button per
lane *inside* the SVG (an SVG cannot hold a real button, and a faked one is unreachable by
keyboard and unnamed to a screen reader).

---

## 2026-08-16 — NiBP entered as one reading, stored as three entries

**What:** Supersedes the entry half of the 2026-08-07 decision. Pressing „Blutdruck erfassen“ opens
one sheet with systolic, mean and diastolic on it and one timestamp. Each of the three has a
`gemessen` checkbox and can be left out. Saving writes one ordinary vital entry per pressure that
was measured, all on the shared timestamp, in a single case-to-case step.

**Why the entry is combined:** an oscillometric cuff inflates once and reports all three numbers
from that single inflation; an arterial line derives all three from one waveform. They are not
three measurements that happen to fall in the same minute, they are one measurement reported three
ways, and the monitor shows them as one item. The 2026-08-07 decision was made when every entry
began at a flat picker, where three trips cost the same as any other three entries. With a
per-lane button, three trips would have meant re-introducing a picker step on this lane alone and
making its button behave unlike the other three.

**Why each one can be switched off:** the other way of taking a pressure is a manual cuff and a
stethoscope, which gives a systolic and a diastolic and no mean at all. Requiring the mean would
mean typing a number nobody measured; calculating it from the other two would be the app producing
a clinical value, which the brief rules out. `nicht gemessen` is the third option, and it is the
honest one.

**Why the storage is unchanged:** three vital entries, as before. The lane draws them as three
series, a correction afterwards touches exactly one of them — which is the real case for keeping
them apart: noticing later that one of the three was an artefact. Nothing downstream had to learn
about a compound entry type. Because the three are added by folding over one `addVital`, the whole
reading is one step in the undo stack.

**The notation.** The sheet's readout is `120/70 (85)` — systolic over diastolic, mean in brackets,
which is how it is written and how it is said. That is deliberately not the order of the rows below
it, which run systolic, mean, diastolic to match how the three sit on the lane: highest at the top.
A pressure that is not being measured prints as `–` rather than dropping out, so the notation keeps
its shape and an absent mean is visibly absent.

**Opening values.** The first reading of a case has nothing to copy, so it opens on the
pre-operative values already in the header — a real measurement of this patient, not an invented
one. There is no pre-operative mean, and three mid-axis defaults read `130/130 (130)`, which is not
a blood pressure; so a pressure the case knows nothing about opens *switched off*. A number the app
cannot get from the record is one it asks for rather than proposes.

---

## 2026-08-16 — A blood pressure reading is labelled once, not three times

**What:** In reading mode the blood pressure lane draws one box per reading, holding all three
numbers in the order the markers run — highest at the top. Every other lane still labels a point at
a time. The grouping is by nearness in time (half a grid interval), with a second point of a kind
already in the group starting a new one, and it now also drives the systolic–diastolic stroke,
which used to do its own pairing.

**Why:** three labels for three points eleven pixels apart is not a placement problem, it is an
unanswerable one. There is no position beside that column that is nearer one of the three markers
than the other two, so whichever arrangement the search found, the reader still had to guess which
number went with which point — and because the search takes the first free position, the
arrangement differed from reading to reading, so there was not even a rule to learn. One box in
marker order answers it by construction, and it is the same claim the entry sheet makes: this is
one reading.

**Consequences worth naming:** the busiest lane went from 33 boxes to 11, which is why the
remaining ones fit cleanly. The label search grew a `prefer: 'side'` hint, because a box three
lines tall anchored to the middle of a column is either on its own markers or off the lane if it
tries above or below first. A reading whose middle pressure is selected loses that line from the
box — the readout is already spelling it out.

**A real bug this surfaced:** `MARKER_BOX` claimed a marker covered 14px when the browser reports
19–20 — the paths are 11px wide but every marker carries a 2px ring, and a triangle's apex carries
its stroke past the point. With `GAP` at 7, measured from the same centre, a label placed beside a
point was sitting on it, and the search could not see the problem because its idea of the obstacle
was too small. `GAP` is now 12 and `MARKER_BOX` 20, and a test asserts no box covers a marker.

**Rejected:** three labels in a fixed side column, one per point (still three boxes, still relies
on the reader learning the convention, and degrades to the old scatter as soon as the column is
crowded). One box in `120/70 (85)` notation on a single line (the notation the sheet uses, but
about 100px wide against roughly 86px between readings on the demo case — it would not fit, and the
vertical stack maps to the markers better anyway).

---

## 2026-08-17 — Values are typed on a keypad, not dialled on a track

**What:** The coarse track is gone. The value step is now a large readout above a keypad: ten
digits, a decimal comma where the metric has decimals, a backspace, and the `−` / `+` keys the old
control already had. A physical keyboard types into the same field, and the sheet hands its focus to
it on open so a desktop entry needs no click first. Supersedes the 2026-08-16 entry above.

**Why:** The premise of the track was that the value has to be *found*. It does not. Whoever is
filling this in is reading 133 off a monitor and already knows the number, so the shortest path from
what they know to what the record holds is its digits — and the track was the slowest and least
exact half of the old control, a guess that then had to be corrected with the steppers. Typing is
exact by construction, needs no readout to disambiguate it, and is the same interaction on an iPad
and on a desktop keyboard. It also removes the one place in the app where accuracy depended on
pointer precision at entry time.

**Why an in-app keypad and not a text input:** the sheet is a drawer at the bottom of the screen,
which is exactly where an iPad's system keyboard opens. A focused input would put the keyboard over
the form it belongs to and reflow the sheet under a thumb already moving. The keypad is always in
the same place, at the touch scale the rest of the app uses, and a physical keyboard still types
into the field on a desktop — so both platforms get the fast path, neither at the other's expense.

**Why the `−` / `+` keys stay:** typing is how a value is entered; a step is how a value already
entered is moved by one, which is the shape of most corrections. Retyping 97 as 98 is four presses;
stepping it is one.

**What the bounds now mean:** a digit that would carry the value past the metric's maximum is
ignored, which catches the one typo a keypad makes easy — a digit too many. The minimum cannot be
enforced while typing, because 45 is 4 first, so it is enforced in `isComplete`: the value reaches
the draft, the range under the readout turns red, and „Übernehmen“ stays shut. That also covers the
zero left behind by deleting every digit. `snapToStep` is no longer applied to an entered value
either — a typed 12 µg is a real dose and must not be dragged onto a grid of fives — but for every
vital the step *is* one decimal place, so a typed value and a dragged one still round identically.

**Blood pressure:** one keypad, three rows. Three keypads do not fit on an iPad and would be
answering a question the sheet never asks — the three numbers are typed one after another, never at
once. Tapping a row's number points the keypad at it, and typing into a row that was switched off
switches it back on, since a number typed into a row is the clearest statement there is that it was
measured.

**Rejected:** a system text input per value (covers the sheet on the iPad, and three of them on the
blood pressure form invite a mid-entry keyboard dismissal). Keeping the track alongside the keypad
(two ways to set one number, the slower one taking the most room, and the sheet is already at the
height of a laptop window). Auto-placing the decimal point monitor-style, so `365` means 36,5
(fewer presses on the one metric with decimals, but it silently reinterprets digits, which is the
one thing a record must never do).

---

## 2026-08-20 — Resetting the demo case is an ordinary, undoable change

**What:** A „Demodaten zurücksetzen“ button in the header replaces the open case with a fresh
`createDemoCase()`. It goes through `update()` like every other change, so it is written to storage,
confirmed by the save status, and taken back by „Rückgängig“. It asks nothing first.

**Why it exists at all:** the app seeds the demo case on first load and then never touches it again,
which is right for a record but wrong for a sample. Anyone trying the app leaves entries behind, and
the next person on that device — or the same person the next day — inherits them with no way back
short of clearing site data in browser settings. That is not a state a person testing on a borrowed
iPad can get out of.

**Why no confirmation dialog:** the same reason nothing else in the app has one. Undo already covers
the mistake, and it covers this one exactly: the pre-reset case is a whole object the history keeps
a reference to, so „Rückgängig“ restores every entry, revision and deletion. A dialog would be a
second mechanism for a problem the first one already solves.

**Why it resets to the demo case and not to an empty one:** the empty case is a first-run state, not
a starting point — a tester handed an empty chart has nothing to correct, drag or undo. Resetting is
for getting back to the case the app ships with.

**Rejected:** clearing storage and reloading the page (simpler, but it leaves the reset outside the
undo history and outside the save confirmation, making it the one change in the app that cannot be
taken back). Hiding it behind a URL parameter (invisible to the person who needs it, who is holding
an iPad and not a terminal).

---

## 2026-08-20 — A GitHub Pages link for device testing, which is not Part 3

**What:** `.github/workflows/pages.yml` builds on every push to `main` and publishes `dist/` to
GitHub Pages. `vite.config.ts` takes its `base` from `BASE_PATH`, which only that workflow sets, so
dev and the Playwright suite keep running at the root.

**Why:** the app is written for Safari on an iPad and there is no substitute for opening it on one.
The touch rules — the 250ms hold, the 10px slop, `touch-action`, the non-passive `touchmove` — are
the parts of this build that emulation is least able to prove, and lending someone a link is the
only way to get them tried on hardware that is not on this desk.

**What this is not:** Part 3 of the brief (completeness check, deployment) stays out of scope. This
is a preview link for testing, not a deployment story: no domain, no environment configuration, no
release process, and nothing in the app depends on being hosted. Part 3 is not reopened by it.

**Why the workflow lints and unit-tests before building:** a link that is live should at least
compile and pass what runs without a browser. Playwright is not run there — it needs browser
downloads, and it is what runs locally before a commit.

---

## Open decisions (not yet made)

- **NiBP on the timeline** is now settled in both halves: entry is one reading, three stored
  entries sharing the timestamp the user set; the chart draws them as three markers joined by the
  systolic–diastolic stroke and labelled as one box. What is still open is whether the *trend*
  reading of that lane should join the three series into a band rather than three separate lines.
