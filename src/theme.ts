/**
 * Ant Design theme and the chart palette.
 *
 * The theme is deliberate rather than default. Three things drive it:
 *
 * - **Touch targets.** Base control height is 40px and buttons are 44px, the size a fingertip
 *   reliably hits on an iPad. AntD's 32px default is a mouse-era size and is too small for a
 *   gloved hand in a hurry.
 * - **A surface that is not pure white.** Long clinical shifts are read under theatre lighting;
 *   a slightly warm off-white lowers glare without tinting the data.
 * - **A primary colour that cannot be mistaken for data.** It is taken from the deep end of the
 *   blue ramp, well below any series step, so a button never reads as a plotted value. AntD's
 *   default blue is both a consumer-product colour and close to the SpO₂ series.
 *
 * The chart palette is the validated categorical set, assigned to lanes in fixed order. Two of
 * the four (aqua, yellow) fall below 3:1 against the surface, so identity may never rest on hue:
 * every lane carries a permanent text label, which is the required relief and is also just how a
 * clinician reads a protocol.
 */

import type { ThemeConfig } from 'antd'
import type { LaneId } from './domain/catalog'

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#184f95',
    colorInfo: '#184f95',
    colorBgLayout: '#f9f9f7',
    colorBgContainer: '#fcfcfb',
    colorText: '#0b0b0b',
    colorTextSecondary: '#52514e',
    colorTextTertiary: '#898781',
    colorBorderSecondary: '#e1e0d9',
    colorSuccess: '#0ca30c',
    colorWarning: '#fab219',
    colorError: '#d03b3b',
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

/** Chart chrome and ink. Text in a chart wears these, never a series colour. */
export const chart = {
  surface: '#fcfcfb',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  ink: '#0b0b0b',
  secondaryInk: '#52514e',
  mutedInk: '#898781',
} as const

/** Categorical slots 1–4, in fixed order, one per lane. Never cycled, never reassigned by rank. */
export const laneColor: Record<LaneId, string> = {
  spo2: '#2a78d6',
  heartRate: '#eb6834',
  bloodPressure: '#1baf7a',
  temperature: '#eda100',
}
