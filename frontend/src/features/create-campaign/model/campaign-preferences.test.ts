// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import type { Catalog } from '@/entities/tracker/model/types'
import {
  campaignPreferences,
  rememberCampaignPreferences,
} from './campaign-preferences'
const catalog: Catalog = {
  domains: [],
  countries: [],
  groups: [
    { id: 1, name: 'One' },
    { id: 2, name: 'Two' },
  ],
  sources: [
    { id: 3, name: 'Three' },
    { id: 4, name: 'Four' },
  ],
}
afterEach(() => localStorage.clear())
it('remembers successful choices separately for each tracker', () => {
  rememberCampaignPreferences('https://one.example', '2', '4')
  expect(campaignPreferences('https://one.example', catalog)).toEqual({
    group: '2',
    source: '4',
  })
  expect(campaignPreferences('https://other.example', catalog)).toEqual({
    group: '',
    source: '',
  })
})
it('ignores references that are no longer available', () => {
  rememberCampaignPreferences('https://one.example', '99', '4')
  expect(campaignPreferences('https://one.example', catalog)).toEqual({
    group: '',
    source: '4',
  })
})
