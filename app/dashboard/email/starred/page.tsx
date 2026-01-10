import { FolderPage } from '../components/folder-page'

export default function StarredPage() {
  return (
    <FolderPage
      folder="inbox"
      title="Starred"
      emptyMessage="No starred emails"
      isStarred
    />
  )
}
