import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '@/shared/api/client'
import type { CampaignListItem } from '@/entities/campaign/model/types'
import type { Catalog, Health } from '@/entities/tracker/model/types'
import type { Reference } from '@/shared/model/reference'

export function useWorkspaceData() {
  const [health, setHealth] = useState<Health | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [offers, setOffers] = useState<Reference[]>([])
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const reload = useCallback(async () => {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    setError('')
    const options = { signal: request.signal }
    const [h, c, o, list] = await Promise.allSettled([
      api<Health>('/health', options),
      api<Catalog>('/catalog', options),
      api<Reference[]>('/offers', options),
      api<CampaignListItem[]>('/campaigns', options),
    ])
    if (request.signal.aborted) return
    if (h.status === 'fulfilled') setHealth(h.value)
    if (c.status === 'fulfilled') setCatalog(c.value)
    if (o.status === 'fulfilled') setOffers(o.value)
    if (list.status === 'fulfilled') setCampaigns(list.value)
    const failures = [h, c, o, list].filter(
      (v) => v.status === 'rejected',
    ) as PromiseRejectedResult[]
    setError(
      [...new Set(failures.map((v) => errorMessage(v.reason)))].join(' '),
    )
    setLoading(false)
  }, [])
  const refreshCampaigns = useCallback(async () => {
    try {
      setCampaigns(await api<CampaignListItem[]>('/campaigns'))
    } catch (error) {
      setError(errorMessage(error))
    }
  }, [])
  useEffect(() => {
    void reload()
    return () => controller.current?.abort()
  }, [reload])
  return {
    health,
    catalog,
    offers,
    campaigns,
    query,
    setQuery,
    loading,
    error,
    reload,
    refreshCampaigns,
    dismissError: () => setError(''),
  }
}
