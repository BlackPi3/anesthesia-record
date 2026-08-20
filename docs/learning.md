# Learning log

What was new, what was surprising, what was first done wrong. Kept alongside the decisions log:
that one records *what* was decided, this one records what I understood along the way.

---

## 2026-08-11 — TypeScript concepts used in the data model

**Discriminated union.** A type that is one of several shapes, where one shared field holds a
literal value that says which shape it is. `Entry` is `VitalEntry | BolusEntry | InfusionEntry |
PhaseEventEntry`, and each carries a `type` field with a fixed string.

The payoff is narrowing: after `if (entry.type === 'vital')`, TypeScript knows inside that block
that `entry` is a `VitalEntry`, so `entry.value` is allowed and `entry.dose` is a compile error.
Without the union I would have written one wide type with optional fields, and every access would
have to be guarded at runtime instead.

**`Pick<T, K>`.** Builds a type from named fields of another type. A revision stores the entry's
values as they were before a correction, so `Revision<Pick<VitalEntry, 'at' | 'value'>>` says
exactly that without restating the field types. If `VitalEntry.value` ever changes type, the
revision type follows automatically.

**Generic interface.** `Revision<TFields>` is a container parameterised by what it holds, the same
way `Array<T>` is. Each entry type fills in its own correctable fields.

**`satisfies`.** `{...} satisfies AnesthesiaCase` checks the object against the type without
widening it to that type, so the literal keeps its precise inferred shape and still gets checked.
`as AnesthesiaCase` would only assert, silencing real errors.

**Result unions instead of exceptions.** `loadCase()` returns `{status: 'empty'} | {status:
'loaded', ...} | {status: 'error', ...}`. Same narrowing mechanism as the entry union, applied to
control flow: the caller cannot read `result.case` without first checking `result.status`, so the
empty and error paths cannot be forgotten. This is worth remembering as a pattern, not just a
detail of this file.

**Type guard (`value is T`).** `isCase(value: unknown): value is AnesthesiaCase` returns a boolean,
but the return type tells the compiler that a `true` result means the value has that type. It is
how data arriving from outside the program (parsed JSON) gets back into the type system.

---

## 2026-08-11 — Two things about the coordinate maths

**The SVG y-axis inversion is not a special case.** Screen y grows downward, values grow upward,
so a high SpO₂ has to land near the top of the lane. The obvious way to write that is to subtract
from the height somewhere, and then remember to do it in every place that touches y. The better
way is to build the value scale with its pixel range written descending, `[bottom, top]`. The
same linear formula then produces the flip on its own, and no other code has to know about it.

Worth remembering as a general shape: when a rule has to be applied everywhere, look for the one
place it can be expressed instead.

**Floating point leaks into stored data if you let it.** `Math.round(36.35 / 0.1) * 0.1` is
`36.400000000000006`. That value would go straight into local storage and onto the screen. Snapping
therefore rounds and then trims to the decimals the step implies. This is not a display concern
that can be fixed at render time; the wrong number would be the one that got saved.

**Why these functions have no React in them.** `scales.ts` is plain functions, and the tests call
them directly with numbers. Coordinate maths is the code most likely to look correct and be wrong,
and testing it through a rendered component would mean simulating pointer events to check
arithmetic. Keeping the maths separate from the drawing makes the risky part directly testable —
21 tests, no DOM.

---

## 2026-08-12 — Two bugs that only exist in React, and one only tests could catch

**Side effects do not belong in a state updater.** The first version of `useCase` wrote to local
storage inside `setRecord(current => …)`. React calls those updater functions **twice** in
development, deliberately, to expose exactly this: the write would have happened twice per
correction. The updater's only job is to compute the next state from the previous one. Anything
with a consequence outside React belongs in the event handler around it.

The fix also removed the reason the updater was needed: the caller already holds the current
case, so the comparison can happen in the handler, and the whole thing became simpler.

**Pointer capture.** Without `setPointerCapture`, a drag that leaves the lane stops receiving
events and the point freezes mid-correction, with the pointer still down. One call routes every
later event for that pointer to the element that captured it. This is not discoverable by
reading; it is discoverable by dragging off the edge and watching the point stick.

