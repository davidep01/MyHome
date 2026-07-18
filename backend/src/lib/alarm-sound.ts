const SAMPLE_RATE = 16_000
const DURATION_SECONDS = 2.2
const CHANNELS = 1
const BITS_PER_SAMPLE = 16

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
}

/** Compact loopable PCM siren used by Fully Kiosk's native alarm stream. */
export function createAlarmSirenWav(): Uint8Array {
  const sampleCount = Math.round(SAMPLE_RATE * DURATION_SECONDS)
  const dataSize = sampleCount * CHANNELS * (BITS_PER_SAMPLE / 8)
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, CHANNELS, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), true)
  view.setUint16(32, CHANNELS * (BITS_PER_SAMPLE / 8), true)
  view.setUint16(34, BITS_PER_SAMPLE, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let phase = 0
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE
    const sweepPosition = (time % 1.1) / 1.1
    const triangle = sweepPosition < 0.5 ? sweepPosition * 2 : (1 - sweepPosition) * 2
    const frequency = 610 + triangle * 590
    phase += (Math.PI * 2 * frequency) / SAMPLE_RATE
    const fundamental = Math.sin(phase)
    const harmonic = Math.sin(phase * 2) * 0.24
    const pulse = 0.82 + 0.18 * Math.sin(Math.PI * 2 * 3.2 * time)
    const sample = Math.max(-1, Math.min(1, (fundamental + harmonic) * 0.62 * pulse))
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true)
  }

  return bytes
}

export const ALARM_SIREN_WAV = createAlarmSirenWav()
