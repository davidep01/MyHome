import type { ReactNode, SVGProps } from 'react'
import { cn } from '../../lib/utils'

/**
 * Icone animate di MyHome — SVG multi-parte in stile lucide (viewBox 24,
 * stroke 2, cap arrotondati), drop-in al posto delle icone statiche.
 *
 * Le PARTI (`.ai-part`) si animano via CSS solo dentro un contesto attivo
 * (`.widget-card-icon-active` sul puck delle card, oppure `.ai-active` su
 * qualunque wrapper). Fuori dal contesto restano pose statiche corrette.
 * Tutte le animazioni sono transform/opacity-only e si spengono in
 * perf-lite / prefers-reduced-motion (vedi "Animated icons" in index.css).
 */

export interface AnimatedIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

function Svg({ size = 24, className, children, ...rest }: AnimatedIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('ai-icon', className)}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** Lampadina: raggi e alone respirano quando è accesa. */
export function AnimLightbulb(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <circle className="ai-part ai-bulb-glow" cx="12" cy="8" r="4" fill="currentColor" stroke="none" />
      <path className="ai-part ai-ray ai-d1" d="M3.8 3.2l1.6 1.5" />
      <path className="ai-part ai-ray ai-d2" d="M12 1v2" />
      <path className="ai-part ai-ray ai-d3" d="M20.2 3.2l-1.6 1.5" />
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </Svg>
  )
}

/** Ventilatore: il rotore gira, il mozzo resta fermo. */
export function AnimFan(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <circle className="ai-fan-ring" cx="12" cy="12" r="9.5" opacity="0.3" />
      <g className="ai-part ai-fan-rotor">
        <ellipse cx="12" cy="6.3" rx="2.2" ry="3.5" fill="currentColor" stroke="none" />
        <ellipse cx="12" cy="6.3" rx="2.2" ry="3.5" fill="currentColor" stroke="none" transform="rotate(120 12 12)" />
        <ellipse cx="12" cy="6.3" rx="2.2" ry="3.5" fill="currentColor" stroke="none" transform="rotate(240 12 12)" />
      </g>
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Fiamma: guizza dalla base quando il riscaldamento è attivo. */
export function AnimFlame(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path
        className="ai-part ai-flame"
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
      />
    </Svg>
  )
}

/** Cristallo di neve: rotazione lentissima quando si raffredda. */
export function AnimSnowflake(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <g className="ai-part ai-snow">
        <path d="M12 3v18" />
        <path d="M4.2 7.5l15.6 9" />
        <path d="M19.8 7.5l-15.6 9" />
        <path d="M12 3l-1.7 1.7M12 3l1.7 1.7M12 21l-1.7-1.7M12 21l1.7-1.7" opacity="0.6" />
      </g>
    </Svg>
  )
}

/** Termometro (statico di proposito: i sensori non "fanno" nulla). */
export function AnimThermometer(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
      <circle cx="12" cy="17" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 13.5V9" />
    </Svg>
  )
}

/** Goccia: oscilla appena quando il flusso è attivo. */
export function AnimDroplet(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path
        className="ai-part ai-bob"
        d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"
      />
    </Svg>
  )
}

/** Vapore: tre fili che salgono (umidificatore in funzione). */
export function AnimMist(props: AnimatedIconProps) {
  const wisp = 'c-.8-1.1-.8-2.4 0-3.5.8-1.1.8-2.4 0-3.5'
  return (
    <Svg {...props}>
      <path className="ai-part ai-wisp ai-d1" d={`M8 16.5${wisp}`} />
      <path className="ai-part ai-wisp ai-d2" d={`M12 17.5${wisp}`} />
      <path className="ai-part ai-wisp ai-d3" d={`M16 16.5${wisp}`} />
      <path d="M5 21h14" />
    </Svg>
  )
}

/** Tenda/tapparella: le stecche ondeggiano solo durante il movimento. */
export function AnimBlinds(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4h18" />
      <path d="M5 4v11" />
      <circle cx="5" cy="18.5" r="1.7" />
      <path className="ai-part ai-slat ai-d1" d="M9 8h12" />
      <path className="ai-part ai-slat ai-d2" d="M9 11.5h12" />
      <path className="ai-part ai-slat ai-d3" d="M10.5 15h10.5" />
    </Svg>
  )
}

/** Variante in movimento: stessa geometria, stecche animate (identità stabile). */
export function AnimBlindsMoving(props: AnimatedIconProps) {
  return <AnimBlinds {...props} data-moving="true" />
}

/** Serratura: il gancio si solleva quando è sbloccata (posa, non loop). */
export function AnimLock(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path className="ai-part ai-lock-shackle" d="M7 11V7a5 5 0 0 1 10 0v4" />
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path className="ai-part ai-keyhole" d="M12 16.5h.01" />
    </Svg>
  )
}

