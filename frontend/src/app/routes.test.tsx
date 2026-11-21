// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from './routes'
import { api, write } from '@/shared/api/client'

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/client')>()),
  api: vi.fn(),
  write: vi.fn(),
  errorMessage: (error: Error) => error.message,
}))
vi.mock('@/features/edit-stream-offers/ui/stream-editor', () => ({
  default: ({
    stream,
    reportDirty,
  }: {
    stream: { id: number }
    reportDirty: (id: number, value: boolean) => void
  }) => (
    <button onClick={() => reportDirty(stream.id, true)}>
      Изменить офферы
    </button>
  ),
}))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.mocked(api).mockImplementation(async (path) => {
    const fixtures: Record<string, unknown> = {
      '/health': { configured: true, tracker_url: 'https://tracker.example' },
      '/catalog': {
        domains: [{ id: 1, name: 'demo.example' }],
        groups: [{ id: 1, name: 'FORTESTS' }],
        sources: [{ id: 1, name: 'FORTESTS' }],
        countries: [{ code: 'AU', name: 'Australia' }],
      },
      '/offers': [{ id: 301, name: 'Test offer' }],
      '/campaigns': [
        { id: 101, name: 'Routing campaign', state: 'active', alias: 'test' },
      ],
      '/campaigns/101': {
        id: 101,
        name: 'Routing campaign',
        streams: [{ id: 202 }],
      },
    }
    if (!(path in fixtures)) throw new Error('Кампания не найдена')
    return fixtures[path] as never
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('campaign routes', () => {
  it('loads the editor from a direct URL and reconstructs it after a fresh mount', async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns/101'],
    })
    const mounted = render(<RouterProvider router={router} />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Routing campaign',
      }),
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe('/campaigns/101')
    mounted.unmount()
    router.dispose()
    const fresh = createMemoryRouter(routes, {
      initialEntries: ['/campaigns/101'],
    })
    render(<RouterProvider router={fresh} />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Routing campaign',
      }),
    ).toBeTruthy()
    expect(api).toHaveBeenCalledWith(
      '/campaigns/101',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    fresh.dispose()
  })

  it('restores the create form by URL and supports back and forward', async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns', '/campaigns/new'],
    })
    render(<RouterProvider router={router} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Новая кампания' }),
    ).toBeTruthy()
    await act(async () => {
      await router.navigate(-1)
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: /Кампании/ }),
    ).toBeTruthy()
    await act(async () => {
      await router.navigate(1)
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Новая кампания' }),
    ).toBeTruthy()
    router.dispose()
  })

  it('protects unsaved editor changes when navigating back', async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns', '/campaigns/101'],
    })
    render(<RouterProvider router={router} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Изменить офферы' }),
    )
    await act(async () => {
      await router.navigate(-1)
    })
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(router.state.location.pathname).toBe('/campaigns/101')
    vi.mocked(window.confirm).mockReturnValue(true)
    await act(async () => {
      await router.navigate(-1)
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/campaigns'),
    )
    router.dispose()
  })

  it('shows a missing campaign error without returning to the list', async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns/999'],
    })
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Кампания не найдена'),
    )
    expect(router.state.location.pathname).toBe('/campaigns/999')
    expect(
      screen.queryByRole('heading', { level: 1, name: /Кампании/ }),
    ).toBeNull()
    router.dispose()
  })
})

