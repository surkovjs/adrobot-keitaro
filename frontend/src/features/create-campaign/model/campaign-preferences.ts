import type { Catalog } from '@/entities/tracker/model/types'

const key = (trackerUrl: string) => `adrobot:campaign-preferences:${trackerUrl}`

export function campaignPreferences(
  trackerUrl: string | null | undefined,
  catalog: Catalog,
) {
  let saved: { groupId?: number; sourceId?: number } = {}
  try {
    if (trackerUrl)
      saved = JSON.parse(localStorage.getItem(key(trackerUrl)) ?? '{}') ?? {}
  } catch {
    /* Storage can be unavailable or contain stale data. */
  }
  const choose = (items: Catalog['groups'], id?: number) =>
    items.some((item) => item.id === id)
      ? String(id)
      : items.length === 1
        ? String(items[0].id)
        : ''
  return {
    group: choose(catalog.groups, saved.groupId),
    source: choose(catalog.sources, saved.sourceId),
  }
}

export function rememberCampaignPreferences(
  trackerUrl: string | null | undefined,
  group: string,
  source: string,
) {
  if (!trackerUrl) return
  try {
    localStorage.setItem(
      key(trackerUrl),
      JSON.stringify({ groupId: Number(group), sourceId: Number(source) }),
    )
  } catch {
    /* Saving a campaign must not depend on browser storage. */
  }
}
