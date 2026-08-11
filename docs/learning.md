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

## Open questions to revisit

- German terminology in `src/domain/catalog.ts`: `RR` (Riva-Rocci) is the conventional
  abbreviation for blood pressure on a protocol, but some newer German documentation writes
  `NIBP`. House style to confirm. The mean was first written as `Blutdruck Mitteldruck`, which is
  redundant and not what the value is called — corrected to *mittlerer arterieller Druck* (`MAD`).