**A test can pass and prove nothing.** The reload test used `page.addInitScript(() =>
localStorage.clear())` in `beforeEach`. That script runs on *every* navigation, including
`page.reload()` — so the test cleared storage, reloaded, watched the app seed a fresh demo case,
saw the patient name and passed. It would have passed with persistence entirely broken. It only
surfaced when a correction test reloaded and found its change gone.

The lesson is about the assertion, not the API: "the screen still looks right" is not evidence of
persistence, because a re-seeded case looks identical. The test now compares the stored `savedAt`
across the reload, which differs if the case was thrown away and rebuilt. **When writing a test,
ask what would still make it pass if the feature were deleted.**

---

## 2026-08-16 — A bug that only appears when the calendar moves

The entry flow defaults its timestamp to "now". That was correct when written and wrong four days
later, and nothing in the code changed in between.

The demo case is pinned to 12.08. `Date.now()` on 16.08 is a time four days after everything in
the record, so the first entry created would have pushed `caseTimeWindow` out to reach it and
squashed the entire case into the left few pixels of the axis. Not a crash, no failing test — just
a chart that quietly stopped being readable, and only for someone running the app on a later date
than the one it was written on.

The lesson is about the shape of the bug rather than the fix: **`Date.now()` is an input, and code
that reads it has a hidden dependency on when it runs.** The fix, `caseNow`, takes `now` as a
parameter with a default, which is the same thing `mutations.ts` already does for the audit trail
and for the same reason — a value the test can pin is a value that cannot drift.

Caught by opening the app and looking at it, not by a test. It joins the four layout defects as
evidence for the same rule.

## 2026-08-16 — A test that failed for a reason that was not a bug

The end-to-end test that creates a value and then drags it on the chart failed: the drag changed
nothing. The coordinate maths was fine, the drag handler was fine.

The drawer's mask is still over the chart for the length of its close animation. The test clicked
"Übernehmen" and started dragging immediately, so the pointer landed on the mask instead of the
lane. Waiting for the dialog to be hidden fixed it.

Worth keeping for two reasons. First, "the test fails" and "the app is broken" are different
claims, and the gap between them is where a lot of time goes. Second, the fix belongs in the test
rather than the app: a close animation is normal, and removing it to make a test pass would be
letting the test design the product.

## 2026-08-16 — The defect was in a CSS property, and the fix was not

`.timeline svg { touch-action: none }` was one line, added for a real reason: without it the
browser claims a drag as a scroll and correction never works on touch. It was applied to the whole
lane rather than to the act of dragging, which meant the browser handed *every* touch to the app.
On an iPad, where a swipe over the timeline is how the page is scrolled, that turned an ordinary
scroll into a silent correction.

Three things worth keeping from it.

**A property that is right during a gesture can be wrong before one starts.** The mistake was not
the value, it was the duration: `none` was correct while dragging and wrong the rest of the time.
Asking "when should this be true?" rather than "should this be true?" would have caught it.

**`touch-action` is not live.** The obvious fix is to default to `pan-y` and switch to `none` once
the point is grabbed. It does not work: the browser settles `touch-action` when the touch begins,
so changing it mid-gesture has no effect on the gesture in flight. The thing that does reclaim a
gesture is `preventDefault()` on `touchmove`. The CSS change is still right, it is just not
sufficient on its own, and expecting it to be would have produced a fix that looked correct and
failed on the device.

**React attaches touch listeners passively.** `onTouchMove` as a JSX prop cannot cancel a scroll:
React registers `touchmove` at the root as a passive listener, where `preventDefault()` is ignored
outright. The listener has to be added with `addEventListener(..., { passive: false })` on the
element itself. This is the first place in this build where a JSX event prop was not enough, and
the reason is a browser performance default, not a React one.

Also worth noting: `event.currentTarget` is null by the time a `setTimeout` callback runs, because
React clears it after dispatch. The hold path reads the element through a ref instead.

---

## 2026-08-16 — In SVG, the last thing drawn is the thing you click

The medication and event bands got invisible `<rect>` targets so a row could be tapped to edit it.
They were rendered first in each row, before the drug name, the bar and the dose. Clicking a bolus
worked. Clicking an infusion did nothing at all.

