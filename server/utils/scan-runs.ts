import type { SupabaseClient } from '@supabase/supabase-js'
import type { KeywordOutcome } from './discovery'

/**
 * Scan history. Every scan opens a run row before touching Reddit and closes
 * it afterwards, so a scan that dies mid-flight stays visible as `running`
 * rather than leaving no trace at all.
 *
 * Writes go through the service role: scan_runs has no client insert policy.
 */

export interface FinishInput {
  keywords: number
  scanned: number
  inserted: number
  updated: number
  skipped: number
  errors: string[]
  perKeyword: KeywordOutcome[]
  byKeyword: Map<string, { inserted: number, updated: number }>
}

export async function startScanRun(
  admin: SupabaseClient,
  campaignId: string,
  opts: { trigger: 'manual' | 'scheduled', triggeredBy?: string | null },
): Promise<string | null> {
  const { data, error } = await admin
    .from('scan_runs')
    .insert({
      campaign_id: campaignId,
      trigger: opts.trigger,
      triggered_by: opts.triggeredBy ?? null,
    })
    .select('id')
    .single()

  // History is observability, not the job. If the table is missing (migration
  // 0005 not applied) or the insert fails, the scan itself must still run.
  if (error) {
    console.warn('[scan-runs] could not open run:', error.message)
    return null
  }
  return data.id as string
}

export async function finishScanRun(
  admin: SupabaseClient,
  runId: string | null,
  result: FinishInput,
): Promise<void> {
  if (!runId) return

  const status = result.errors.length ? 'partial' : 'ok'

  const { error } = await admin
    .from('scan_runs')
    .update({
      finished_at: new Date().toISOString(),
      status,
      keywords: result.keywords,
      scanned: result.scanned,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    })
    .eq('id', runId)

  if (error) {
    console.warn('[scan-runs] could not close run:', error.message)
    return
  }

  if (!result.perKeyword.length) return

  const rows = result.perKeyword.map((k) => {
    const written = result.byKeyword.get(k.phrase) ?? { inserted: 0, updated: 0 }
    return {
      run_id: runId,
      phrase: k.phrase,
      subreddit_filter: k.subreddit_filter,
      scanned: k.scanned,
      matched: k.matched,
      inserted: written.inserted,
      updated: written.updated,
      top_score: k.top_score,
      error: k.error,
    }
  })

  const { error: kwError } = await admin.from('scan_run_keywords').insert(rows)
  if (kwError) console.warn('[scan-runs] could not record keywords:', kwError.message)
}

/** Marks a run that aborted before writing any leads. */
export async function failScanRun(
  admin: SupabaseClient,
  runId: string | null,
  message: string,
): Promise<void> {
  if (!runId) return

  const { error } = await admin
    .from('scan_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: message,
    })
    .eq('id', runId)

  if (error) console.warn('[scan-runs] could not mark failure:', error.message)
}

/**
 * A `running` row still on the clock: something else genuinely has this
 * campaign locked. Older than this, the process behind it almost certainly
 * died (server restart, crashed request) rather than still being in flight —
 * matches the queue's own SCAN_TIMEOUT_MS in scan-queue.ts.
 */
const RUNNING_STALE_MS = 5 * 60 * 1000

/** Scanned this recently and it's probably still the same Reddit content. */
const COOLDOWN_MS = 5 * 60 * 1000

export interface CampaignScanState {
  /** Someone else's scan is genuinely in flight right now. */
  blocked: boolean
  blockedBy?: string | null
  blockedStartedAt?: string
  /** Not blocked, but recent enough to ask "scan anyway?" before spending quota. */
  needsConfirm: boolean
  lastScannedAt?: string
}

/**
 * Reads the campaign's most recent scan_runs row to answer two questions
 * before a new scan starts: is one already running (block it), and if not,
 * was the last one recent enough that a repeat is unlikely to find anything
 * new (ask first, don't just spend the quota).
 *
 * DB-backed rather than in-memory: unlike scan-queue.ts's per-user queue,
 * this is the source of truth across every serverless instance, not just
 * whichever one happens to be warm.
 */
export async function checkCampaignScanState(
  admin: SupabaseClient,
  campaignId: string,
): Promise<CampaignScanState> {
  const { data, error } = await admin
    .from('scan_runs')
    .select('id, status, started_at, profiles(display_name)')
    .eq('campaign_id', campaignId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // No history, or the table isn't reachable — nothing to block on.
  if (error || !data) return { blocked: false, needsConfirm: false }

  const age = Date.now() - new Date(data.started_at as string).getTime()

  if (data.status === 'running') {
    if (age < RUNNING_STALE_MS) {
      const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles
      return {
        blocked: true,
        blockedBy: (profile as { display_name?: string } | null)?.display_name ?? null,
        blockedStartedAt: data.started_at as string,
        needsConfirm: false,
      }
    }
    // Stale: whoever opened it never closed it out. Close it now so it stops
    // blocking every scan attempt after it.
    await failScanRun(admin, data.id as string, 'Timed out — the process likely died mid-scan.')
    return { blocked: false, needsConfirm: false }
  }

  if (age < COOLDOWN_MS) {
    return { blocked: false, needsConfirm: true, lastScannedAt: data.started_at as string }
  }

  return { blocked: false, needsConfirm: false }
}
