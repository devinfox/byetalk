import { JoinClient } from './join-client'

interface JoinPageProps {
  params: Promise<{ code: string }>
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { code } = await params

  return <JoinClient inviteCode={code} />
}
