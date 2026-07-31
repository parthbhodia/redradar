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
