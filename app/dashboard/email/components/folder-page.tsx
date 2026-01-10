import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { EmailList } from './email-list'
import { NoAccountsSetup } from './no-accounts-setup'

interface FolderPageProps {
  folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive'
  title: string
  emptyMessage: string
  isStarred?: boolean
}

export async function FolderPage({ folder, title, emptyMessage, isStarred }: FolderPageProps) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get user's email accounts
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)

  if (!accounts || accounts.length === 0) {
    return <NoAccountsSetup />
  }

  const accountIds = accounts.map((a: any) => a.id)

  // Build query for threads
  let query = supabase
    .from('email_threads')
    .select(`
      *,
      emails(
        id,
        from_address,
        from_name,
        snippet,
        sent_at,
        created_at,
        is_read
      )
    `)
    .in('email_account_id', accountIds)
    .eq('is_deleted', false)
    .order('last_message_at', { ascending: false })
    .limit(50)

  // Filter by folder or starred
  if (isStarred) {
    query = query.eq('is_starred', true).neq('folder', 'trash')
  } else {
    query = query.eq('folder', folder)
  }

  const { data: threads } = await query

  // Get first account for compose
  const selectedAccountId = accountIds[0]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h1 className="text-xl font-light text-white">{title}</h1>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-hidden">
        <EmailList
          threads={(threads || []).map((t: any) => ({
            ...t,
            emails: t.emails?.sort((a: any, b: any) =>
              new Date(b.sent_at || b.created_at).getTime() -
              new Date(a.sent_at || a.created_at).getTime()
            )
          }))}
          selectedAccountId={selectedAccountId}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  )
}