describe('page state after decomposition', () => {
  it('preserves campaign search when returning from the editor', async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns'],
    })
    render(<RouterProvider router={router} />)
    const search = await screen.findByRole('textbox', {
      name: 'Поиск кампаний',
    })
    fireEvent.change(search, { target: { value: '101' } })
    fireEvent.click(
      await screen.findByRole('link', { name: /Routing campaign/ }),
    )
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Routing campaign',
      }),
    ).toBeTruthy()
    await act(async () => {
      await router.navigate(-1)
    })
    expect(
      await screen.findByRole('textbox', { name: 'Поиск кампаний' }),
    ).toHaveProperty('value', '101')
    router.dispose()
  })

  it('protects an unsaved create form when navigating back', async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns', '/campaigns/new'],
    })
    render(<RouterProvider router={router} />)
    fireEvent.change(
      await screen.findByPlaceholderText(
        'Например, Beauty · Romania · November',
      ),
      { target: { value: 'Draft campaign' } },
    )
    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.pathname).toBe('/campaigns/new')
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(
      screen.getByPlaceholderText('Например, Beauty · Romania · November'),
    ).toHaveProperty('value', 'Draft campaign')
    router.dispose()
  })

  it('opens the created campaign even while the create request is finishing', async () => {
    vi.mocked(write).mockResolvedValue({ id: 101 })
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns/new'],
    })
    render(<RouterProvider router={router} />)
    fireEvent.change(
      await screen.findByPlaceholderText(
        'Например, Beauty · Romania · November',
      ),
      { target: { value: 'New campaign' } },
    )
    fireEvent.focus(
      screen.getByRole('combobox', { name: 'Поиск оффера по названию или ID' }),
    )
    fireEvent.click(await screen.findByRole('option', { name: /Test offer/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Создать кампанию' }))
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Routing campaign',
      }),
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe('/campaigns/101')
    expect(window.confirm).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledWith(
      '/campaigns',
      'POST',
      expect.objectContaining({ name: 'New campaign', offer_id: 301 }),
      expect.any(String),
    )
    router.dispose()
  })

  it('explains blocked navigation while a campaign is being created', async () => {
    let resolveWrite!: (value: { id: number }) => void
    vi.mocked(write).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve
        }) as never,
    )
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns/new'],
    })
    render(<RouterProvider router={router} />)
    fireEvent.change(
      await screen.findByPlaceholderText(
        'Например, Beauty · Romania · November',
      ),
      { target: { value: 'New campaign' } },
    )
    fireEvent.focus(
      screen.getByRole('combobox', { name: 'Поиск оффера по названию или ID' }),
    )
    fireEvent.click(screen.getByRole('option', { name: /Test offer/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Создать кампанию' }))
    await act(async () => {
      await router.navigate('/campaigns')
    })
    expect(
      await screen.findByText(
        'Идёт сохранение. Дождитесь его завершения перед переходом.',
      ),
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe('/campaigns/new')
    await act(async () => {
      resolveWrite({ id: 101 })
    })
    await screen.findByRole('heading', { name: 'Routing campaign' })
    router.dispose()
  })

  it('shows missing configuration even when tracker requests fail and hides placeholder links', async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/health')
        return { configured: false, tracker_url: null } as never
      throw new Error('API-ключ Keitaro не настроен в .env')
    })
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns'],
    })
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Keitaro не настроен')).toBeTruthy()
    expect(screen.getByText('Укажите адрес и API-ключ')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Открыть Keitaro' })).toBeNull()
    expect(screen.queryByText('Подключение настроено')).toBeNull()
    router.dispose()
  })

  it('ignores a stale campaign response after a route change', async () => {
    const original = vi.mocked(api).getMockImplementation()!
    let resolveOld!: (value: unknown) => void
    vi.mocked(api).mockImplementation((path, options) =>
      path === '/campaigns/102'
        ? (new Promise((resolve) => {
            resolveOld = resolve
          }) as never)
        : original(path, options),
    )
    const router = createMemoryRouter(routes, {
      initialEntries: ['/campaigns/102'],
    })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(resolveOld).toBeTypeOf('function'))
    await act(async () => {
      await router.navigate('/campaigns/101')
    })
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Routing campaign',
      }),
    ).toBeTruthy()
    await act(async () => {
      resolveOld({ id: 102, name: 'Stale campaign', streams: [] })
    })
    expect(screen.queryByRole('heading', { name: 'Stale campaign' })).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Routing campaign' }),
    ).toBeTruthy()
    router.dispose()
  })
})
