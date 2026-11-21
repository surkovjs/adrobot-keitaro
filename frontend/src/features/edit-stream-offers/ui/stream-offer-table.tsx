import type { Dispatch } from 'react'
import {
  ExternalLink,
  Link2,
  LockKeyhole,
  RotateCcw,
  Trash2,
  UnlockKeyhole,
} from 'lucide-react'
import type { OfferRow } from '@/entities/campaign/model/types'
import type { EditorAction } from '@/features/edit-stream-offers/model/editor-reducer'
import { cx } from '@/shared/lib/class-names'
import a11yStyles from '@/shared/ui/accessibility.module.css'
import textStyles from '@/shared/ui/typography.module.css'
import buttonStyles from '@/shared/ui/button.module.css'
import styles from './stream-editor.module.css'
import ShareInput from './share-input'

export function StreamOfferTable({
  rows,
  showRemoved,
  pending,
  trackerUrl,
  dispatch,
}: {
  rows: OfferRow[]
  showRemoved: boolean
  pending: boolean
  trackerUrl: string | null
  dispatch: Dispatch<EditorAction>
}) {
  return (
    <div className={styles['offers-table-wrap']}>
      <table className={styles['offers-table']}>
        <thead>
          <tr>
            <th>Оффер</th>
            <th>Доля трафика</th>
            <th>
              <span className={a11yStyles['sr-only']}>Действия</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((row) => showRemoved || !row.removed)
            .map((row) => (
              <tr
                key={row.offer_id}
                className={row.removed ? styles['removed-row'] : undefined}
              >
                <td>
                  <div className={styles['offer-name']}>
                    <span className={styles['offer-symbol']}>
                      <Link2 size={17} />
                    </span>
                    <div>
                      {trackerUrl ? (
                        <a
                          href={`${trackerUrl}/admin/#!/offers/${row.offer_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {row.name}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <strong>{row.name}</strong>
                      )}
                      <div className={styles['offer-meta']}>
                        <span className={textStyles.mono}>#{row.offer_id}</span>
                        {row.removed ? (
                          <span>Удалён из потока</span>
                        ) : row.locked ? (
                          <span>
                            <LockKeyhole size={11} />
                            Доля закреплена
                          </span>
                        ) : (
                          <span>Автоматическая доля</span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className={styles['share-controls']}>
                    <ShareInput
                      row={row}
                      disabled={pending}
                      onCommit={(value) =>
                        dispatch({ type: 'share', id: row.offer_id, value })
                      }
                    />
                    <button
                      className={cx(
                        buttonStyles['icon-button'],
                        styles['lock-button'],
                        row.locked ? styles.locked : undefined,
                      )}
                      disabled={pending || row.removed}
                      aria-label={`${row.locked ? 'Открепить' : 'Закрепить'} долю оффера ${row.offer_id}`}
                      title={row.locked ? 'Открепить долю' : 'Закрепить долю'}
                      onClick={() =>
                        dispatch({ type: 'lock', id: row.offer_id })
                      }
                    >
                      {row.locked ? (
                        <LockKeyhole size={16} />
                      ) : (
                        <UnlockKeyhole size={16} />
                      )}
                    </button>
                  </div>
                </td>
                <td className={styles['row-action']}>
                  <button
                    className={
                      row.removed
                        ? cx(
                            buttonStyles['text-button'],
                            styles['restore-button'],
                          )
                        : cx(
                            buttonStyles['icon-button'],
                            styles['delete-button'],
                          )
                    }
                    disabled={pending}
                    aria-label={`${row.removed ? 'Вернуть' : 'Удалить'} оффер ${row.offer_id}`}
                    onClick={() =>
                      dispatch({
                        type: row.removed ? 'restore' : 'remove',
                        id: row.offer_id,
                      })
                    }
                  >
                    {row.removed ? (
                      <>
                        <RotateCcw size={14} />
                        Вернуть
                      </>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
