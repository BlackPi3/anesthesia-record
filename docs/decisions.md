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

**Extended on 2026-08-21** — see „A load failure gets a way out“ below. The union was right;
one flat `error` variant was not, because it left the UI unable to tell a failure it could offer a
way out of from one it could not.

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

> **Superseded 2026-08-31, in two respects.**
>
> *On CI*, by *Four checks before the merge, not four checks before the commit* below: `pages.yml`
> no longer exists, its build and deploy jobs are the tail of `ci.yml`, and Playwright does now run
> there. What this entry got wrong was the last paragraph — browser downloads are a cache, not an
> obstacle.
>
> *On Part 3*, the paragraph headed „What this is not" no longer describes what this is. It was
> written on 2026-08-20 against a submission deadline, when the link existed only to be opened on an
> iPad. The brief's deployment half asks for an *"optional public deployment (e.g. Vercel) with
> fictional demo data only"*, and that is now what this is: a public URL carrying an obviously
> synthetic case, offered at the top of the README as the way to meet the app, with
> „Demodaten zurücksetzen" for the visitor who edits it. Nothing in the app depends on being hosted,
> which was true then and stays true — but that was never what the brief asked for.
>
> **The other half, the completeness check, was built on 2026-09-01** — see *The completeness check
> is a chip in the header, and a flag is a contradiction* at the end of this file. Part 3 is
> therefore done, not half done and not out of scope.

---

## 2026-08-20 — Palette cut to six interface values plus four traces

**What:** `theme.ts` and `index.css` now carry one set of tokens: `--paper #FBFAF8` as the single
ground for page and card, `--grid-minor #E2E0DA` and `--grid-major #C9C6BE`, two inks
(`--ink #14181C`, `--ink-muted #5C6470`), and one interactive accent `--accent #2F4B7C`. The lane
traces are separate from all of it: SpO₂ `#185FA5`, Herzfrequenz `#0F6E56`, Blutdruck `#8C2F39`,
Temperatur `#5B4B8A`.

**Why:** the previous set had grown to three greys, two blues and a categorical ramp chosen for
distinctness rather than for meaning. Two of its four traces — a green at 2.74:1 and a yellow at
2.11:1 against the old surface — were both hard to see and, worse, the colours IEC 60601-1-8 gives
alarm meaning to. Every anesthesiologist reading this has those wired in from Dräger and Philips,
so spending them on a temperature line costs real signal.

**Temperature is the one hue not taken from the design specification.** That document has no
temperature band at all and reserves red, amber, green and cyan, so its three trace colours do not
cover the fourth lane the brief makes mandatory. Muted violet was chosen over a slate-brown (too
near `--ink-muted` at a 2px stroke) and over leaving the lane grey (which draws a mandatory
parameter as chrome).

**Page, card and entry sheet share one ground.** The first two were previously `#f9f9f7` and
`#fcfcfb`, about 1.5% apart in luminance — not a difference anyone can see, and the borders were
already doing the separating. The sheet needed `colorBgElevated` set explicitly: AntD derives that
token rather than taking it from `colorBgContainer`, so the drawer stayed at pure white while
everything inside it wore `--paper`, and the drug tiles read as dirty patches on a clean sheet.
Caught by opening the sheet and looking at it, which is the only way it was ever going to be
caught — the old palette had the same bug and hid it, because `#fcfcfb` tiles on white are a gap
nobody can see.

**On the 7:1 target.** The specification asks 7:1 of "anything numeric". `--ink` is 17.1:1 and
carries every value and dose, so that is met where it matters. `--ink-muted` is 5.7:1 on axis
numbers and secondary labels: short of 7:1, kept at the specified hex, and still a repair of a real
defect, because the `#898781` it replaces was 3.5:1 and failed WCAG AA outright at 11–13px. The
four traces are graphics, not text, so the binding floor is 3:1; they run 5.95:1 to 7.80:1.

**What did not change:** every lane keeps its permanent text label. The reason is now different —
all four traces clear 3:1 comfortably, so the label is no longer a contrast concession — but a
protocol is read by its labels and identity should not rest on hue even when the hue is legible.

**Rejected:** leaving `colorSuccess` and `colorWarning` at AntD's green and amber. They are bound
to `--ink-muted` instead, so a later `type="success"` cannot put alarm green on a clinical display
without someone deciding to. `colorError` stays red at `#B3261E`: the message it renders is that
the record stopped persisting, and there red means what red means.

**One provisional number:** the infusion bar's opacity dropped from 0.75 to 0.55, because
`--ink-muted` is darker than the grey it replaced and the two bars would otherwise have become the
heaviest ink on the page while carrying the least interesting content on it. It goes away when the
bar becomes a thin rule, rather than being retuned. *Superseded 2026-08-20 by the entry below: the
opacity is gone. The rule is not in "the drug's own colour" as written here — there is no such
colour, and there is not going to be one.*

---

## 2026-08-20 — The medication band's symbols are ink, and there is no drug colour

**What:** a bolus is a 16×2px vertical tick in `--ink` at its time; an infusion is a 3px rule in
`--ink-muted` spanning the period it ran, capped at each end by a 10×2px serif. The dose keeps its
place beside the mark and moves from `--ink-muted` to `--ink`. The 5px dot, the 12px rounded slab
and the 0.55 opacity holding that slab's weight down are all gone.

**Why:** measured off a screenshot rather than argued, the two slabs were the heaviest ink on the
page and carried the least interesting content on it — a fluid running is the one thing in a
protocol nobody has to look up. The rule is about a quarter of the slab's area, which is why the
opacity is deleted rather than retuned: the weight problem is now solved by size, and an opacity
was only ever a way of drawing a too-large mark too faintly.

**The tick also separates a dose from a measurement.** A bolus drawn as a filled circle wore the
Herzfrequenz lane's own marker one band away from it, and the two mean nothing alike. The symbol
vocabulary is the design specification's, taken from the paper protocol, and it is read instantly
by the people this is for.

**There is no drug colour, and the phrase should not have been written down.** The plan said "a
thin bar in the drug's colour". The design specification names three trace hues and all three are
vitals; it supplies no medication colour anywhere. Decided by Parham on 2026-08-20: ink only. The
palette stays at six interface values and four traces, and colour keeps meaning "this is a vital,
and which one" — a fifth hue that is not a vital would weaken exactly that. Two alternatives were
put and rejected: drugs solid and fluids hollow (a 3px outlined rule is barely visible on an iPad,
and "hollow" already means "this value went off its axis" one band up), and a single new
medication hue (costs the six-value discipline for a band that has just been made deliberately
quiet).

**The serif is shorter than the bolus tick, at 10px against 16px.** Cut to the same height the two
became one mark: the start of a Remifentanil infusion and a Propofol bolus are both a dose given
at a time, and at a glance they told the same story. Shorter, and in the lighter ink, the serif
reads as the end of its rule rather than as a mark in its own right.

**A running infusion closes with nothing.** The rule still runs to the right edge of the window, as
before; it simply has no end serif, so an open end looks open. Verified by creating one through the
sheet and photographing the band, not by reading the branch.

