import styles from './header.module.css'
import { cx } from '@/shared/lib/class-names'
import { useMatches } from 'react-router-dom'
import { useWorkspace } from '@/app/providers/workspace-provider'

export default function Header() {
  const { health } = useWorkspace()
  const matches = useMatches()
  const title =
    (matches.at(-1)?.handle as { title?: string } | undefined)?.title ??
    'Кампании'
  return (
    <header className={styles.topbar}>
      <div className={styles.breadcrumb}>
        <span>Workspace</span>
        <span>/</span>
        <strong>{title}</strong>
      </div>
      <div
        className={cx(
          styles.environment,
          !health?.configured && styles.unconfigured,
        )}
      >
        <span />
        {!health
          ? 'Проверяем настройки…'
          : health.configured
            ? 'Keitaro настроен'
            : 'Keitaro не настроен'}
      </div>
    </header>
  )
}
