export const FULLY_KIOSK_EVENT = 'myhome:fully-event'

export const FULLY_KIOSK_EVENTS = [
  'onMotion',
  'screenOn',
  'screenOff',
  'onScreensaverStart',
  'onScreensaverStop',
] as const

export type FullyKioskEventName = typeof FULLY_KIOSK_EVENTS[number]
export type FullyKioskAvailability = 'unavailable' | 'blocked' | 'available'
export type FullyAmbientSource = 'average-luma' | 'sensor-lux'

export interface FullyAmbientReading {
  value: number
  source: FullyAmbientSource
}

export interface FullyKioskCapabilities {
  bindEvents: boolean
  averageLuma: boolean
  hardwareLux: boolean
  brightnessRead: boolean
  brightnessWrite: boolean
  screenState: boolean
  screenWake: boolean
  motionStart: boolean
  motionStop: boolean
  motionState: boolean
}

export interface FullyKioskBridge {
  readonly capabilities: FullyKioskCapabilities
  readAmbientLight: () => FullyAmbientReading | null
  getBrightness: () => number | null
  setBrightness: (level: number) => boolean
  getScreenOn: () => boolean | null
  turnScreenOn: () => boolean
  isMotionRunning: () => boolean | null
  startMotion: () => boolean
  stopMotion: () => boolean
  bind: (eventName: FullyKioskEventName, javascript: string) => boolean
}

interface LocationLike {
  protocol: string
  hostname: string
}

interface FullyBindingHost extends EventTarget {
  __myhomeFullyDispatch?: (eventName: string) => void
  __myhomeFullyBoundEvents?: Partial<Record<string, boolean>>
}

const SENSOR_TYPE_LIGHT = 5

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((octet) => octet < 0 || octet > 255)) return false
  const [a, b] = octets
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
}

function isPrivateIpv6(hostname: string): boolean {
  if (!hostname.includes(':')) return false
  if (hostname === '::1') return true
  const first = hostname.split(':')[0]
  const prefix = Number.parseInt(first, 16)
  if (!Number.isFinite(prefix)) return false
  return (prefix >= 0xfc00 && prefix <= 0xfdff)
    || (prefix >= 0xfe80 && prefix <= 0xfebf)
}

/**
 * Fully's privileged interface is intentionally ignored on public origins.
 * Operators still need to configure Fully's own exact URL whitelist; this is
 * a second, app-side guard for common private-LAN addressing schemes.
 */
export function isTrustedLanLocation(location: LocationLike): boolean {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return false
  const hostname = normalizeHostname(location.hostname)
  if (!hostname) return false
  if (hostname === 'localhost' || isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return true
  if (!hostname.includes('.')) return true
  return hostname.endsWith('.local') || hostname.endsWith('.lan') || hostname.endsWith('.home.arpa')
}

export function fullyKioskAvailability(
  fully: FullyKioskJavascriptInterface | undefined,
  location: LocationLike,
): FullyKioskAvailability {
  if (!fully) return 'unavailable'
  return isTrustedLanLocation(location) ? 'available' : 'blocked'
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

export function createFullyKioskBridge(
  fully: FullyKioskJavascriptInterface | undefined,
  location: LocationLike,
): FullyKioskBridge | null {
  if (!fully || !isTrustedLanLocation(location)) return null

  const methods = fully as Record<string, unknown>
  const has = (name: string) => typeof methods[name] === 'function'
  const capabilities: FullyKioskCapabilities = {
    bindEvents: has('bind'),
    averageLuma: has('getAverageLuma'),
    hardwareLux: has('getSensorValue'),
    brightnessRead: has('getScreenBrightness'),
    brightnessWrite: has('setScreenBrightness'),
    screenState: has('getScreenOn'),
    screenWake: has('turnScreenOn'),
    motionStart: has('startMotionDetection'),
    motionStop: has('stopMotionDetection'),
    motionState: has('isMotionDetectionRunning'),
  }

  const invoke = (name: string, ...args: unknown[]): { ok: boolean; value?: unknown } => {
    const method = methods[name]
    if (typeof method !== 'function') return { ok: false }
    try {
      return { ok: true, value: method.apply(fully, args) }
    } catch {
      return { ok: false }
    }
  }

  return {
    capabilities,
    readAmbientLight: () => {
      const luma = invoke('getAverageLuma')
      const lumaValue = luma.ok ? finiteNumber(luma.value) : null
      if (lumaValue !== null && lumaValue >= 0) {
        return { value: lumaValue, source: 'average-luma' }
      }
      const sensor = invoke('getSensorValue', SENSOR_TYPE_LIGHT)
      const luxValue = sensor.ok ? finiteNumber(sensor.value) : null
      return luxValue !== null && luxValue >= 0
        ? { value: luxValue, source: 'sensor-lux' }
        : null
    },
    getBrightness: () => {
      const result = invoke('getScreenBrightness')
      const value = result.ok ? finiteNumber(result.value) : null
      return value !== null && value >= 0 && value <= 255 ? Math.round(value) : null
    },
    setBrightness: (level) => {
      if (!Number.isFinite(level)) return false
      return invoke('setScreenBrightness', Math.round(clamp(level, 0, 255))).ok
    },
    getScreenOn: () => {
      const result = invoke('getScreenOn')
      return result.ok ? booleanValue(result.value) : null
    },
    turnScreenOn: () => invoke('turnScreenOn').ok,
    isMotionRunning: () => {
      const result = invoke('isMotionDetectionRunning')
      return result.ok ? booleanValue(result.value) : null
    },
    startMotion: () => invoke('startMotionDetection').ok,
    stopMotion: () => invoke('stopMotionDetection').ok,
    bind: (eventName, javascript) => invoke('bind', eventName, javascript).ok,
  }
}

/** Maps camera luma or hardware lux to a comfortable 0..255 screen level. */
export function adaptiveBrightnessFor(reading: FullyAmbientReading): number {
  const normalized = reading.source === 'average-luma'
    ? Math.pow(clamp(reading.value, 0, 255) / 255, 0.75)
    : clamp(Math.log10(Math.max(0, reading.value) + 1) / 4, 0, 1)
  return Math.round(42 + normalized * 188)
}

export function isFullyKioskEventName(value: unknown): value is FullyKioskEventName {
  return typeof value === 'string' && (FULLY_KIOSK_EVENTS as readonly string[]).includes(value)
}

/** Registers each native event once and forwards it as a typed DOM event. */
export function ensureFullyEventBindings(
  bridge: FullyKioskBridge,
  host: FullyBindingHost = window,
): void {
  host.__myhomeFullyDispatch = (eventName) => {
    if (!isFullyKioskEventName(eventName)) return
    host.dispatchEvent(new CustomEvent(FULLY_KIOSK_EVENT, { detail: { name: eventName } }))
  }
  const bound = host.__myhomeFullyBoundEvents ?? {}
  host.__myhomeFullyBoundEvents = bound
  if (!bridge.capabilities.bindEvents) return

  for (const eventName of FULLY_KIOSK_EVENTS) {
    if (bound[eventName]) continue
    const javascript = `window.__myhomeFullyDispatch("${eventName}");`
    if (bridge.bind(eventName, javascript)) bound[eventName] = true
  }
}
