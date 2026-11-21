import textStyles from '@/shared/ui/typography.module.css'
import badgeStyles from '@/shared/ui/status-badge.module.css'
import buttonStyles from '@/shared/ui/button.module.css'
import styles from './campaign-table.module.css'
import { cx } from '@/shared/lib/class-names'
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Layers3, Settings2 } from 'lucide-react'
import type { CampaignListItem } from '@/entities/campaign/model/types'

export default function CampaignTable({
  campaigns: filtered,
  search = '',
}: {
  campaigns: CampaignListItem[]
  search?: string
}) {
  const [params, setParams] = useSearchParams()
  const sizes = [25, 50, 100, 250, 500, 1000]
  const requestedSize = Number(params.get('limit') ?? 100)
  const size = sizes.includes(requestedSize) ? requestedSize : 100
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const requestedPage = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(pages, requestedPage))
    : 1
  const start = (page - 1) * size
  const rows = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (rows.current) rows.current.scrollTop = 0
  }, [page, size, search])
  function changePage(next: number) {
    setParams((current) => {
      const nextParams = new URLSearchParams(current)
      if (next === 1) nextParams.delete('page')
      else nextParams.set('page', String(next))
      return nextParams
    })
  }
  function changeSize(next: string) {
    setParams((current) => {
      const nextParams = new URLSearchParams(current)
      nextParams.set('limit', next)
      nextParams.delete('page')
      return nextParams
    })
  }
  return (
    <>
      <div className={styles['campaign-table-head']}>
        <span>Название кампании</span>
        <span>Статус</span>
        <span>Действия</span>
      </div>
      <div className={styles['campaign-rows']} ref={rows}>
        {filtered.slice(start, start + size).map((item) => (
          <div className={styles['campaign-row']} key={item.id}>
            <Link
              className={styles['campaign-name']}
              to={`/campaigns/${item.id}`}
            >
              <span className={styles['campaign-symbol']}>
                <Layers3 size={20} />
              </span>
              <span>
                <strong>{item.name}</strong>
                <small className={textStyles.mono}>
                  #{item.id} {item.alias && <span>· {item.alias}</span>}
                </small>
              </span>
            </Link>
            <span
              className={cx(
                badgeStyles.pill,
                item.state === 'active'
                  ? badgeStyles.green
                  : badgeStyles.neutral,
              )}
            >
              {item.state === 'active' ? 'Активна' : 'Выключена'}
            </span>
            <Link
              className={cx(
                buttonStyles.button,
                buttonStyles.small,
                buttonStyles.secondary,
              )}
              to={`/campaigns/${item.id}`}
            >
              <Settings2 size={14} />
              Редактировать
            </Link>
          </div>
        ))}
      </div>
      <div className={styles['list-footer']}>
        <label className={styles['page-size']}>
          Строк на странице
          <select
            aria-label="Количество кампаний на странице"
            value={size}
            onChange={(event) => changeSize(event.target.value)}
          >
            {sizes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <span role="status" aria-live="polite">
          {filtered.length ? start + 1 : 0}–
          {Math.min(start + size, filtered.length)} из {filtered.length}
        </span>
        <nav className={styles.pagination} aria-label="Страницы кампаний">
          <button
            className={buttonStyles['text-button']}
            disabled={page === 1}
            onClick={() => changePage(page - 1)}
            aria-label="Предыдущая страница кампаний"
          >
            Назад
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            className={buttonStyles['text-button']}
            disabled={page === pages}
            onClick={() => changePage(page + 1)}
            aria-label="Следующая страница кампаний"
          >
            Вперёд
          </button>
        </nav>
      </div>
    </>
  )
}
