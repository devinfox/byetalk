import { getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { EmailSidebar } from './components/email-sidebar'
import { DocumentPanel } from '@/components/documents/document-panel'

export default async function EmailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="h-full flex overflow-hidden max-w-full">
      {/* Email Folder Sidebar */}
      <div className="flex-shrink-0">
        <EmailSidebar userId={user.id} />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {children}
      </div>

      {/* Document Panel for attaching files to emails */}
      <div className="flex-shrink-0">
        <DocumentPanel userId={user.id} />
      </div>
    </div>
  )
}
