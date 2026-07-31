import { MAX_ORG_MEMBERS } from '#shared/limits'
import { requireUserClient } from '../utils/guard'

/**
 * Invite a teammate into the caller's org. The service role sends the invite
 * email (or just attaches an existing account) and inserts the membership row,
 * which is why this can't be done from the client under RLS.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string }>(event)
  const email = body?.email?.trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid email is required.' })
  }

  const { client, local } = await requireUserClient(event)
  if (local) {
    throw createError({ statusCode: 400, statusMessage: 'Invites are not available in local mode.' })
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
    throw createError({ statusCode: 409, statusMessage: 'Create a workspace first.' })
  }
  if (!['owner', 'admin'].includes(mine.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can invite.' })
  }

  const { serverSupabaseServiceRole } = await import('#supabase/server')
  // supabase.types is disabled project-wide, so cast once instead of fighting
  // `never` on every query.
  const admin = serverSupabaseServiceRole(event) as import('@supabase/supabase-js').SupabaseClient<any>

  // Checked before the invite is sent, not after: creating the auth user first
  // and then refusing the seat would leave a stranded account and an email the
  // recipient can't act on.
  const { count: seatsUsed, error: seatError } = await admin
    .from('org_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('org_id', mine.org_id)

  if (seatError) {
    throw createError({ statusCode: 500, statusMessage: seatError.message })
  }

  if ((seatsUsed ?? 0) >= MAX_ORG_MEMBERS) {
    throw createError({
      statusCode: 409,
      statusMessage: `This workspace is full — ${MAX_ORG_MEMBERS} members is the limit.`,
    })
  }

  // Existing account? profiles mirrors auth.users, and unlike the auth schema
  // it's queryable, so we look the user up there.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (profileError) {
    // Most likely cause: migration 0002 hasn't been applied yet.
    throw createError({ statusCode: 500, statusMessage: profileError.message })
  }

  let userId = profile?.id as string | undefined
  let status: 'added' | 'invited' = 'added'

  if (!userId) {
    const redirectTo = `${getRequestURL(event).origin}/confirm?next=${encodeURIComponent('/app')}`
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })

    if (inviteError || !invited?.user) {
      throw createError({
        statusCode: 502,
        statusMessage: `Could not send the invite: ${inviteError?.message ?? 'unknown error'}`,
      })
    }

    userId = invited.user.id
    status = 'invited'
  }

  const { data: existingMember } = await admin
    .from('org_members')
    .select('user_id')
    .eq('org_id', mine.org_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingMember) {
    throw createError({ statusCode: 409, statusMessage: 'Already a member of this workspace.' })
  }

  const { error: insertError } = await admin
    .from('org_members')
    .insert({ org_id: mine.org_id, user_id: userId, role: 'member' })

  if (insertError) {
    throw createError({ statusCode: 500, statusMessage: insertError.message })
  }

  return { status, email }
})
