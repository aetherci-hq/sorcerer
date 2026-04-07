import { useCallback, useEffect, useMemo, useState } from 'react'
import { getApi } from '../api/client'
import type { ProviderInfo } from '../types'

export function useProviders() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (refresh = false) => {
    setLoading(true)
    try {
      const next = refresh
        ? await getApi().providers.refresh()
        : await getApi().providers.list()
      setProviders(next)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load().catch(() => setLoading(false))

    const reload = () => {
      load().catch(() => setLoading(false))
    }

    window.addEventListener('sorcerer:providers-updated', reload)
    const unsubscribe = getApi().providers.onUpdated?.(reload)
    return () => {
      window.removeEventListener('sorcerer:providers-updated', reload)
      unsubscribe?.()
    }
  }, [load])

  const detectedProviders = useMemo(
    () => providers.filter((provider) => provider.detected),
    [providers]
  )

  const defaultProvider = useMemo(
    () => detectedProviders.find((provider) => provider.isDefault) || detectedProviders[0] || null,
    [detectedProviders]
  )

  const getProvider = useCallback(
    (id: string) => providers.find((provider) => provider.id === id),
    [providers]
  )

  return {
    providers,
    detectedProviders,
    defaultProvider,
    loading,
    getProvider,
    reload: () => load(false),
    refresh: () => load(true)
  }
}
