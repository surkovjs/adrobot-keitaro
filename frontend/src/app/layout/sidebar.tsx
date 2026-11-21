import styles from './sidebar.module.css'
import { cx } from '@/shared/lib/class-names'
import { Link, useMatch, useNavigate } from 'react-router-dom'
import { Activity, ExternalLink, LayoutGrid, Plus } from 'lucide-react'
import { useWorkspace } from '@/app/providers/workspace-provider'

export default function Sidebar() {
  const { campaigns, catalog, loading, health } = useWorkspace()
  const isCreating = Boolean(useMatch('/campaigns/new'))
  const navigateRoute = useNavigate()
  const navigate = (view: 'list' | 'create') =>
    void navigateRoute(view === 'list' ? '/campaigns' : '/campaigns/new')
  return (
    <aside className={styles.sidebar}>
      <Link to="/campaigns" className={styles.brand}>
        <span className={styles['brand-icon']}>
          <Activity size={23} strokeWidth={2.4} />
        </span>
        adrobot<span className={styles['brand-dot']}>.</span>
      </Link>
      <div className={styles['workspace-label']}>CAMPAIGN WORKSPACE</div>
      <nav aria-label="Главная навигация">
        <button
          className={
            !isCreating
              ? cx(styles['nav-item'], styles.active)
              : styles['nav-item']
          }
          onClick={() => navigate('list')}
        >
          <LayoutGrid size={18} />
          Кампании
          <span className={styles['nav-count']}>{campaigns.length || '—'}</span>
        </button>
        <button
          className={
            isCreating
              ? cx(styles['nav-item'], styles.active)
              : styles['nav-item']
          }
          disabled={!catalog || loading}
          onClick={() => navigate('create')}
        >
          <Plus size={19} />
          Новая кампания
        </button>
      </nav>
      <div className={styles['sidebar-bottom']}>
        <div className={styles.integration}>
          <span className={styles['integration-icon']}>K</span>
          <div>
            <strong>Keitaro</strong>
            <span>
              {!health
                ? 'Проверяем настройки…'
                : health.configured
                  ? 'Подключение настроено'
                  : 'Укажите адрес и API-ключ'}
            </span>
          </div>
          {health?.configured && <span className={styles['connection-dot']} />}
        </div>
        {health?.tracker_url && (
          <a
            className={styles['sidebar-link']}
            href={`${health.tracker_url}/admin/`}
            target="_blank"
            rel="noreferrer"
          >
            Открыть Keitaro
            <ExternalLink size={14} />
          </a>
        )}
        <div className={styles['sidebar-caption']}>
          Меньше рутины.
          <br />
          Больше контроля.
        </div>
      </div>
    </aside>
  )
}
