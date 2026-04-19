import { ComingSoonPage } from '../../components/ComingSoonPage'

export default function TrashPage() {
  return (
    <ComingSoonPage
      activeRoute="/trash"
      title="Trash"
      subtitle="Deleted files live here for 30 days before they're gone for good."
      illustration="trash"
      body="Accidentally dropped the wrong folder? You've got a month to change your mind. After that, files are permanently removed from hot storage and their stored pieces are released from Filecoin deals."
    />
  )
}