SVG has no `z-index`: elements paint in document order, later on top of earlier. The infusion's bar
is drawn after the target, so it sat over it and received every click. A bolus dot is small enough
that the click usually landed on bare target instead, which is why half the band appeared to work
and made the cause harder to see, not easier.

Moving the target to the end of the row fixed it. The general lesson is that in SVG, stacking and
hit-testing are the same question and both are answered by document order — so "an invisible layer
over the row" has to be literally last, not merely conceptually on top.

Found by clicking, not by reading. The handler, the coordinates and the `role="button"` were all
correct, and nothing about the source suggested a problem.

## 2026-08-16 — A component that mounts fresh needs no effect to stay in sync

The edit sheet has to show the entry that was tapped. The obvious way is one long-lived sheet with
`useEffect` copying the selected entry into a draft whenever it changes. That is the pattern that
ends up showing one entry's values under another entry's name, because there is a render between
the prop changing and the effect running.

The sheet is instead rendered only while something is being edited, and keyed on that entry's id.
Changing the key unmounts one sheet and mounts another, so the draft comes from
`useState(() => draftFrom(entry))` and there is no window in which the two disagree. **Remounting
is state synchronisation, done by React rather than by hand.**

The related habit: the entry being edited is held in `App` as an **id, not an object**. A
correction produces a whole new case, so a stored entry object would be the pre-edit version within
one keystroke. Looking it up by id each render is one line and cannot go stale.

---

## 2026-08-16 — A button inside a surface that handles its own presses

The readout is a button drawn inside the lane's `<svg>`, and the lane answers `pointerdown` by
hit-testing for a point. A press on the readout arrives at both. The lane finds no point under the
box, clears the selection, and React unmounts the readout — before the browser has finished the
click it was going to deliver to it. The button would have been unpressable, and nothing in either
handler would have looked wrong.

**A click is two events with a gap in between, and anything that unmounts the target in that gap
cancels it.** The lane now checks whether the press landed inside `[data-readout]` and leaves it
alone. `event.target` is the deepest element hit; `event.currentTarget` is the element whose handler
is running — the distinction is the whole fix.

The same collision on the keyboard, with the opposite answer: `Enter` on the readout bubbles to the
lane, which also opens the sheet, so the readout stops it. The arrow keys deliberately keep
bubbling, because adjusting the point while focus sits on its readout is the useful behaviour.

---

## 2026-08-16 — Immutable state makes undo nearly free

Parham's observation, and it was right against the agent's first answer, which called a real undo
"a history stack, more work" and recommended a disappearing toast instead.

The reasoning: `correctVital`, `addBolus` and the rest never modify the case they are given. They
build a new one and return it, and `useCase` swaps the whole thing. So at the moment of any change
there are two complete cases in memory, and the older one is not a copy or a reconstruction — it is
the exact object the app was rendering a moment ago. Undo is a list of those and a pop.

**The general lesson: what state is allowed to do decides what features are cheap.** Had the
mutations edited entries in place, undo would have meant an inverse operation for every mutation,
each able to drift out of step with the forward one. Nothing about the undo feature was planned for
when that rule was set on 07.08; it fell out of it.

Worth noticing where the cost went instead: memory, and a decision about what the audit trail should
say. Neither is nothing, but both are smaller than the code that was avoided.

**A trap avoided on the way**, and the same one already recorded above: the first draft of `undo`
read the previous case inside a `setPast` updater and wrote to storage from in there. Updaters must
be pure, and React runs them twice in development to say so. Reading the value from the closure and
writing plainly outside is both shorter and correct.

---

## 2026-08-16 — The suite ran green on WebKit the first time, and that is information

Adding a WebKit project was expected to find something. Thirty-nine tests passed on the first run,
including the entry sheet, the undo shortcut and the pointer path.

That is worth reading correctly rather than as luck. Nothing in the app is written against a
browser: the chart is SVG with coordinates computed in the app's own code, persistence is
`localStorage`, and every gesture goes through pointer events, which is the one input API all three
of mouse, stylus and touch share. **Code that targets the platform instead of a browser tends to
port for free**; the places that would not have are the places where a browser was assumed.

What this does **not** cover: the hold-to-grab path. Those tests drive real touch gestures through
the Chrome DevTools Protocol and are Chromium-only, so they are excluded from the WebKit project.
Synthetic touch events do not cause real scrolling, so no cross-browser test can tell a page that
scrolled from one that did not. That gap is honest and stays named in the README.

