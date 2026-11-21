import headingStyles from '@/shared/ui/page-heading.module.css'
import buttonStyles from '@/shared/ui/button.module.css'
import panelStyles from '@/shared/ui/panel.module.css'
import stateStyles from '@/shared/ui/empty-state.module.css'
import { cx } from '@/shared/lib/class-names'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className={cx(panelStyles.panel, stateStyles['empty-state'])}>
      <h1 className={headingStyles.title}>Страница не найдена</h1>
      <p>Проверьте адрес или вернитесь к списку кампаний.</p>
      <Link
        className={cx(buttonStyles.button, buttonStyles.secondary)}
        to="/campaigns"
      >
        Все кампании
      </Link>
    </div>
  )
}
