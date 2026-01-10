import { FolderPage } from '../components/folder-page'

export default function SentPage() {
  return (
    <FolderPage
      folder="sent"
      title="Sent"
      emptyMessage="No sent emails yet"
    />
  )
}
