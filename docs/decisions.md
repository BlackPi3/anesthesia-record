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

## Open decisions (not yet made)

- **Value-selection control**: scrollable/rotatable "wheel" vs. a plain tappable list of values.
  Both keep the same "+", pick metric, pick value flow — differ in how the value step feels and
  how precise it is.
- **Desktop/mouse input mapping** for the value control: click-drag, scroll wheel, and/or
  keyboard arrows all proposed, not yet finalized in detail.
- **Precision fallback**: how to guarantee landing an exact number (e.g. large live numeric
  readout while scrubbing, or direct numeric entry) when scrubbing/swiping alone isn't precise
  enough.
- **NiBP grouped rendering** on the timeline (see above).
