import fieldStyles from '@/shared/ui/form-controls.module.css'
import textStyles from '@/shared/ui/typography.module.css'
import styles from './offer-picker.module.css'
import { cx } from '@/shared/lib/class-names'
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'
import type { Reference } from '@/shared/model/reference'

export function OfferPicker({
  offers,
  onSelect,
  excluded = [],
  disabled = false,
}: {
  offers: Reference[]
  onSelect: (offer: Reference) => void
  excluded?: number[]
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  const available = offers.filter(
    (v) =>
      !excluded.includes(v.id) &&
      `${v.id} ${v.name}`.toLowerCase().includes(query.toLowerCase()),
  )
  const visible = available.slice(0, 50)
  const selected = visible[Math.min(highlighted, visible.length - 1)]
  const activeId =
    open && !disabled && selected ? `${listId}-${selected.id}` : undefined
  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])
  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [])
  function choose(offer: Reference) {
    onSelect(offer)
    setQuery('')
    setOpen(false)
  }
  return (
    <div className={styles['offer-picker']} ref={root}>
      <div className={cx(fieldStyles['search-input'], styles['offer-search'])}>
        <Search size={17} />
        <input
          className={fieldStyles.input}
          aria-label="Поиск оффера по названию или ID"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open && !disabled ? listId : undefined}
          aria-activedescendant={activeId}
          value={query}
          disabled={disabled}
          placeholder="Название или ID оффера"
          onFocus={() => {
            setHighlighted(0)
            setOpen(true)
          }}
          onChange={(e) => {
            setHighlighted(0)
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Tab') setOpen(false)
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setOpen(true)
              setHighlighted((index) =>
                !open
                  ? e.key === 'ArrowDown'
                    ? 0
                    : visible.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        visible.length - 1,
                        index + (e.key === 'ArrowDown' ? 1 : -1),
                      ),
                    ),
              )
            }
            if (e.key === 'Enter' && open) {
              e.preventDefault()
              if (selected) choose(selected)
            }
          }}
        />
        <ChevronDown size={15} />
      </div>
      {open && !disabled && (
        <div
          className={styles['picker-results']}
          id={listId}
          role="listbox"
          aria-label="Офферы"
        >
          {!available.length && (
            <p className={styles['picker-empty']}>Офферы не найдены</p>
          )}
          {visible.map((offer, index) => (
            <button
              type="button"
              role="option"
              id={`${listId}-${offer.id}`}
              aria-selected={offer.id === selected?.id}
              tabIndex={-1}
              onMouseEnter={() => setHighlighted(index)}
              onMouseDown={(event) => event.preventDefault()}
              key={offer.id}
              onClick={() => choose(offer)}
            >
              <span className={textStyles.mono}>#{offer.id}</span>
              <span>{offer.name}</span>
              <Plus size={15} />
            </button>
          ))}
          {available.length > 50 && (
            <p className={styles['picker-empty']}>
              Найдено {available.length}. Уточните название или ID.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
