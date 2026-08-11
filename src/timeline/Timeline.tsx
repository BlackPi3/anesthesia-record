/**
 * The timeline: one lane per vital parameter over a shared time axis, with medications and
 * phase events in a band beneath.
 *
 * Each lane is its own `<svg>` rather than one large one. Lanes already own their value scale, so
 * giving each its own coordinate space means a pointer position inside a lane needs no offset
 * arithmetic to become a measurement — which is the mapping this component exists to get right.
 * The lanes stay visually aligned because they share the same gutter widths and time window.
 *
 * Phase events are drawn as dashed rules through every lane, so the vitals at incision can be
 * read without leaving the entry layout. That is the cheap half of the merged reading view
 * deferred in docs/decisions.md.
 *
 * This renders the record. Pointer entry and correction are wired in next; the scales the
 * interaction needs are already built here.
 */

import { Fragment } from 'react'

import {
  GRID_INTERVAL_MS,
  LANES,
  PHASE_EVENTS,
  VITALS,
  laneRange,
  laneUnit,
} from '../domain/catalog'
import { medications, phaseEvents, vitalSeries } from '../domain/entries'
import type { AnesthesiaCase, PhaseEventEntry, VitalKind } from '../domain/types'
import type { LaneDef } from '../domain/catalog'
import { formatTime, formatNumber } from '../format'
import { chart, laneColor } from '../theme'
import { useElementWidth } from '../useElementWidth'
import { createLaneScales, caseTimeWindow, gridTimes, type TimeWindow } from './scales'

/**
 * Width of the left gutter holding lane labels and axis values. Sized so the longest German lane
 * name ("Sauerstoffsättigung") clears the axis numbers rather than printing over them.
 */
const GUTTER = 168
const RIGHT_PAD = 24
/** Vertical inset inside a lane, so a value at the axis limit is not clipped by the edge. */
const LANE_INSET = 12
const LANE_BASE_HEIGHT = 92
const AXIS_HEIGHT = 30
const MED_ROW_HEIGHT = 26
const EVENT_ROW_HEIGHT = 34

// ---------------------------------------------------------------------------