**Step notches at rate changes have nothing to act on, and drawing them would have been a lie.**
The plan asked for them. This model has no rate change inside an infusion entry: a rate change is
documented by stopping the entry and starting a new one, which is two entries and therefore two
rows. The only in-entry candidate is `revisions`, and a revision is a *correction*, not a rate
change — drawing a typo repair as a step would assert that the drug ran at the wrong rate for the
first half of its infusion, which is the opposite of what an audit trail is for. The serif is the
notch mark, established at the ends of the rule, so if per-drug rows are ever merged onto one line
the mark is already there and already means "the rate changed here".

**Rejected:** enlarging the dose to carry the row now that the marks are lighter. That is the
current-value readout item, it belongs to the lanes as much as to this band, and doing half of it
here would have set the type size twice.

---

## 2026-08-20 — The current value of each lane, in a rail to the right of the chart

**What:** every lane carries its newest measurement at 32px in a fixed 136px column outside the
plot, right-aligned and centred on the lane, with the unit and „zuletzt HH:MM“ under it in the
small type. The pressure lane shows `133/80` with `MAD 98` beneath. The plot's right edge moved in
by that column, and every band moved with it.

**Why:** measured off a screenshot, the largest text on the page was the patient's name and no
measured value was legible at all without switching the whole chart into its numbers mode — which
is something you do to read the record, not something you should have to do to read the patient.
This is the item that makes the page read as a clinical display rather than as four charts.

**It is outside the plot, not drawn on it.** Put at the lane's top right, a readout has to be moved
out of the data's way — a saturation of 100 and a hypertensive systolic both live exactly there —
and a number that is not in the same place twice is a number you have to look for. Put in the left
gutter instead it costs no plot width but adds roughly 14px of height to every lane, and the
vertical budget is what fills an iPad screen. Put to Parham on 2026-08-20 with all three drawn out;
he chose the rail, which is also where a Dräger or a Philips monitor puts it.

**Every band takes the same right edge, not only the lanes.** The bands carry no readout and the
column is empty beneath them, which is real medication width given away. One time scale across the
whole canvas is what this chart is for, and a band drawn 136px wider than the lanes above it would
put a dose at one x and the vitals of that minute at another.

**In `--ink`, not in the lane's colour.** These are the largest numbers on the page, and
`DESIGN.md` asks 7:1 of anything numeric — which `--ink` clears at 17.1:1 and the four traces do
not, running 5.95:1 to 7.80:1 on a graphics floor rather than a numeric one. The lane's permanent
label and its trace already say which parameter this is, and four large numbers in four colours
would take the boldness off the canvas, where the symbols are, and put it in the margin.

**It says „zuletzt“ and it says when.** A large bare number beside a live-looking trace asserts
that it is what the patient is doing now. This app is a record: nothing polls a device, and the
number is the last value somebody wrote down. Nothing is derived either — a pressure reading whose
mean has been removed prints the pair and drops the MAD line rather than computing one.

**It follows a drag but never a selection.** Selecting a point already opens that point's own
readout with the unit and the time, which is where a value from earlier in the case is read. If the
large number followed the selection too, the one number on the lane that is always the same thing
would stop being that. It does follow a drag of the newest point, because that value is genuinely
changing.

**The rail is not chart surface, and the toggle now knows it.** A press on empty chart drops the
trend lines and writes every value out. That handler took a press anywhere on the lane's `<svg>`,
gutter included, which was already wrong and would have made the largest target on the lane one
that changes how the whole record reads by accident. It is now bounded to the plot area.

**Mono, tabular, at the platform's own monospace face.** `--font-numeric` in `index.css`, so item 5
of the conversion list swaps IBM Plex Mono in at one place. *Superseded 2026-08-20 by the
typography entry below: it swapped, and at that one place.* 32px sits in the middle of `DESIGN.md`'s
28–40px and is the largest size the shortest lane holds — Temperatur is 74px, and 32 plus two 15px
lines leaves a margin at each end. One size across all four: a rail whose numbers are different
sizes is not a rail.

**The width it cost exposed a defect in the label placer that had nothing to do with it.** Two
numbers overlapped on iPad in the numbers mode, and the plausible cause was the 136px. It was not:
`cost` in `labels.ts` subtracted two float sums of the same rectangle, so a free position scored a
few femto-pixels either side of zero, `if (bestCost === 0) break` never fired, and the comparison
between two free positions was decided by rounding. The preference order that keeps a series of
labels on one shared row had not been applying at all, on either form factor. Fixed by treating
anything under one square pixel as free. Written up in `docs/learning.md`; the regression test
places one label at a coordinate found by searching for noise that flips the comparison, because
every existing test used whole pixels, which is the one arithmetic where the bug cannot happen.

---

## 2026-08-20 — Two faces, and the boundary between them is what the record holds

Item 5 of the `DESIGN.md` conversion list. IBM Plex Sans on the interface, IBM Plex Mono on
numerals, both self-hosted. Supersedes the note in the readout entry above, which parked
`--font-numeric` on the platform's monospace face until this landed.

**„For all numerals“ needed a boundary, and Parham chose the narrow one.** Put to him on 2026-08-20
with three readings drawn out. Taken literally, a numeral inside a sentence is a numeral: the
header's „RR 142/85 mmHg · HF 80/min“ would have to have its digit runs wrapped and set in a second
face, which means two faces inside one 14px line and a formatting helper every string in the header
passes through. The other end was mono only on the numbers set large. What was chosen is the
middle: **mono is what the record holds — a measured value, a dose, a clock time — and sans is
everything the interface says about it.** So the header's baseline row stays sans, and the 98 in a
lane's rail is mono, because it is the number itself rather than a sentence containing one.

That rule turned out to have already been drawn. Every hand-written CSS rule and every SVG `<text>`
carrying `font-variant-numeric: tabular-nums` was a candidate, and applying the rule to those
thirteen selectors and six elements one at a time moved five of them: `.picker__lead` is a drug
name, `.pressure-row__short` is „SYS“, `.time-field__steps .ant-btn` says „Jetzt“ alongside „+5“,
`.value-field__range` is a sentence about limits, and `.case-facts dd` is prose. They keep tabular
figures and stay in the sans. The six SVG sites all moved, and now share one `.timeline__num`
class instead of six inline styles.

**The `@fontsource` stylesheets are not used, only their files.** Importing them declares nine
subsets per weight and puts roughly 3 MB of woff2 into `dist` for Cyrillic and Vietnamese this
interface cannot render. Four hand-written `@font-face` blocks in `src/fonts.css` ship the latin
subset alone: one variable file for the sans, covering 100–700, and three static weights of the
mono, which has no variable release. 91 kB. The packages stay in `package.json` because they are
where the version and the licence live and where an update comes from.

**`latin` alone is provably enough, not hopefully enough.** The app has no free-text input of any
kind, so every string it can draw is authored in this repo, and every non-ASCII character in `src/`
sits inside U+0000–U+00FF or U+2000–U+206F. Three do not — → ₂ ⌫ — and IBM Plex carries none of
them in any subset, so they fall through to the platform face per glyph either way.

