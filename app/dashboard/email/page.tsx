import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { EmailList } from './components/email-list'
import { NoAccountsSetup } from './components/no-accounts-setup'

const PAGE_SIZE = 20

export default async function EmailInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ starred?: string; account?: string; page?: string }>
}) {
  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get user's email accounts (use admin client to bypass RLS for domain join)
  const { data: accounts } = await supabaseAdmin
    .from('email_accounts')
    .select('*, email_domains(*)')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('is_primary', { ascending: false })

  // If no accounts, show setup screen
  if (!accounts || accounts.length === 0) {
    return <NoAccountsSetup />
  }

  // Get selected account or default to primary
  const selectedAccountId = params.account || accounts.find(a => a.is_primary)?.id || accounts[0].id

  // Get total count first
  let countQuery = supabase
    .from('email_threads')
    .select('*', { count: 'exact', head: true })
    .eq('email_account_id', selectedAccountId)
    .eq('is_deleted', false)
    .eq('folder', 'inbox')

  if (params.starred === 'true') {
    countQuery = countQuery.eq('is_starred', true)
  }

  const { count: totalCount } = await countQuery

  // Fetch threads for inbox with pagination
  const offset = (currentPage - 1) * PAGE_SIZE
  let query = supabase
    .from('email_threads')
    .select(`
      *,
      emails (
        id,
        from_address,
        from_name,
        snippet,
        sent_at,
        created_at,
        is_read
      )
    `)
    .eq('email_account_id', selectedAccountId)
    .eq('is_deleted', false)
    .eq('folder', 'inbox')
    .order('last_message_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  // Filter by starred if requested
  if (params.starred === 'true') {
    query = query.eq('is_starred', true)
  }

  const { data: threads, error } = await query

  if (error) {
    console.error('Error fetching threads:', error)
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light text-white">
              {params.starred === 'true' ? 'Starred' : 'Inbox'}
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {selectedAccount.email_address}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {totalCount || 0} conversations
            </span>
          </div>
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-hidden">
        <EmailList
          threads={threads || []}
          selectedAccountId={selectedAccountId}
          emptyMessage={
            params.starred === 'true'
              ? 'No starred emails'
              : 'Your inbox is empty'
          }
          currentPage={currentPage}
          totalCount={totalCount || 0}
          pageSize={PAGE_SIZE}
        />
      </div>
    </div>
  )
}
