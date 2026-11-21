import { Check, LockKeyhole, RefreshCw } from 'lucide-react'
import { cx } from '@/shared/lib/class-names'
import buttonStyles from '@/shared/ui/button.module.css'
import animationStyles from '@/shared/ui/animation.module.css'
import styles from './stream-editor.module.css'

export function StreamEditorActions({
  changed,
  pending,
  total,
  onCancel,
  onSave,
}: {
  changed: boolean
  pending: boolean
  total: number
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className={styles['stream-footer']}>
      <span>
        <LockKeyhole size={14} />
        Закреплённые доли сохраняются при пересчёте
      </span>
      <div>
        <button
          className={cx(buttonStyles.button, buttonStyles.secondary)}
          disabled={!changed || pending}
          onClick={onCancel}
        >
          Отменить
        </button>
        <button
          className={cx(buttonStyles.button, buttonStyles.primary)}
          disabled={!changed || pending || total !== 100}
          onClick={onSave}
        >
          {pending ? (
            <RefreshCw className={animationStyles.spin} size={16} />
          ) : (
            <Check size={17} />
          )}
          {pending ? 'Сохранение…' : 'Сохранить в Keitaro'}
        </button>
      </div>
    </div>
  )
}
