import fieldStyles from './form-controls.module.css'
import type { Reference } from '@/shared/model/reference'

export function SelectField({
  label,
  value,
  onChange,
  items,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  items: Reference[]
  disabled?: boolean
}) {
  return (
    <label className={fieldStyles.field}>
      <span>{label}</span>
      <select
        className={fieldStyles.select}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Выберите…</option>
        {items.map((v) => (
          <option value={v.id} key={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </label>
  )
}
