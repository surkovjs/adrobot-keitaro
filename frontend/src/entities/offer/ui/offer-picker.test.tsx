// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OfferPicker } from './offer-picker'
afterEach(cleanup)
it('selects the highlighted offer with arrows and Enter and closes with Escape', () => {
  const select = vi.fn()
  render(
    <OfferPicker
      offers={[
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' },
      ]}
      onSelect={select}
    />,
  )
  const input = screen.getByRole('combobox')
  fireEvent.focus(input)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  const second = screen.getByRole('option', { name: /Second/ })
  expect(second.getAttribute('aria-selected')).toBe('true')
  expect(input.getAttribute('aria-activedescendant')).toBe(second.id)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(select).toHaveBeenCalledWith({ id: 2, name: 'Second' })
  expect(input.getAttribute('aria-expanded')).toBe('false')
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).toBeNull()
})
