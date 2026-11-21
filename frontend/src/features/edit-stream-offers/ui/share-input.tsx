import fieldStyles from '@/shared/ui/form-controls.module.css'
import styles from './share-input.module.css'
import { cx } from '@/shared/lib/class-names'
import { useEffect, useState } from 'react'
import type { OfferRow } from '@/entities/campaign/model/types'

export default function ShareInput({
  row,
  disabled,
  onCommit,
}: {
  row: OfferRow
  disabled: boolean
  onCommit: (value: number) => void
}) {
  const [value, setValue] = useState(String(row.share))
  useEffect(() => setValue(String(row.share)), [row.share, row.locked])
  function commit() {
    if (value !== String(row.share))
      onCommit(value.trim() === '' ? NaN : Number(value))
    setValue(String(row.share))
  }
  return (
    <div className={cx(styles['share-input'], row.removed && styles.removed)}>
      <input
        className={fieldStyles.input}
        aria-label={`Доля оффера ${row.offer_id}`}
        type="number"
        min="1"
        max="100"
        step="1"
        value={row.removed ? '0' : value}
        disabled={disabled || row.removed}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setValue(String(row.share))
            e.currentTarget.blur()
          }
        }}
      />
      <span>%</span>
    </div>
  )
}
