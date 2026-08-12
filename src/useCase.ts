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

export function useCase(initial: AnesthesiaCase) {
  const [record, setRecord] = useState(initial)
  const [save, setSave] = useState<SaveState>({ status: 'clean' })

  const update = useCallback(
    (next: AnesthesiaCase) => {
      // The mutations return the case unchanged when a change was a no-op, so dragging a point
      // back to where it started costs neither a render nor a write.
      if (next === record) return

      setRecord(next)
      const result = saveCase(next)
      setSave(
        result.status === 'error'
          ? { status: 'error', message: result.message }
          : { status: 'saved', at: result.savedAt },
      )
    },
    [record],
  )

  return { record, save, update }
}
