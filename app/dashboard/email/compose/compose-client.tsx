'use client'

import { useRouter } from 'next/navigation'
import { EmailCompose } from '../components/email-compose'
import { EmailAccount } from '@/types/email.types'

interface ComposePageClientProps {
  accounts: EmailAccount[]
  draftId?: string
}

export function ComposePageClient({ accounts, draftId }: ComposePageClientProps) {
  const router = useRouter()

  const handleClose = () => {
    router.push('/dashboard/email')
  }

  return (
    <EmailCompose
      accounts={accounts}
      onClose={handleClose}
      draftId={draftId}
    />
  )
}
