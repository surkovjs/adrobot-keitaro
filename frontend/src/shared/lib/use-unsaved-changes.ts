import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useLocation } from 'react-router-dom'

export function useUnsavedChanges() {
  const dirty = useRef(new Map<string | number, boolean>())
  const pending = useRef(new Map<string | number, boolean>())
  const allowNavigation = useRef(false)
  const [busy, setBusy] = useState(false)
  const [navigationMessage, setNavigationMessage] = useState('')
  const { pathname } = useLocation()
  const reportDirty = useCallback((id: number, value: boolean) => {
    dirty.current.set(id, value)
  }, [])
  const reportFormDirty = useCallback((value: boolean) => {
    dirty.current.set('form', value)
  }, [])
  const reportBusy = useCallback(
    (value: boolean, id: string | number = 'form') => {
      pending.current.set(id, value)
      setBusy([...pending.current.values()].some(Boolean))
    },
    [],
  )
  const hasChanges = useCallback(
    () => [...dirty.current.values()].some(Boolean),
    [],
  )
  const reset = useCallback(() => {
    dirty.current.clear()
  }, [])
  const discardAndLeave = useCallback(() => {
    dirty.current.clear()
    allowNavigation.current = true
  }, [])
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      !allowNavigation.current &&
      (busy || hasChanges()),
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (busy) {
      setNavigationMessage(
        'Идёт сохранение. Дождитесь его завершения перед переходом.',
      )
      blocker.reset()
      return
    }
    if (
      window.confirm(
        'Есть несохранённые изменения. Покинуть страницу и отменить их?',
      )
    )
      blocker.proceed()
    else blocker.reset()
  }, [blocker, busy])
  useEffect(() => {
    if (!busy) setNavigationMessage('')
  }, [busy])
  useEffect(() => {
    reset()
    allowNavigation.current = false
  }, [pathname, reset])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasChanges() || [...pending.current.values()].some(Boolean)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [hasChanges])
  return {
    busy,
    navigationMessage,
    dismissNavigationMessage: () => setNavigationMessage(''),
    reportBusy,
    reportDirty,
    reportFormDirty,
    hasChanges,
    reset,
    discardAndLeave,
  }
}
