import { useRef } from 'react'
import { ApiError } from '@/shared/api/client'

// Retain the key when the server may have applied the write.
export function useIdempotencyKey(payload: unknown) {
  const signature = JSON.stringify(payload)
  const request = useRef({ signature, key: crypto.randomUUID() })
  if (request.current.signature !== signature)
    request.current = { signature, key: crypto.randomUUID() }
  return {
    getKey: () => request.current.key,
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.outcome === 'failed')
        request.current.key = crypto.randomUUID()
    },
  }
}
