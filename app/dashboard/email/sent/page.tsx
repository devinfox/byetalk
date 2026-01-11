import { FolderPage } from '../components/folder-page'

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))

  return (
    <FolderPage
      folder="sent"
      title="Sent"
      emptyMessage="No sent emails yet"
      currentPage={currentPage}
    />
  )
}
