import { ComingSoonPage } from '../../components/ComingSoonPage'

export default function RecentsPage() {
  return (
    <ComingSoonPage
      activeRoute="/recents"
      title="Recents"
      subtitle="Everything you've touched lately, in one view."
      illustration="recents"
      body="Opened a file on your phone this morning? Saved something 10 minutes ago from the laptop? Recents gives you the last 7 days at a glance, across every device that talks to your bucket."
    />
  )
}