export function Timeline({ record }: { record: AnesthesiaCase }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const window = caseTimeWindow(record)
  const events = phaseEvents(record)

  return (
    <div ref={ref} className="timeline">
      {width > GUTTER + RIGHT_PAD + 80 && (
        <>
          <TimeAxis width={width} window={window} />
          {LANES.map((lane) => (
            <VitalLane
              key={lane.id}
              lane={lane}
              width={width}
              window={window}
              record={record}
              events={events}
            />
          ))}
          <MedicationBand width={width} window={window} record={record} />
          <EventBand width={width} window={window} events={events} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Gridline times, and how often to label them so the axis stays readable when narrow. */
function useAxisTicks(window: TimeWindow, width: number) {
  const times = gridTimes(window.from, window.to)
  const plotWidth = width - GUTTER - RIGHT_PAD
  // A time label needs roughly 46px to stand clear of its neighbour.
  const every = Math.max(1, Math.ceil((times.length * 46) / Math.max(plotWidth, 1)))
  return { times, labelEvery: every }
}

function TimeAxis({ width, window }: { width: number; window: TimeWindow }) {
  const { times, labelEvery } = useAxisTicks(window, width)
  const scale = createLaneScales(
    { left: GUTTER, right: width - RIGHT_PAD, top: 0, bottom: 0 },
    window,
    [0, 1],
  ).time

  return (
    <svg
      width={width}
      height={AXIS_HEIGHT}
      role="img"
      aria-label={`Zeitachse von ${formatTime(window.from)} bis ${formatTime(window.to)}`}
    >
      <text x={0} y={AXIS_HEIGHT - 9} fill={chart.secondaryInk} fontSize={12} fontWeight={500}>
        Uhrzeit
      </text>
      {times.map((time, index) => {
        const x = scale.map(time)
        const labelled = index % labelEvery === 0
        return (
          <Fragment key={time}>
            <line
              x1={x}
              x2={x}
              y1={AXIS_HEIGHT - 6}
              y2={AXIS_HEIGHT}
              stroke={labelled ? chart.axis : chart.grid}
              strokeWidth={1}
            />
            {labelled && (
              <text
                x={x}
                y={AXIS_HEIGHT - 11}
                fill={chart.mutedInk}
                fontSize={12}
                textAnchor="middle"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatTime(time)}
              </text>
            )}
          </Fragment>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------

interface LaneProps {
  lane: LaneDef
  width: number
  window: TimeWindow
  record: AnesthesiaCase
  events: PhaseEventEntry[]
}

function VitalLane({ lane, width, window, record, events }: LaneProps) {
  const height = Math.round(LANE_BASE_HEIGHT * lane.weight)
  const area = {
    left: GUTTER,
    right: width - RIGHT_PAD,
    top: LANE_INSET,
    bottom: height - LANE_INSET,
  }
  const domain = laneRange(lane)
  const scales = createLaneScales(area, window, domain)
  const color = laneColor[lane.id]

  const [min, max] = domain
  const valueTicks = [min, (min + max) / 2, max]
  const grid = gridTimes(window.from, window.to)

  return (
    <svg
      width={width}
      height={height}
      className="timeline__lane"
      role="img"
      aria-label={`${lane.label}, Achse von ${min} bis ${max} ${laneUnit(lane)}`}
    >
      {/* Value gridlines, recessive: they orient, they are not data. */}
      {valueTicks.map((value) => (
        <line
          key={value}
          x1={area.left}
          x2={area.right}
          y1={scales.value.map(value)}
          y2={scales.value.map(value)}
          stroke={chart.grid}
          strokeWidth={1}
        />
      ))}

      {/* Five-minute reference grid. */}
      {grid.map((time) => (
        <line
          key={time}
          x1={scales.time.map(time)}
          x2={scales.time.map(time)}
          y1={area.top}
          y2={area.bottom}
          stroke={chart.grid}
          strokeWidth={time % (GRID_INTERVAL_MS * 6) === 0 ? 1 : 0.5}
        />
      ))}

      {/* Phase events, carried through every lane so correlations stay readable in place. */}
      {events.map((event) => (
        <line
          key={event.id}
          x1={scales.time.map(event.at)}
          x2={scales.time.map(event.at)}
          y1={area.top}
          y2={area.bottom}
          stroke={chart.axis}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}

      <text x={0} y={20} fill={chart.ink} fontSize={12} fontWeight={600}>
        {lane.label}
      </text>
      <text x={0} y={35} fill={chart.mutedInk} fontSize={11}>
        {laneUnit(lane)}
      </text>

      {valueTicks.map((value) => (
        <text
          key={value}
          x={GUTTER - 8}
          y={scales.value.map(value) + 4}
          fill={chart.mutedInk}
          fontSize={11}
          textAnchor="end"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatNumber(value, VITALS[lane.vitals[0]].decimals)}
        </text>
      ))}

      {lane.id === 'bloodPressure' && (
        <BloodPressureConnectors record={record} scales={scales} color={color} />
      )}

      {lane.vitals.map((kind) => (
        <Series key={kind} kind={kind} record={record} scales={scales} color={color} />
      ))}

      <line
        x1={area.left}
        x2={area.right}
        y1={height - 0.5}
        y2={height - 0.5}
        stroke={chart.grid}
        strokeWidth={1}
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------

type Scales = ReturnType<typeof createLaneScales>

/**
 * One vital's points, joined in time order.
 *
 * The marker shape carries which of the three pressures a point is, following the paper protocol:
 * systolic points up, diastolic points down, the mean is a dot. That leaves hue free to mean
 * "which lane", and keeps the three readable for anyone who cannot separate them by colour.
 */
function Series({
  kind,
  record,
  scales,
  color,
}: {
  kind: VitalKind
  record: AnesthesiaCase
  scales: Scales
  color: string
}) {
  const points = vitalSeries(record, kind).map((entry) => ({
    id: entry.id,
    x: scales.time.map(entry.at),
    y: scales.value.map(entry.value),
  }))

  if (points.length === 0) return null

  return (
    <g>
      {points.length > 1 && (
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {points.map((point) => (
        <Marker key={point.id} kind={kind} x={point.x} y={point.y} color={color} />
      ))}
    </g>
  )
}

/** A 2px ring in the surface colour keeps overlapping points from merging into one blob. */
function Marker({
  kind,
  x,
  y,
  color,
}: {
  kind: VitalKind
  x: number
  y: number
  color: string
}) {
  const shared = { fill: color, stroke: chart.surface, strokeWidth: 2 }

  if (kind === 'bloodPressureSystolic') {
    return <path d={`M ${x} ${y - 6} L ${x + 5.5} ${y + 4} L ${x - 5.5} ${y + 4} Z`} {...shared} />
  }
  if (kind === 'bloodPressureDiastolic') {
    return <path d={`M ${x} ${y + 6} L ${x + 5.5} ${y - 4} L ${x - 5.5} ${y - 4} Z`} {...shared} />
  }
  return <circle cx={x} cy={y} r={4.5} {...shared} />
}

/** The vertical stroke joining systolic to diastolic, as drawn on a paper protocol. */
function BloodPressureConnectors({
  record,
  scales,
  color,
}: {
  record: AnesthesiaCase
  scales: Scales
  color: string
}) {
  const systolic = vitalSeries(record, 'bloodPressureSystolic')
  const diastolic = new Map(
    vitalSeries(record, 'bloodPressureDiastolic').map((entry) => [entry.at, entry.value]),
  )

  return (
    <g>
      {systolic.map((entry) => {
        const low = diastolic.get(entry.at)
        if (low === undefined) return null
        const x = scales.time.map(entry.at)
        return (
          <line
            key={entry.id}
            x1={x}
            x2={x}
            y1={scales.value.map(entry.value)}
            y2={scales.value.map(low)}
            stroke={color}
            strokeWidth={2}
            opacity={0.55}
          />
        )
      })}
    </g>
  )
}

// ---------------------------------------------------------------------------

function MedicationBand({
  width,
  window,
  record,
}: {
  width: number
  window: TimeWindow
  record: AnesthesiaCase
}) {
  const rows = medications(record)
  if (rows.length === 0) return null

  const height = rows.length * MED_ROW_HEIGHT + 28
  const scale = createLaneScales(
    { left: GUTTER, right: width - RIGHT_PAD, top: 0, bottom: 0 },
    window,
    [0, 1],
  ).time

  return (
    <svg
      width={width}
      height={height}
      className="timeline__band"
      role="img"
      aria-label="Medikamente und Infusionen"
    >
      <text x={0} y={18} fill={chart.ink} fontSize={13} fontWeight={600}>
        Medikamente
      </text>

      {rows.map((entry, index) => {
        const y = 28 + index * MED_ROW_HEIGHT + MED_ROW_HEIGHT / 2
        // The drug goes in the gutter, where every row aligns; the dose rides beside its own
        // mark. Putting both in the gutter is what clipped the longer names.
        const dose =
          entry.type === 'bolus'
            ? `${formatNumber(entry.dose)} ${entry.unit}`
            : `${formatNumber(entry.rate, entry.rate < 1 ? 1 : 0)} ${entry.unit}`

        const start = scale.map(entry.type === 'bolus' ? entry.at : entry.startedAt)
        const end =
          entry.type === 'bolus'
            ? start
            : Math.max(scale.map(entry.endedAt ?? window.to), start + 4)
        // Flip the dose to the left of the mark when it would run off the right edge.
        const flip = end + 90 > width - RIGHT_PAD

        return (
          <Fragment key={entry.id}>
            <text
              x={GUTTER - 8}
              y={y + 4}
              fill={chart.secondaryInk}
              fontSize={12}
              textAnchor="end"
            >
              {entry.drug}
            </text>

            {entry.type === 'bolus' ? (
              <circle
                cx={start}
                cy={y}
                r={5}
                fill={chart.secondaryInk}
                stroke={chart.surface}
                strokeWidth={2}
              />
            ) : (
              <rect
                x={start}
                y={y - 6}
                width={end - start}
                height={12}
                rx={4}
                fill={chart.secondaryInk}
                opacity={0.75}
              />
            )}

            <text
              x={flip ? start - 10 : end + 10}
              y={y + 4}
              fill={chart.mutedInk}
              fontSize={11}
              textAnchor={flip ? 'end' : 'start'}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {dose}
            </text>
          </Fragment>
        )
      })}
    </svg>
  )
}

/**
 * Phase events. Labels alternate between two rows so neighbouring milestones do not overlap when
 * a case is short and the axis is dense.
 */
function EventBand({
  width,
  window,
  events,
}: {
  width: number
  window: TimeWindow
  events: PhaseEventEntry[]
}) {
  if (events.length === 0) return null

  const height = 24 + EVENT_ROW_HEIGHT * 2
  const scale = createLaneScales(
    { left: GUTTER, right: width - RIGHT_PAD, top: 0, bottom: 0 },
    window,
    [0, 1],
  ).time

  return (
    <svg width={width} height={height} className="timeline__band" role="img" aria-label="Ereignisse">
      <text x={0} y={18} fill={chart.ink} fontSize={13} fontWeight={600}>
        Ereignisse
      </text>

      {events.map((event, index) => {
        const x = scale.map(event.at)
        const row = index % 2
        const y = 30 + row * EVENT_ROW_HEIGHT
        // Milestones near the end of a case (discharge, above all) would print past the edge, so
        // their labels flip to the left of the marker.
        const flip = x + 130 > width - RIGHT_PAD
        const labelX = flip ? x - 8 : x + 8

        return (
          <Fragment key={event.id}>
            <line x1={x} x2={x} y1={24} y2={y + 8} stroke={chart.axis} strokeWidth={1} />
            <circle cx={x} cy={y + 8} r={4} fill={chart.secondaryInk} />
            <text
              x={labelX}
              y={y + 12}
              fill={chart.secondaryInk}
              fontSize={12}
              textAnchor={flip ? 'end' : 'start'}
            >
              {PHASE_EVENTS[event.event].label}
            </text>
            <text
              x={labelX}
              y={y + 25}
              fill={chart.mutedInk}
              fontSize={11}
              textAnchor={flip ? 'end' : 'start'}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTime(event.at)}
            </text>
          </Fragment>
        )
      })}
    </svg>
  )
}
