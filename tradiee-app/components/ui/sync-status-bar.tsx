'use client'
import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'

// Standalone status bar — does not require PowerSync context so it renders
// even before the DB initialises. Uses native navigator.onLine + events.
export function SyncStatusBar() {
  const [online, setOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    // navigator.onLine is a browser API, unavailable during SSR/render — this
    // has to run in an effect after mount, not as a lazy useState initializer.
    setOnline(navigator.onLine)

    function handleOnline() {
      setOnline(true)
      setSyncing(true)
      // Give PowerSync a moment to upload pending operations
      setTimeout(() => setSyncing(false), 3000)
    }
    function handleOffline() { setOnline(false) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Track pending ops via PowerSync if available
  useEffect(() => {
    let unsub: (() => void) | undefined
    import('@/lib/powersync/database').then(({ getPowerSyncDb }) => {
      try {
        const db = getPowerSyncDb()
        if (!db) return
        const interval = setInterval(async () => {
          const result = await db.execute('SELECT COUNT(*) as n FROM ps_crud')
          setPendingCount(result.rows?.item(0)?.n ?? 0)
        }, 2000)
        unsub = () => clearInterval(interval)
      } catch {
        // DB not available
      }
    })
    return () => unsub?.()
  }, [])

  if (online && pendingCount === 0 && !syncing) return null

  return (
    <div className={`flex items-center gap-2 px-4 py-1.5 text-xs font-medium ${
      !online
        ? 'bg-amber-50 border-b border-amber-200 text-amber-800'
        : 'bg-blue-50 border-b border-blue-200 text-blue-700'
    }`}>
      {!online ? (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          Working offline — changes will sync when back in range
          {pendingCount > 0 && (
            <span className="ml-auto bg-amber-200 text-amber-800 rounded-full px-2 py-0.5">
              {pendingCount} pending
            </span>
          )}
        </>
      ) : (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Syncing {pendingCount > 0 ? `${pendingCount} changes` : 'latest data'}…
        </>
      )}
    </div>
  )
}
