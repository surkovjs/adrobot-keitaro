// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import CampaignTable from './campaign-table'
const campaigns = Array.from({ length: 392 }, (_, i) => ({
  id: i + 1,
  name: `Campaign ${i + 1}`,
  state: 'active',
  alias: null,
}))
afterEach(cleanup)
function mount(url: string, rows = campaigns) {
  const router = createMemoryRouter(
    [{ path: '/campaigns', element: <CampaignTable campaigns={rows} /> }],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  return router
}
it('navigates beyond the original 100-row cutoff and changes page size', () => {
  const router = mount('/campaigns')
  expect(screen.getByRole('status').textContent).toBe('1–100 из 392')
  fireEvent.click(
    screen.getByRole('button', { name: 'Следующая страница кампаний' }),
  )
  expect(screen.getByRole('status').textContent).toBe('101–200 из 392')
  expect(screen.getByText('Campaign 101', { exact: true })).toBeTruthy()
  expect(router.state.location.search).toBe('?page=2')
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Количество кампаний на странице' }),
    { target: { value: '500' } },
  )
  expect(screen.getByRole('status').textContent).toBe('1–392 из 392')
  expect(screen.getAllByRole('link', { name: 'Редактировать' })).toHaveLength(
    392,
  )
  expect(router.state.location.search).toBe('?limit=500')
  expect(
    (
      screen.getByRole('button', {
        name: 'Следующая страница кампаний',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true)
  router.dispose()
})
it('restores a direct URL and shows the final partial page', () => {
  const router = mount('/campaigns?limit=25&page=16')
  expect(screen.getByRole('status').textContent).toBe('376–392 из 392')
  expect(screen.getAllByRole('link', { name: 'Редактировать' })).toHaveLength(
    17,
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Предыдущая страница кампаний' }),
  )
  expect(screen.getByRole('status').textContent).toBe('351–375 из 392')
  router.dispose()
})
it('handles an out-of-range page after the list shrinks', () => {
  const router = mount('/campaigns?limit=25&page=16', campaigns.slice(0, 3))
  expect(screen.getByRole('status').textContent).toBe('1–3 из 3')
  expect(
    (
      screen.getByRole('button', {
        name: 'Предыдущая страница кампаний',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true)
  router.dispose()
})
