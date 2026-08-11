/**
 * Persistence for one case, in the browser's localStorage.
 *
 * Everything that touches localStorage lives behind these four functions, so the rest of the app
 * never sees a storage key or a JSON string. If a backend is added later, only this file changes.
 *
 * localStorage is not a safe API to call directly: it throws when a Safari private window denies
 * access, when the origin quota is exceeded, and it hands back whatever string is under the key,
 * including a truncated or hand-edited one. So both operations return a result union rather than
 * throwing or returning `null`, which forces every caller to say what it does when storage fails.
 * That is also exactly the empty / error distinction the UI has to render.
 */

import type { AnesthesiaCase, Entry, Timestamp } from './types'

const STORAGE_KEY = 'anesthesia-record:case'

/**
 * Bumped when the persisted shape changes incompatibly. A stored case from an older version is
 * reported as an error rather than guessed at, so a bad restore can never be mistaken for real
 * documentation.
 */
const SCHEMA_VERSION = 1

interface Envelope {
  schemaVersion: number
  savedAt: Timestamp
  case: AnesthesiaCase
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; case: AnesthesiaCase; savedAt: Timestamp }
  | { status: 'error'; message: string }

export type SaveResult =
  | { status: 'saved'; savedAt: Timestamp }
  | { status: 'error'; message: string }

/**
 * Structural check on data coming back from storage. It confirms the fields the app dereferences
 * are present and of the right kind; it does not re-validate every entry field.
 *
 * A schema validator (zod or similar) would check the whole tree and give better messages. That
 * is the right answer for a persisted format that outlives the code, and it is a dependency worth
 * adding if this grows past one screen. At this size the guard covers the failure that actually
 * happens, which is "the key holds something that is not a case at all".
 */
function isCase(value: unknown): value is AnesthesiaCase {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<AnesthesiaCase>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.procedure === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.startedAt === 'number' &&
    typeof candidate.patient === 'object' &&
    candidate.patient !== null &&
    Array.isArray(candidate.entries) &&
    candidate.entries.every(isEntry)
  )
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Entry>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.recordedAt === 'number' &&
    (candidate.deletedAt === null || typeof candidate.deletedAt === 'number') &&
    (candidate.type === 'vital' ||
      candidate.type === 'bolus' ||
      candidate.type === 'infusion' ||
      candidate.type === 'event')
  )
}

export function loadCase(): LoadResult {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return {
      status: 'error',
      message: 'Auf den lokalen Speicher kann nicht zugegriffen werden.',
    }
  }

  if (raw === null) return { status: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      status: 'error',
      message: 'Die gespeicherten Falldaten sind beschädigt und können nicht gelesen werden.',
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      status: 'error',
      message: 'Die gespeicherten Falldaten sind beschädigt und können nicht gelesen werden.',
    }
  }

  const envelope = parsed as Partial<Envelope>

  if (envelope.schemaVersion !== SCHEMA_VERSION) {
    return {
      status: 'error',
      message: 'Die gespeicherten Falldaten stammen aus einer älteren Version der Anwendung.',
    }
  }

  if (!isCase(envelope.case)) {
    return {
      status: 'error',
      message: 'Die gespeicherten Falldaten sind unvollständig.',
    }
  }

  return {
    status: 'loaded',
    case: envelope.case,
    savedAt: typeof envelope.savedAt === 'number' ? envelope.savedAt : 0,
  }
}

export function saveCase(value: AnesthesiaCase, now: Timestamp = Date.now()): SaveResult {
  const envelope: Envelope = { schemaVersion: SCHEMA_VERSION, savedAt: now, case: value }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch (error) {
    const quotaExceeded = error instanceof DOMException && error.name === 'QuotaExceededError'
    return {
      status: 'error',
      message: quotaExceeded
        ? 'Der lokale Speicher ist voll. Die letzte Änderung wurde nicht gesichert.'
        : 'Die Änderung konnte nicht gesichert werden.',
    }
  }

  return { status: 'saved', savedAt: now }
}

/** Removes the stored case. Used by the reset action and by test setup. */
export function clearCase(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing useful to do: if storage is unreachable there is nothing stored to clear.
  }
}
