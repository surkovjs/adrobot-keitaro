import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '@/shared/api/client'
import type { Campaign, Stream } from './types'

export function useCampaign(id: number | null) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const reload = useCallback(async () => {
    controller.current?.abort()
    if (!id) return false
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    setError('')
    try {
      const result = await api<Campaign>(`/campaigns/${id}`, {
        signal: request.signal,
      })
      if (request.signal.aborted) return false
      setCampaign(result)
      return true
    } catch (error) {
      if (!request.signal.aborted) setError(errorMessage(error))
      return false
    } finally {
      if (!request.signal.aborted) setLoading(false)
    }
  }, [id])
  useEffect(() => {
    setCampaign(null)
    setError('')
    void reload()
    return () => controller.current?.abort()
  }, [reload])
  const updateStream = useCallback((updated: Stream) => {
    setCampaign((previous) =>
      previous
        ? {
            ...previous,
            streams: previous.streams.map((stream) =>
              stream.id === updated.id ? updated : stream,
            ),
          }
        : previous,
    )
  }, [])
  return {
    campaign: campaign?.id === id ? campaign : null,
    loading,
    error,
    reload,
    updateStream,
    dismissError: () => setError(''),
  }
}
