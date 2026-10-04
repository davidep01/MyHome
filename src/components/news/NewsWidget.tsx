import { ExternalLink } from 'lucide-react'
import { useNews } from '../../hooks/useNews'
import { tokens } from '../../design/tokens'
import type { WidgetSize } from '../../api/backend'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m fa`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h fa`
  return `${Math.floor(hrs / 24)}g fa`
}

export function NewsWidget({ size = 'md' }: { size?: WidgetSize }) {
  const { data: articles, isLoading, error, refetch } = useNews()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-5 w-5 rounded-full border-2 border-[var(--hairline)] border-t-[var(--ink-secondary)] animate-spin" />
      </div>
    )
  }

  if (!articles?.length) {
    return (
      <div className="text-center"><p role={error ? "alert" : "status"} className="text-[13px] text-[var(--ink-tertiary)] py-3">
        {error ? 'Notizie non raggiungibili' : 'Nessuna notizia'}
      </p>{error && <button type="button" className="min-h-11 rounded-xl bg-[var(--fill-subtle)] px-3 text-sm text-[var(--ink)]" onClick={()=>void refetch()}>Riprova notizie</button>}</div>
    )
  }

  const limit = size === 'xs' || size === 'sm' ? 1 : size === 'md' ? 1 : size === 'lg' ? articles.length : 2
  const expanded = size === 'lg' || size === 'wide'

  return (
    <div className={size === 'wide' ? 'grid h-full grid-cols-2 gap-2 overflow-y-auto' : 'flex h-full flex-col gap-2 overflow-y-auto'}>
      {articles.slice(0, limit).map((article) => (
        <a
          key={article.id}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-h-[44px] shrink-0 gap-3 rounded-[14px] bg-[var(--fill-subtle)] p-2 transition-colors hover:bg-[var(--fill-muted)]"
        >
          {expanded && article.urlToImage && (
            <img
              src={article.urlToImage}
              alt=""
              className="h-14 w-14 shrink-0 rounded-[10px] object-cover bg-[var(--fill-muted)]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--ink)] line-clamp-2 leading-snug">
              {article.title}
            </p>
            {size !== 'xs' && <div className="flex items-center gap-1.5 mt-auto">
              <span className="text-[13px]" style={{ color: tokens.text.tertiary }}>
                {article.source}
              </span>
              <span className="text-[13px] text-[var(--ink-tertiary)]">·</span>
              <span className="text-[13px]" style={{ color: tokens.text.tertiary }}>
                {timeAgo(article.publishedAt)}
              </span>
              <ExternalLink
                size={9}
                className="ml-auto text-[var(--ink-tertiary)] group-hover:text-[var(--ink-secondary)] transition-colors"
              />
            </div>}
          </div>
        </a>
      ))}
    </div>
  )
}