**One number in the chart's geometry is now read off a font file.** `labels.ts` sizes the value
labels and the readout pill from a character count, and both were multiplying by a width measured
against the old face. Every glyph of IBM Plex Mono advances exactly 600/1000 em, read out of the
shipped `.woff2`, so those widths stopped being estimates and became arithmetic — which matters
because the placement search decides which labels collide, and a width a few percent out was
deciding overlap on a number nobody had checked. `tests/typography.spec.ts` is what holds that
claim, in the browser and on WebKit, because a font file is now an input to layout and nothing else
would complain if it stopped arriving.

**Known, and left alone: mono spaces its punctuation.** A comma and a colon each take a full
advance, so „36,5“ and „09:45“ are airier than they were. That is what a tabular face is — the
separator is unmistakable at a glance and the digits either side of it cannot move — and it is one
line to revert per site if it reads wrong on a real iPad.

---

## 2026-08-20 — Two grid weights, and the grid runs under the bands as well

Item 6 of the `DESIGN.md` conversion list. One grey was doing three jobs — five-minute lines,
half-hour lines, value rules and the boundary between two lanes — separated only by half a pixel of
stroke width, and the canvas read flat because nothing on it was structural.

**Vertically: a hairline every five minutes, a rule every fifteen.** `MAJOR_INTERVAL_MS` in
`catalog.ts` is the quarter hour, and it is a multiple of `GRID_INTERVAL_MS` on purpose, so the two
weights are one grid drawn in one pass rather than a second grid laid over the first. The
half-hour emphasis it replaces was written as `GRID_INTERVAL_MS * 6` at the call site and was
carried by stroke width alone, which is not a distinction anyone reads at 0.5px.

**Time labels moved onto the major rules and nowhere else.** They used to be thinned by stepping
through the five-minute ticks, so on a wide canvas they landed on 08:40 and 09:20 — times that
carried a number but were drawn as hairlines. Now the label interval is a multiple of the quarter
hour, so whatever carries a time is also drawn as a rule the eye can follow down the canvas, and a
long case thins to the half hour rather than to an arbitrary tick.

**Horizontally: rules every `gridStep`, with floor, midpoint and ceiling heavier and labelled.** A
lane drew three rules, so between 40 and 140 there was nothing to read a heart rate against. The
spacing is per metric in `catalog.ts` and is required to divide the half-span, because the three
labelled rules are the floor, the midpoint and the ceiling and a spacing that steps past the
midpoint would leave the one rule that carries a number floating between two hairlines.
`scales.test.ts` asserts that for every lane.

**Heart rate is ruled every 25, not every 10.** 10 is the rounder rhythm for a pulse and the only
other divisor of the half-span, but at the lane's drawn height it puts a rule every seven pixels,
which is texture rather than a grid. Fourth instance on this list of a figure in `DESIGN.md` naming
something this app does not have: its "horizontal rules every 20, labelled every 40" describes the
merged 30–190 pressure/rate grid of item 11, and applied to four narrow standalone bands — one of
them six points wide, one of them three degrees — it has no meaning.

**The grid now runs under the medication and event bands too, which is the largest part of what
changed.** They had no time reference at all: a bolus tick sat in white space and its time could
only be read by tracing up to the lanes. A shared timeline is the point of this product, and the
bands already take the lanes' right edge for exactly this reason. `tests/protocol.spec.ts` asserts
that a band's rules land on the same coordinates as a lane's, because the grid is now drawn from
three places that each compute their own plot edges.

**Row separators moved to `--grid-major`, and only the lanes have one.** A lane's bottom rule
divides two bands of one canvas, so it should read heavier than what rules a lane and lighter than
anything drawn inside one. The medication and event bands are already separated by their own
headings and their entry buttons; adding a rule to each would box the canvas rather than divide it.

**Not done here, and visible in the screenshots:** a phase milestone's dashed rule and a
milestone's stem in the event band are both `--grid-major` at 1px, so they now sit at the same
weight as a quarter-hour rule. The dash still tells them apart. Item 8 of the conversion list is
where the milestones are dealt with as a whole, and pre-empting it here would be a second opinion
on the same question.

---

## 2026-08-20 — The end-to-end suite runs against the built app

**What:** `playwright.config.ts` starts `npm run build && npm run preview` rather than the dev
server.

**Why:** it was found doing the wrong thing, not chosen on principle. Two WebKit tests in
`tests/typography.spec.ts` failed intermittently, and instrumenting the requests showed the Vite dev
server leaving the three IBM Plex Mono files unanswered under the suite's own parallel load — a
quarter of runs on `ipad-safari`. WebKit gave up on them, painted the fallback and marked the faces
`error`, so anything measuring those metrics measured the platform's monospace. Against the built
app the same measurement errored zero times in twenty, four consecutive full runs were green, and
the suite got about 20% faster because nothing is transformed per request.

The better reason is what it now tests. Safari on an iPad is given `dist` — hashed static assets,
one bundle, no module graph — and a font that arrives through a dev server is not evidence about
the artifact anyone will open. The build costs about 200ms.

**Rejected:** retrying or waiting longer in the tests, which is the usual answer to a flake and
here would have hidden a server dropping requests; and lowering the worker count, which reduces the
contention without fixing what the contention exposed.

**Kept in mind:** `reuseExistingServer` is still on outside CI, so a dev server left running on the
port will be used instead. That is Playwright's own behaviour and predates this change, but it is
now a way to test something other than what the config says.

---

## 2026-08-20 — Blood pressure as paired chevrons, apex at the value

**What:** on the pressure lane, systolic is a filled triangle with its apex pointing **down** and
sitting exactly on the value, diastolic a triangle with its apex pointing **up** on its value, the
two joined apex to apex by a 1.5px stem at full strength, and the mean a 3px dot on that stem.
`markerBox` now offsets a chevron's footprint by half its height, because a chevron hangs off its
point rather than surrounding it.

**Why:** this is the symbol every anesthesiologist already reads off the paper protocol, and it is
the one item on the conversion list where `DESIGN.md` describes a mark this app was drawing
backwards. Both triangles used to point outward, and that was wrong in two ways that only show up
once you ask which pixel is the number:

- **The value was at no vertex.** The old systolic path put its apex 6px above the point and its
  base 4px below, so the measurement sat somewhere in the triangle's interior with nothing on the
  mark to say where. The apex is a point, and a point is what a value wants. Now the two are the
  same pixel, which is also why the stem needed no arithmetic: both its ends are already a point's
  own `y`.
- **The bodies ate the span they were measuring.** Pointing inward, the two triangles filled about
  ten pixels of the gap between systolic and diastolic. That gap is the pulse pressure. Turning
  them around empties it and leaves it for the stem.

**The stem is thin and solid rather than thick and faded.** It was 2px at 0.55 opacity, which made
it quieter than every trend line crossing it: the one mark that says *these numbers are one
inflation of one cuff* was the one you could not see. A hairline that is actually there reads as
structure; a wide grey one reads as a smudge.

**The mean is small, and small is the whole of what it says.** At the old r=4.5 it wore the heart
rate lane's marker one band away from it, so the loudest of a reading's three marks was the number
read least. Same argument as the medication band's bolus tick, and the third time it has come up.

