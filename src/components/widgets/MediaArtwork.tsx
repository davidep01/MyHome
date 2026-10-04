import { useEffect, useRef, useState, type ElementType } from 'react'
import { haApi } from '../../api/backend'
import { mediaArtworkRevision, mediaArtworkSources } from '../../lib/mediaArtwork'

/** Cover stays visible during replacement; failed sources fall through and retry without reloading HA. */
export function MediaArtwork({ entityId, attributes, playing, title, Icon }: {
  entityId: string
  attributes?: Record<string, unknown>
  playing: boolean
  title: string
  Icon: ElementType
}) {
  const root = useRef<HTMLDivElement>(null)
  const [refresh, setRefresh] = useState(0)
  const [failure, setFailure] = useState<{ key: string; urls: string[] }>({ key: '', urls: [] })
  const [loaded, setLoaded] = useState<{ url: string; title: string; revision: string } | null>(null)
  const sources = mediaArtworkSources(attributes)
  const revision = mediaArtworkRevision(attributes) ?? 'cover'
  const key = `${revision}-${refresh}`
  const failed = failure.key === key ? failure.urls : []
  const source = sources.find((url) => !failed.includes(url))
  const url = source ? haApi.imageUrl(source, entityId, key) : undefined
  const failedAll = sources.length > 0 && !source

  useEffect(() => {
    if (!playing && failure.urls.length === 0) return
    const timer = window.setInterval(() => {
      // Skip refresh outside the viewport and while the browser tab is hidden.
      const rect = root.current?.getBoundingClientRect()
      if (document.hidden || !rect || rect.bottom <= 0 || rect.top >= window.innerHeight) return
      setRefresh(Math.floor(Date.now() / 30_000))
    }, 30_000)
    return () => clearInterval(timer)
  }, [playing, failure.urls.length])

  useEffect(() => {
    if (!source || !url || loaded?.url === url) return
    // A hanging image must not permanently suppress other advertised covers.
    const timeout = window.setTimeout(() => {
      setFailure((previous) => ({ key, urls: [...(previous.key === key ? previous.urls : []), source] }))
    }, 10_000)
    return () => clearTimeout(timeout)
  }, [source, url, key, loaded?.url])

  const fail = () => {
    if (source) setFailure((previous) => ({ key, urls: [...(previous.key === key ? previous.urls : []), source] }))
  }

  return <div ref={root} className="media-card-artwork absolute inset-0" data-media-cover-style data-media-cover-source={loaded ? 'provided' : 'missing'}>
    <div className="media-card-cover-frame">
      {loaded ? <img src={loaded.url} alt={`Copertina: ${loaded.title}`} className="media-card-cover-image" /> : <div className="media-card-cover-placeholder" aria-label="Copertina non disponibile"><Icon size={28} aria-hidden="true" /></div>}
      {url && url !== loaded?.url && <img key={url} src={url} alt="" aria-hidden="true" className="media-card-cover-image media-card-cover-loading" onLoad={() => setLoaded({ url, title, revision })} onError={fail} />}
      {(failedAll || (loaded && (!source || loaded.revision !== revision))) && <span className="media-card-cover-status">{loaded ? 'Ultima copertina' : 'Cover non disponibile'}</span>}
    </div>
  </div>
}
