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

import { useState } from 'react'
import { Alert, Typography } from 'antd'

import { CaseHeader } from './CaseHeader'
import { createDemoCase } from './domain/demoCase'
import { AddEntry } from './entry/AddEntry'
import { EditEntry } from './entry/EditEntry'
import { addDraft, correctDraft } from './entry/draft'
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
  const { record, save, update } = useCase(initial)
  // The entry being edited is held by id rather than as an object. A correction produces a new
  // case, so a stored entry would be the version from before the edit within one keystroke.
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = record.entries.find((entry) => entry.id === editingId) ?? null

  return (
    <div className="app">
      <CaseHeader record={record} save={save} />
      <main className="app__main">
        <Timeline
          record={record}
          onCorrect={(id, next) => update(correctVital(record, id, next))}
          onRemove={(id) => update(removeEntry(record, id))}
          onEdit={setEditingId}
        />
      </main>
      <div className="app__actions">
        <AddEntry record={record} onAdd={(draft) => update(addDraft(record, draft))} />
      </div>

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
