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

## Open questions to revisit

- German terminology in `src/domain/catalog.ts`: `RR` (Riva-Rocci) is the conventional
  abbreviation for blood pressure on a protocol, but some newer German documentation writes
  `NIBP`. House style to confirm. The mean was first written as `Blutdruck Mitteldruck`, which is
  redundant and not what the value is called — corrected to *mittlerer arterieller Druck* (`MAD`).
