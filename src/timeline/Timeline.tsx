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
 * Two ways in, because the two halves of the chart are not the same kind of thing. A vital is a
 * number on an axis, so it is corrected where it is: press the point, drag it, release. A
 * medication or a milestone is a drug, a dose, a unit and a time, none of which a drag can
 * express, so the bands hand their entries to the entry sheet instead.
 *
 * Creating is per row. Every lane and both bands carry their own „Erfassen“ button, so what is
 * being written down is chosen by pointing at the row it belongs to rather than by naming it in a
 * list — which is why the entry sheet no longer opens on a chooser. A lane's button sits in its
 * gutter, under the name and the unit: that space is already the lane's and is otherwise empty, and
 * six buttons stacked between the lanes would add half a screen of height to a chart that fills an
 * iPad. The bands' gutters hold their rows' own labels, so their buttons sit beneath them instead.
 *
 * The chart also reads two ways. Its normal state is a trace: points joined into a line, which is
 * what makes a trend visible and is the reason to draw vitals at all. But a protocol is also read
 * for exact numbers, and a position on an axis cannot give one. So a tap on the chart itself —
 * anywhere that is not a point — drops the lines and writes every value beside its point. The
 * lines are the trend, the numbers are the record, and neither has to be guessed from the other.
 */

import { Fragment, useEffect, useRef, useState } from 'react'
import { Button } from 'antd'

import {
  GRID_INTERVAL_MS,
  LANES,
  PHASE_EVENTS,
  VITALS,
  laneRange,
  laneUnit,
} from '../domain/catalog'
import { medications, phaseEvents, visibleEntries, vitalSeries } from '../domain/entries'
import type { AnesthesiaCase, PhaseEventEntry, Timestamp, VitalKind } from '../domain/types'
import type { LaneDef } from '../domain/catalog'
import { targetForLane, type AddTarget } from '../entry/target'
import { formatTime, formatNumber, formatValue } from '../format'
import { chart, laneColor } from '../theme'
import { useElementWidth } from '../useElementWidth'
import { placeValueLabels, type Box } from './labels'
import {
  clamp,
  createLaneScales,
  caseTimeWindow,
  gridTimes,
  pointerToMeasurement,
  snapToStep,
  type PlotArea,
  type TimeWindow,
} from './scales'

/**
 * Width of the left gutter holding lane labels and axis values. Sized so the longest German lane
 * name ("Sauerstoffsättigung") clears the axis numbers rather than printing over them.
 */
const GUTTER = 168
const RIGHT_PAD = 24
/**
 * The right-hand rail holding each lane's current-value readout.
 *
 * Outside the plot rather than drawn on it. The top right of a lane is where a saturation of 100
 * and a hypertensive systolic both live, so a number placed there would have to be moved out of
 * the data's way — and a readout that is not in the same place twice is a readout you have to look
 * for. Out here it is aligned with its own trace and can never touch a point.
 *
 * Every band takes the same right edge, not only the lanes. The bands carry no readout and the
 * column is empty beneath them, which costs real medication width; but one time scale across the
 * whole canvas is what this chart is for, and a band drawn 136px wider than the lanes above it
 * would put a dose at one x and the vitals of that minute at another.
 */
const VALUE_COLUMN = 136

/** The plot's right edge, shared by the time axis, all four lanes and both bands. */
function plotRight(width: number): number {
  return width - RIGHT_PAD - VALUE_COLUMN
}
/** Vertical inset inside a lane, so a value at the axis limit is not clipped by the edge. */
const LANE_INSET = 12
const LANE_BASE_HEIGHT = 92
const AXIS_HEIGHT = 30
const MED_ROW_HEIGHT = 34
/**
 * The medication band's two marks, from the paper protocol: a bolus is a vertical tick at its
 * time, an infusion a thin rule spanning the period it ran, serifed at each end.
 *
 * Sized against what they replaced rather than in the abstract. A 5px dot and a 12px slab were the
 * heaviest ink on the page while carrying the least interesting content on it — a fluid running is
 * the one thing in a protocol nobody has to look up. The tick covers about 40% of the dot's area
 * and the rule a quarter of the slab's, which is why the 0.55 opacity that used to hold the slab's
 * weight down is gone rather than retuned: the weight is now solved by size, and an opacity was
 * only ever a way of drawing a too-large mark too faintly.
 *
 * The tick is also what separates a dose from a measurement. A bolus drawn as a filled circle
 * wears the heart rate lane's marker, one band away from it, and the two mean nothing alike.
 */
const MED_TICK = 16
const MED_RULE = 3
/**
 * The serif capping an infusion is deliberately shorter than a bolus tick. Cut to the tick's 16px
 * the two became one mark: the start of a Remifentanil infusion and a Propofol bolus are both a
 * dose given at a time, and at a glance they told the same story. Shorter, and in the lighter ink,
 * the serif reads as the end of its rule rather than as a mark in its own right.
 */
const MED_SERIF = 10
const EVENT_ROW_HEIGHT = 34
/** Width of a milestone's hit area, sized to the label beside it rather than to the dot. */
const EVENT_HIT_WIDTH = 138

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
/** Space kept clear at the right of the readout for the chevron that says it opens the sheet. */
const CHEVRON_ROOM = 18
const READOUT_HEIGHT = 22

/**
 * One character of IBM Plex Mono, as a fraction of the font size.
 *
 * Read from the shipped `.woff2` rather than guessed: every glyph in the file has an advance of
 * 600 units against a 1000-unit em, which is what makes the width of any string in it arithmetic
 * instead of a measurement. Two places on the chart size a box around text they cannot ask the DOM
 * about — the value labels and the readout pill — and both are set in this face.
 *
 * If the numeric face is ever changed, this number changes with it, and `tests/typography.spec.ts`
 * is what says so out loud: it measures a real label in a real browser against this figure.
 */
