import buttonStyles from './button.module.css'
import styles from './notice.module.css'
import { cx } from '@/shared/lib/class-names'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Notice({
  children,
  close,
  success = false,
}: {
  children: ReactNode
  close?: () => void
  success?: boolean
}) {
  return (
    <div
      className={cx(styles.notice, success ? styles.success : styles.error)}
      role={success ? 'status' : 'alert'}
    >
      <span>{children}</span>
      {close && (
        <button
          className={buttonStyles['icon-button']}
          onClick={close}
          aria-label="Закрыть сообщение"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
