import { EntityCollectionPage } from '../components/entities/EntityCollectionPage'

export function AutomationsPage() {
  return (
    <EntityCollectionPage
      title="Automazioni"
      subtitle="Automazioni, script e scene operative"
      domains={['automation', 'script', 'scene']}
      emptyText="Nessuna automazione o script esposto da Home Assistant"
    />
  )
}