/** Equalizer: barre che danzano quando la musica suona. */
export function AnimEqualizer(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path className="ai-part ai-eq ai-d1" d="M6.5 14.5v-5" />
      <path className="ai-part ai-eq ai-d2" d="M12 16.5v-9" />
      <path className="ai-part ai-eq ai-d3" d="M17.5 14.5v-5" />
    </Svg>
  )
}

/** TV: mini equalizer nello schermo quando riproduce. */
export function AnimTv(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="m17 2-5 5-5-5" />
      <path className="ai-part ai-eq ai-d1" d="M9 16.5v-2" />
      <path className="ai-part ai-eq ai-d2" d="M12 17.5v-4" />
      <path className="ai-part ai-eq ai-d3" d="M15 16.5v-2" />
    </Svg>
  )
}

/** Speaker: il woofer pulsa a tempo. */
export function AnimSpeaker(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <circle className="ai-part ai-woofer" cx="12" cy="14" r="4" />
      <path d="M12 6h.01" />
    </Svg>
  )
}

/** Robot (aspirapolvere/tagliaerba): occhi che sbattono, corpo che ondeggia. */
export function AnimBot(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <g className="ai-part ai-bot-body">
        <path d="M12 8V4H8" />
        <rect x="4" y="8" width="16" height="12" rx="2" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <path className="ai-part ai-eye ai-d1" d="M9 13v2" />
        <path className="ai-part ai-eye ai-d2" d="M15 13v2" />
      </g>
    </Svg>
  )
}

const shieldPath =
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'

/** Scudo: eco che si propaga + punto esclamativo quando c'è un allarme. */
export function AnimShield(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path className="ai-part ai-shield-echo" d={shieldPath} />
      <path d={shieldPath} />
      <path className="ai-part ai-alert-mark" d="M12 8.5v4" />
      <path className="ai-part ai-alert-mark" d="M12 15.5h.01" />
    </Svg>
  )
}

/** Movimento: anelli che si propagano dal punto quando rileva qualcosa. */
export function AnimRadar(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle className="ai-part ai-ring ai-d1" cx="12" cy="12" r="5" opacity="0.5" />
      <circle className="ai-part ai-ring ai-d2" cx="12" cy="12" r="8.5" opacity="0.22" />
    </Svg>
  )
}

/** Camera: iride viva + puntino REC quando è online. */
export function AnimCamera(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
      <circle className="ai-part ai-iris" cx="12" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <circle className="ai-part ai-rec" cx="18.3" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Campanello: onde sonore che respirano piano (mai oscillazione continua). */
export function AnimBell(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <path className="ai-part ai-sound ai-d1" d="M2.6 6.4a9.5 9.5 0 0 1 2-3.2" />
      <path className="ai-part ai-sound ai-d2" d="M19.4 3.2a9.5 9.5 0 0 1 2 3.2" />
    </Svg>
  )
}

/** Scintille: le stelle piccole brillano sfalsate, la grande respira. */
export function AnimSparkles(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path
        className="ai-part ai-star-main"
        d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
      />
      <path className="ai-part ai-twinkle ai-d1" d="M20 3v4M22 5h-4" />
      <path className="ai-part ai-twinkle ai-d2" d="M4 17v2M5 18H3" />
    </Svg>
  )
}

/** Interruttore: respiro impercettibile quando è acceso. */
export function AnimPower(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <g className="ai-part ai-breath">
        <path d="M12 2v10" />
        <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
      </g>
    </Svg>
  )
}

/** Fulmine: tremolio dell'energia che scorre. */
export function AnimZap(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path
        className="ai-part ai-zap"
        d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
      />
    </Svg>
  )
}

/** Sole e nuvola: raggi che brillano piano, nuvola che fluttua. */
export function AnimCloudSun(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path className="ai-part ai-twinkle ai-d1" d="M12 2v2" />
      <path className="ai-part ai-twinkle ai-d2" d="m4.93 4.93 1.41 1.41" />
      <path className="ai-part ai-twinkle ai-d3" d="M20 12h2" />
      <path className="ai-part ai-twinkle ai-d2" d="m19.07 4.93-1.41 1.41" />
      <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" />
      <path className="ai-part ai-bob" d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
    </Svg>
  )
}

/** Vento / qualità dell'aria: i flussi scorrono sfalsati. */
export function AnimWind(props: AnimatedIconProps) {
  return (
    <Svg {...props}>
      <path className="ai-part ai-flow ai-d1" d="M9.8 4.4A2 2 0 1 1 11 8H2" />
      <path className="ai-part ai-flow ai-d2" d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
      <path className="ai-part ai-flow ai-d3" d="M12.8 19.6A2 2 0 1 0 14 16H2" />
    </Svg>
  )
}
