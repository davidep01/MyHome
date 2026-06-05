export interface RoomEntity {
  entityId: string
  label: string
  type: 'light' | 'climate' | 'cover' | 'scene' | 'security' | 'media' | 'sensor' | 'switch' | 'camera' | 'vacuum' | 'lock' | 'alarm'
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

/** Circular quick-scenes shown in the home header (label, icon, accent color). */
/** Exact scene orb colors from hearth-design-system/project/preview/comp-scenes.html */
export const quickScenes = [
  { entityId: 'scene.musica', label: 'Musica', icon: 'music', color: '#e8508d' },
  { entityId: 'scene.fuori_casa', label: 'Fuori', icon: 'door-open', color: '#0a84ff' },
  { entityId: 'scene.buonanotte', label: 'Notte', icon: 'moon', color: '#7c5cff' },
  { entityId: 'scene.film', label: 'Film', icon: 'film', color: '#ff453a' },
  { entityId: 'scene.buongiorno', label: 'Mattino', icon: 'sunrise', color: '#ff9f0a' },
  { entityId: 'scene.in_casa', label: 'Arrivo', icon: 'house', color: '#30b15a' },
]

/**
 * Entity IDs surfaced in the "Preferiti" section of the home view.
 * Matched against the configured room entities (see TabletDashboard).
 */
export const favoriteEntityIds: string[] = [
  'climate.termostufa',
  'light.camera_mattia',
  'light.comodino',
  'sensor.ups_battery',
  'lock.porta_ingresso',
  'alarm_control_panel.casa',
]
