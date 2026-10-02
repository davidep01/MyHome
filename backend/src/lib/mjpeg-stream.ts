/** A complete JPEG frame, rather than multipart headers, renews the stream lease. */
export class JpegFrameMonitor {
  private previous = 0
  private length = 0
  private frame = false
  private hasFrameHeader = false
  accept(chunk: Uint8Array): boolean {
    let complete = false
    for (const byte of chunk) {
      if (!this.frame && this.previous === 0xff && byte === 0xd8) {
        this.frame = true; this.length = 2; this.hasFrameHeader = false
      } else if (this.frame) {
        this.length += 1
        if (this.length > 8 * 1024 * 1024) throw new Error('Frame MJPEG troppo grande')
        if (this.previous === 0xff && [0xc0, 0xc1, 0xc2].includes(byte)) this.hasFrameHeader = true
        if (this.previous === 0xff && byte === 0xd9) {
          complete ||= this.hasFrameHeader && this.length >= 128
          this.frame = false; this.length = 0
        }
      }
      this.previous = byte
    }
    return complete
  }
}

export function monitoredMjpegStream(upstream: ReadableStream<Uint8Array>, abort: AbortController, cleanup: () => void, timeoutMs = 15_000): ReadableStream<Uint8Array> {
  const reader = upstream.getReader()
  const frames = new JpegFrameMonitor()
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let sink: ReadableStreamDefaultController<Uint8Array>
  const stop = (error?: unknown) => {
    if (closed) return
    closed = true; clearTimeout(timer); cleanup()
    if (error) { abort.abort(error); void reader.cancel(error).catch(() => {}); sink.error(error) }
    else sink.close()
  }
  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => stop(new Error('Nessun nuovo frame MJPEG')), timeoutMs)
  }
  return new ReadableStream<Uint8Array>({
    start(controller) { sink = controller; arm() },
    async pull(controller) {
      try {
        const next = await reader.read()
        if (closed) return
        if (next.done) { stop(); reader.releaseLock(); return }
        if (frames.accept(next.value)) arm()
        controller.enqueue(next.value)
      } catch (error) { stop(error) }
    },
    async cancel(reason) {
      if (closed) return
      closed = true; clearTimeout(timer); cleanup(); abort.abort(reason)
      await reader.cancel(reason)
    },
  })
}
