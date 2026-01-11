import { getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { PresentationEditor } from './presentation-editor'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PresentationEditorPage({ params }: PageProps) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const { id } = await params

  return <PresentationEditor presentationId={id} userId={user.id} />
}