**One thing this improved that was not the point of it.** An off-scale value is drawn hollow as an
arrowhead pointing the way it went, so an off-scale systolic at the ceiling is a hollow apex-up
triangle. The on-scale systolic beside it used to be a *filled* apex-up triangle — same direction,
distinguished by fill alone. It now points the other way, so near an edge the two differ in
direction as well.

**Not decided here:** whether the pressure lane should keep its three trend polylines at all.
`DESIGN.md`'s symbol table gives SpO₂ a polyline explicitly and gives pressure only the chevrons
and the stem, so the omission looks deliberate — and three parallel lines are three times the ink
of any other lane, on the lane that already carries the most marks. Rendered both ways and put to
Parham with the screenshots; it belongs with the open question below about a band, which is the
same question asked a third way.

**No test fallout.** Nothing asserts a marker's path — the suite keys on `data-entry-id`, on
`data-value-label` and on bounding boxes, all of which survive. One comment in `values.spec.ts`
said "systolic points up, diastolic points down" and is now false; rewritten. All four checks
green: 99 unit tests, 237 Playwright runs.

---

## 2026-08-20 — The entry sheet is a bounded card, and its body is two columns

**What:** the drawer that creates and corrects entries was reworked. It is now a card of at most
880px, centred, with rounded top corners, a `--grid-minor` border and a mask at 32% rather than
AntD's 45%, so the ruled canvas stays visible around and under it. Its height is capped at
`calc(100dvh - 32px)`, with the header and footer fixed and only the body scrolling. Inside, every
form is two columns: the number and the keypad that types it on the left, what the entry says about
itself — unit, timestamp, an infusion's end — on the right. `BloodPressureForm` was moved onto the
same grid, and every part of the drawer is now named through AntD's `classNames` (`sheet.ts`).

**Why:** three separate faults, one of them a real defect.

- **The height cap had never worked.** `.entry-sheet .ant-drawer-content` selected nothing: AntD 6
  renamed that element to `ant-drawer-section` *and* puts the `className` on it rather than above
  it, so the rule was neither matching the wrapper nor the panel. Measured on an 810px iPad
  viewport, the medication sheet rendered 921px tall with its own title bar 111px **above** the top
  of the window and no scroll that could reach it — the „Übernehmen“ and „Zurück“ buttons were
  visible, the title and the top of the readout were not. `docs/learning.md` has the cascade half
  of this.
- **Stacked, the forms were taller than the window.** A readout, a range line, a keypad, a unit row
  and two time controls in one 640px column is about 750px of body before the header and footer.
  Two columns makes the same infusion form 513px on the same viewport, and it fits a 680px laptop
  window with room to spare. The blood pressure sheet had already been given a side-by-side layout
  for exactly this reason at a 560px breakpoint; that was the right idea applied to one form, and
  it is now the layout of all of them.
- **It did not look like the rest of the app.** A full-bleed white panel over a 45% mask is a screen
  that replaced the record, not a sheet laid on it. Everything else in this app is bounded, ruled
  and bordered in `--grid-minor`; the entry sheet was the one surface that was not, and a
  correction is made while looking at the curve that prompted it.

**The readout is a plate now, not floating text.** The number, its unit and the accepted range sit
in one bordered box the width of the keypad below it, and the box border turns `--error` when the
typed number is outside the range. Loose in the middle of a sheet, the largest element on screen
promised nothing about where its input came from; framed above the keys, it reads as the field they
write into, which is what it is. `Range` no longer computes the out-of-range test itself — the
field does, because the whole plate wears it.

**The drug tiles show what this case last gave.** They were 88px boxes holding one word in the
top-left corner. They are now 60px, and where the case holds a previous dose of that drug given the
same way, the tile carries it: „zuletzt 150 mg“, in the mono face, worded as the lane rail words
its own last value. That number is not a suggestion and not a dosing aid — it is a fact already in
this record, and it is the number the sheet behind the tile will open on, which the tile was
previously hiding until after the tap.

**What was rejected.** Sizing the card to its content (`width: max-content`) would let the picker
grid and the two-column body disagree about how wide the sheet should be, and the sheet would
change width between steps of the same flow. A modal centred in the window was rejected for the
reason the drawer was chosen originally: on an iPad the bottom edge is where the hand already is.

**No behaviour changed.** The gestures, the draft model, `isComplete`, the audit trail and the
keyboard handling are untouched; the blood pressure sheet's typing now reaches the selected
pressure from the keypad column and from the rows, which are the only two places its focus can be,
and deliberately not from the time controls, where a digit is not a value. 99 unit tests and the
Playwright suite green.

---

## 2026-08-21 — A load failure gets a way out, and says which kind it is

**What:** `LoadResult`'s error variant carries a `cause` of `'access'` or `'content'`. On a
`content` failure the error screen offers „Gespeicherte Daten verwerfen und neu beginnen", which
clears the key and re-seeds the demo case. On an `access` failure it keeps the existing advice and
offers no button. Extends the entry of 2026-08-11 above rather than replacing it.

**Why:** Found by exercising the state rather than reading it, during the cold-start and error
pass of 2026-08-21. The screen was a dead end. Its only advice — „Prüfen Sie, ob der Browser
lokalen Speicher zulässt, und laden Sie die Seite neu" — is *wrong* for a corrupt, outdated or
incomplete stored case: the browser is allowing storage, and reloading reads the same unreadable
bytes and fails identically every time. The app was bricked on that device until somebody opened
the developer tools. Part 2 grades clear error states and safe correction workflows, and an error
state with no exit is neither.

**Why the field and not a boolean in the UI:** `loadCase` reports what failed; whether that leaves
the user anything to press is a conclusion, and it is drawn once, in `App.tsx`, as `recoverable`.
A denied storage API cannot be argued with, and neither can a seed that would not save — nothing
is stored to discard in either case.

**Rejected:** offering the discard on every failure (it would do nothing when storage is denied,
since `removeItem` throws too, and a button that cannot work is worse than advice that cannot
help). A confirmation dialog (the house answer is undo, not confirmation — but undo lives inside a
case that never loaded, so instead the consequence is stated in plain text beside the button;
nothing readable is being discarded, because the data being unreadable is why the screen is on).

**What the tests had to be told:** the first version of the recovery test corrupted storage in an
`addInitScript`, which re-ran on the closing reload and put the bad value back — reporting a
working recovery as broken. It now corrupts once through `page.evaluate`. The test asserts against
`localStorage` and survives a reload, so a screen repaired over a still-corrupt key fails it.

---

## 2026-08-21 — The six „Erfassen“ buttons wear the accent, not a box

**What:** placement is unchanged from *The row is the button* above; this is the paint only. AntD's
default button — a near-white fill inside a grey border — is replaced by a wash of `--accent` at
7%, no visible border, the label in `--accent` at weight 600, one width of 128px for all six, and
the label left-aligned so the „+“ glyphs and the words each line up down the edge.

**Why:** three things, and the first is the one that shows in a screenshot. Six outlined boxes
running down the left edge were the loudest repeated element on the record. Their border was
`colorBorderSecondary`, which is `--grid-minor` — the chart's own hairline value — so each button
was drawn at the weight of the ruling and was still heavier than the lane name directly above it.
A lane's name is what identifies the row, and it was losing to its own button.

