import { describe, expect, it, vi } from 'vitest'
import { createSerialIceCandidateSender } from './serialIceCandidateSender'

const candidate = (value: string): RTCIceCandidateInit => ({ candidate: value, sdpMLineIndex: 0 })

describe('serial ICE candidate sender', () => {
  it('preserves order and stops the queue after the first rejection', async () => {
    const sent: string[] = []
    const failure = vi.fn()
    const sender = createSerialIceCandidateSender(async (item) => {
      sent.push(item.candidate ?? '')
      if (item.candidate === 'bad') throw new Error('rejected')
    }, failure)

    sender.enqueue(candidate('first'))
    sender.enqueue(candidate('bad'))
    sender.enqueue(candidate('never'))
    await sender.drain()

    expect(sent).toEqual(['first', 'bad'])
    expect(failure).toHaveBeenCalledOnce()
  })

  it('can be stopped during component cleanup without reporting a failure', async () => {
    const send = vi.fn(async () => undefined)
    const failure = vi.fn()
    const sender = createSerialIceCandidateSender(send, failure)
    sender.stop()
    sender.enqueue(candidate('ignored'))
    await sender.drain()

    expect(send).not.toHaveBeenCalled()
    expect(failure).not.toHaveBeenCalled()
  })
})

