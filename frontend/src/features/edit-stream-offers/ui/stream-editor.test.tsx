// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import StreamEditor from './stream-editor'
import type { Stream } from '@/entities/campaign/model/types'

const stream: Stream = {
  id: 202,
  name: 'Offers',
  position: 2,
  type: 'default',
  state: 'active',
  schema: 'landings',
  action_type: 'http',
  action_options: null,
  action_payload: null,
  filters: [],
  revision: 'original',
  editable: true,
  offers: [1, 2].map((id) => ({
    offer_id: id,
    name: `Offer ${id}`,
    share: 50,
    removed: false,
    locked: false,
  })),
}
const saved = {
  ...stream,
  revision: 'saved',
  offers: stream.offers.map((row, i) => ({ ...row, locked: i === 0 })),
}
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
function Harness({
  initial = stream,
  onReload,
}: {
  initial?: Stream
  onReload?: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <StreamEditor
      stream={value}
      campaignId={101}
      offers={[1, 2, 3].map((id) => ({ id, name: `Offer ${id}` }))}
      trackerUrl={null}
      reportDirty={() => {}}
      onBusy={() => {}}
      onSaved={setValue}
      onReload={onReload}
    />
  )
}
const saveButton = () =>
  screen.getByRole('button', { name: 'Сохранить в Keitaro' })
const requestKey = (init: RequestInit | undefined) =>
  (init?.headers as Record<string, string>)['Idempotency-Key']
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('stream save and retry', () => {
  it('retries a confirmed failure with a new key and marks the saved draft clean', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          { detail: { message: 'Временный сбой', outcome: 'failed' } },
          502,
        ),
      )
      .mockResolvedValueOnce(response(saved))
    vi.stubGlobal('fetch', fetch)
    render(<Harness />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Закрепить долю оффера 1' }),
    )
    fireEvent.click(saveButton())
    await screen.findByText('Временный сбой')
    fireEvent.click(saveButton())
    await screen.findByText('Доли сохранены и проверены в Keitaro.')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(requestKey(fetch.mock.calls[0][1])).not.toBe(
      requestKey(fetch.mock.calls[1][1]),
    )
    expect(JSON.parse(fetch.mock.calls[1][1].body).offers[0].locked).toBe(true)
    await waitFor(() =>
      expect((saveButton() as HTMLButtonElement).disabled).toBe(true),
    )
  })
  it.each(['unknown', 'network', 'conflict'])(
    'retains the key for %s and preserves the draft',
    async (kind) => {
      const fetch = vi.fn()
      if (kind === 'network')
        fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      else
        fetch.mockResolvedValueOnce(
          response(
            {
              detail: {
                message: 'Загрузите поток заново',
                ...(kind === 'unknown' ? { outcome: 'unknown' } : {}),
              },
            },
            kind === 'conflict' ? 409 : 502,
          ),
        )
      fetch.mockResolvedValueOnce(
        response(
          { detail: { message: 'Повтор заблокирован', outcome: 'unknown' } },
          409,
        ),
      )
      vi.stubGlobal('fetch', fetch)
      render(<Harness />)
      fireEvent.click(
        screen.getByRole('button', { name: 'Закрепить долю оффера 1' }),
      )
      fireEvent.click(saveButton())
      await screen.findByRole('alert')
      fireEvent.click(saveButton())
      await screen.findByText('Повтор заблокирован')
      expect(requestKey(fetch.mock.calls[0][1])).toBe(
        requestKey(fetch.mock.calls[1][1]),
      )
      expect(
        screen.getByRole('button', { name: 'Открепить долю оффера 1' }),
      ).toBeTruthy()
    },
  )
})

it('adds, redistributes, removes, saves and restores offers after a fresh mount', async () => {
  let stored = stream
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    stored = {
      ...stored,
      revision: `revision-${fetch.mock.calls.length}`,
      offers: body.offers.map((row: Stream['offers'][number]) => ({
        ...row,
        name: `Offer ${row.offer_id}`,
      })),
    }
    return response(stored)
  })
  vi.stubGlobal('fetch', fetch)
  const mounted = render(<Harness />)
  const first = screen.getByRole('spinbutton', { name: 'Доля оффера 1' })
  fireEvent.change(first, { target: { value: '25' } })
  fireEvent.blur(first)
  fireEvent.focus(
    screen.getByRole('combobox', { name: 'Поиск оффера по названию или ID' }),
  )
  fireEvent.click(screen.getByRole('option', { name: /Offer 3/ }))
  expect(
    screen.getByRole('spinbutton', { name: 'Доля оффера 2' }),
  ).toHaveProperty('value', '38')
  expect(
    screen.getByRole('spinbutton', { name: 'Доля оффера 3' }),
  ).toHaveProperty('value', '37')
  fireEvent.click(screen.getByRole('button', { name: 'Удалить оффер 2' }))
  expect(
    screen.getByRole('spinbutton', { name: 'Доля оффера 3' }),
  ).toHaveProperty('value', '75')
  fireEvent.click(saveButton())
  await screen.findByText('Доли сохранены и проверены в Keitaro.')
  await waitFor(() =>
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true),
  )
  mounted.unmount()
  render(<Harness initial={stored} />)
  expect(
    screen.getByRole('spinbutton', { name: 'Доля оффера 2' }),
  ).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: 'Вернуть оффер 2' }))
  expect(
    screen.getByRole('spinbutton', { name: 'Доля оффера 1' }),
  ).toHaveProperty('value', '25')
  expect(
    screen.getByRole('spinbutton', { name: 'Доля оффера 2' }),
  ).toHaveProperty('value', '38')
  expect(
    screen.getByRole('spinbutton', { name: 'Доля оффера 3' }),
  ).toHaveProperty('value', '37')
  fireEvent.click(saveButton())
  await screen.findByText('Доли сохранены и проверены в Keitaro.')
  expect(stored.offers.map((row) => row.share)).toEqual([25, 38, 37])
  expect(stored.offers[0].locked).toBe(true)
})

it('offers an explicit reload action for an unknown save outcome', async () => {
  const reload = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        response(
          { detail: { message: 'Результат неизвестен', outcome: 'unknown' } },
          504,
        ),
      ),
  )
  render(<Harness onReload={reload} />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Закрепить долю оффера 1' }),
  )
  fireEvent.click(saveButton())
  const button = await screen.findByRole('button', { name: 'Загрузить заново' })
  fireEvent.click(button)
  expect(reload).toHaveBeenCalledOnce()
})
