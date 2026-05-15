export interface RoomEntity {
  entityId: string
  label: string
  type: 'light' | 'climate' | 'cover' | 'scene' | 'security' | 'media' | 'sensor' | 'switch' | 'camera'
}

export interface Room {
  id: string
  label: string
  icon: string
  entities: RoomEntity[]
}

export const rooms: Room[] = [
  {
    id: 'all',
    label: 'Tutto',
    icon: 'home',
    entities: [],
  },
  {
    id: 'soggiorno',
    label: 'Soggiorno',
    icon: 'sofa',
    entities: [
      { entityId: 'light.soggiorno', label: 'Luci', type: 'light' },
      { entityId: 'light.soggiorno_lampada', label: 'Lampada', type: 'light' },
      { entityId: 'cover.soggiorno_tende', label: 'Tende', type: 'cover' },
      { entityId: 'climate.soggiorno', label: 'Clima', type: 'climate' },
      { entityId: 'scene.soggiorno_relax', label: 'Relax', type: 'scene' },
      { entityId: 'scene.soggiorno_film', label: 'Film', type: 'scene' },
      // Predisposto — sostituisci con entity ID reale quando configuri il media player
      { entityId: 'media_player.soggiorno', label: 'Musica', type: 'media' },
      // Predisposto — sostituisci con entity ID reale della telecamera
      { entityId: 'camera.soggiorno', label: 'Camera', type: 'camera' },
    ],
  },
  {
    id: 'cucina',
    label: 'Cucina',
    icon: 'utensils',
    entities: [
      { entityId: 'light.cucina', label: 'Luci', type: 'light' },
      { entityId: 'light.cucina_piano', label: 'Piano cottura', type: 'light' },
      { entityId: 'cover.cucina_tenda', label: 'Tenda', type: 'cover' },
    ],
  },
  {
    id: 'camera',
    label: 'Camera',
    icon: 'bed',
    entities: [
      { entityId: 'light.camera', label: 'Luci', type: 'light' },
      { entityId: 'light.camera_comodino', label: 'Comodino', type: 'light' },
      { entityId: 'cover.camera_tapparelle', label: 'Tapparelle', type: 'cover' },
      { entityId: 'climate.camera', label: 'Clima', type: 'climate' },
      { entityId: 'scene.camera_notte', label: 'Notte', type: 'scene' },
    ],
  },
  {
    id: 'bagno',
    label: 'Bagno',
    icon: 'bath',
    entities: [
      { entityId: 'light.bagno', label: 'Luci', type: 'light' },
      { entityId: 'light.bagno_specchio', label: 'Specchio', type: 'light' },
    ],
  },
  {
    id: 'esterno',
    label: 'Esterno',
    icon: 'tree-pine',
    entities: [
      { entityId: 'light.esterno', label: 'Giardino', type: 'light' },
      { entityId: 'cover.cancello', label: 'Cancello', type: 'cover' },
      { entityId: 'binary_sensor.movimento_esterno', label: 'Movimento', type: 'sensor' },
      // Predisposto Ring / telecamera esterna — sostituisci con entity ID reale
      { entityId: 'camera.esterno', label: 'Ingresso', type: 'camera' },
      // Predisposto — presa smart o switch irrigazione
      { entityId: 'switch.irrigazione', label: 'Irrigazione', type: 'switch' },
    ],
  },
]

export const quickScenes = [
  { entityId: 'scene.buongiorno', label: 'Buongiorno', icon: 'sunrise' },
  { entityId: 'scene.buonanotte', label: 'Buonanotte', icon: 'moon' },
  { entityId: 'scene.in_casa', label: 'In casa', icon: 'house' },
  { entityId: 'scene.fuori_casa', label: 'Fuori casa', icon: 'door-open' },
]
