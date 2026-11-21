import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'

afterEach(() => vi.unstubAllGlobals())
it.each([
  [
    'Value error, Первая ошибка; Value error, Вторая ошибка',
    'Первая ошибка; Вторая ошибка',
  ],
  [
    [
      { msg: 'Value error, Первая ошибка' },
      { msg: 'Value error, Вторая ошибка' },
    ],
    'Первая ошибка; Вторая ошибка',
  ],
  [
    {
      message: 'Value error, Первая ошибка; Value error, Вторая ошибка',
      campaign_id: 42,
      recovery: 'Проверьте кампанию.',
    },
    'Первая ошибка; Вторая ошибка Кампания #42. Проверьте кампанию.',
  ],
])(
  'cleans validation prefixes and keeps error context',
  async (detail, expected) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail }), { status: 422 }),
        ),
    )
    await expect(api('/campaigns')).rejects.toMatchObject({
      message: expected,
      status: 422,
    })
  },
)
it('retains unknown outcome so retries cannot discard idempotency protection', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: { message: 'Неизвестный результат', outcome: 'unknown' },
          }),
          { status: 502 },
        ),
      ),
  )
  const error = await api('/campaigns').catch((value: unknown) => value)
  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ outcome: 'unknown', status: 502 })
})
