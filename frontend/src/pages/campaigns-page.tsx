import headingStyles from '@/shared/ui/page-heading.module.css'
import buttonStyles from '@/shared/ui/button.module.css'
import fieldStyles from '@/shared/ui/form-controls.module.css'
import animationStyles from '@/shared/ui/animation.module.css'
import stateStyles from '@/shared/ui/empty-state.module.css'
import panelStyles from '@/shared/ui/panel.module.css'
import styles from './campaigns-page.module.css'
import { cx } from '@/shared/lib/class-names'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CircleHelp, Layers3, Plus, RefreshCw, Search } from 'lucide-react'
import { useWorkspace } from '@/app/providers/workspace-provider'
import CampaignOverview from '@/entities/campaign/ui/campaign-overview'
import CampaignTable from '@/entities/campaign/ui/campaign-table'

export default function CampaignsPage() {
  const { campaigns, offers, catalog, loading, reload, query, setQuery } =
    useWorkspace()
  const navigateRoute = useNavigate()
  const [, setParams] = useSearchParams()
  const filtered = campaigns.filter((v) =>
    `${v.id} ${v.name}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <>
      <div className={headingStyles['page-heading']}>
        <div>
          <div className={headingStyles.eyebrow}>УПРАВЛЕНИЕ ТРАФИКОМ</div>
          <h1 className={headingStyles.title}>
            Кампании
            <span className={styles['heading-count']}>{campaigns.length}</span>
          </h1>
          <p>Создавайте кампании и управляйте распределением офферов.</p>
        </div>
        <button
          className={cx(buttonStyles.button, buttonStyles.primary)}
          disabled={!catalog || loading}
          onClick={() => void navigateRoute('/campaigns/new')}
        >
          <Plus size={18} />
          Новая кампания
        </button>
      </div>
      <CampaignOverview
        campaignCount={campaigns.length}
        offerCount={offers.length}
        domainCount={catalog?.domains.length ?? null}
      />
      <section className={panelStyles.panel}>
        <div className={styles['list-toolbar']}>
          <div className={styles['list-title']}>
            <h2>Все кампании</h2>
            <span>{filtered.length}</span>
          </div>
          <div className={styles['list-controls']}>
            <div
              className={cx(
                fieldStyles['search-input'],
                styles['campaign-search'],
              )}
            >
              <Search size={17} />
              <input
                className={fieldStyles.input}
                aria-label="Поиск кампаний"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setParams(
                    (current) => {
                      const next = new URLSearchParams(current)
                      next.delete('page')
                      return next
                    },
                    { replace: true },
                  )
                }}
                placeholder="Поиск по названию или ID"
              />
            </div>
            <button
              className={cx(
                buttonStyles['icon-button'],
                styles['refresh-button'],
              )}
              disabled={loading}
              onClick={() => void reload()}
              aria-label="Обновить кампании"
            >
              <RefreshCw
                size={17}
                className={loading ? animationStyles.spin : undefined}
              />
            </button>
          </div>
        </div>
        {loading ? (
          <div className={stateStyles['empty-state']}>
            <RefreshCw size={27} className={animationStyles.spin} />
            <h3>Загружаем данные Keitaro</h3>
            <p>Получаем кампании и справочники.</p>
          </div>
        ) : !filtered.length ? (
          <div className={stateStyles['empty-state']}>
            <Layers3 size={30} />
            <h3>{query ? 'Ничего не найдено' : 'Пока нет кампаний'}</h3>
            <p>
              {query
                ? 'Попробуйте другое название или ID.'
                : 'Создайте первую кампанию с двумя потоками.'}
            </p>
          </div>
        ) : (
          <CampaignTable campaigns={filtered} search={query} />
        )}
      </section>
      <div className={styles['page-footnote']}>
        <CircleHelp size={15} />
        Выберите кампанию, чтобы загрузить потоки и отредактировать офферы.
      </div>
    </>
  )
}
