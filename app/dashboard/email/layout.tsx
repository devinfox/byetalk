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
    <div className="h-full flex">
      {/* Email Folder Sidebar */}
      <EmailSidebar userId={user.id} />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>

      {/* Document Panel for attaching files to emails */}
      <DocumentPanel userId={user.id} />
    </div>
  )
}
