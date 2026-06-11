import type { ElementType } from 'react'
import {
  AnimBot, AnimEqualizer, AnimFan, AnimFlame, AnimLightbulb, AnimSnowflake,
} from '../../icons/animated'
import { widgetTones, type RingTone } from '../../widgets/utils/getRingColorScale'
import type { RoomActivity } from '../../../hooks/useRoomsOverview'

/**
 * Attività dominante di una stanza → icona animata + tono. Condivisa da
 * chip Stanze e catalogo Spazi: stessa grammatica visiva ovunque.
 */
export const ACTIVITY_META: Record<Exclude<RoomActivity, null>, { Icon: ElementType; tone: RingTone; label: string }> = {
  media: { Icon: AnimEqualizer, tone: widgetTones.media, label: 'In riproduzione' },
  heating: { Icon: AnimFlame, tone: widgetTones.heat, label: 'Riscaldamento' },
  cooling: { Icon: AnimSnowflake, tone: widgetTones.cool, label: 'Raffrescamento' },
  light: { Icon: AnimLightbulb, tone: widgetTones.light, label: 'Luci accese' },
  fan: { Icon: AnimFan, tone: widgetTones.cool, label: 'Ventilazione' },
  vacuum: { Icon: AnimBot, tone: widgetTones.ok, label: 'Pulizia in corso' },
}
