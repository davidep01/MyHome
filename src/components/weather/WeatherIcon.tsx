import {
  Cloud, CloudFog, CloudLightning, CloudMoon, CloudMoonRain, CloudRain,
  CloudSnow, CloudSun, CloudSunRain, Moon, Sun,
  type LucideIcon,
} from 'lucide-react'
import { createElement } from 'react'
import { cn } from '../../lib/utils'

function iconFor(code: string): LucideIcon {
  const day = code.endsWith('d')
  if (code.startsWith('01')) return day ? Sun : Moon
  if (code.startsWith('02')) return day ? CloudSun : CloudMoon
  if (code.startsWith('03') || code.startsWith('04')) return Cloud
  if (code.startsWith('09')) return CloudRain
  if (code.startsWith('10')) return day ? CloudSunRain : CloudMoonRain
  if (code.startsWith('11')) return CloudLightning
  if (code.startsWith('13')) return CloudSnow
  if (code.startsWith('50')) return CloudFog
  return Cloud
}

export function WeatherIcon({
  code,
  size = 32,
  className,
  label,
}: {
  code: string
  size?: number
  className?: string
  label?: string
}) {
  return createElement(iconFor(code), {
    size,
    strokeWidth: 1.65,
    className: cn('shrink-0 text-black/55', className),
    'aria-hidden': label ? undefined : true,
    'aria-label': label,
    role: label ? 'img' : undefined,
  })
}
