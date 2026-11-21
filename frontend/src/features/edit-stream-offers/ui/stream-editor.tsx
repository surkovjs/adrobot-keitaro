import { useState } from 'react'
import { Layers3, Plus, RotateCcw } from 'lucide-react'
import type { Stream } from '@/entities/campaign/model/types'
import type { Reference } from '@/shared/model/reference'
import { cx } from '@/shared/lib/class-names'
import { Notice } from '@/shared/ui/notice'
import { OfferPicker } from '@/entities/offer/ui/offer-picker'
import panelStyles from '@/shared/ui/panel.module.css'
import badgeStyles from '@/shared/ui/status-badge.module.css'
import buttonStyles from '@/shared/ui/button.module.css'
import { useStreamEditor } from '@/features/edit-stream-offers/model/use-stream-editor'
import { ReadonlyStream } from './readonly-stream'
import { StreamOfferTable } from './stream-offer-table'
import { StreamEditorActions } from './stream-editor-actions'
import styles from './stream-editor.module.css'

const DISTRIBUTION_COLORS = [
  '#236752',
  '#528d77',
  '#84b39e',
  '#bad3c5',
  '#3b7a73',
  '#9ac7ba',
]

export default function StreamEditor({
  stream,
  campaignId,
  offers,
  onSaved,
  reportDirty,
  trackerUrl,
  onBusy,
  onReload,
}: {
  stream: Stream
  campaignId: number
  offers: Reference[]
  onSaved: (stream: Stream) => void
  reportDirty: (id: number, value: boolean) => void
  trackerUrl: string | null
  onBusy: (value: boolean) => void
  onReload?: () => void | Promise<void>
}) {
  const {
    state,
    dispatch,
    pending,
    saveError,
    needsReload,
    setSaveError,
    success,
    setSuccess,
    changed,
    active,
    total,
    save,
  } = useStreamEditor({ stream, campaignId, onSaved, reportDirty, onBusy })
  const [showRemoved, setShowRemoved] = useState(true)
  const removedCount = state.rows.length - active.length
  if (!stream.editable) return <ReadonlyStream stream={stream} />
  return (
    <section
      className={cx(
        panelStyles.panel,
        styles['stream-panel'],
        changed ? styles['has-changes'] : undefined,
      )}
    >
      <div className={styles['stream-header']}>
        <div className={styles['stream-title']}>
          <div className={styles['stream-icon']}>
            <Layers3 size={20} />
          </div>
          <div>
            <div className={styles['stream-overline']}>
              ПОТОК {stream.position} <span>#{stream.id}</span>
            </div>
            <h2>{stream.name}</h2>
          </div>
        </div>
        <span
          className={cx(
            badgeStyles.pill,
            changed ? badgeStyles.amber : badgeStyles.neutral,
          )}
        >
          {changed
            ? 'Есть изменения'
            : stream.state === 'disabled'
              ? 'Поток выключен'
              : 'Синхронизирован'}
        </span>
      </div>
      <div className={styles['stream-toolbar']}>
        <div>
          <strong>{active.length}</strong> офферов{' '}
          <span className={styles.separator}>/</span>
          <strong className={total !== 100 ? styles['danger-text'] : undefined}>
            {total}%
          </strong>{' '}
          распределено
        </div>
        <div className={styles['toolbar-actions']}>
          {removedCount > 0 && (
            <label className={styles['check-label']}>
              <input
                type="checkbox"
                checked={showRemoved}
                onChange={(e) => setShowRemoved(e.target.checked)}
              />
              Удалённые ({removedCount})
            </label>
          )}
          <button
            className={buttonStyles['text-button']}
            disabled={pending}
            onClick={() => dispatch({ type: 'equalize' })}
          >
            <RotateCcw size={14} />
            Поровну
          </button>
        </div>
      </div>
      {(state.error || saveError) && (
        <div className={styles['stream-notice']}>
          <Notice
            close={() => {
              dispatch({ type: 'dismiss' })
              setSaveError('')
            }}
          >
            {state.error || saveError}
            {saveError && needsReload && onReload && (
              <button
                className={buttonStyles['text-button']}
                disabled={pending}
                onClick={() => void onReload()}
              >
                Загрузить заново
              </button>
            )}
          </Notice>
        </div>
      )}
      {success && (
        <div className={styles['stream-notice']}>
          <Notice success close={() => setSuccess(false)}>
            Доли сохранены и проверены в Keitaro.
          </Notice>
        </div>
      )}
      <div
        className={styles['distribution-bar']}
        role="img"
        aria-label={`Распределено ${total}%`}
      >
        {active.map((row, i) => (
          <div
            key={row.offer_id}
            style={{
              width: `${row.share}%`,
              background: DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length],
            }}
            title={`${row.name}: ${row.share}%`}
          />
        ))}
      </div>
      <StreamOfferTable
        rows={state.rows}
        showRemoved={showRemoved}
        pending={pending}
        trackerUrl={trackerUrl}
        dispatch={dispatch}
      />
      <div className={styles['add-offer-row']}>
        <Plus size={18} />
        <OfferPicker
          offers={offers}
          excluded={state.rows.map((v) => v.offer_id)}
          disabled={pending}
          onSelect={(offer) => dispatch({ type: 'add', offer })}
        />
        <span>Добавить в поток</span>
      </div>
      <StreamEditorActions
        changed={changed}
        pending={pending}
        total={total}
        onCancel={() => {
          dispatch({ type: 'cancel' })
          setSaveError('')
        }}
        onSave={() => void save()}
      />
    </section>
  )
}
