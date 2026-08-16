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
 * Correction is the interaction here: press a point, drag it, release. Creation via the "+" flow
 * is separate and still to come.
 */

import { Fragment, useEffect, useRef, useState } from 'react'

import {
  GRID_INTERVAL_MS,
  LANES,
  PHASE_EVENTS,
  VITALS,
  laneRange,
  laneUnit,
} from '../domain/catalog'
import { medications, phaseEvents, vitalSeries } from '../domain/entries'
import type { AnesthesiaCase, PhaseEventEntry, Timestamp, VitalKind } from '../domain/types'
import type { LaneDef } from '../domain/catalog'
import { formatTime, formatNumber, formatValue } from '../format'
import { chart, laneColor } from '../theme'
import { useElementWidth } from '../useElementWidth'
import {
  clamp,
  createLaneScales,
  caseTimeWindow,
  gridTimes,
  pointerToMeasurement,
  snapToStep,
  type TimeWindow,
} from './scales'

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

/**
 * How close a pointer must be to a point to grab it, in pixels. 22 gives a 44px target, the size
 * a fingertip hits reliably, while still resolving points five minutes apart on a normal axis.
 */
const HIT_RADIUS = 22
/** Movement past this counts as a drag rather than a tap. */
const DRAG_THRESHOLD = 4
/**
 * How long a finger must rest on a point before it can be moved. Touch only: a swipe is how an
 * iPad is scrolled, so a touch that lands on a point cannot be taken as a correction on contact.
 * Long enough that a swipe passing over a point never grabs it, short enough that a deliberate
 * grab does not feel like waiting.
 */
const HOLD_MS = 250
/** Movement past this during the hold means the gesture was a swipe, and the point is let go. */
const HOLD_SLOP = 10
/** One arrow-key press along the time axis. */
const KEY_TIME_STEP = 60_000

// ---------------------------------------------------------------------------

export interface TimelineProps {
  record: AnesthesiaCase
  onCorrect: (id: string, next: { at: Timestamp; value: number }) => void
  onRemove: (id: string) => void
}