Second, `theme.ts` already declares `--accent` to be the one colour the interface uses to say „you
can press this“, and the record's primary action was wearing none of it. Third, the brief calls
default component styling out as a negative, and apart from height, padding and font size these
were AntD's defaults.

**The wash is there at rest, not only under a pointer.** The iPad is the first form factor and
there is no hover on it, so a control whose only affordance is a hover state has no affordance on
half the target hardware. That is also why a plain text button was rejected.

**Measured rather than read**, because a rule that loses to AntD fails silently: at rest the
background computes to `rgba(47, 75, 124, 0.07)` and on hover to `0.13`, and all six boxes report
`x=37, w=128, h=32`. The hover rule needs `:not(:disabled)` to outrank AntD's own, which is
injected after this stylesheet and wins at equal specificity — the same fight `src/entry/sheet.ts`
documents. The label measures **7.48:1** against the tinted ground, which clears even the 7:1 the
design specification asks of numerals.

**What was deliberately not changed: the 32px height.** The theme sets `Button` to 44px because
that is the size a fingertip reliably hits, and this rule cuts these six back to 32. Raising it is
not a paint change — the gutter comment fixes the geometry as 40px of clearance above the button
and 32px of button clearing the shortest lane's floor at 74px — and it is entangled with the gutter
width, which is an open decision below. A hit area larger than the painted box would reach into the
lane's `<svg>`, and anything new on that surface has to say what the four gestures must not do and
be proven by a scripted gesture. That is a change with a test attached, not a restyle, so it is
recorded here as known and left for a decision.

**Rejected:** a filled accent button — six solid blue blocks down the edge is a louder version of
the problem, not a fix for it. A bare text button with no tint — quietest at rest, and on a
touchscreen nothing marks it as pressable.

---

## 2026-08-21 — The „Erfassen“ button is painted 32px and answers to 44px

**Supersedes the last paragraph of *The six „Erfassen“ buttons wear the accent* above**, which
recorded the 32px height as known and left it for a decision. This is the decision.

**What:** the painted box is unchanged. `.timeline__add--gutter::after` adds a transparent
`inset: -10px 0 -3px`, which makes the target 43.98px tall — 44px to within subpixel layout —
running from y=30.0 to y=74.0 in the lane's own coordinates. Nothing on the page moves or changes
colour.

**Why:** `theme.ts` sets `Button: { controlHeight: 44 }` and argues that 44px is the size a
fingertip reliably hits, calling AntD's 32px "a mouse-era size"; `index.css` then cuts the six most
pressed controls on the record back to 32. The brief's Part 2 opens with *"Large, reliable touch
targets and precise mouse interaction."* This was the only place in the app where the theme
contradicted its own argument, and it was the one real defect the clause-by-clause brief audit
found.

**Why not simply paint it at 44px.** Measured at a 1080×810 iPad viewport, every lane's button is
`top 40, bottom 72` in its lane's `<svg>`, and the lanes are 92, 92, 129 and 74px tall. Growing the
box downwards puts the temperature lane's button 10.5px past its plot floor and 10px outside its
`<svg>`, hanging over the Medikamente band; growing it upwards collides with the unit's baseline at
y=38. A symmetric hit area reaches into the next row for the same reason. So the expansion is
asymmetric, and the temperature lane — the shortest — is what it is cut to.

**Why this is safe, which is the part that was actually checked.** `CLAUDE.md` is strict about the
lane surface: four gestures, and anything new there must say what the other four must not do. The
gutter is not that surface — the rulebook already calls the gutter and the value rail the lane's
furniture — and rather than trust that, presses were scripted at the lane's name, at its unit, and
at empty gutter below the button. All three are inert; only a press on the plot changes anything.
The expansion claims dead space and takes nothing from any of the four.

**Proven by gesture, not by reading**, in `tests/gutter.spec.ts`: a press 6px above the painted box
opens that lane's entry sheet; the target measures 44px and ends on the temperature lane's floor
rather than past it; a press on the plot still switches how the lane reads and opens nothing; a
press on a point still selects it. The two edges are found by binary search with
`elementFromPoint`, because the insets are not the arithmetic you would predict — the button
carries a 1px border and an absolutely positioned pseudo-element lays out against the padding box
inside it, so the pair that measures right is -10 and -3. With the expansion removed, the first two
fail and the last two pass, checked rather than assumed.

**Why this one and not the other outstanding items:** it changes nothing visible, so it does not
re-stale the seven story videos. That is what separated it from the gutter width, the pressure-lane
question and the „Jetzt“ button on submission day.

---

## 2026-08-21 — Labels inside the plot knock the grid out from behind their glyphs

**What:** `.timeline__halo` — `paint-order: stroke fill` with a 3px `--paper` stroke — on the event
band's names and times and on the medication band's doses. Nothing moves; the only change is that
a hairline no longer runs through a word.

**Why it is not a new decision.** `ValueLabel` has carried its own opaque surface since the reading
mode was built, and its comment gives the reason: a number set straight onto the chart is read
across gridlines, event rules and the neighbouring lane's ink. The two bands were simply never
given the same treatment. „Schnitt“ is documented at 08:42 and the quarter-hour rule at 08:45 runs
straight through the word; „0,2 µg/kg/min“ crosses two hairlines. This applies a decision the app
had already made to the two places that were missed.

**Why a halo and not a plate.** The value labels use an opaque rounded rect, and it is right there:
they sit over data, sometimes three to a box, and they have to be opaque enough that the collision
search in `labels.ts` means something. The bands are sparse and their labels sit over grid only, so
five opaque plates would be the heaviest thing in a band whose whole content is five thin marks. A
stroke hugging the glyphs also leaves the rule visible between the letters, so the grid stays
continuous to the eye — which matters, because both bands are ruled from the same window as the
lanes and that is what makes them one timeline rather than three stacked pictures.

**Rejected: stopping the grid under the label rows.** `CLAUDE.md` is explicit that the grid runs
under the bands, from the same window and the same plot edges, because a dose with no time under it
is not on a shared timeline. Clearing the ruling to make room for a word is solving a paint problem
by deleting the structure.

**No test, deliberately**, on the principle `typography.spec.ts` opens with: most of that change was
paint and paint does not need a test, and what earned tests there was the one place a font had
become an input to geometry. Nothing measures this halo — no layout depends on it, and if
`paint-order` ever stopped applying the labels would collide again exactly as they did before,
which is a cosmetic regression and not a silent data defect.

**Cost:** the seven story videos were re-recorded, because both bands appear in them.

---

## 2026-08-21 — Each band's heading and button sit above it, not under it

**What:** „Medikamente“ and „Ereignisse“ are no longer `<text>` inside their band's `<svg>`. Each is
an `<h3>` in a row above the band, with that band's „Erfassen“ button stacked directly beneath it,
left-aligned at the same x as the four lanes' buttons. The bands lose their internal 24px heading
strip and gain 6px of padding, so the record is no taller than it was.

