import { EntityCollectionPage } from '../components/entities/EntityCollectionPage'

export function CamerasPage() {
  return (
    <EntityCollectionPage
      title="Telecamere"
      subtitle="Snapshot, motion detection e feed live"
      domains={['camera']}
      emptyText="Nessuna telecamera esposta da Home Assistant"
    />
  )
}