---

## 2026-08-16 — Layout that must not collide is a search, not an offset

Writing every value next to its point looked like arithmetic: put the number seven pixels above the
marker. It is not, and the two things that break it are the two things this chart is made of. A
blood pressure measurement is three values on one timestamp, eleven to twenty-one pixels apart on a
lane a hundred pixels tall, so "above" is the same place three times. A dense series puts
neighbouring points closer together than their labels are wide, so "above" is also the neighbour's
place.

What replaced it: each label has eight candidate positions in preference order, and takes the first
that overlaps nothing already placed and stays inside the lane. Where nothing is free it takes the
position with the smallest overlap rather than being dropped — **in a clinical record a number drawn
over a gridline is a worse-looking number, and a number silently omitted is a missing measurement.**
Those are not the same kind of failure and the code should not treat them as one.

Two general points worth keeping:

- **It went in `labels.ts`, not in the component**, for the same reason `scales.ts` exists: it is
  geometry, it has no React in it, and twelve tests can state exactly what it promises ("no two
  labels of one measurement overlap") in numbers. Placement bugs are invisible when read and obvious
  when measured.
- **Greedy first-fit is enough here.** A real optimiser would place all fifty-one labels at once and
  minimise total overlap. Left to right, first fit, has a property that matters more: correcting one
  point cannot reshuffle the labels of the points before it, so the lane reads the same way after an
  edit as it did before it.

---

## 2026-08-16 — A ref is what the next event needs to know

A drag that clamps at the top of the axis ends with the pointer far above the point it just
corrected. The release therefore lands on empty chart — and empty chart had just been given a
meaning: a click there asks for the numbers. So finishing a correction switched the chart into
reading mode, every time the value hit the top of its scale.

The fix is one line of bookkeeping: the lane remembers that this gesture moved a point, and the
click that follows checks it and clears it. What is worth remembering is why it is a `useRef` and
not `useState`:

- **It must not cause a render.** Nothing on screen depends on it.
- **It must be readable in the very next event, synchronously.** A state update is not visible to
  the handler that scheduled it; a ref is written and read immediately.

**State is for what the screen shows. A ref is for what the next event needs to know.** That is the
whole distinction, and this is a cleaner example of it than the hold timer, which needed a ref for
the more obvious reason that a timer has to be cancellable.

The larger point about this chart: one surface now answers four gestures — press a point to select,
hold and drag to correct, press the readout to open the sheet, press nothing to switch how the
chart reads. **Each one is defined by how it ends, not by how it begins**, which is why they can
share a surface at all, and why every one of them needed an explicit rule about what the other three
must not do.

---

## 2026-08-17 — A controlled component may keep state, if it is not the value

The rule so far has been that the entry field keeps nothing: the parent owns the number and the
field renders what it is given, which is what lets one control serve entry and correction without
two copies drifting apart. The keypad appears to break it — `ValueField` now has a `useState`.

It does not, because what it keeps is not the value. `36,` is a legal thing to have typed and is not
a number; `97` on the way to `975` is a different thing from the number 97; and after deleting every
digit there is nothing at all to render, though the draft still has to hold something. So the field
keeps the **digits as a string** and the parent keeps the **number they parse to**, and every
keypress reports the parsed number upward. `null` means nothing has been typed yet and the readout
is showing the parent's value — which is exactly what makes the first digit replace the opening
number rather than append to it.

**The test for whether local state is legitimate in a controlled component: could the parent
reconstruct it?** From the number 36 you cannot tell whether the user typed `36` or `36,`. That is
state the parent cannot hold, so it belongs to the field. The moment it *is* derivable — the value,
the formatted text, whether the number is in range — it goes back to being computed, not stored.

The same reasoning put the typing rules in `digits.ts` rather than in the component: they are string
and number work with no rendering in them, so they are tested the way the timeline's coordinate
maths is, with inputs and expected outputs rather than through a rendered sheet.

---

## 2026-08-17 — `autoFocus` is not a general HTML attribute in practice

The sheet was supposed to focus its readout on open so a desktop user types straight into it.
`autoFocus` was set on the readout `<div role="spinbutton" tabIndex={0}>`, the tests passed, and the
feature did not work — the first digit typed went nowhere, and the failure was invisible because the
value simply stayed where it was.

`document.activeElement` was the trigger button, in both sheets. React only performs the focus for
form controls, and the HTML `autofocus` attribute is processed once per document, so an element
inserted later is generally ignored. **A prop that is silently a no-op on the element you put it on
is worse than one that errors**, and only measuring where focus actually went revealed it.

The fix is a `useEffect` with a ref, which is honest about what it is: focusing is a DOM side effect,
not a description of the rendered output. It also has to be arranged with whatever else claims
focus — AntD's `Drawer` focuses its own panel on open, so the sheets now pass `autoFocus={false}`
where a field will take it, and keep it where there is nothing to hand it to (the picker step, and a
milestone, which has no value to type). Otherwise the drawer would win the race and `Escape` would
have nothing to close.

**The general lesson is the checking, not the fact.** Two tests were green over a broken feature,
because they exercised the keypad buttons rather than the keyboard. The assertion that caught it was
a direct one: read `document.activeElement` and see what it says.

---

## 2026-08-20 — Narrowing an axis is a change to what the chart can say

Three of the four lanes plotted over 90% empty: saturation spanned 70–100 and used 97–100,
temperature spanned 34–40 and used 36,2–36,6. The page read as four boxes of grid with a flat line
in each, and the fix looked like editing four pairs of numbers.

It was not, because **a wide axis was hiding a decision nobody had made**. At 70–100 no saturation
this app can record falls off the lane, so "what does a value outside the axis look like" had never
come up. At 94–100 it comes up on the first desaturation — the single reading the lane most exists
to show. The drawing code mapped value to pixel with no clamp, and each lane is its own `<svg>`,
which clips: the point would not have been drawn wrong, it would have been *absent*, with no error
and nothing failing. So the narrowing had to bring the off-scale case with it — clamp the drawn
`y`, keep the real number, and mark the point as resting on the edge rather than measured there.

Two correction paths had the same shape of bug hiding in them. `pointerToMeasurement` clamps to the
axis, so dragging an off-scale point sideways to fix its time would have quietly rewritten 88 to
94; and the arrow keys clamped to the axis too, so one press on an off-scale point snapped it
inside. The arrow keys now bound to `inputRange` — **what the metric can be, not what the lane
happens to draw** — and a drag on an off-scale point moves it in time only.

Choosing the ranges had one constraint worth writing down: the lane labels its floor, midpoint and
ceiling, so a band whose midpoint is not round draws a gridline somewhere other than where its own
label says it is. Picking 94–100, 40–140 and 35,0–38,0 satisfies that with no new code, which is
why there is no tick configuration anywhere — **the constraint was cheaper to satisfy than to
implement.** It is asserted in `scales.test.ts` so the next edit to a range cannot quietly break it.

That same test run caught something pre-existing: the diastolic `plotRange` is 40–220 while its
`inputRange` stops at 200. Not a bug — the three pressures share one axis and the diastolic simply
never occupies the top of it — but it did prove the invariant belonged to the lane rather than to
the kind. **An assertion that fails on correct code is still telling you something**, and here it
was that the property had been stated about the wrong object.

---

## 2026-08-20 — Float noise was deciding where every label went

Adding the current-value rail took 136px off the plot, which pushed the labels of the „Zahlen
anzeigen“ mode close enough together on an iPad that two of them overlapped. That is a real
promise broken — `values.spec.ts` asserts that no two numbers are written over each other — so the
obvious reading was that the rail costs too much width and the answer was to make it narrower.

That reading was wrong, and measuring said so. Logging the cost of all eight candidate positions
for every label showed this, for a label with nothing anywhere near it:

```
costs [544, 5.1e-13, 72, 94, 544, 594, -2.6e-12, 37]  chose 6
```

Three of those positions are free. The first of them — index 1, directly under the point — scores
`+5.1e-13`; index 6, off to the right, scores `−2.6e-12`. `placeValueLabels` stops at the first
candidate scoring **exactly** zero and otherwise keeps the strictly cheapest, so neither branch
did what it was written to do: the break never fired, and the comparison was decided by which way
a float happened to round. The preference order — the whole reason a series of labels shares one
row — had not been applying at all.

The noise comes from `cost`, which computes `box.width * box.height - overlapArea(box, bounds)`.
For a box entirely inside the lane those two are the same rectangle measured two ways, and
`overlapArea` gets its width as `min(a.x + a.width, b.x + b.width) - max(a.x, b.x)` — a subtraction
of two large fractional coordinates, where `(186.3 + 28) - 186.3` is not 28. On whole pixels it is
exact, which is why every unit test passed: `labels.test.ts` placed its points at 200, 280, 360.
**The tests were written in the one arithmetic where the bug cannot happen.** The fix is to treat
anything under one square pixel as free — a physical threshold, not a float epsilon, because a
label hiding less than a square pixel of something is hiding no digit of it.

Three things worth keeping:

- **The first plausible cause was the change I had just made.** The rail did make the symptom
  visible, and stopping there would have produced a narrower rail, a still-broken placer, and a
  test that passed for the wrong reason.
- **A green test proved nothing, again, and for a new reason.** Not because it would pass with the
  feature deleted, but because its inputs were rounder than any input the app produces. The
  regression test now places one label at `x = 242.15`, which was found by searching for a
  coordinate whose noise flips the comparison; it fails without the fix.
- **`===` against a float is a bug even when it looks like a shortcut.** `if (bestCost === 0)
  break` reads as an optimisation. It was load-bearing: without it the search has no notion of
  "good enough", and every free position competes on noise.

Desktop was never asserted on and looked fine, but it had the same defect — the heart rate labels
alternated above and below the trace for no reason. They sit on one row now.

---

---

## 2026-08-20 — `document.fonts.check` was answering a different question

The typography tests assert that the app serves its own faces rather than borrowing the platform's.
The obvious way to ask is `document.fonts.check('600 13px "IBM Plex Mono"')`, and it returned
`false` on all three projects while nine sibling assertions passed.

Nothing was broken. `check` asks *is this already downloaded*, and a browser does not download a
weight nothing on screen is set in. Mono 600 is the entry sheet's 56px value and the chart's value
labels — one lives behind a drawer and the other behind a toggle, so on the first screen the weight
is declared and correctly unfetched. The test was reading a browser being efficient as a missing
font.

`document.fonts.load(spec, text)` is the question that was meant: it fetches what matches and
resolves with the faces it matched. An empty array means the app never declared that weight; a
rejection means it declared a file it cannot serve. Both are real failures, and neither depends on
what happens to be painted when the test runs.

The general shape: **an API that returns `false` is not always saying no to the question you
asked.** `check` and `load` differ by tense, and the failing assertion looked exactly like a broken
`@font-face` — a wrong hypothesis that would have survived a while, because the first thing anyone
does with it is go and re-read the font declarations, which were fine.

---

## 2026-08-20 — A test can pass because the fallback is as good as the font

`tests/typography.spec.ts` was checked by breaking the app three ways before being trusted, which
is the rule in `CLAUDE.md` about asking what would still pass if the feature were deleted. Two of
the three sabotages behaved as expected. The third did not: deleting the `@font-face` declarations
left "a value label is as wide as the geometry says it is" **passing**.

Two reasons, both worth keeping in mind.

`getComputedStyle(el).fontFamily` returns the stack that was *declared*, not the face that drew the
glyphs. There is no DOM API that names the font actually used, so an assertion on computed style
can only prove that a CSS rule reached an element.

And the fallback is `ui-monospace`, which on macOS is SF Mono, which also advances 0.6 em. The
arithmetic the test checks was still correct — because the property it depends on is *monospace*,
not *Plex*.

That is not a hole once it is named. The width test proves the geometry matches whatever face is
drawing, which is the property layout depends on; the loading test proves the face is Plex and is
served from here. Written into the spec's own header so it is not read as promising the other
thing. **The value of a sabotage is not that the test failed — it is finding out precisely which
claim each test is making.**


## Open questions to revisit

- German terminology in `src/domain/catalog.ts`: `RR` (Riva-Rocci) is the conventional
  abbreviation for blood pressure on a protocol, but some newer German documentation writes
  `NIBP`. House style to confirm. The mean was first written as `Blutdruck Mitteldruck`, which is
  redundant and not what the value is called — corrected to *mittlerer arterieller Druck* (`MAD`).
