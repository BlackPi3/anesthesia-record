import { useCallback, useState } from 'react'

import { saveCase } from './domain/storage'
import type { AnesthesiaCase } from './domain/types'

/**
 * Holds the open case and writes every change straight to local storage.
 *
 * There is no debounce and no save button. A correction made during a case has to be durable the
 * moment it is made, because the next interruption may be the one that closes the tab. The write
 * is synchronous, so "saved" is a fact by the time the handler returns rather than a promise.
 *
 * The save outcome is surfaced rather than swallowed: local storage can fail, and a record that
 * silently stopped persisting would be worse than one that never persisted at all.
 *
 * The write happens in the callback, not inside a `setRecord` updater. Updaters must be pure —
 * React invokes them twice in development to surface exactly this kind of hidden effect, which
 * would have meant two writes per correction.
 */
export type SaveState =
  | { status: 'clean' }
  | { status: 'saved'; at: number }
  | { status: 'error'; message: string }

/**
 * How many steps back undo reaches. Deep enough to walk out of a mistake nobody noticed at once,
 * short enough that the list is never worth thinking about.
 */
const UNDO_DEPTH = 25

export function useCase(initial: AnesthesiaCase) {
  const [record, setRecord] = useState(initial)
  const [save, setSave] = useState<SaveState>({ status: 'clean' })
  /**
   * The cases this one replaced, newest last.
   *
   * Every mutation returns a whole new case rather than editing the old one, so the previous case
   * is still a perfectly good object — nothing copied it, nothing has to reconstruct it, and
   * holding on to it costs a reference. That is what makes undo a list and a pop rather than an
   * inverse for every mutation the app can perform.
   *
   * It is deliberately not persisted. Undo is for the slip you just made; a reload is where the
   * record stands as documented.
   */
  const [past, setPast] = useState<AnesthesiaCase[]>([])

  /** Both paths write, so the outcome is reported the same way for both. */
  const persist = useCallback((next: AnesthesiaCase) => {
    const result = saveCase(next)
    setSave(
      result.status === 'error'
        ? { status: 'error', message: result.message }
        : { status: 'saved', at: result.savedAt },
    )
  }, [])

  const update = useCallback(
    (next: AnesthesiaCase) => {
      // The mutations return the case unchanged when a change was a no-op, so dragging a point
      // back to where it started costs neither a render nor a write, and leaves nothing to undo.
      if (next === record) return

      setPast((history) => [...history, record].slice(-UNDO_DEPTH))
      setRecord(next)
      persist(next)
    },
    [record, persist],
  )

  /**
   * Back one step. The restored case carries its own revisions with it, so undoing a correction
   * removes it from the audit trail as well as from the chart: the record then reads as though the
   * change was never made, which is what it means to have not made it.
   */
  const undo = useCallback(() => {
    const previous = past.at(-1)
    if (previous === undefined) return

    // Read from the closure and write plainly, rather than reaching for the previous case inside a
    // `setPast` updater: an updater must be pure, and the write to storage in there would run
    // twice in development, which is React saying it could run twice anywhere.
    setPast(past.slice(0, -1))
    setRecord(previous)
    persist(previous)
  }, [past, persist])

  return { record, save, update, undo, canUndo: past.length > 0 }
}