const MONO_ADVANCE = 0.6

/**
 * The value labels of the reading mode. A point larger than the marker it labels, deliberately:
 * this text exists because the chart was not readable as numbers, so it is set at the size of the
 * axis labels rather than smaller.
 *
 * `LABEL_CHAR_WIDTH` is no longer an estimate. These labels are set in IBM Plex Mono, every glyph
 * of which advances exactly 600/1000 em, so a label's width *is* its character count times
 * `MONO_ADVANCE * LABEL_FONT` — 7.8px at 13px. That matters more here than it looks: the placement
 * search decides which labels collide, so a width that was a few percent off was deciding overlap
 * on a number nobody had measured. It is also why this stays out of the DOM: there is nothing left
 * for a measurement to discover.
 *
 * `LABEL_HEIGHT` is the height of one line. A blood pressure label carries three of them.
 */
const LABEL_FONT = 13
const LABEL_HEIGHT = 18
const LABEL_CHAR_WIDTH = MONO_ADVANCE * LABEL_FONT
const LABEL_PADDING = 6
/**
 * The marker's own footprint, which no label may sit on.
 *
 * Twenty, not the eleven the largest marker path spans: every marker is drawn with a 2px ring in
 * the surface colour, and a triangle's apex carries its stroke out past the point itself. Measured
 * from what the browser reports rather than from the path, because the search is only as good as
 * its idea of what is already on the chart.
 */
const MARKER_BOX = 20

function labelWidth(text: string): number {
  return text.length * LABEL_CHAR_WIDTH + LABEL_PADDING * 2
}

// ---------------------------------------------------------------------------

export interface TimelineProps {
  record: AnesthesiaCase
  onCorrect: (id: string, next: { at: Timestamp; value: number }) => void
  onRemove: (id: string) => void
  /** Asks for an entry to be opened for editing: the bands' only route in, and a vital's readout. */
  onEdit: (id: string) => void
  /** Asks for a new entry on one row. Every lane and both bands raise this. */
  onAdd: (target: AddTarget) => void
}

export function Timeline({ record, onCorrect, onRemove, onEdit, onAdd }: TimelineProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Held here rather than per lane: "show me the numbers" is a way of reading the record, not a
  // property of one parameter. Reading a saturation against the heart rate at the same minute is
  // the whole reason the lanes share a time axis, and it only works if they answer together.
  const [showValues, setShowValues] = useState(false)
  const window = caseTimeWindow(record)
  const events = phaseEvents(record)
  const hasVitals = LANES.some((lane) =>
    lane.vitals.some((kind) => vitalSeries(record, kind).length > 0),
  )

  return (
    <div ref={ref} className="timeline">
      {plotRight(width) > GUTTER + 80 && (
        <>
          {/* The gesture is the fast way in and the button is the discoverable one. A tap on the
              chart is worth having — it is where the eye and the finger already are — but nobody
              finds it on their own, and it is unreachable from a keyboard. Both drive the one
              state, so the button also says which of the two modes is currently on. */}
          {hasVitals && (
            <div className="timeline__head">
              <Button
                size="small"
                className="timeline__values-toggle"
                aria-pressed={showValues}
                onClick={() => setShowValues((shown) => !shown)}
              >
                {showValues ? 'Zahlen ausblenden' : 'Zahlen anzeigen'}
              </Button>
            </div>
          )}
          <TimeAxis width={width} window={window} />
          {LANES.map((lane) => (
            // The wrapper is what the lane's own button is positioned against, which is why it is
            // here rather than inside `VitalLane`: an SVG cannot hold a real button, and the button
            // has to be a real one to be reachable by keyboard and named to a screen reader.
            <div key={lane.id} className="timeline__row">
              <VitalLane
                lane={lane}
                width={width}
                window={window}
                record={record}
                events={events}
                selectedId={selectedId}
                showValues={showValues}
                onSelect={setSelectedId}
                onToggleValues={() => setShowValues((shown) => !shown)}
                onCorrect={onCorrect}
                onRemove={onRemove}
                onEdit={onEdit}
              />
              <AddButton
                className="timeline__add timeline__add--gutter"
                label="Erfassen"
                name={`${lane.label} erfassen`}
                onClick={() => onAdd(targetForLane(lane))}
              />
            </div>
          ))}

          <MedicationBand width={width} window={window} record={record} onEdit={onEdit} />
          <AddButton
            className="timeline__add"
            label="Medikament"
            name="Medikament erfassen"
            onClick={() => onAdd({ kind: 'medication' })}
          />

          <EventBand width={width} window={window} events={events} onEdit={onEdit} />
          <AddButton
            className="timeline__add"
            label="Ereignis"
            name="Ereignis erfassen"
            onClick={() => onAdd({ kind: 'event' })}
          />

          {visibleEntries(record).length === 0 && <EmptyRecord />}
        </>
      )}
    </div>
  )
}

/**
 * A record with nothing in it yet.
 *
 * The lanes stay: the axis, the value ranges and the parameter names are what the chart is going to
 * be, and a blank grid with a caption reads as ready, where a replaced panel would read as a
 * different screen. Written over them rather than beside them so the eye lands on it — four empty
 * lanes with no explanation is the shape a failed load has, and that guess costs seconds.
 *
 * Not AntD's `Empty`, whose illustration would announce the component library on the emptiest
 * screen in the app. It also passes the pointer straight through: there is nothing to press here,
 * and the entry button is the thing this text is pointing at.
 */
function EmptyRecord() {
  return (
    <div className="timeline__empty" role="status">
      {/* The text carries its own surface. Written straight onto the chart it crossed the
          gridlines and the boundary between two lanes, which made a deliberate message look like
          an accident of layout. */}
      <div className="timeline__empty-card">
        <p className="timeline__empty-title">Noch keine Einträge</p>
        <p className="timeline__empty-hint">
          Über „Erfassen“ an der jeweiligen Zeile aufnehmen.
        </p>
      </div>
    </div>
  )
}

