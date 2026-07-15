import { ExternalLink } from 'lucide-react'
import { useNews } from '../../hooks/useNews'
import { tokens } from '../../design/tokens'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m fa`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h fa`
  return `${Math.floor(hrs / 24)}g fa`
}

export function NewsWidget() {
  const { data: articles, isLoading, error } = useNews()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-5 w-5 rounded-full border-2 border-black/20 border-t-black/50 animate-spin" />
      </div>
    )
  }

  if (!articles?.length) {
    return (
      <p className="text-xs text-black/30 text-center py-6">
        {error instanceof Error ? error.message : 'Nessuna notizia'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto">
      {articles.map((article) => (
        <a
          key={article.id}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex gap-3 rounded-[14px] bg-black/5 p-3 hover:bg-black/8 transition-colors"
        >
          {article.urlToImage && (
            <img
              src={article.urlToImage}
              alt=""
              className="h-14 w-14 shrink-0 rounded-[10px] object-cover bg-black/10"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-xs font-semibold text-black/85 line-clamp-2 leading-snug">
              {article.title}
            </p>
            <div className="flex items-center gap-1.5 mt-auto">
              <span className="text-[10px]" style={{ color: tokens.text.tertiary }}>
                {article.source}
              </span>
              <span className="text-[10px] text-black/20">·</span>
              <span className="text-[10px]" style={{ color: tokens.text.tertiary }}>
                {timeAgo(article.publishedAt)}
              </span>
              <ExternalLink
                size={9}
                className="ml-auto text-black/20 group-hover:text-black/40 transition-colors"
              />
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}
