/**
 * Invia i candidati ICE in ordine e apre il circuito al primo errore. I browser
 * possono produrne molti nello stesso tick: senza serializzazione un rifiuto HA
 * genera comunque una raffica di richieste concorrenti.
 */
export function createSerialIceCandidateSender(
  send: (candidate: RTCIceCandidateInit) => Promise<unknown>,
  onFailure: (error: unknown) => void,
) {
  let stopped = false
  let chain = Promise.resolve()

  return {
    enqueue(candidate: RTCIceCandidateInit): void {
      if (stopped) return
      chain = chain.then(async () => {
        if (stopped) return
        try {
          await send(candidate)
        } catch (error) {
          if (stopped) return
          stopped = true
          onFailure(error)
        }
      })
    },
    stop(): void {
      stopped = true
    },
    drain(): Promise<void> {
      return chain
    },
  }
}

export type SerialIceCandidateSender = ReturnType<typeof createSerialIceCandidateSender>

