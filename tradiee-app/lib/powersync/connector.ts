import { AbstractPowerSyncDatabase, PowerSyncBackendConnector, UpdateType } from '@powersync/web'
import { createClient } from '@/lib/supabase/browser'

export class SupabaseConnector implements PowerSyncBackendConnector {
  // Reuse the app's browser client (cookie-based @supabase/ssr session) so the
  // connector shares the logged-in session — a separate supabase-js client would
  // have no session and fail with "Not signed in".
  readonly supabase = createClient()

  async fetchCredentials() {
    const { data: { session } } = await this.supabase.auth.getSession()
    if (!session) return null
    return {
      endpoint: process.env.NEXT_PUBLIC_POWERSYNC_URL!,
      token: session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const tx = await database.getNextCrudTransaction()
    if (!tx) return

    try {
      for (const op of tx.crud) {
        const { table, id, op: opType, opData } = op

        if (opType === UpdateType.PUT) {
          const { error } = await this.supabase
            .from(table)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .upsert({ id, ...(opData ?? {}) } as any, { onConflict: 'id' })
          if (error) throw error
        } else if (opType === UpdateType.PATCH) {
          const { error } = await this.supabase
            .from(table)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update((opData ?? {}) as any)
            .eq('id', id)
          if (error) throw error
        } else if (opType === UpdateType.DELETE) {
          const { error } = await this.supabase
            .from(table)
            .delete()
            .eq('id', id)
          if (error) throw error
        }
      }
      await tx.complete()
    } catch (e) {
      console.error('[PowerSync] upload error:', e)
      // Re-throw so PowerSync retries on next cycle
      throw e
    }
  }
}
