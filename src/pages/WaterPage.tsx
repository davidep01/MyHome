import { EntityCollectionPage } from '../components/entities/EntityCollectionPage'

const WATER_KEYWORDS = [
  'acqua',
  'water',
  'piscina',
  'pool',
  'irrigazione',
  'irrigation',
  'pompa',
  'pump',
  'cloro',
  'chlorine',
  'ph',
  'sale',
  'salt',
  'valvola',
  'valve',
  'perdita',
  'leak',
  'pioggia',
  'rain',
]

export function WaterPage() {
  return (
    <EntityCollectionPage
      title="Acqua"
      subtitle="Piscina, irrigazione, perdite e valvole"
      domains={['sensor', 'binary_sensor', 'switch', 'valve', 'water_heater', 'number', 'select']}
      keywords={WATER_KEYWORDS}
      emptyText="Nessuna entità acqua, piscina o irrigazione rilevata"
    />
  )
}
