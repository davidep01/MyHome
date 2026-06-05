import { EntityCollectionPage } from '../components/entities/EntityCollectionPage'

export function LightsPage() {
  return (
    <EntityCollectionPage
      title="Luci"
      subtitle="Illuminazione, dimmer e scene collegate"
      domains={['light']}
      emptyText="Nessuna luce esposta da Home Assistant"
    />
  )
}
