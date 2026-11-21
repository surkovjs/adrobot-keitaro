import styles from './campaign-overview.module.css'
import { Globe2, Layers3, Link2, ShieldCheck } from 'lucide-react'

export default function CampaignOverview({
  campaignCount,
  offerCount,
  domainCount,
}: {
  campaignCount: number
  offerCount: number
  domainCount: number | null
}) {
  return (
    <div className={styles['overview-strip']}>
      <div>
        <span className={styles['overview-icon']}>
          <Layers3 size={19} />
        </span>
        <div>
          <span>Кампании</span>
          <strong>{campaignCount}</strong>
        </div>
      </div>
      <div>
        <span className={styles['overview-icon']}>
          <Link2 size={19} />
        </span>
        <div>
          <span>Доступные офферы</span>
          <strong>{offerCount}</strong>
        </div>
      </div>
      <div>
        <span className={styles['overview-icon']}>
          <Globe2 size={19} />
        </span>
        <div>
          <span>Домены</span>
          <strong>{domainCount ?? '—'}</strong>
        </div>
      </div>
      <div className={styles['overview-note']}>
        <ShieldCheck size={19} />
        <span>
          Изменения отправляются
          <br />
          после сохранения
        </span>
      </div>
    </div>
  )
}
