import { describe, expect, it } from 'vitest'
import { dirty, distribute, editorReducer, initEditor } from './editor-reducer'
import type { OfferRow, Stream } from '@/entities/campaign/model/types'

const rows: OfferRow[] = [1, 2, 3].map((id, i) => ({
  offer_id: id,
  name: `Offer ${id}`,
  share: i ? 33 : 34,
  removed: false,
  locked: false,
}))
const stream = { id: 1, offers: rows } as Stream

describe('integer traffic distribution', () => {
  it('distributes every integer remainder without losing traffic', () => {
    for (let count = 1; count <= 100; count++) {
      const result = distribute(
        Array.from({ length: count }, (_, i) => ({ ...rows[0], offer_id: i })),
      )
      expect(result.reduce((s, v) => s + v.share, 0)).toBe(100)
      expect(
        Math.max(...result.map((v) => v.share)) -
          Math.min(...result.map((v) => v.share)),
      ).toBeLessThanOrEqual(1)
      expect(result.every((v) => v.share >= 1)).toBe(true)
    }
  })
  it('preserves a pinned share and redistributes only the rest', () => {
    expect(
      distribute([
        { ...rows[0], locked: true, share: 25 },
        ...rows.slice(1),
      ]).map((v) => v.share),
    ).toEqual([25, 38, 37])
  })
  it('is stable when the row order changes', () => {
    const normalized = (rs: OfferRow[]) =>
      rs.sort((a, b) => a.offer_id - b.offer_id).map((v) => v.share)
    expect(normalized(distribute([...rows].reverse()))).toEqual(
      normalized(distribute(rows)),
    )
  })
  it('rejects impossible pinned percentages instead of silently changing them', () => {
    expect(() =>
      distribute([{ ...rows[0], share: 100, locked: true }, rows[1]]),
    ).toThrow()
    expect(() =>
      distribute([
        { ...rows[0], share: 70, locked: true },
        { ...rows[1], share: 40, locked: true },
      ]),
    ).toThrow()
  })
  it('rejects fractional and non-finite pinned shares', () => {
    for (const share of [NaN, Infinity, 0, -1, 101, 2.5])
      expect(() => distribute([{ ...rows[0], share, locked: true }])).toThrow()
  })
})

describe('editor draft', () => {
  it('reproduces add, remove, restore and cancel from the video', () => {
    const initial = initEditor(stream)
    let state = editorReducer(initial, {
      type: 'add',
      offer: { id: 4, name: 'Fourth' },
    })
    expect(state.rows.map((v) => v.share)).toEqual([25, 25, 25, 25])
    expect(dirty(state)).toBe(true)
    state = editorReducer(state, { type: 'remove', id: 4 })
    expect(state.rows).toEqual(rows)
    expect(dirty(state)).toBe(false)
    state = editorReducer(state, {
      type: 'add',
      offer: { id: 4, name: 'Fourth' },
    })
    expect(state.rows.map((v) => v.share)).toEqual([25, 25, 25, 25])
    state = editorReducer(state, { type: 'cancel' })
    expect(state.rows).toEqual(rows)
    expect(dirty(state)).toBe(false)
    expect(initial.rows).toEqual(rows)
  })
  it('retains restore for offers loaded from the server', () => {
    const state = editorReducer(initEditor(stream), { type: 'remove', id: 3 })
    expect(state.rows[2].removed).toBe(true)
    const restored = editorReducer(state, { type: 'restore', id: 3 })
    expect(restored.rows).toEqual(rows)
  })
  it('explains the fixed share of a single offer', () => {
    const state = initEditor({
      ...stream,
      offers: [{ ...rows[0], share: 100 }],
    })
    const next = editorReducer(state, { type: 'share', id: 1, value: 75 })
    expect(next.rows).toEqual(state.rows)
    expect(next.error).toBe('Единственный оффер получает 100% трафика')
  })
  it('cannot remove the last offer', () => {
    const state = initEditor({
      ...stream,
      offers: [{ ...rows[0], share: 100 }],
    })
    const next = editorReducer(state, { type: 'remove', id: 1 })
    expect(next.rows).toEqual(state.rows)
    expect(next.error).toBeTruthy()
  })
  it('keeps a pinned 25% when adding an offer', () => {
    let state = editorReducer(initEditor(stream), {
      type: 'share',
      id: 1,
      value: 25,
    })
    state = editorReducer(state, {
      type: 'add',
      offer: { id: 4, name: 'Fourth' },
    })
    expect(state.rows.map((v) => v.share)).toEqual([25, 25, 25, 25])
    expect(state.rows[0].locked).toBe(true)
  })
  it('prevents duplicates and retains the valid draft after errors', () => {
    const state = initEditor(stream)
    const next = editorReducer(state, {
      type: 'add',
      offer: { id: 1, name: 'Duplicate' },
    })
    expect(next.rows).toEqual(rows)
    expect(next.error).toBeTruthy()
  })
})
