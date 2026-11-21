import buttonStyles from '@/shared/ui/button.module.css'
import styles from './app-layout.module.css'
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Notice } from '@/shared/ui/notice'
import { useWorkspace } from '@/app/providers/workspace-provider'
import Header from './header'
import Sidebar from './sidebar'

export default function AppLayout() {
  const { pathname } = useLocation()
  const { error, dismissError, reload } = useWorkspace()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return (
    <div className={styles['app-shell']}>
      <Sidebar />
      <div className={styles['main-shell']}>
        <Header />
        <main className={styles.main}>
          {error && (
            <Notice close={dismissError}>
              {error}{' '}
              <button
                className={buttonStyles['text-button']}
                onClick={() => void reload()}
              >
                Повторить загрузку
              </button>
            </Notice>
          )}
          <Outlet />
        </main>
        <footer className={styles['app-footer']}>
          <span>Adrobot</span>
          <span>Campaign management, simplified.</span>
        </footer>
      </div>
    </div>
  )
}
