import { ComingSoonPage } from '../../components/ComingSoonPage'

export default function SharedPage() {
  return (
    <ComingSoonPage
      activeRoute="/shared"
      title="Shared"
      subtitle="Files you've shared, and files shared with you."
      illustration="shared"
      body="Send a file with a link that never expires. Revoke access at any moment. Shared files carry the same verifiable-storage guarantees as everything else in your bucket — nothing about sharing changes how the file is stored."
    />
  )
}
