import { afterEach, describe, expect, it, vi } from 'vitest'
import jpeg from 'jpeg-js'
import { JpegFrameMonitor, monitoredMjpegStream } from './mjpeg-stream.js'
const frame = jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 70).data
afterEach(() => vi.useRealTimers())
describe('MJPEG progress and cancellation', () => {
  it('requires a complete JPEG across chunks, not just headers or a truncated frame', () => {
    const monitor = new JpegFrameMonitor()
    expect(monitor.accept(Buffer.from('--boundary\r\nContent-Type: image/jpeg\r\n'))).toBe(false)
    expect(monitor.accept(frame.subarray(0, -1))).toBe(false)
    expect(monitor.accept(frame.subarray(-1))).toBe(true)
  })
  it('terminates a stalled upstream even when a read is pending', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const upstream = new ReadableStream<Uint8Array>({ cancel })
    const abort = new AbortController()
    const cleanup = vi.fn()
    const reader = monitoredMjpegStream(upstream, abort, cleanup, 100).getReader()
    const read = reader.read().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(100)
    expect(await read).toBeInstanceOf(Error)
    expect(abort.signal.aborted).toBe(true)
    expect(cleanup).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('does not let repeated multipart headers extend the no-frame deadline', async () => {
    vi.useFakeTimers()
    let producer!: ReadableStreamDefaultController<Uint8Array>
    const upstream = new ReadableStream<Uint8Array>({ start(controller) { producer = controller } })
    const reader = monitoredMjpegStream(upstream, new AbortController(), () => {}, 100).getReader()
    const read = reader.read()
    producer.enqueue(Buffer.from('Content-Type: image/jpeg\r\n'))
    await read
    const pending = reader.read().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(100)
    expect(await pending).toBeInstanceOf(Error)
  })
})
