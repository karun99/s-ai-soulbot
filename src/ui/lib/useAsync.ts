/** A minimal async data hook: runs once on mount, exposes loading and error. */

import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ loading: boolean; value: T | null; error: unknown }>({
    loading: true,
    value: null,
    error: null,
  })
  const mounted = useRef(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    fnRef.current()
      .then((value) => {
        if (!cancelled && mounted.current) setState({ loading: false, value, error: null })
      })
      .catch((error: unknown) => {
        if (!cancelled && mounted.current) setState({ loading: false, value: null, error })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
  }, [])

  return { ...state, reload }
}
