/**
 * Ant Design theme and the chart palette.
 *
 * The palette is the six-value structure from the design specification: one ground, two greys for
 * the grid, two inks, and a single interactive accent. Everything on screen is one of those six or
 * one of the four trace colours below. There is no third grey and no second blue, which is the
 * point — a clinical display that reaches for a new colour whenever something needs emphasis ends
 * up with no colour meaning anything.
 *
 * Four things drive the rest of it:
 *
 * - **Touch targets.** Base control height is 40px and buttons are 44px, the size a fingertip
 *   reliably hits on an iPad. AntD's 32px default is a mouse-era size and is too small for a
 *   gloved hand in a hurry.
 * - **A ground that is not pure white.** Long clinical shifts are read under theatre lighting; a
 *   slightly warm off-white lowers glare without tinting the data. Page and card share it: the
 *   two used to differ by about 1.5% luminance, which is not a distinction anyone could see, and
 *   the borders were doing that work already.
 * - **An accent that cannot be mistaken for data.** `#2F4B7C` is darker and greyer than any trace,
 *   so a button never reads as a plotted value, and it is the only colour the interface uses to
 *   say "you can press this".
 * - **Alarm colours are not decoration.** Red, amber, green and cyan carry IEC 60601-1-8 priority
 *   and monitor-trace meaning, and an anesthesiologist has them hard-wired from Dräger and
 *   Philips. They are kept off the interface, which is why `colorSuccess` and `colorWarning` are
 *   bound to ink rather than left at AntD's green and amber: a stray `type="success"` then reads
 *   as a quiet fact instead of putting alarm green on a clinical display. `colorError` is the one
 *   exception and stays red, because the message it renders — the record stopped persisting — is
 *   the worst thing that can happen here, and there red carries its real meaning.
 *
 * Contrast, measured against `#FBFAF8`. The design specification asks 7:1 of anything numeric:
 * `--ink` is 17.1:1 and carries every value and dose, so the numbers clear it with room. `--ink-
 * muted` is 5.7:1 and carries axis numbers, units and secondary labels — short of 7:1, kept at the
 * specified hex, and still a real improvement on the `#898781` it replaces, which was 3.5:1 and
 * failed WCAG AA outright for text that small.
 *
 * The four trace colours are graphics rather than text, so the floor that binds them is 3:1, and
 * they run 5.95:1 (heart rate) to 7.80:1 (blood pressure). Every lane nonetheless keeps its
 * permanent text label. That is no longer a contrast concession — it is how a clinician reads a
 * protocol, and identity should not rest on hue even when the hue is legible.
 */

import type { ThemeConfig } from 'antd'
import type { LaneId } from './domain/catalog'

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#2f4b7c',
    colorInfo: '#2f4b7c',
    colorBgLayout: '#fbfaf8',
    colorBgContainer: '#fbfaf8',
    colorText: '#14181c',
    // Two inks, so AntD's third level collapses onto the second rather than inventing a grey.
    colorTextSecondary: '#5c6470',
    colorTextTertiary: '#5c6470',
    colorBorderSecondary: '#e2e0da',
    colorSuccess: '#5c6470',
    colorWarning: '#5c6470',
    colorError: '#b3261e',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSize: 15,
    borderRadius: 6,
    controlHeight: 40,
    wireframe: false,
  },
  components: {
    Button: { controlHeight: 44, fontWeight: 500 },
    Descriptions: { titleMarginBottom: 4 },
  },
}

/**
 * Chart chrome and ink, named for the tokens rather than for the job, so the code and the design
 * specification use one vocabulary. Text in a chart wears an ink, never a trace colour.
 */
export const chart = {
  paper: '#fbfaf8',
  gridMinor: '#e2e0da',
  gridMajor: '#c9c6be',
  ink: '#14181c',
  inkMuted: '#5c6470',
} as const

/**
 * One trace colour per lane, in fixed order. Never cycled, never reassigned by rank.
 *
 * Three come from the design specification. Temperature has none there — the specification has no
 * temperature band at all, and it reserves red, amber, green and cyan — so the muted violet is
 * chosen to sit as far from the alarm set as the other three do. Decided 2026-08-20.
 */
export const laneColor: Record<LaneId, string> = {
  spo2: '#185fa5',
  heartRate: '#0f6e56',
  bloodPressure: '#8c2f39',
  temperature: '#5b4b8a',
}