**Why:** a band grows downwards as it fills, and the button was in the flow underneath it. Every
drug added pushed „+ Medikament“ 34px further from the „Medikamente“ it belongs to — on a long case
far enough to be off the screen, which is the one thing the record's primary action cannot be.
„+ Ereignis“ had the same distance permanently, because the event band reserves two label rows
whether or not anything is in them.

**Why this position and not another.** The four lanes never had the problem: their button is pinned
to the top of the gutter, level with the lane's own name. A band's gutter is *not* empty — it holds
each row's drug name — which is what put the button below the band in the first place, and is
recorded in the rule this supersedes. Above the band is the same relationship in the only place a
band has room for it.

**Stacked, not side by side.** Both were tried and looked at. Side by side is more compact, and it
puts the two bands' buttons 118px in from the edge, breaking the column of six „+“ glyphs that
*The six „Erfassen“ buttons wear the accent* set out to create — for a third of the record. Stacked,
all six line up and each sits under its own name, which is what a lane already does.

**Proven by a test, because it is a property of the record with data in it**, not of the record as
it first renders: `gutter.spec.ts` adds a bolus and asserts the button has not moved relative to its
heading. Against the old layout it fails by exactly 34px, one medication row.

**The measurement is heading-relative on purpose.** Written against absolute page coordinates it
failed for a second reason as well: the header gains „Gespeichert 09:xx“ on the first save and grows
about a pixel, moving everything below it. That is a real change and not this one — what must not
move is the button away from its own name.

---

## 2026-08-21 — The record says which phase it is in, and keeps measuring until it ends

**What:** two changes with one cause. The case header's first fact is now **Phase**, carrying the
last milestone documented and its time — „Entlassung · 09:45“ on the demo case, „noch nichts
dokumentiert“ before the first one. And the demo case takes observations at minutes 65 and 70,
after Ausleitungsende at 48 and before Entlassung at 75.

**Why:** the record could be read for a long time and still leave the wrong impression. Vitals
stopped at 09:30, the axis ran to 09:45, and nothing named what the last quarter hour was — which
reads as an anaesthetic still running, not as a patient in recovery and then discharged. That was a
real misreading by someone who had been looking at this app for days, not a hypothetical one. The
fifteen-minute gap was demo data stopping early, and the missing sentence was the phase.

**It is a restatement, never an inference.** „Phase“ prints the newest entry in the Ereignisse band
and nothing else. Nothing decides that a case is „laufend“ or „beendet“, because that would be the
app concluding something about a patient from the record rather than showing what is in it — the
same line `MAD` is on.

**First position because it is the only fact in that header that changes during a case.** Everything
beside it — date, birth date, ASA, baseline — is fixed before the first entry is written.

**No cuff reading in recovery, and that is a decision.** The other three parameters take readings at
09:35 and 09:40; NiBP stops at 09:30. Intermittent measurement makes that ordinary, and the
alternative collides: a pressure label is a three-line box, and two of them ten minutes apart that
close to the right edge cannot both take a side position, so `placeValueLabels` falls back to its
least-bad placement and two boxes touch. **The fallback is correct** — a value drawn over a gridline
beats a value silently dropped, which is the rule `labels.ts` is built on — but the case that ships
should not be demonstrating it, and `values.spec.ts` should not be relaxed to accept it. The limit
is now in the README's known limitations, where it is a property of the reading mode rather than a
secret about the demo data.

---

## 2026-08-21 — The phases lead the record, and every band carries a ruler

**Supersedes *Each band's heading and button sit above it* from earlier today**, which put both
bands' headings in a row of their own. That row is gone; this is where those two ended up.

**What:** three changes to the order and furniture of the canvas.

1. **Ereignisse moves from the foot of the record to directly under the time axis.** The dashed
   phase rules already ran down through every lane; now they descend from their own labels, so
   „Schnitt“ is readable where the vitals are being read instead of only at the bottom of the page.
2. **The time axis is repeated above the medication band.** Same component, same window, same plot
   edges, with „Uhrzeit“ dropped on the copy — the word needs saying once.
3. **Both bands keep their heading and button in the gutter**, in the same column as the four
   lanes. The event band can do this directly: its gutter holds nothing. The medication band's
   gutter holds each row's drug name, so its heading and button sit in the gutter beside its
   *ruler*, which is empty precisely because the repeat drops „Uhrzeit“.

**Why (1):** the phases are the frame the case is thought about in, and „was ist der aktuelle
Stand“ is the question a record gets asked first. It costs 64px above the vitals on an iPad, which
is the whole argument against it, and that is bought back by (3).

**Why (2):** the record is taller than an iPad, so the ruler scrolled away with the top of it —
reading a dose meant scrolling up to find out what time the column under it was. A sticky axis was
measured as the alternative and works, but needs `overflow-x: clip` on `.timeline` (the current
`hidden` makes it its own scrollport, so `position: sticky` inside it silently does nothing) and
the case header's height measured into a custom property, because the header is 130px at 1080 and
shorter at 1280. Two lines of JSX against a runtime dependency between two components, on the last
day. The repeat also survives print and appears in a screenshot, which a sticky header does not.

**Why (3):** it answers the complaint that started this — a band grew downwards and its button went
with it — without the row of its own that the superseded entry added, and it puts all six „+“
glyphs back in one column. It also closes the unruled gap between Temperatur and the medication
band that the separate heading row had opened: the record now runs ruler, phases, four lanes,
ruler, drugs, with nothing between them that is not on the timeline.

**Found by looking, not by reading:** collapsing the event band to its heading when empty left
„+ Ereignis“ hanging over the saturation lane below — still clickable, no longer inside anything.
The band now keeps one height whether or not it has events, because it carries its own button.

---

## 2026-08-21 — The row's name is the button, and the gutter is 88px

**Implements the proposal at the foot of the gutter entry under *Open decisions*, and supersedes
its 80px with 88.** It also supersedes the last paragraph of *The „Erfassen“ button is painted 32px
and answers to 44px* above: the painted box that entry cut a hit area around no longer exists, and
the target it argued for is now the block itself.

**What:** every row of the record — four lanes and both bands — carries one control in its gutter
instead of a name with a painted 128×32 button under it. The block is the row's name, its unit, and
a „+“ in `--accent`; it is 88px wide, 44px tall, and pressing anywhere in it opens that row's entry
sheet. The lane names are abbreviated to „SpO₂“, „HF“, „RR“ and „Temp“, which `LANES` now carries as
`short`. `GUTTER` drops from 168 to 88.

**Why the abbreviation is the enabling move and not a nicety.** Measured in the shipped face at the
sizes the gutter uses: „Sauerstoffsättigung“ is 119.1px, and with the widest axis number and its
padding beside it that is 162 — which is the 168 we already had. The gutter is read at two x
positions on one line, the name at the left and the number right-aligned to `GUTTER − 8`, so the
width is the widest pair. At 88 the pairs that actually meet are „+ Temp“ (41.9) against „38,0“
(26.4, from x=53.6) and „mmHg“ (35.8) against „220“ (19.8, from x=60.2): 11.7px and 24.4px of
clearance. The abbreviations are what a paper Narkoseprotokoll already uses, so this is a shorter
name and not a truncation, and the full name is still the block's accessible name and the entry
sheet's title.

