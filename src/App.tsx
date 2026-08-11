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
import { loadCase, saveCase } from './domain/storage'
import type { AnesthesiaCase } from './domain/types'
import { Timeline } from './timeline/Timeline'

type Status = { kind: 'ready'; record: AnesthesiaCase } | { kind: 'error'; message: string }

function openCase(): Status {
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
  const [status] = useState<Status>(openCase)

  if (status.kind === 'error') {
    return (
      <div className="app app__centered">
        <Alert
          type="error"
          showIcon
          message="Das Protokoll konnte nicht geladen werden"
          description={status.message}
          style={{ maxWidth: 520 }}
        />
        <Typography.Text type="secondary">
          Prüfen Sie, ob der Browser lokalen Speicher zulässt, und laden Sie die Seite neu.
        </Typography.Text>
      </div>
    )
  }

  return (
    <div className="app">
      <CaseHeader record={status.record} />
      <main className="app__main">
        <Timeline record={status.record} />
      </main>
    </div>
  )
}
