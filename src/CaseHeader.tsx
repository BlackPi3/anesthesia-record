/**
 * Compact case context. Everything an anesthesiologist confirms at a glance and then stops
 * looking at, so it stays on one or two lines and never competes with the timeline.
 *
 * The facts are a description list that wraps, not AntD's `Descriptions`. That component lays out
 * a fixed grid, and at iPad width its columns became narrow enough to break values mid-word
 * ("Peni | cillin", "22.04.196 | 8"). A wrapping row keeps each fact whole and simply moves it to
 * the next line, which is the behaviour a header needs across two very different form factors.
 *
 * The demo badge is deliberate and permanent: this app holds fictional data, and nothing about
 * the layout should let it be mistaken for a real record.
 */

import { Tag, Typography } from 'antd'

import type { AnesthesiaCase } from './domain/types'
import { ageAt, formatDate, formatNumber, formatTime } from './format'
import type { SaveState } from './useCase'

const SEX_LABEL: Record<AnesthesiaCase['patient']['sex'], string> = {
  w: 'weiblich',
  m: 'männlich',
  d: 'divers',
}

/**
 * Save confirmation, in the header where it is visible without being in the way.
 *
 * It reports a fact, not an intention: the write to local storage has already completed by the
 * time this renders. A failure has to be loud, because a record that quietly stopped persisting
 * is the worst outcome this app has.
 */
function SaveStatus({ save }: { save: SaveState }) {
  if (save.status === 'clean') return null

  if (save.status === 'error') {
    return (
      <Typography.Text type="danger" role="alert" style={{ fontSize: 13 }}>
        Nicht gespeichert: {save.message}
      </Typography.Text>
    )
  }

  return (
    <Typography.Text type="success" role="status" style={{ fontSize: 13 }}>
      Gespeichert {formatTime(save.at)}
    </Typography.Text>
  )
}

export function CaseHeader({ record, save }: { record: AnesthesiaCase; save: SaveState }) {
  const { patient, baseline } = record

  const facts: Array<[label: string, value: string]> = [
    ['Datum', formatDate(record.date)],
    [
      'Geburtsdatum',
      `${formatDate(patient.dateOfBirth)} (${ageAt(patient.dateOfBirth, record.date)} J.)`,
    ],
    ['Geschlecht', SEX_LABEL[patient.sex]],
    [
      'Größe / Gewicht',
      `${formatNumber(patient.heightCm)} cm / ${formatNumber(patient.weightKg)} kg`,
    ],
    ['ASA', `${patient.asa}`],
    [
      'Ausgangswerte',
      `RR ${baseline.bloodPressureSystolic}/${baseline.bloodPressureDiastolic} mmHg · HF ${baseline.heartRate}/min`,
    ],
    ['Allergien', patient.allergies.length > 0 ? patient.allergies.join(', ') : 'keine bekannt'],
  ]

  return (
    <header className="case-header">
      <div className="case-header__title">
        <Typography.Title level={1} style={{ fontSize: 20, margin: 0 }}>
          {patient.lastName}, {patient.firstName}
        </Typography.Title>
        <Typography.Text type="secondary">{record.procedure}</Typography.Text>
        <Tag bordered>Demodaten</Tag>
        <span className="case-header__save">
          <SaveStatus save={save} />
        </span>
      </div>

      <dl className="case-facts">
        {facts.map(([label, value]) => (
          <div key={label} className="case-facts__item">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </header>
  )
}