export function Timeline({ record, onCorrect, onRemove }: TimelineProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCorrect={onCorrect}
              onRemove={onRemove}
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

interface LanePoint {
  id: string
  kind: VitalKind
  at: Timestamp
  value: number
  x: number
  y: number
}

/** A correction in progress. Lives in the lane, since a drag never leaves the lane it began in. */
interface Drag {
  pointerId: number
  id: string
  kind: VitalKind
  startX: number
  startY: number
  moved: boolean
  /**
   * Whether the point is actually being held. A mouse or a stylus arms on contact; a touch only
   * once the hold completes, and until then the gesture still belongs to the browser.
   */
  armed: boolean
  at: Timestamp
  value: number
}

interface LaneProps {
  lane: LaneDef
  width: number
  window: TimeWindow
  record: AnesthesiaCase
  events: PhaseEventEntry[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCorrect: (id: string, next: { at: Timestamp; value: number }) => void
  onRemove: (id: string) => void
}

function VitalLane({
  lane,
  width,
  window,
  record,
  events,
  selectedId,
  onSelect,
  onCorrect,
  onRemove,
}: LaneProps) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const grabbed = drag?.armed ?? false

  // A pending hold outliving the lane would arm a point that is no longer on screen.
  useEffect(() => {
    return () => {
      if (holdTimer.current !== null) clearTimeout(holdTimer.current)
    }
  }, [])

  /**
   * While a grab is live the page must not scroll underneath it. `touch-action` is settled by the
   * browser when the touch begins, so changing it cannot reclaim a gesture already in flight;
   * preventing the `touchmove` can. React attaches its own touch listeners passively, where
   * `preventDefault` is ignored, so this one is attached directly and only for as long as it is
   * needed.
   */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !grabbed) return

    const keepGesture = (event: TouchEvent) => event.preventDefault()
    svg.addEventListener('touchmove', keepGesture, { passive: false })
    return () => svg.removeEventListener('touchmove', keepGesture)
  }, [grabbed])

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

  // The point being dragged renders at the pointer, not at its stored position, so the correction
  // is visible while it is being made rather than only after release.
  const seriesByKind = lane.vitals.map((kind) => ({
    kind,
    points: vitalSeries(record, kind)
      .map((entry): LanePoint => {
        const live = drag && drag.id === entry.id ? drag : null
        const at = live ? live.at : entry.at
        const value = live ? live.value : entry.value
        return { id: entry.id, kind, at, value, x: scales.time.map(at), y: scales.value.map(value) }
      })
      .sort((a, b) => a.at - b.at),
  }))
  const points = seriesByKind.flatMap((series) => series.points)
  const active = points.find((point) => point.id === (drag?.id ?? selectedId)) ?? null

  function localPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /** Nearest point within the hit radius, or nothing. */
  function hitTest(at: { x: number; y: number }): LanePoint | null {
    let best: LanePoint | null = null
    let bestDistance = HIT_RADIUS

    for (const point of points) {
      const distance = Math.hypot(point.x - at.x, point.y - at.y)
      if (distance <= bestDistance) {
        best = point
        bestDistance = distance
      }
    }
    return best
  }

  function cancelHold() {
    if (holdTimer.current === null) return
    clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  /**
   * Take the pointer. Capture routes every later event for it here, so a drag that wanders out of
   * the lane keeps tracking instead of freezing the point mid-correction. Read through the ref
   * rather than the event, because the touch path calls this from a timer, by which time React has
   * already cleared the event's `currentTarget`.
   */
  function grab(pointerId: number) {
    const svg = svgRef.current
    if (!svg) return
    svg.setPointerCapture(pointerId)
    svg.focus()
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const at = localPoint(event)
    const hit = hitTest(at)

    if (!hit) {
      onSelect(null)
      return
    }

    // Selecting on contact is what makes a tap a way to read a value. Moving it is a separate
    // question, answered below.
    onSelect(hit.id)

    // A mouse and a stylus are precise enough to mean the point they land on, so they arm at
    // once, exactly as before. A touch is not: the same gesture that grabs a point is the one
    // that scrolls the page, so it has to be held first. Until then nothing is captured and the
    // browser keeps the gesture.
    const armed = event.pointerType !== 'touch'
    if (armed) {
      grab(event.pointerId)
    } else {
      const { pointerId } = event
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null
        grab(pointerId)
        setDrag((current) => (current ? { ...current, armed: true } : null))
      }, HOLD_MS)
    }

    setDrag({
      pointerId: event.pointerId,
      id: hit.id,
      kind: hit.kind,
      startX: at.x,
      startY: at.y,
      moved: false,
      armed,
      at: hit.at,
      value: hit.value,
    })
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return

    const at = localPoint(event)
    const travelled = Math.hypot(at.x - drag.startX, at.y - drag.startY)

    // Movement before the hold completes means this was a swipe rather than a grab. Let the point
    // go entirely: it keeps its value, and the browser scrolls the page as it would anywhere else.
    if (!drag.armed) {
      if (travelled > HOLD_SLOP) {
        cancelHold()
        setDrag(null)
        onSelect(null)
      }
      return
    }

    // Below the threshold this is still a tap, and the point must not twitch under a fingertip.
    if (!drag.moved && travelled <= DRAG_THRESHOLD) return

    setDrag({ ...drag, moved: true, ...pointerToMeasurement(at, scales, VITALS[drag.kind].step) })
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return

    cancelHold()
    // A touch that was released before its hold completed never captured anything.
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.armed && drag.moved) onCorrect(drag.id, { at: drag.at, value: drag.value })
    setDrag(null)
  }

  /**
   * A cancelled pointer discards the correction. On touch this is the ordinary ending, not an
   * exceptional one: it is what the browser sends when it claims the gesture for a scroll.
   */
  function handlePointerCancel(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return
    cancelHold()
    setDrag(null)
  }

  /**
   * Keyboard adjustment of the selected point. This is the precision path: a pointer gets you
   * close, arrow keys land the exact number, and it is the only way in for anyone not using one.
   */
  function handleKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (!active) return

    const step = VITALS[active.kind].step
    const move = (at: Timestamp, value: number) => {
      event.preventDefault()
      onCorrect(active.id, {
        at: clamp(at, window.from, window.to),
        value: snapToStep(clamp(value, min, max), step),
      })
    }

    switch (event.key) {
      case 'ArrowUp':
        return move(active.at, active.value + step)
      case 'ArrowDown':
        return move(active.at, active.value - step)
      case 'ArrowLeft':
        return move(active.at - KEY_TIME_STEP, active.value)
      case 'ArrowRight':
        return move(active.at + KEY_TIME_STEP, active.value)
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        onRemove(active.id)
        return onSelect(null)
      case 'Escape':
        return onSelect(null)
    }
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className={grabbed ? 'timeline__lane timeline__lane--grabbed' : 'timeline__lane'}
      role="group"
      tabIndex={0}
      aria-label={`${lane.label}, Achse von ${min} bis ${max} ${laneUnit(lane)}. Punkt auswählen und mit den Pfeiltasten korrigieren.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
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
        <BloodPressureConnectors seriesByKind={seriesByKind} color={color} />
      )}

      {seriesByKind.map(({ kind, points: series }) => (
        <g key={kind}>
          {series.length > 1 && (
            <polyline
              points={series.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {series.map((point) => (
            <Marker
              key={point.id}
              id={point.id}
              kind={kind}
              x={point.x}
              y={point.y}
              color={color}
            />
          ))}
        </g>
      ))}

      {active && <SelectionRing point={active} color={color} grabbed={grabbed} />}
      {active && <Readout point={active} area={area} grabbed={grabbed} />}

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

/** A 2px ring in the surface colour keeps overlapping points from merging into one blob. */
function Marker({
  id,
  kind,
  x,
  y,
  color,
}: {
  id: string
  kind: VitalKind
  x: number
  y: number
  color: string
}) {
  // Addressable by entry id so a test can drag one specific point and assert what it became.
  const shared = {
    'data-entry-id': id,
    fill: color,
    stroke: chart.surface,
    strokeWidth: 2,
    cursor: 'grab',
  }

  if (kind === 'bloodPressureSystolic') {
    return <path d={`M ${x} ${y - 6} L ${x + 5.5} ${y + 4} L ${x - 5.5} ${y + 4} Z`} {...shared} />
  }
  if (kind === 'bloodPressureDiastolic') {
    return <path d={`M ${x} ${y + 6} L ${x + 5.5} ${y - 4} L ${x - 5.5} ${y - 4} Z`} {...shared} />
  }
  return <circle cx={x} cy={y} r={4.5} {...shared} />
}

/**
 * The ring grows the moment the point is actually held. On touch that growth is the whole
 * acknowledgment of the hold: it is how the user learns the point is now theirs to move, and that
 * the gesture is no longer going to scroll the page.
 */
function SelectionRing({
  point,
  color,
  grabbed,
}: {
  point: LanePoint
  color: string
  grabbed: boolean
}) {
  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={grabbed ? 14 : 11}
      fill="none"
      stroke={color}
      strokeWidth={grabbed ? 3 : 2}
      opacity={grabbed ? 0.9 : 0.6}
      pointerEvents="none"
    />
  )
}

/**
 * The exact value under the pointer, spelled out.
 *
 * Dragging alone cannot promise a specific number — a pixel is worth more than one unit on most
 * of these axes. Showing the value as it changes is what makes the gesture precise rather than
 * approximate, and it is why the drag can be coarse and still land on 97 %.
 */
function Readout({
  point,
  area,
  grabbed,
}: {
  point: LanePoint
  area: { left: number; right: number; top: number; bottom: number }
  grabbed: boolean
}) {
  const meta = VITALS[point.kind]
  const label = `${meta.short} ${formatValue(point.kind, point.value)} ${meta.unit} · ${formatTime(point.at)}`
  const boxWidth = label.length * 6.6 + 16

  // Anchored to the top edge of the lane rather than trailing the point. A lane is only about 90
  // pixels tall, so a box that follows the point vertically spends most of its time covering the
  // trace being corrected; pinning it means the eye always knows where the number is. It drops to
  // the bottom edge only when the point itself is up there.
  const nearTop = point.y - area.top < 40
  const x = clamp(point.x - boxWidth / 2, area.left, Math.max(area.right - boxWidth, area.left))
  const y = nearTop ? area.bottom - 24 : area.top + 2

  return (
    <g pointerEvents="none" aria-live="polite">
      <rect
        x={x}
        y={y}
        width={boxWidth}
        height={22}
        rx={4}
        fill={chart.ink}
        opacity={grabbed ? 0.92 : 0.78}
      />
      <text
        x={x + boxWidth / 2}
        y={y + 15}
        fill={chart.surface}
        fontSize={12}
        fontWeight={600}
        textAnchor="middle"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {label}
      </text>
    </g>
  )
}

/** The vertical stroke joining systolic to diastolic, as drawn on a paper protocol. */
function BloodPressureConnectors({
  seriesByKind,
  color,
}: {
  seriesByKind: Array<{ kind: VitalKind; points: LanePoint[] }>
  color: string
}) {
  const systolic = seriesByKind.find((s) => s.kind === 'bloodPressureSystolic')?.points ?? []
  const diastolic = seriesByKind.find((s) => s.kind === 'bloodPressureDiastolic')?.points ?? []

  return (
    <g pointerEvents="none">
      {systolic.map((high) => {
        // Pair on nearest time rather than an exact match: once a point has been dragged, the
        // three pressures no longer share a timestamp.
        const low = diastolic.reduce<LanePoint | null>((best, candidate) => {
          if (Math.abs(candidate.at - high.at) > GRID_INTERVAL_MS / 2) return best
          if (!best) return candidate
          return Math.abs(candidate.at - high.at) < Math.abs(best.at - high.at) ? candidate : best
        }, null)

        if (!low) return null
        return (
          <line
            key={high.id}
            x1={high.x}
            x2={low.x}
            y1={high.y}
            y2={low.y}
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
