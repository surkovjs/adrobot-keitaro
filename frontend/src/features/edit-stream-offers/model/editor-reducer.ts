import type { OfferRow, Stream } from '@/entities/campaign/model/types'
import type { Reference } from '@/shared/model/reference'

// Integer percentages: reserve locked shares, divide the rest equally and
// assign rounding remainders in stable offer-ID order. Always total 100.
export function distribute(rows: OfferRow[]): OfferRow[] {
  const active = rows.filter((row) => !row.removed)
  if (!active.length)
    throw new Error('В потоке должен остаться хотя бы один оффер')
  if (active.length > 100)
    throw new Error('В потоке может быть не больше 100 активных офферов')
  const locked = active.filter((row) => row.locked)
  if (
    locked.some(
      (row) => !Number.isInteger(row.share) || row.share < 1 || row.share > 100,
    )
  )
    throw new Error('Доля должна быть целым числом от 1 до 100')
  if (active.length === 1 && locked.length && locked[0].share !== 100)
    throw new Error('Единственный оффер получает 100% трафика')
  const fixed = locked.reduce((sum, row) => sum + row.share, 0)
  const free = active
    .filter((row) => !row.locked)
    .sort((a, b) => a.offer_id - b.offer_id)
  const rest = 100 - fixed
  if (rest < free.length || (!free.length && rest !== 0))
    throw new Error(
      'Для остальных офферов не осталось достаточно трафика. Измените или открепите долю.',
    )
  const shares = new Map(
    free.map((row, i) => [
      row.offer_id,
      Math.floor(rest / free.length) + (i < rest % free.length ? 1 : 0),
    ]),
  )
  return rows.map((row) =>
    row.removed
      ? { ...row, share: 0, locked: false }
      : { ...row, share: row.locked ? row.share : shares.get(row.offer_id)! },
  )
}

export type EditorState = {
  original: Stream
  rows: OfferRow[]
  error: string | null
}
export type EditorAction =
  | { type: 'load'; stream: Stream }
  | { type: 'add'; offer: Reference }
  | { type: 'remove' | 'restore' | 'lock'; id: number }
  | { type: 'share'; id: number; value: number }
  | { type: 'cancel' | 'equalize' | 'dismiss' }

export function initEditor(stream: Stream): EditorState {
  return { original: stream, rows: structuredClone(stream.offers), error: null }
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  try {
    if (action.type === 'load') return initEditor(action.stream)
    if (action.type === 'cancel') return initEditor(state.original)
    if (action.type === 'dismiss') return { ...state, error: null }
    let rows = state.rows
    if (action.type === 'add') {
      if (rows.some((row) => row.offer_id === action.offer.id))
        throw new Error(
          'Этот оффер уже в списке. Для удалённого оффера нажмите «Вернуть».',
        )
      if (rows.length >= 100)
        throw new Error('В редакторе может быть не больше 100 строк')
      rows = [
        ...rows,
        {
          offer_id: action.offer.id,
          name: action.offer.name,
          share: 0,
          removed: false,
          locked: false,
        },
      ]
    }
    if (
      action.type === 'remove' &&
      !state.original.offers.some((row) => row.offer_id === action.id)
    )
      rows = rows.filter((row) => row.offer_id !== action.id)
    if (action.type === 'remove' || action.type === 'restore')
      rows = rows.map((row) =>
        row.offer_id === action.id
          ? { ...row, removed: action.type === 'remove', locked: false }
          : row,
      )
    if (action.type === 'lock')
      rows = rows.map((row) =>
        row.offer_id === action.id ? { ...row, locked: !row.locked } : row,
      )
    if (action.type === 'share')
      rows = rows.map((row) =>
        row.offer_id === action.id
          ? { ...row, share: action.value, locked: true }
          : row,
      )
    if (action.type === 'equalize')
      rows = rows.map((row) => ({ ...row, locked: false }))
    return { ...state, rows: distribute(rows), error: null }
  } catch (error) {
    return {
      ...state,
      error: error instanceof Error ? error.message : 'Ошибка расчёта долей',
    }
  }
}

export function dirty(state: EditorState) {
  return JSON.stringify(state.rows) !== JSON.stringify(state.original.offers)
}
