import { ExternalLink, Globe2 } from 'lucide-react'
import panelStyles from '@/shared/ui/panel.module.css'
import { cx } from '@/shared/lib/class-names'
import type { Stream } from '@/entities/campaign/model/types'
import styles from './stream-editor.module.css'

export function ReadonlyStream({ stream }: { stream: Stream }) {
  return (
    <section className={cx(panelStyles.panel, styles['redirect-panel'])}>
      <div className={styles['stream-icon']}>
        <Globe2 size={20} />
      </div>
      <div>
        <div className={styles['stream-overline']}>
          ПОТОК {stream.position} <span>#{stream.id}</span>
        </div>
        <h2>{stream.name}</h2>
        <p>
          {stream.filters.length
            ? stream.filters
                .map(
                  (v) =>
                    `${v.name}: ${Array.isArray(v.payload) ? v.payload.join(', ') : String(v.payload)}`,
                )
                .join(' · ')
            : 'Без фильтров'}{' '}
          · {stream.state === 'active' ? 'Активен' : 'Выключен'}
        </p>
      </div>
      <div className={styles['redirect-destination']}>
        <ExternalLink size={15} />
        <span>
          {stream.schema === 'redirect'
            ? stream.action_payload || 'URL не задан'
            : 'Просмотр в Keitaro'}
        </span>
      </div>
    </section>
  )
}
