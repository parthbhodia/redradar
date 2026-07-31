import { requireUserClient } from '../utils/guard'

/**
 * Remove a teammate from the caller's workspace.
 *
 * Their claims are released first, then the membership row goes. That order
 * matters: if the second step fails, the worst case is a still-present member
 * whose leads are free to re-claim. The reverse order could strand a lead
 * assigned to someone who can no longer reach it, and the duplicate-claim
 * trigger would then block anyone else from taking the thread.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ userId?: string }>(event)
  const userId = body?.userId?.trim()

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'A user id is required.' })
  }

  const { client, user, local } = await requireUserClient(event)
  if (local) {
    throw createError({ statusCode: 400, statusMessage: 'Teams are not available in local mode.' })
  }

  if (userId === user.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'You cannot remove yourself from a workspace.',
    })
  }

  // RLS scopes this to the caller's own memberships.
  const { data: memberships, error: membershipError } = await client!
    .from('org_members')
    .select('org_id, role')
    .limit(1)

  if (membershipError) {
    throw createError({ statusCode: 500, statusMessage: membershipError.message })
  }

  const mine = memberships?.[0]
  if (!mine) {
    throw createError({ statusCode: 409, statusMessage: 'You are not in a workspace.' })
  }
  if (!['owner', 'admin'].includes(mine.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can remove members.' })
  }

  const { serverSupabaseServiceRole } = await import('#supabase/server')
  const admin = serverSupabaseServiceRole(event) as import('@supabase/supabase-js').SupabaseClient<any>

  const { data: target, error: targetError } = await admin
    .from('org_members')
    .select('user_id, role, profiles!org_members_user_profile_fkey(display_name, email)')
    .eq('org_id', mine.org_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (targetError) {
    throw createError({ statusCode: 500, statusMessage: targetError.message })
  }
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'That person is not in this workspace.' })
  }

  // The owner is the workspace's anchor and there is no way to transfer the
  // role, so removing one would leave an org nobody can administer.
  if (target.role === 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'The workspace owner cannot be removed.' })
  }

  // --- release their claims -------------------------------------------------

  // Leads reach the org through campaigns → brands, which PostgREST cannot
  // filter through in a single update, so resolve the campaign ids first.
  const { data: brands } = await admin
    .from('brands')
    .select('id')
    .eq('org_id', mine.org_id)

  const brandIds = (brands ?? []).map(b => b.id)
  let released = 0

  if (brandIds.length) {
    const { data: campaigns } = await admin
      .from('campaigns')
      .select('id')
      .in('brand_id', brandIds)

    const campaignIds = (campaigns ?? []).map(c => c.id)

    if (campaignIds.length) {
      const { data: freed, error: releaseError } = await admin
        .from('leads')
        .update({ assigned_to: null, claimed_at: null })
        .eq('assigned_to', userId)
        .in('campaign_id', campaignIds)
        .select('id')

      if (releaseError) {
        throw createError({
          statusCode: 500,
          statusMessage: `Could not release their claimed leads: ${releaseError.message}`,
        })
      }

      released = freed?.length ?? 0

      // Attributed to whoever did the removing, because they are the one who
      // released it. Best-effort: a missing audit line is not worth failing on
      // once the lead is already free.
      if (released) {
        await admin.from('lead_events').insert(
          (freed ?? []).map(lead => ({ lead_id: lead.id, user_id: user.id, type: 'released' })),
        )
      }
    }
  }

  // --- drop the membership --------------------------------------------------

  const { error: deleteError } = await admin
    .from('org_members')
    .delete()
    .eq('org_id', mine.org_id)
    .eq('user_id', userId)

  if (deleteError) {
    throw createError({ statusCode: 500, statusMessage: deleteError.message })
  }

  const profile = target.profiles as { display_name?: string, email?: string } | null

  return {
    removed: profile?.display_name || profile?.email || 'That member',
    released,
  }
})
