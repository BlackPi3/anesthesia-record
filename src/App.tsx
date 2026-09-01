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
import { Alert, Button, Typography } from 'antd'

import { CaseHeader } from './CaseHeader'
import { createDemoCase } from './domain/demoCase'
import { AddEntry } from './entry/AddEntry'
import { EditEntry } from './entry/EditEntry'
import { addDraft, correctDraft } from './entry/draft'
import { targetKey, type AddTarget } from './entry/target'
import { correctVitals, removeEntry } from './domain/mutations'
import { clearCase, loadCase, saveCase } from './domain/storage'
import type { AnesthesiaCase } from './domain/types'
import { Timeline } from './timeline/Timeline'
import { useCase } from './useCase'

/**
 * `recoverable` is the screen's question, not storage's. `loadCase` reports *what* failed; this is
 * the one conclusion the error screen draws from it — whether there is anything the user can press
 * to get out. Only a `content` failure qualifies: the bytes under the key are unreadable but the
 * key can still be written, so discarding them ends the failure. A denied storage API cannot be
 * argued with, and neither can a seed that would not save, since nothing is stored to discard.
 */
type Opened =
  | { kind: 'ready'; record: AnesthesiaCase }
  | { kind: 'error'; message: string; recoverable: boolean }

function openCase(): Opened {
  const result = loadCase()

  if (result.status === 'error') {
    return { kind: 'error', message: result.message, recoverable: result.cause === 'content' }
  }
  if (result.status === 'loaded') return { kind: 'ready', record: result.case }

  const seeded = createDemoCase()
  const saved = saveCase(seeded)
  return saved.status === 'error'
    ? { kind: 'error', message: saved.message, recoverable: false }
    : { kind: 'ready', record: seeded }
}

export default function App() {
  const [opened, setOpened] = useState<Opened>(openCase)

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
        {opened.recoverable ? (
          <>
            {/* Without this the screen is a dead end. Reloading re-reads the same unreadable
                bytes and fails identically every time, so the advice given for a denied storage
                API — check the browser, reload — is not merely unhelpful here, it is wrong: the
                browser is allowing storage, and the app is bricked on this device until somebody
                opens the developer tools.

                It asks nothing first, in keeping with every other action in the app. The
                difference is that this one cannot be undone, because undo lives inside a case
                that never loaded — so the consequence is spelled out on the button's own line
                rather than in a dialog that would be dismissed without being read. Nothing
                readable is being discarded: the data is already unreadable, which is why this
                screen is on. */}
            <Button
              type="primary"
              size="large"
              // Cleared and re-read here, then handed to `setOpened` as a finished value. Both
              // calls are side effects, and a state updater has to be pure — React runs updaters
              // twice in development precisely to surface this, which here would mean clearing
              // storage twice and re-seeding over the first seed.
              onClick={() => {
                clearCase()
                setOpened(openCase())
              }}
            >
              Gespeicherte Daten verwerfen und neu beginnen
            </Button>
            <Typography.Text type="secondary" style={{ maxWidth: 520, textAlign: 'center' }}>
              Die unlesbaren Daten werden dabei endgültig gelöscht. Das Protokoll beginnt
              anschließend neu mit den Demodaten.
            </Typography.Text>
          </>
        ) : (
          <Typography.Text type="secondary">
            Prüfen Sie, ob der Browser lokalen Speicher zulässt, und laden Sie die Seite neu.
          </Typography.Text>
        )}
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
      <CaseHeader
        record={record}
        save={save}
        canUndo={canUndo}
        onUndo={undo}
        // A reset is an ordinary update to a fresh demo case, not a separate path through
        // storage: it is written, confirmed and undone exactly like a corrected value.
        onReset={() => update(createDemoCase())}
        // The completeness check opens the same two sheets the timeline opens, through the same
        // two pieces of state. A flag is a second way to reach an entry, never a second way to
        // write one.
        onAdd={setAdding}
        onEdit={setEditingId}
      />
      <main className="app__main">
        <Timeline
          record={record}
          onCorrect={(corrections) => update(correctVitals(record, corrections))}
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