/**
 * A row's own way of starting an entry.
 *
 * The visible word is the same on all six, because the row above it already says which one this is
 * and repeating the lane's name under the lane's name is ink for nothing. The accessible name is
 * not the same on any two: it carries the row, so the buttons are told apart in a list of controls
 * where the chart above them is not there to be seen. The visible text is contained in it, which is
 * what keeps the two readings of the button the same button.
 *
 * The „+“ is decoration and marked as such — it repeats what "Erfassen" already says, and spoken
 * aloud in front of every one of these it is noise.
 */
function AddButton({
  className,
  label,
  name,
  onClick,
}: {
  className: string
  label: string
  name: string
  onClick: () => void
}) {
  return (
    <Button size="small" className={className} aria-label={name} onClick={onClick}>
      <span aria-hidden="true">+ </span>
      {label}
    </Button>
  )
}

// ---------------------------------------------------------------------------

/** Gridline times, and how often to label them so the axis stays readable when narrow. */
function useAxisTicks(window: TimeWindow, width: number) {
  const times = gridTimes(window.from, window.to)
  const plotWidth = plotRight(width) - GUTTER
  // A time label needs roughly 46px to stand clear of its neighbour.
  const every = Math.max(1, Math.ceil((times.length * 46) / Math.max(plotWidth, 1)))
  return { times, labelEvery: every }
}

