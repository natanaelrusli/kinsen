import { useEffect, useState } from 'react'
import { useAssetStore } from '../../shared/state/asset-store'

export function useGoldPriceRefresh(): { online: boolean } {
  const [online, setOnline] = useState(navigator.onLine)
  const refresh = useAssetStore(state => state.refreshGoldPrices)
  useEffect(() => {
    let reconnectPending = false
    const foregroundRefresh = () => {
      if (navigator.onLine && document.visibilityState !== 'hidden') {
        void refresh(reconnectPending)
        reconnectPending = false
      }
    }
    const reconnected = () => {
      setOnline(true)
      reconnectPending = true
      foregroundRefresh()
    }
    const disconnected = () => setOnline(false)
    foregroundRefresh()
    window.addEventListener('online', reconnected)
    window.addEventListener('offline', disconnected)
    window.addEventListener('focus', foregroundRefresh)
    document.addEventListener('visibilitychange', foregroundRefresh)
    const timer = window.setInterval(foregroundRefresh, 60 * 60 * 1000)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', reconnected)
      window.removeEventListener('offline', disconnected)
      window.removeEventListener('focus', foregroundRefresh)
      document.removeEventListener('visibilitychange', foregroundRefresh)
    }
  }, [refresh])
  return { online }
}
