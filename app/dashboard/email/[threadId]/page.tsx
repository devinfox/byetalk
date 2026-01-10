import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { ThreadView } from './thread-view'

interface ThreadPageProps {
  params: Promise<{ threadId: string }>
}

export default async function ThreadPage({ params }: ThreadPageProps) {
  const { threadId } = await params
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get the thread with all emails (use admin to bypass RLS)
  const { data: thread, error: threadError } = await supabaseAdmin
    .from('email_threads')
    .select(`
      *,
      email_account:email_accounts(id, email_address, display_name, user_id)
    `)
    .eq('id', threadId)
    .single()

  if (threadError || !thread) {
    console.error('Thread error:', threadError)
    notFound()
  }

  // Verify user owns this thread's account
  if (!thread.email_account || thread.email_account.user_id !== user.id) {
    notFound()
  }

  // Get all emails in the thread
  const { data: emails } = await supabaseAdmin
    .from('emails')
    .select(`
      *,
      attachments:email_attachments(*)
    `)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  // Mark thread and emails as read
  await supabaseAdmin
    .from('email_threads')
    .update({ is_read: true })
    .eq('id', threadId)

  if (emails && emails.length > 0) {
    const unreadEmailIds = emails.filter(e => !e.is_read).map(e => e.id)
    if (unreadEmailIds.length > 0) {
      await supabaseAdmin
        .from('emails')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', unreadEmailIds)
    }
  }

  // Get user's email accounts for reply (use admin to bypass RLS for domain join)
  const { data: accounts } = await supabaseAdmin
    .from('email_accounts')
    .select(`
      *,
      domain:email_domains(id, domain, verification_status)
    `)
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('is_primary', { ascending: false })

  return (
    <ThreadView
      thread={thread}
      emails={emails || []}
      accounts={accounts || []}
    />
  )
}