**Why 88 and not the 80 that was proposed.** The proposal costed the names without the „+“ that now
precedes each of them, which is 8.6px, and did not price the medication band's own name at all:
„+ Medikament“ is 80.5px. At 80 the temperature lane cleared its ceiling number by 3.7px and
„+ Medikament“ printed through the repeated ruler's first time label. Eight pixels buys both, and
„Medikament“ stays a word — „Med.“ is shorthand for something the row has room to say. The change
is still 80px of chart, about 12% more of it on an iPad.

**Why the name is the button.** This is the end of the hit-area change made the same morning: that
one expanded the target into gutter it had *proven inert* by scripted press, and the honest reading
of a 44px target sitting in dead space is that the dead space was the button. Making it so costs no
height, removes the six painted boxes that *The six „Erfassen“ buttons wear the accent* already
called the loudest repeated element on the record, and gives a larger target than the box it
replaces — 88×44 rather than 128×32 painted. The visible word „Erfassen“ goes with it, so the empty
record now points at the „+“ instead.

**The wrinkle, which is what made this a session rather than an hour:** the medication band's gutter
held each row's drug name, and „Ringer-Acetat“ does not fit in 88px. Giving that band a wider gutter
than the lanes was never an option — the single left edge is what makes the six rows one timeline —
so the drug moved into the plot beside its own mark, joining the dose that was already there, as
`drug dose` in one text run with `.timeline__halo` behind it. The band's block then moved down
beside the band itself rather than beside the repeated ruler, because the ruler's first time label
is centred on the plot's left edge and reaches 18px back into the gutter; the medication band's
minimum height is 48px so that the block always has a band to sit beside.

**Accessibility, deliberately and not by default.** The block is spoken as „SpO₂, Sauerstoffsättigung
erfassen“: the written name first, so someone driving the interface by voice can say what they can
see, then the full parameter, which is what a screen reader is owed. `CLAUDE.md`'s rule that colour
never carries identity alone still holds — an abbreviation is still a permanent visible text label —
but it is thinner than it was, and that is a judgement made deliberately rather than by accident.

**Rejected, with what each was measured to cost**, carried over from the open decision this
replaces so they are not proposed again:

- *Leave it at 168.* Costs 80px of chart on the form factor with the least of it.
- *100px with the full names*, which was Backlog §8 item 9 as written. „Sauerstoffsättigung“ at
  y=20 against a ceiling number at y=16 overlaps by 44.3px, and the old button against the
  temperature midpoint by 28.1px. The item was not a constant edit.
- *Name and button on a row above each lane*, the shape the bands used to have. Makes all six rows
  one shape and frees the gutter entirely, and costs a row of height per lane — roughly 96px over
  four — on the iPad. That is the version this was sent back to improve on.
- *Axis numbers inside the plot.* They would sit over data, and they are already the smallest type
  on the canvas.
- *A round „+“ beside a full name*: `119 + 8 + 32 = 159`, which saves nothing.
- *A hover-only affordance.* There is no hover on the first form factor.

**Proven by gesture, not by reading**, in `tests/gutter.spec.ts` and `tests/touch.spec.ts`: a press
on the lane's own axis number opens its entry sheet; the target measures 44px and ends inside the
shortest lane; the gutter below the block is still inert; a press on the plot still switches how the
lane reads; a press on a point still selects it; a *swipe* from the block scrolls the record and
opens nothing, which is the new risk a 128px painted button never had. Every block's written name is
asserted to be contained in its spoken one, because that pair breaks silently when either half is
edited alone.

**Revised within the hour, on looking at it: the block wears a wash after all.** Painting nothing
at rest made the six rows read as labels rather than as controls — the „+“ alone was not enough of
an affordance, and there is no hover on the first form factor to supply the rest. So the name and
its unit sit on `--accent` at 6% with a 6px radius, the same wash the old buttons wore and a
quarter of their area.

What makes this not a return to the painted box is that **the paint and the target are no longer
the same rectangle.** The target is the whole 88×44 gutter; the painted face is `fit-content`, 38
to 91px wide, and its padding is paid to the *left* of x=0 so the names stay on the record's left
edge with „Uhrzeit“ instead of stepping in from it. The gutter's right half is where the axis
numbers are, and a surface drawn under „38,0“ would read as though the number belonged to the
control — which is exactly what the first attempt, a wash across the full 88, looked like. The
tightest margin is „+ Temp“ against its own ceiling number at 6.7px, so `gutter.spec.ts` measures
the gap on all four lanes rather than trusting it; with the face widened to the full gutter that
test reports −21.8px on the saturation lane, checked rather than assumed. The focus ring hugs the
face for the same reason: an 88px ring around a 48px control points at the wrong thing.

**Two test bugs found on the way, both of the kind `CLAUDE.md` warns about.** The hit-area search
matched `[aria-label="Temperatur erfassen"]` exactly, which stopped matching when the accessible
name gained its abbreviation — a selector aimed at a string nothing checks. And the search window
was ±20px around the block's centre, which reports a 44px target as 40: the interval it searched
was inside the target at both ends, so it measured itself.

---

## 2026-08-31 — Four checks before the merge, not four checks before the commit

**What:** `.github/workflows/ci.yml` runs lint, the unit tests, the build and the full Playwright
suite on every pull request and on every push to `main`, and deploys to Pages only from a run in
which all four passed. `pages.yml` is gone; its two jobs are the tail of this one file. `main` is
protected: a pull request is required, status checks must pass, and only rebase merging is allowed.

**Why:** `CLAUDE.md` has asked for all four green before a commit since the first week, and that was
true because Parham ran them. A rule enforced by memory is not enforced on the evening it matters,
and it cannot be enforced at all on a clean machine — `npm ci` from the lockfile catches the
dependency that is installed here and declared nowhere. The suite most worth running is also the one
least likely to be run: `npm run e2e` is 237 runs across three browsers and costs minutes, so it is
the check discipline drops first, and every pointer test in it is geometry.

**Why the deploy waits on the tests.** The alternative is two independent workflows, where the link
goes live on the build and the suite reports separately. That is faster to `main` and it means a
green public link can sit over a red pointer suite. Rejected: this repo is a portfolio piece, so the
link is what a stranger meets first, and a subtly broken record costs more than five minutes of
latency. Waiting also answers the failure mode that is more common than having no CI at all — a
suite that goes flaky and is quietly ignored. If the tests can stop the deploy, a red run has to be
dealt with rather than scrolled past.

**Why one file rather than the `ci.yml` / `pages.yml` split the backlog proposed.** Two workflows
can only be sequenced with `workflow_run`, which fires on a run that has already finished; `needs:`
inside one workflow is the same intent in one line. The split is the right shape only when nothing
downstream waits.

**Why `push` is narrowed to `main` rather than firing on every branch.** The backlog asked for both
on any branch. A branch with an open pull request would then be tested twice, and the second run
proves nothing the first did not — `pull_request` is already the gate that fails before the merge.
A branch with no pull request open is not yet asking to become `main`.

**Why the e2e job does not wait on lint.** Running them in series would delay the geometry result by
the length of a lint run for no information gained. They are independent; the deploy waits on both.

