// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CreateCampaignForm from './create-campaign-form'
import type { Catalog } from '@/entities/tracker/model/types'

const catalog: Catalog = {
  domains: [{ id: 1, name: 'tracker.example' }],
  groups: [{ id: 2, name: 'Campaigns' }],
  sources: [{ id: 3, name: 'Traffic' }],
  countries: [{ code: 'AU', name: 'Australia' }],
}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it.each(['failed', 'unknown'])(
  'retries creation with the correct key for %s outcome',
  async (outcome) => {
    const response = () =>
      new Response(
        JSON.stringify({ detail: { message: 'Ошибка создания', outcome } }),
        { status: 502 },
      )
    const fetch = vi.fn().mockImplementation(async () => response())
    vi.stubGlobal('fetch', fetch)
    render(
      <CreateCampaignForm
        catalog={catalog}
        offers={[{ id: 301, name: 'Test offer' }]}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
        onDirty={vi.fn()}
        onBusy={vi.fn()}
      />,
    )
    fireEvent.change(
      screen.getByPlaceholderText('Например, Beauty · Romania · November'),
      { target: { value: 'test_surkov_example' } },
    )
    fireEvent.focus(
      screen.getByRole('combobox', { name: 'Поиск оффера по названию или ID' }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Test offer/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Создать кампанию' }))
    await screen.findByText('Ошибка создания')
    fireEvent.click(screen.getByRole('button', { name: 'Создать кампанию' }))
    await screen.findByText('Ошибка создания')
    expect(fetch).toHaveBeenCalledTimes(2)
    const key = (index: number) =>
      fetch.mock.calls[index][1].headers['Idempotency-Key']
    if (outcome === 'failed') expect(key(0)).not.toBe(key(1))
    else expect(key(0)).toBe(key(1))
  },
)
