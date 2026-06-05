import { EntityCollectionPage } from '../components/entities/EntityCollectionPage'

export function MediaPage() {
  return (
    <EntityCollectionPage
      title="Media"
      subtitle="Player, sorgenti e controlli multiroom"
      domains={['media_player', 'remote']}
      emptyText="Nessun player multimediale esposto da Home Assistant"
    />
  )
}