function TimeAxis({ width, window }: { width: number; window: TimeWindow }) {
  const { times, labelEvery } = useAxisTicks(window, width)
  const scale = createLaneScales(
    { left: GUTTER, right: plotRight(width), top: 0, bottom: 0 },
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
      <text x={0} y={AXIS_HEIGHT - 9} fill={chart.inkMuted} fontSize={12} fontWeight={500}>
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
              stroke={labelled ? chart.gridMajor : chart.gridMinor}
              strokeWidth={1}
            />
            {labelled && (
              <text
                className="timeline__num"
                x={x}
                y={AXIS_HEIGHT - 11}
                fill={chart.inkMuted}
                fontSize={12}
                textAnchor="middle"
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
  /**
   * Which edge of the lane the value fell past, if it fell past one. The bands are narrow enough
   * to be read, which means a value can sit outside one, and `y` is then the edge rather than the
   * value's true position. Nothing may go missing from a clinical record because of a drawing
   * choice, so an off-scale point is still drawn, still selectable, and still prints its real
   * number — it is only drawn differently, and marked as being off the scale.
   */
  offScale: 'above' | 'below' | null
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
  showValues: boolean
  onSelect: (id: string | null) => void
  onToggleValues: () => void
  onCorrect: (id: string, next: { at: Timestamp; value: number }) => void
  onRemove: (id: string) => void
  onEdit: (id: string) => void
}

function VitalLane({
  lane,
  width,
  window,
  record,
  events,
  selectedId,
  showValues,
  onSelect,
  onToggleValues,
  onCorrect,
  onRemove,
  onEdit,
}: LaneProps) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * Whether the gesture that is ending moved a point. A drag that leaves the pointer clear of the
   * point it just corrected — because the value clamped at the top of the axis, say — ends with a
   * click over empty chart, and without this that click would read as "show the numbers".
   */
  const corrected = useRef(false)
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
    right: plotRight(width),
    top: LANE_INSET,
    bottom: height - LANE_INSET,
  }
  const domain = laneRange(lane)
  const scales = createLaneScales(area, window, domain)
  const color = laneColor[lane.id]

  const [min, max] = domain
  // Every kind in a lane shares one scale and therefore one precision; see laneRange.
  const decimals = VITALS[lane.vitals[0]].decimals
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
        // Drawn at the edge when it is past it, so the mark stays inside its own lane and inside
        // the hit radius that selects it. The number itself is untouched; only `y` is clamped.
        const offScale = value > max ? 'above' : value < min ? 'below' : null
        return {
          id: entry.id,
          kind,
          at,
          value,
          x: scales.time.map(at),
          y: scales.value.map(clamp(value, min, max)),
          offScale,
        }
      })
      .sort((a, b) => a.at - b.at),
  }))
  const points = seriesByKind.flatMap((series) => series.points)
  const active = points.find((point) => point.id === (drag?.id ?? selectedId)) ?? null
  /**
   * The reading the lane's large readout shows: the last group `readings` produces, which on a
   * one-kind lane is simply the newest point and on the pressure lane is the newest systolic,
   * mean and diastolic taken together. Read off `points` rather than off the record, so a drag of
   * the newest value is written in the rail as it happens.
   */
  const latest = readings(points).at(-1) ?? []

  /**
   * What each label covers. Every lane but one labels a point at a time; the blood pressure lane
   * labels a whole reading, because three numbers eleven pixels apart cannot each be tied to their
   * own marker by position alone.
   *
   * The selected point drops out of its label and its marker stays: its readout already spells the
   * value out, with the unit and the time the label deliberately drops, and a label beside it would
   * be the same number twice. A reading whose middle pressure is selected simply loses that line.
   */
  const labelled = (lane.id === 'bloodPressure' ? readings(points) : points.map((point) => [point]))
    .map((reading) => reading.filter((point) => point.id !== active?.id))
    .filter((reading) => reading.length > 0)
  const readingsById = new Map(labelled.map((reading) => [reading[0].id, reading]))

  /**
   * The numbers, placed against the points as they are currently drawn — so a point being dragged
   * carries its label with it, and a corrected value is written in the moment it changes.
   *
   * The readout box joins the obstacles for the same reason the markers do — it is opaque, and a
   * value printed under it is a value nobody can read.
   */
  const labels = showValues
    ? placeValueLabels(
        labelled.map((reading) => {
          const lines = reading.map((point) => formatValue(point.kind, point.value))
          return {
            id: reading[0].id,
            // Anchored to the middle of the column, not to any one of its points: the box belongs
            // to all of them, and hanging it off the topmost would say it belonged to that one.
            x: mean(reading.map((point) => point.x)),
            y: mean(reading.map((point) => point.y)),
            width: Math.max(...lines.map(labelWidth)),
            height: reading.length * LABEL_HEIGHT,
            prefer: reading.length > 1 ? ('side' as const) : undefined,
          }
        }),
        [...points.map(markerBox), ...(active ? [readoutBox(active, area)] : [])],
        { x: area.left, y: 0, width: area.right - area.left, height },
      )
    : []

  // Typed as the mouse event both a pointer event and a click satisfy, so the hit test and the
  // toggle read a position the same way.
  function localPoint(event: React.MouseEvent<SVGSVGElement>) {
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
    // The readout is a button drawn inside the lane, so a press on it arrives here first. Left
    // alone, the hit test would find no point under the box, deselect, and unmount the very button
    // that was pressed before its click could fire. The press belongs to the button; the chart
    // below it sees nothing.
    if (event.target instanceof Element && event.target.closest('[data-readout]')) return

    corrected.current = false
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

    corrected.current = true
    const measurement = pointerToMeasurement(at, scales, VITALS[drag.kind].step)
    // A point already outside the band has no position on it, so a drag cannot mean a new value
    // for it — every pixel of the lane would read as "bring it back inside", and a saturation of
    // 88 would silently become 94 on the way to nudging its timestamp. Such a point moves in time
    // only; its value stays what was recorded until the keypad or the arrow keys change it.
    const offScale = drag.value > max || drag.value < min
    setDrag({
      ...drag,
      moved: true,
      at: measurement.at,
      value: offScale ? drag.value : measurement.value,
    })
  }

  /**
   * A press on the chart that hit nothing asks for the numbers, or puts them away again.
   *
   * On `click` rather than on the pointer down that already handles selection, and for the reason
   * the bands' hit areas are: a browser withholds the click when a touch turns into a scroll, so a
   * swipe across the timeline scrolls the page and changes nothing about how the chart reads. That
   * is the same distinction the lanes had to draw by hand for a grab, already drawn here.
   */
  function handleClick(event: React.MouseEvent<SVGSVGElement>) {
    if (event.target instanceof Element && event.target.closest('[data-readout]')) return
    if (corrected.current) {
      corrected.current = false
      return
    }
    // A press on or near a point selected it; that is what the press meant, and this lane keeps
    // the numbers it is showing. Labels sit inside the hit radius of their own point, which makes
    // the number a second, larger target for selecting the point it belongs to.
    const at = localPoint(event)
    if (hitTest(at)) return
    // Only the chart switches how the lane reads. The gutter and the value rail are the lane's
    // furniture — a press on the parameter's name, on its entry button or on its current value is
    // not a press on empty chart, and dropping every line on the lane in answer to one reads as
    // the app having done something at random.
    if (at.x < area.left || at.x > area.right) return

    onToggleValues()
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
    // Bounded by what the metric can be, not by what the lane happens to draw. The arrow keys are
    // the precision path, and a point resting off the end of the band has to be adjustable from
    // where it actually is — clamping to the band would snap it inside on the first keypress.
    const [floor, ceiling] = VITALS[active.kind].inputRange
    const move = (at: Timestamp, value: number) => {
      event.preventDefault()
      onCorrect(active.id, {
        at: clamp(at, window.from, window.to),
        value: snapToStep(clamp(value, floor, ceiling), step),
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
      case 'Enter':
      case ' ':
        // The keyboard's way into the entry sheet, and with it the exact-number path: the arrow
        // keys walk a value one step at a time, which is the wrong tool for a wide correction.
        event.preventDefault()
        return onEdit(active.id)
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
      aria-label={`${lane.label}, Achse von ${formatNumber(min, decimals)} bis ${formatNumber(max, decimals)} ${laneUnit(lane)}. Punkt auswählen und mit den Pfeiltasten korrigieren, mit der Eingabetaste bearbeiten.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
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
          stroke={chart.gridMinor}
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
          stroke={chart.gridMinor}
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
          stroke={chart.gridMajor}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}

      <text x={0} y={20} fill={chart.ink} fontSize={12} fontWeight={600}>
        {lane.label}
      </text>
      <text x={0} y={35} fill={chart.inkMuted} fontSize={11}>
        {laneUnit(lane)}
      </text>

      {valueTicks.map((value) => (
        <text
          key={value}
          className="timeline__num"
          x={GUTTER - 8}
          y={scales.value.map(value) + 4}
          fill={chart.inkMuted}
          fontSize={11}
          textAnchor="end"
        >
          {formatNumber(value, decimals)}
        </text>
      ))}

      {lane.id === 'bloodPressure' && (
        <BloodPressureConnectors readings={readings(points)} color={color} />
      )}

      {seriesByKind.map(({ kind, points: series }) => (
        <g key={kind}>
          {/* The trend line goes while the numbers are up. It is the thing the labels have to be
              read across, and it is the one piece of ink on the chart that carries no value of its
              own: it says how the record moved between two measurements, which is exactly what is
              not being asked for when someone asks what the measurements were. */}
          {series.length > 1 && !showValues && (
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
              offScale={point.offScale}
            />
          ))}
        </g>
      ))}

      {/* Hidden from assistive technology on purpose: the marks these annotate are already in the
          lane's own description, and a bare run of numbers with no metric and no time attached is
          not a better reading of the chart than that. The spoken route to an exact value is the
          one it has always been — select the point, hear the readout. */}
      {labels.length > 0 && (
        <g aria-hidden="true" pointerEvents="none">
          {labels.map((label) => {
            const reading = readingsById.get(label.id)
            if (!reading) return null
            return <ValueLabel key={label.id} box={label} points={reading} color={color} />
          })}
        </g>
      )}

      {active && <SelectionRing point={active} color={color} grabbed={grabbed} />}
      {active && <Readout point={active} area={area} grabbed={grabbed} onEdit={onEdit} />}

      {/* Always the newest reading, never the selected one. Selecting a point already opens its
          own readout, with the unit and the time; if the large number followed the selection too,
          the one number on the lane that is always the same thing would stop being that. It does
          follow a drag of the newest point, because that point's value is genuinely changing. */}
      <LaneValue lane={lane} reading={latest} width={width} height={height} />

      <line
        x1={area.left}
        x2={area.right}
        y1={height - 0.5}
        y2={height - 0.5}
        stroke={chart.gridMinor}
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
  offScale,
}: {
  id: string
  kind: VitalKind
  x: number
  y: number
  color: string
  offScale: 'above' | 'below' | null
}) {
  // Addressable by entry id so a test can drag one specific point and assert what it became.
  const shared = {
    'data-entry-id': id,
    fill: color,
    stroke: chart.paper,
    strokeWidth: 2,
    cursor: 'grab',
  }

  /**
   * A value past the end of the band. It is drawn hollow and as an arrowhead pointing the way it
   * went, which says two things the ordinary marker cannot: that the reading is real, and that
   * where it sits on the lane is not where its number is. Hollow, because a filled mark at the
   * edge would be read as a measurement taken at the edge.
   */
  if (offScale) {
    const tip = offScale === 'above' ? y - 5 : y + 5
    const base = offScale === 'above' ? y + 4 : y - 4
    return (
      <path
        d={`M ${x} ${tip} L ${x + 5.5} ${base} L ${x - 5.5} ${base} Z`}
        {...shared}
        fill={chart.paper}
        stroke={color}
      />
    )
  }

  if (kind === 'bloodPressureSystolic') {
    return <path d={`M ${x} ${y - 6} L ${x + 5.5} ${y + 4} L ${x - 5.5} ${y + 4} Z`} {...shared} />
  }
  if (kind === 'bloodPressureDiastolic') {
    return <path d={`M ${x} ${y + 6} L ${x + 5.5} ${y - 4} L ${x - 5.5} ${y - 4} Z`} {...shared} />
  }
  return <circle cx={x} cy={y} r={4.5} {...shared} />
}

/** What a marker covers, so no other point's label is written over it. */
function markerBox(point: LanePoint): Box {
  return {
    x: point.x - MARKER_BOX / 2,
    y: point.y - MARKER_BOX / 2,
    width: MARKER_BOX,
    height: MARKER_BOX,
  }
}

/**
 * The measured value or values of one reading, written next to it.
 *
 * The numbers and nothing else. The unit is at the lane's edge, where it is the same for every
 * point in the lane, and the time is the position on the axis the label is already sitting at —
 * printing either beside every point would double the width of the labels and halve how many of
 * them fit, to repeat what the chart says twice over. The exact minute is a question about one
 * entry, and it is answered by the readout of the point that raised it.
 *
 * More than one line means a blood pressure reading, and the lines run in the order the markers
 * do: highest at the top. That order is the whole point of the box — with three values eleven
 * pixels apart, no arrangement of three separate labels says which number belongs to which marker,
 * because every position is equally near all three. One box in marker order does.
 *
 * It carries its own surface, because a number set straight onto the chart is read across
 * gridlines, event rules and the neighbouring lane's ink. The hairline is the lane's colour, which
 * is what ties a label back to its series where two lanes' labels come close.
 */
function ValueLabel({ box, points, color }: { box: Box; points: LanePoint[]; color: string }) {
  // Two hooks, with two jobs. `data-value-label` sits on each number, so a test can still ask what
  // one entry's value is drawn as — and neither goes on the marker, which already answers to
  // `data-entry-id`. `data-value-box` is the surface, which is what may not be written over
  // another: the rects are opaque, so two that overlap hide a number even when the digits inside
  // them would have missed each other.
  return (
    <g data-value-box={points[0].id}>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={4}
        fill={chart.paper}
        opacity={0.94}
        stroke={color}
        strokeOpacity={0.4}
      />
      {points.map((point, line) => (
        <text
          key={point.id}
          className="timeline__num"
          data-value-label={point.id}
          x={box.x + box.width / 2}
          y={box.y + line * LABEL_HEIGHT + LABEL_HEIGHT / 2 + 4.5}
          fill={chart.ink}
          fontSize={LABEL_FONT}
          fontWeight={600}
          textAnchor="middle"
        >
          {formatValue(point.kind, point.value)}
        </text>
      ))}
    </g>
  )
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
 * The exact value under the pointer, spelled out, and the way into that value's entry sheet.
 *
 * Dragging alone cannot promise a specific number — a pixel is worth more than one unit on most
 * of these axes. Showing the value as it changes is what makes the gesture precise rather than
 * approximate, and it is why the drag can be coarse and still land on 97 %.
 *
 * It is also a button, because three things a vital needs have no gesture on the chart: removing
 * it without a hardware `Delete` key, reading what it was before it was corrected, and changing it
 * to an exact number without aiming. The readout is where the eye already is once a point is
 * selected, so it is the honest place to put them — a second control elsewhere would be a second
 * thing to find. The chevron is there to say it opens something; a box that only prints a number
 * gives no reason to press it.
 */
function readoutLabel(point: LanePoint): string {
  const meta = VITALS[point.kind]
  return `${meta.short} ${formatValue(point.kind, point.value)} ${meta.unit} · ${formatTime(point.at)}`
}

// ---------------------------------------------------------------------------

/**
 * The readout's type. 32px sits in the middle of `DESIGN.md`'s 28–40px and is the largest size the
 * shortest lane holds: Temperatur is 74px tall, and 32 plus two 15px lines leaves a margin at each
 * end. One size across all four, because a rail whose numbers are different sizes is not a rail.
 */
const VALUE_SIZE = 32
const VALUE_NOTE_SIZE = 12
const VALUE_NOTE_LINE = 15

interface LaneValueText {
  /** The number, set at `VALUE_SIZE`. An em dash when the lane holds nothing yet. */
  value: string
  unit: string
  /** The lines under the unit, smallest type: the mean pressure where there is one, and the time. */
  notes: string[]
  /** The same reading as one sentence, for the lane's screen-reader description. */
  spoken: string
}

/**
 * What one lane's readout says, from the reading it is showing.
 *
 * Pure, and given the reading rather than the record, so it stays correct while a point is being
 * dragged: the caller passes the points as they are currently drawn, and a correction to the newest
 * value is read here as it is made.
 */
function laneValueText(lane: LaneDef, reading: readonly LanePoint[]): LaneValueText {
  const unit = laneUnit(lane)
  if (reading.length === 0) {
    return {
      value: '—',
      unit,
      notes: ['keine Werte'],
      spoken: `${lane.label}, noch keine Werte erfasst.`,
    }
  }

  const at = Math.max(...reading.map((point) => point.at))
  const time = formatTime(at)
  const text = (kind: VitalKind) => {
    const point = reading.find((member) => member.kind === kind)
    return point ? formatValue(kind, point.value) : null
  }

  if (lane.id === 'bloodPressure') {
    const systolic = text('bloodPressureSystolic')
    const diastolic = text('bloodPressureDiastolic')
    const mean = text('bloodPressureMean')
    // A blood pressure is read and spoken as one reading, so the pair is the number and the mean
    // arterial pressure is the line beneath it. Nothing is filled in when a part is missing: any
    // of the three can be removed on its own, and MAD is read off the monitor, never computed
    // from the other two.
    if (systolic !== null && diastolic !== null) {
      return {
        value: `${systolic}/${diastolic}`,
        unit,
        notes: mean === null ? [`zuletzt ${time}`] : [`MAD ${mean}`, `zuletzt ${time}`],
        spoken:
          `${lane.label}, zuletzt ${systolic} zu ${diastolic} ${unit}` +
          `${mean === null ? '' : `, Mittlerer arterieller Druck ${mean}`}, um ${time} Uhr.`,
      }
    }
  }

  // One measurement: the lane's own kind, or whichever half of a blood pressure is left after the
  // others were removed. The short name is printed only where a lane carries more than one kind,
  // because at this size "104" over "mmHg" does not say which of the three pressures it is, while
  // "98" over "%" in the lane named Sauerstoffsättigung says it twice.
  const point = reading[0]
  const meta = VITALS[point.kind]
  const value = formatValue(point.kind, point.value)
  return {
    value,
    unit,
    notes: lane.vitals.length > 1 ? [meta.short, `zuletzt ${time}`] : [`zuletzt ${time}`],
    spoken: `${lane.label}, zuletzt ${value} ${meta.unit}${
      lane.vitals.length > 1 ? ` ${meta.label}` : ''
    }, um ${time} Uhr.`,
  }
}

/**
 * A lane's current-value readout: the newest measurement on that lane, set large. Right-aligned in
 * the rail and centred on its lane, so each number sits level with the trace it belongs to.
 *
 * The reason it exists is that a protocol is a clinical display and this one was not reading as
 * one. The largest text on the page was the patient's name, and no measured value was legible at
 * all without switching the whole chart into its numbers mode — which is a thing you do to read
 * the record, not a thing you should have to do to read the patient.
 *
 * It says „zuletzt“, and it says when. This is a record, not a monitor: the number is the last
 * value somebody wrote down, and a large bare number beside a live-looking trace would assert that
 * it is what the patient is doing now. Nothing here polls a device and nothing here is derived.
 *
 * It is not clamped. A value that fell off its axis is drawn hollow against the edge of the lane,
 * and this is where its real number is read — the point of keeping off-scale points at all is that
 * nothing vanishes from a clinical record because of a drawing choice.
 *
 * In `--ink` rather than in the lane's colour. It is the largest number on the page and
 * `DESIGN.md` asks 7:1 of anything numeric, which `--ink` clears at 17.1:1 and the four traces do
 * not — they run 5.95:1 to 7.80:1, which is a graphics floor, not a numeric one. The lane's own
 * label and trace already say which parameter this is, and four large numbers in four colours
 * would take the boldness off the canvas, where the symbols are, and put it in the margin.
 *
 * `pointerEvents` is off. The rail is the lane's furniture, not its chart surface: nothing here is
 * pressed, and the four gestures the lane answers all belong to the plot.
 */
function LaneValue({
  lane,
  reading,
  width,
  height,
}: {
  lane: LaneDef
  reading: readonly LanePoint[]
  width: number
  height: number
}) {
  const { value, unit, notes, spoken } = laneValueText(lane, reading)
  const right = width - RIGHT_PAD
  const block = VALUE_SIZE + (notes.length + 1) * VALUE_NOTE_LINE
  const top = (height - block) / 2
  const empty = reading.length === 0

  return (
    <g role="img" aria-label={spoken} pointerEvents="none">
      <text
        className="timeline__value"
        data-lane-value={lane.id}
        x={right}
        y={top + VALUE_SIZE * 0.78}
        fill={empty ? chart.inkMuted : chart.ink}
        fontSize={VALUE_SIZE}
        textAnchor="end"
      >
        {value}
      </text>
      {[unit, ...notes].map((line, index) => (
        <text
          key={index}
          className="timeline__value-note"
          x={right}
          y={top + VALUE_SIZE + (index + 1) * VALUE_NOTE_LINE - 4}
          fill={chart.inkMuted}
          fontSize={VALUE_NOTE_SIZE}
          textAnchor="end"
        >
          {line}
        </text>
      ))}
    </g>
  )
}

/**
 * Where the readout sits, as a plain rectangle.
 *
 * Anchored to the top edge of the lane rather than trailing the point. A lane is only about 90
 * pixels tall, so a box that follows the point vertically spends most of its time covering the
 * trace being corrected; pinning it means the eye always knows where the number is. It drops to
 * the bottom edge only when the point itself is up there.
 *
 * Separate from the drawing because the label placement has to know about this box too: it is
 * opaque, it is wide, and it lands exactly where a value label would otherwise go.
 */
function readoutBox(point: LanePoint, area: PlotArea): Box {
  // 12px is the pill's own font size; see `MONO_ADVANCE`. One character in the whole app escapes
  // that arithmetic — the ₂ of SpO₂, which IBM Plex does not carry and which falls through to the
  // platform's monospace face — and the pill's 16px of padding is wider than any advance it could
  // come back with.
  const width = readoutLabel(point).length * (MONO_ADVANCE * 12) + 16 + CHEVRON_ROOM
  const nearTop = point.y - area.top < 40

  return {
    x: clamp(point.x - width / 2, area.left, Math.max(area.right - width, area.left)),
    y: nearTop ? area.bottom - 24 : area.top + 2,
    width,
    height: READOUT_HEIGHT,
  }
}

function Readout({
  point,
  area,
  grabbed,
  onEdit,
}: {
  point: LanePoint
  area: PlotArea
  grabbed: boolean
  onEdit: (id: string) => void
}) {
  const label = readoutLabel(point)
  const { x, y, width: boxWidth } = readoutBox(point, area)
  const chevronX = x + boxWidth - CHEVRON_ROOM + 2
  const middle = y + 11

  // The hook is `data-readout`, not `data-entry-id`: the marker for this same entry already
  // carries that one, and a second element answering to it would make every "the point with this
  // id" lookup ambiguous the moment the point is selected.
  return (
    <g
      className="timeline__readout"
      data-readout={point.id}
      role="button"
      tabIndex={0}
      aria-label={`${label}. Eintrag bearbeiten.`}
      aria-live="polite"
      onClick={() => onEdit(point.id)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        // The lane behind offers the same key, so without this the sheet would be asked for twice.
        // The arrow keys are deliberately left to bubble: focus sits here once the readout is
        // reached, and adjusting the point from there is the useful thing to be able to do.
        event.stopPropagation()
        onEdit(point.id)
      }}
    >
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
        className="timeline__num"
        x={x + (boxWidth - CHEVRON_ROOM) / 2}
        y={y + 15}
        fill={chart.paper}
        fontSize={12}
        fontWeight={600}
        textAnchor="middle"
      >
        {label}
      </text>
      <path
        d={`M ${chevronX} ${middle - 4} L ${chevronX + 4} ${middle} L ${chevronX} ${middle + 4}`}
        fill="none"
        stroke={chart.paper}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </g>
  )
}

/** Arithmetic mean, for anchoring a label to a column of points rather than to one of them. */
function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length
}

/**
 * How far apart two pressures may be and still count as one cuff inflation. Half the reference
 * grid: two readings are minutes apart, and the three numbers of one are the same instant.
 */
const READING_TOLERANCE = GRID_INTERVAL_MS / 2

/**
 * The lane's points, gathered into readings.
 *
 * One inflation of a cuff produces three numbers on one timestamp, and the chart has two things to
 * say about that — the stroke joining systolic to diastolic, and the label carrying all three — so
 * the grouping is worked out once here and both are drawn from it.
 *
 * Grouped on nearness in time rather than on an identical timestamp, because a point that has been
 * dragged no longer shares its reading's to the millisecond, and a correction must not make the
 * reading come apart on screen. A second point of a kind already in the group starts a new one: two
 * systolic values that close together are two readings, not one reading with two tops.
 *
 * Each group comes back ordered by height, so a label's lines run in the order its markers do.
 */
function readings(points: readonly LanePoint[]): LanePoint[][] {
  const groups: LanePoint[][] = []

  for (const point of [...points].sort((a, b) => a.at - b.at)) {
    const open = groups[groups.length - 1]
    const belongs =
      open !== undefined &&
      point.at - open[0].at <= READING_TOLERANCE &&
      !open.some((member) => member.kind === point.kind)

    if (belongs) open.push(point)
    else groups.push([point])
  }

  return groups.map((group) => [...group].sort((a, b) => a.y - b.y))
}

/** The vertical stroke joining systolic to diastolic, as drawn on a paper protocol. */
function BloodPressureConnectors({
  readings: grouped,
  color,
}: {
  readings: LanePoint[][]
  color: string
}) {
  return (
    <g pointerEvents="none">
      {grouped.map((reading) => {
        const high = reading.find((point) => point.kind === 'bloodPressureSystolic')
        const low = reading.find((point) => point.kind === 'bloodPressureDiastolic')
        if (!high || !low) return null

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

/**
 * An invisible target over something drawn in a band, opening it for editing.
 *
 * `onClick` rather than `onPointerDown`, deliberately, and it is why the bands needed no equivalent
 * of the lanes' press-and-hold. A browser withholds the click when a touch turns into a scroll, so
 * a swipe that happens to start on a medication row scrolls and opens nothing — the ambiguity the
 * lanes had to resolve by hand is already resolved here.
 *
 * `role="button"` and a tab stop because an SVG rect is not one: without them these would be
 * reachable by finger and mouse only, and the entries in the bands are exactly the ones with no
 * other route in.
 */
function HitArea({
  x,
  y,
  width,
  height,
  label,
  entryId,
  onEdit,
}: {
  x: number
  y: number
  width: number
  height: number
  label: string
  entryId: string
  onEdit: (id: string) => void
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      className="timeline__hit"
      data-entry-id={entryId}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => onEdit(entryId)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onEdit(entryId)
      }}
    />
  )
}

function MedicationBand({
  width,
  window,
  record,
  onEdit,
}: {
  width: number
  window: TimeWindow
  record: AnesthesiaCase
  onEdit: (id: string) => void
}) {
  const rows = medications(record)
  // The band stays when it is empty, down to its heading. It is what the button beneath it is
  // labelled by, and on a record with nothing in it the six headings are the six things this
  // protocol can hold — which is more use than four lanes and two loose buttons.
  const height = rows.length * MED_ROW_HEIGHT + 28
  const scale = createLaneScales(
    { left: GUTTER, right: plotRight(width), top: 0, bottom: 0 },
    window,
    [0, 1],
  ).time

  return (
    <svg
      width={width}
      height={height}
      className="timeline__band"
      role="group"
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
        const flip = end + 90 > plotRight(width)

        const summary =
          entry.type === 'bolus'
            ? `${entry.drug}, Bolus ${dose}, ${formatTime(entry.at)}`
            : `${entry.drug}, Dauerinfusion ${dose}, ab ${formatTime(entry.startedAt)}${
                entry.endedAt === null ? ', läuft' : ` bis ${formatTime(entry.endedAt)}`
              }`

        return (
          <Fragment key={entry.id}>
            <text
              x={GUTTER - 8}
              y={y + 4}
              fill={chart.inkMuted}
              fontSize={12}
              textAnchor="end"
            >
              {entry.drug}
            </text>

            {entry.type === 'bolus' ? (
              <line
                x1={start}
                x2={start}
                y1={y - MED_TICK / 2}
                y2={y + MED_TICK / 2}
                stroke={chart.ink}
                strokeWidth={2}
              />
            ) : (
              <>
                <rect
                  x={start}
                  y={y - MED_RULE / 2}
                  width={end - start}
                  height={MED_RULE}
                  fill={chart.inkMuted}
                />
                {/* Serifs, not the rule, are what say where an infusion ran. A 3px rule is thin
                    enough that its own ends read as the line fading out, and the one thing this
                    row has to answer is when the drug started and whether it has stopped. A
                    running infusion is drawn to the right edge of the window and closes with
                    nothing, so an open end looks open. */}
                <line
                  x1={start}
                  x2={start}
                  y1={y - MED_SERIF / 2}
                  y2={y + MED_SERIF / 2}
                  stroke={chart.inkMuted}
                  strokeWidth={2}
                />
                {entry.endedAt !== null && (
                  <line
                    x1={end}
                    x2={end}
                    y1={y - MED_SERIF / 2}
                    y2={y + MED_SERIF / 2}
                    stroke={chart.inkMuted}
                    strokeWidth={2}
                  />
                )}
              </>
            )}

            <text
              className="timeline__num"
              x={flip ? start - 10 : end + 10}
              y={y + 4}
              fill={chart.ink}
              fontSize={11}
              textAnchor={flip ? 'end' : 'start'}
            >
              {dose}
            </text>

            {/* Last, so it sits above the row's own ink: an SVG element painted later is the one
                that receives the pointer, and a bar drawn over this rect would swallow the tap.
                One row is one entry, so the whole row is the target — on an iPad that is a band
                the width of the screen rather than a 10px dot on a five-hour axis. */}
            <HitArea
              x={0}
              y={y - MED_ROW_HEIGHT / 2}
              width={width}
              height={MED_ROW_HEIGHT}
              label={`${summary}. Bearbeiten.`}
              entryId={entry.id}
              onEdit={onEdit}
            />
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
  onEdit,
}: {
  width: number
  window: TimeWindow
  events: PhaseEventEntry[]
  onEdit: (id: string) => void
}) {
  // Kept when empty for the reason the medication band is: it heads the button below it.
  const height = events.length === 0 ? 24 : 24 + EVENT_ROW_HEIGHT * 2
  const scale = createLaneScales(
    { left: GUTTER, right: plotRight(width), top: 0, bottom: 0 },
    window,
    [0, 1],
  ).time

  return (
    <svg
      width={width}
      height={height}
      className="timeline__band"
      role="group"
      aria-label="Ereignisse"
    >
      <text x={0} y={18} fill={chart.ink} fontSize={13} fontWeight={600}>
        Ereignisse
      </text>

      {events.map((event, index) => {
        const x = scale.map(event.at)
        const row = index % 2
        const y = 30 + row * EVENT_ROW_HEIGHT
        // Milestones near the end of a case (discharge, above all) would print past the edge, so
        // their labels flip to the left of the marker.
        const flip = x + 130 > plotRight(width)
        const labelX = flip ? x - 8 : x + 8

        return (
          <Fragment key={event.id}>
            <line x1={x} x2={x} y1={24} y2={y + 8} stroke={chart.gridMajor} strokeWidth={1} />
            <circle cx={x} cy={y + 8} r={4} fill={chart.inkMuted} />
            <text
              x={labelX}
              y={y + 12}
              fill={chart.inkMuted}
              fontSize={12}
              textAnchor={flip ? 'end' : 'start'}
            >
              {PHASE_EVENTS[event.event].label}
            </text>
            <text
              className="timeline__num"
              x={labelX}
              y={y + 25}
              fill={chart.inkMuted}
              fontSize={11}
              textAnchor={flip ? 'end' : 'start'}
            >
              {formatTime(event.at)}
            </text>

            {/* Last, and sized to the label rather than the dot: the words are what the eye and
                the finger both go to, and the dot alone is an 8px target. */}
            <HitArea
              x={flip ? labelX - EVENT_HIT_WIDTH : labelX - 16}
              y={y - 6}
              width={EVENT_HIT_WIDTH}
              height={EVENT_ROW_HEIGHT}
              label={`${PHASE_EVENTS[event.event].label}, ${formatTime(event.at)}. Bearbeiten.`}
              entryId={event.id}
              onEdit={onEdit}
            />
          </Fragment>
        )
      })}
    </svg>
  )
}
