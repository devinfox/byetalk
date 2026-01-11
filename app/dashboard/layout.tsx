import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { DialerWrapper } from '@/components/dialer-wrapper'
import { ChatWrapper } from '@/components/chat/chat-wrapper'
import { TaskSidebar } from '@/components/task-sidebar'
import { NimbusProvider } from '@/components/nimbus'
import { ComplianceAlertProvider } from '@/components/compliance-alert-provider'
import { EmailDraftAlertProvider } from '@/components/email-draft-alert-provider'
import { FunnelEnrollmentAlertProvider } from '@/components/funnel-enrollment-alert-provider'
import { DocumentProvider } from '@/lib/document-context'
import { RealtimeRefreshProvider } from '@/components/realtime-refresh-provider'
import { TurboModeProvider } from '@/lib/turbo-mode-context'
import { ImportProgressBar } from '@/components/import-progress-bar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getCurrentUser()

  // Fetch unread email count for sidebar badge (only for current user's email accounts)
  let unreadEmailCount = 0
  if (profile?.id) {
    // First get the user's email account IDs
    const { data: userEmailAccounts } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('user_id', profile.id)
      .eq('is_deleted', false)

    if (userEmailAccounts && userEmailAccounts.length > 0) {
      const accountIds = userEmailAccounts.map(acc => acc.id)
      const { count } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)
        .eq('is_inbound', true)
        .in('email_account_id', accountIds)

      unreadEmailCount = count || 0
    }
  }

  return (
    <TurboModeProvider>
      <DialerWrapper userId={profile?.id}>
        <DocumentProvider>
          <NimbusProvider>
            <RealtimeRefreshProvider userId={profile?.id}>
              <ChatWrapper userId={profile?.id}>
                <ComplianceAlertProvider>
                  <EmailDraftAlertProvider userId={profile?.id}>
                    <FunnelEnrollmentAlertProvider userId={profile?.id}>
                      <div
                      className="min-h-screen flex"
                      style={{
                        backgroundImage: 'url(/background.png)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundAttachment: 'fixed',
                      }}
                    >
                      {/* Dark overlay for readability */}
                      <div className="fixed inset-0 bg-black/60 pointer-events-none" />

                      <Sidebar user={profile} unreadEmailCount={unreadEmailCount} />
                      <div className="flex-1 flex flex-col relative z-10">
                        <Header user={profile} />
                        <div className="flex-1 flex overflow-hidden">
                          <main className="flex-1 p-6 overflow-auto">
                            {children}
                          </main>
                          <TaskSidebar userId={profile?.id} />
                        </div>
                      </div>
                      <ImportProgressBar />
                    </div>
                    </FunnelEnrollmentAlertProvider>
                  </EmailDraftAlertProvider>
                </ComplianceAlertProvider>
              </ChatWrapper>
            </RealtimeRefreshProvider>
          </NimbusProvider>
        </DocumentProvider>
      </DialerWrapper>
    </TurboModeProvider>
  )
}