**Rejected:** *required reviewers* (GitHub does not let an author approve their own pull request, so
any number above zero locks a solo repo); *squash merging* (collapses a branch into one generated
commit, and the commit history is a graded deliverable here — 59 commits, one coherent unit each);
*a coverage threshold* (a percentage does not answer the question `CLAUDE.md` asks about a test,
which is what would still pass if the feature were deleted); *a pre-commit hook* (the fast checks
are seconds and already habitual; the slow one is what needed moving).

**What moves, in practice:** the fast three stay local, before a commit, because instant feedback is
worth having. `npm run e2e` moves to CI, and is run locally when something geometric has been
touched and the answer is wanted now.

**Amended the same day: the local half is now a git hook, not a habit.** Leaving it to memory was
the thing this entry objected to, and CI answering for the slow check does not answer for the fast
three. `.githooks/pre-commit` runs lint, the unit tests and the build — 5.1 seconds together — and
refuses the commit if any fails. Not husky: git runs a pre-commit script on its own, and the only
thing the package adds is committing the hook so a fresh clone gets it, which `"prepare": "git
config core.hooksPath .githooks"` does in one line and no dependency, since npm runs `prepare` after
an install. `npm run e2e` is deliberately left out — a hook that costs minutes is a hook that gets
bypassed, and bypassing it would cost the three that are worth having. Two limits kept on purpose:
it checks the working tree rather than the staged content (`lint-staged` would fix that and is not
worth a dependency at this size), and `--no-verify` skips it, which is the honest split — the local
check is a convenience, the remote one is the gate.

---

## 2026-09-01 — The completeness check is a chip in the header, and a flag is a contradiction

**What:** Part 3(a) is built. `src/domain/completeness.ts` reads a case and returns what is
structurally wrong with it — the three the challenge names: a required milestone never recorded, an
entry whose unit is missing, a continuous dosing with no end. A count appears in the header beside
the „Gespeichert“ status („Offen (2)“) and opens the list in the same sheet the entry controls use.
Pressing a row opens the entry sheet that fixes it. When nothing is wrong there is no chip at all,
which is how the demo case ships.

**Every flag is about the shape of the record and none is a judgement about a number in it.** It may
say „Naht nicht erfasst“ and may never say a dose looks high. That is the challenge's own second
bullet — *does not calculate medical values or provide treatment recommendations* — and the same
line the no-calculation rule draws for MAD, arrived at from the other side. The sheet says so out
loud: *Geprüft wird die Form des Protokolls, nicht die Messwerte.*

**The check prompts; it never writes.** A flag naming Narkosebeginn opens the milestone sheet on
Narkosebeginn and then waits for „Übernehmen“. The app filling it in would put a milestone in the
record that nobody documented, and „the app inferred it“ is not a provenance a clinical document can
carry. What the flag saves is the picker step, not the decision.

### A chip, not a gate and not a standing panel

**Rejected — a blocking gate** before a „finish case“ action. Two costs, either enough on its own:
the app has no such action, so the gate would first have to invent what finishing a case means,
whether it can be undone and what follows it; and a modal between the user and their record is a
confirmation dialog, which this app does not have by rule. Its one genuine advantage is that it
costs no pixels at rest.

**Rejected — a standing panel.** Horizontal room on the iPad is the scarcest thing on this canvas —
it is why the gutter is 88px and why the lane names are abbreviated — and a permanently-occupied
region spends it on a message that is usually empty. The chip costs about 70px of header when there
is something to say and nothing when there is not.

### When a flag is allowed to fire, which is the decision that mattered

**A flag is a contradiction inside the record, never „you are not finished yet“.** The obvious rule
is wrong: a case that has just been induced has four of its five milestones unrecorded because three
of them have not happened, so checking them outright puts „Offen (4)“ on a record with nothing
whatever wrong with it, for most of the operation. A warning that fires on the normal case is worse
than no warning. So each rule waits for something already in the record to contradict what is
absent:

- a milestone is missing only once a **later** one is recorded — Naht at 09:11 with no Schnitt is a
  hole somebody has to explain;
- an infusion has no end only once **Entlassung** is recorded — running is a state the record is
  built to hold, and it becomes an omission when the record also says the patient went home;
- a unit is checked always, because there is no moment at which a dose is legitimately given in
  nothing.

Each flag carries the entry that proves it, and the list shows it: „Naht ist um 09:11 erfasst“ under
„Schnitt nicht erfasst“. A flag that cannot say why it fired asks to be believed.

**What this gives up, deliberately:** a record that simply stops after Naht is never flagged for the
two milestones it never reached. The check says the record is inconsistent; it never says the record
is unfinished. **The alternative was to wake the check at Ausleitungsende** and then count
everything still missing, which does catch „Entlassung nicht erfasst“ and is closer to the
challenge's own phrase *pre-submission validation*. It was rejected because it means reading „the
anaesthetic is over“ off a single event — the conclusion *The record says which phase it is in*
above explicitly refuses to draw, on the grounds that the header restates what was documented and
concludes nothing about the patient. A second feature quietly drawing it would make that entry
false.

### Two defects the check surfaced on its way in

Neither was introduced here; both were reachable before this feature existed and had nothing to
find them.

**A dose whose unit is unknown crashed the sheet that would have fixed it.** `bolusAmount` looked
its unit up in `BOLUS_RANGES`, got `undefined`, and spread it into an `AmountMeta` with no `max`;
`ValueField` then threw on `max.toFixed`. `catalog.ts` now falls back to a wide, fine `UNKNOWN_UNIT`
range — wide and fine on purpose, because the number under it is already documented and a tidier
step would round a recorded dose on the way to the screen.

**And the unit picker claimed a unit the record did not hold.** AntD's `Segmented` has no unselected
state: handed a `value` matching no option it highlights the first, so a dose with no unit was
displayed as „mg“ — a value the record does not contain, shown as though it did — and because AntD
believed „mg“ was already selected, pressing it fired no change, so the correction could not be
made. The picker now shows an unknown unit as its own option labelled „fehlt“, the same word the
flag uses, and `isComplete` refuses the entry until a real one is chosen.

Both are only reachable through `storage.ts`, whose guard checks an entry's id, type and timestamps
and deliberately stops there. That is the honest description of this rule: **the unit check does not
guard the forms, it guards the other way in** — and it is why its Playwright test edits the app's own
stored envelope and reloads, rather than asserting against a case the interface cannot produce.

---

## Open decisions (not yet made)

- **The left gutter is settled.** It is 88px, and the row's name is the control that opens its
  entry sheet — see *The row's name is the button, and the gutter is 88px* above, which carries the
  measurements this entry used to argue over and the two things that turned out to be wrong in
  them.

- **NiBP on the timeline** is now settled in both halves: entry is one reading, three stored
  entries sharing the timestamp the user set; the chart draws them as paired chevrons on one stem
  and labels them as one box. What is still open is what the *trend* reading of that lane should
  do with the three series — join them into a band, leave them as three separate polylines, or
  drop the polylines and let each reading stand as its own mark, which is what `DESIGN.md`'s
  symbol table implies. Both of the last two are rendered in this session's screenshots.
