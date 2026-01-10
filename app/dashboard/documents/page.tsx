import { getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { DocumentsPageClient } from './documents-client'

export default async function DocumentsPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return <DocumentsPageClient userId={user.id} />
}
