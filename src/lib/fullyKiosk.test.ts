import { describe, expect, it, vi } from 'vitest'
import {
  adaptiveBrightnessFor,
  createFullyKioskBridge,
  ensureFullyEventBindings,
  FULLY_KIOSK_EVENTS,
  fullyKioskAvailability,
  isTrustedLanLocation,
} from './fullyKiosk'

const LAN_LOCATION = { protocol: 'http:', hostname: '192.168.1.40' }

describe('Fully Kiosk LAN guard', () => {
  it.each([
    ['http:', 'localhost'],
    ['http:', '127.0.0.1'],
    ['http:', '10.0.0.12'],
    ['https:', '172.20.4.8'],
    ['http:', '192.168.50.3'],
    ['http:', '169.254.10.4'],
    ['https:', 'myhome.local'],
    ['http:', 'homeassistant'],
    ['http:', '[fe80::1234]'],
  ])('accepts trusted origin %s//%s', (protocol, hostname) => {
    expect(isTrustedLanLocation({ protocol, hostname })).toBe(true)
  })

  it.each([
    ['https:', 'example.com'],
    ['http:', '203.0.113.4'],
    ['file:', 'localhost'],
    ['https:', 'myhome.example.net'],
  ])('rejects non-LAN origin %s//%s', (protocol, hostname) => {
    expect(isTrustedLanLocation({ protocol, hostname })).toBe(false)
  })

  it('distinguishes absent and blocked interfaces', () => {
    expect(fullyKioskAvailability(undefined, LAN_LOCATION)).toBe('unavailable')
    expect(fullyKioskAvailability({}, { protocol: 'https:', hostname: 'example.com' })).toBe('blocked')
    expect(createFullyKioskBridge({}, { protocol: 'https:', hostname: 'example.com' })).toBeNull()
  })
})

describe('Fully Kiosk capability bridge', () => {
  it('detects partial versions and safely normalizes native values', () => {
    const fully: FullyKioskJavascriptInterface = {
      getScreenBrightness: () => '126.6',
      getScreenOn: () => 'true',
      isMotionDetectionRunning: () => 0,
    }
    const bridge = createFullyKioskBridge(fully, LAN_LOCATION)

    expect(bridge?.capabilities).toMatchObject({
      brightnessRead: true,
      brightnessWrite: false,
      screenState: true,
      screenWake: false,
      motionState: true,
    })
    expect(bridge?.getBrightness()).toBe(127)
    expect(bridge?.getScreenOn()).toBe(true)
    expect(bridge?.isMotionRunning()).toBe(false)
    expect(bridge?.setBrightness(100)).toBe(false)
  })

  it('falls back from camera luma to hardware light sensor type 5', () => {
    const sensor = vi.fn(() => '17.5')
    const bridge = createFullyKioskBridge({
      getAverageLuma: () => { throw new Error('not supported by this device') },
      getSensorValue: sensor,
    }, LAN_LOCATION)

    expect(bridge?.readAmbientLight()).toEqual({ value: 17.5, source: 'sensor-lux' })
    expect(sensor).toHaveBeenCalledWith(5)
  })

  it('clamps writes to Fully screen brightness range and catches failures', () => {
    const setBrightness = vi.fn<(level: number) => void>()
    const bridge = createFullyKioskBridge({ setScreenBrightness: setBrightness }, LAN_LOCATION)
    expect(bridge?.setBrightness(-20)).toBe(true)
    expect(bridge?.setBrightness(999)).toBe(true)
    expect(setBrightness.mock.calls.map(([value]) => value)).toEqual([0, 255])

    const failing = createFullyKioskBridge({
      turnScreenOn: () => { throw new Error('native failure') },
    }, LAN_LOCATION)
    expect(failing?.turnScreenOn()).toBe(false)
  })

  it('registers each supported event only once', () => {
    const bind = vi.fn<(eventName: string, javascript: string) => void>()
    const bridge = createFullyKioskBridge({ bind }, LAN_LOCATION)
    const host = new EventTarget() as EventTarget & {
      __myhomeFullyDispatch?: (eventName: string) => void
      __myhomeFullyBoundEvents?: Partial<Record<string, boolean>>
    }
    if (!bridge) throw new Error('bridge unavailable')

    ensureFullyEventBindings(bridge, host)
    ensureFullyEventBindings(bridge, host)

    expect(bind).toHaveBeenCalledTimes(FULLY_KIOSK_EVENTS.length)
    expect(bind.mock.calls[0]).toEqual([
      'onMotion',
      'window.__myhomeFullyDispatch("onMotion");',
    ])
  })

  it('maps ambient readings monotonically to comfortable levels', () => {
    const dark = adaptiveBrightnessFor({ value: 0, source: 'average-luma' })
    const indoor = adaptiveBrightnessFor({ value: 80, source: 'average-luma' })
    const bright = adaptiveBrightnessFor({ value: 255, source: 'average-luma' })
    expect(dark).toBeGreaterThanOrEqual(40)
    expect(dark).toBeLessThan(indoor)
    expect(indoor).toBeLessThan(bright)
    expect(bright).toBeLessThanOrEqual(230)
  })
})
