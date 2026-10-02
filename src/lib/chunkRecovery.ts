/** A stale chunk must never silently reload a form or cause a reload loop. */
export function installChunkRecovery(): () => void {
  let banner: HTMLElement | null = null
  const onError = (event: Event) => {
    event.preventDefault()
    if (banner) return
    banner = document.createElement('aside')
    banner.setAttribute('role', 'alert')
    banner.setAttribute('aria-label', 'Aggiornamento interfaccia')
    Object.assign(banner.style, { position: 'fixed', bottom: '16px', left: '16px', right: '16px', zIndex: '500', padding: '16px', borderRadius: '16px', background: 'var(--surface-solid)', color: 'var(--ink)', border: '1px solid var(--hairline)' })
    const message = document.createElement('p')
    message.textContent = 'È disponibile una nuova interfaccia oppure un componente non è raggiungibile. Salva le modifiche aperte prima di ricaricare.'
    const button = document.createElement('button')
    button.textContent = 'Ricarica interfaccia'
    Object.assign(button.style, { minHeight: '44px', marginTop: '12px', padding: '0 16px', borderRadius: '12px', background: 'var(--action-blue)', color: 'var(--on-accent)' })
    button.onclick = () => {
      if (window.confirm('Ricaricare? Le modifiche non salvate andranno perse.')) {
        button.disabled = true
        window.location.reload()
      }
    }
    banner.append(message, button)
    document.body.append(banner)
  }
  window.addEventListener('vite:preloadError', onError)
  return () => { window.removeEventListener('vite:preloadError', onError); banner?.remove() }
}
