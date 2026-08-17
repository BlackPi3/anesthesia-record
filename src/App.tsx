/**
 * Loads the case and renders it.
 *
 * The read happens in a lazy state initialiser, not an effect. `localStorage` is synchronous, so
 * there is nothing to wait for: an effect would add one render with an empty screen and a
 * spinner that is never seen. There is deliberately no loading state here for the same reason —
 * when persistence becomes asynchronous, that is when a loading state earns its place.
 *
 * On a first visit there is nothing stored, so the app seeds the fictional demo case and saves
 * it. That is what makes the record survive a reload from the very first load rather than only
 * after the first entry.
 */

import { useEffect, useState } from 'react'
import { Alert, Typography } from 'antd'

import { CaseHeader } from './CaseHeader'
import { createDemoCase } from './domain/demoCase'
import { AddEntry } from './entry/AddEntry'
import { EditEntry } from './entry/EditEntry'
import { addDraft, correctDraft } from './entry/draft'
import { targetKey, type AddTarget } from './entry/target'
import { correctVital, removeEntry } from './domain/mutations'
import { loadCase, saveCase } from './domain/storage'
import type { AnesthesiaCase } from './domain/types'
import { Timeline } from './timeline/Timeline'
import { useCase } from './useCase'

type Opened = { kind: 'ready'; record: AnesthesiaCase } | { kind: 'error'; message: string }

function openCase(): Opened {
  const result = loadCase()

  if (result.status === 'error') return { kind: 'error', message: result.message }
  if (result.status === 'loaded') return { kind: 'ready', record: result.case }

  const seeded = createDemoCase()
  const saved = saveCase(seeded)
  return saved.status === 'error'
    ? { kind: 'error', message: saved.message }
    : { kind: 'ready', record: seeded }
}

export default function App() {
  const [opened] = useState<Opened>(openCase)

  if (opened.kind === 'error') {
    return (
      <div className="app app__centered">
        <Alert
          type="error"
          showIcon
          message="Das Protokoll konnte nicht geladen werden"
          description={opened.message}
          style={{ maxWidth: 520 }}
        />
        <Typography.Text type="secondary">
          Prüfen Sie, ob der Browser lokalen Speicher zulässt, und laden Sie die Seite neu.
        </Typography.Text>
      </div>
    )
  }

  return <OpenCase initial={opened.record} />
}

/**
 * Split out so the case hook is only ever created with a case that actually loaded, which keeps
 * its state non-optional.
 */
function OpenCase({ initial }: { initial: AnesthesiaCase }) {
  const { record, save, update, undo, canUndo } = useCase(initial)
  // The entry being edited is held by id rather than as an object. A correction produces a new
  // case, so a stored entry would be the version from before the edit within one keystroke.
  const [editingId, setEditingId] = useState<string | null>(null)
  // An entry undone out of the record stops being found here, which closes the sheet on its own.
  const editing = record.entries.find((entry) => entry.id === editingId) ?? null
  // Which row's button was pressed, and nothing more: the sheet works out what that opens on.
  const [adding, setAdding] = useState<AddTarget | null>(null)

  useKeyboardUndo(undo)

  return (
    <div className="app">
      <CaseHeader record={record} save={save} canUndo={canUndo} onUndo={undo} />
      <main className="app__main">
        <Timeline
          record={record}
          onCorrect={(id, next) => update(correctVital(record, id, next))}
          onRemove={(id) => update(removeEntry(record, id))}
          onEdit={setEditingId}
          onAdd={setAdding}
        />
      </main>

      {adding !== null && (
        // Keyed on the target for the reason the editing sheet is keyed on the entry: pressing a
        // different row while one sheet is open has to open on that row, not on the one before.
        <AddEntry
          key={targetKey(adding)}
          record={record}
          target={adding}
          onAdd={(draft) => update(addDraft(record, draft))}
          onClose={() => setAdding(null)}
        />
      )}

      {editing !== null && (
        // Keyed on the entry so the sheet mounts fresh for each one and seeds its draft from
        // props, with no effect copying one into the other. See EditEntry.
        <EditEntry
          key={editing.id}
          record={record}
          entry={editing}
          onCorrect={(id, draft) => update(correctDraft(record, id, draft))}
          onRemove={(id) => update(removeEntry(record, id))}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}

/**
 * Ctrl+Z, and Cmd+Z on a Mac.
 *
 * On `window` rather than on a container, because undo has to work wherever the last action left
 * the focus — on a lane, in the sheet, or nowhere in particular after a tap on the chart. This is
 * one of the few things in the app that is genuinely global, which is what earns the listener.
 *
 * An effect is the right tool precisely because it is not React's own event system: the handler
 * subscribes to something outside React and has to unsubscribe when the component goes, which is
 * what the returned function does.
 */
function useKeyboardUndo(undo: () => void) {
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (event.key !== 'z' && event.key !== 'Z') return
      if (!event.ctrlKey && !event.metaKey) return
      // Redo is a different feature and is not built; letting Shift+Z through would undo instead
      // of redoing, which is worse than doing nothing.
      if (event.shiftKey) return

      event.preventDefault()
      undo()
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [undo])
}
