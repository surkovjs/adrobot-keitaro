import { useEffect, useReducer, useState } from 'react'
import type { Stream } from '@/entities/campaign/model/types'
import { useIdempotencyKey } from '@/shared/lib/use-idempotency-key'
import { ApiError, errorMessage, write } from '@/shared/api/client'
import { dirty, editorReducer, initEditor } from './editor-reducer'

export function useStreamEditor({
  stream,
  campaignId,
  onSaved,
  reportDirty,
  onBusy,
}: {
  stream: Stream
  campaignId: number
  onSaved: (stream: Stream) => void
  reportDirty: (id: number, value: boolean) => void
  onBusy: (value: boolean) => void
}) {
  const [state, dispatch] = useReducer(editorReducer, stream, initEditor)
  const [pending, setPending] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [needsReload, setNeedsReload] = useState(false)
  const [success, setSuccess] = useState(false)
  const changed = dirty(state)
  const request = useIdempotencyKey({
    campaignId,
    streamId: stream.id,
    revision: state.original.revision,
    rows: state.rows,
  })
  useEffect(() => {
    dispatch({ type: 'load', stream })
    setSaveError('')
    setNeedsReload(false)
  }, [stream])
  useEffect(() => {
    reportDirty(stream.id, changed)
  }, [changed, stream.id, reportDirty])
  useEffect(() => {
    if (dirty(state)) setSuccess(false)
  }, [state.rows])
  const active = state.rows.filter((v) => !v.removed)
  const total = active.reduce((sum, v) => sum + v.share, 0)
  async function save() {
    setPending(true)
    onBusy(true)
    setSaveError('')
    setNeedsReload(false)
    setSuccess(false)
    try {
      const result = await write<Stream>(
        `/campaigns/${campaignId}/streams/${stream.id}`,
        'PUT',
        {
          revision: state.original.revision,
          offers: state.rows.map(({ offer_id, share, removed, locked }) => ({
            offer_id,
            share,
            removed,
            locked,
          })),
        },
        request.getKey(),
      )
      onSaved(result)
      setSuccess(true)
    } catch (error) {
      request.onError(error)
      setNeedsReload(error instanceof ApiError && error.outcome !== 'failed')
      setSaveError(errorMessage(error))
    } finally {
      setPending(false)
      onBusy(false)
    }
  }
  return {
    state,
    dispatch,
    pending,
    saveError,
    needsReload,
    setSaveError,
    success,
    setSuccess,
    changed,
    active,
    total,
    save,
  }
}
