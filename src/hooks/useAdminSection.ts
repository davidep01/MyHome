import { useEffect, useState } from 'react'
import type { AdminSection } from '../components/layout/AdminSections'

/** URL-backed subsections: refresh and browser history preserve the open panel. */
export function useAdminSection(sections: readonly AdminSection[]) {
  const read = () => {
    const requested = new URLSearchParams(window.location.search).get('section')
    return sections.find((item) => item.id === requested)?.id ?? sections[0].id
  }
  const [section, setSection] = useState(read)
  useEffect(() => {
    const onPop = () => setSection(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // Section definitions are module constants; pathname is owned by AppShell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const select = (id: string) => {
    if (!sections.some((item) => item.id === id) || id === section) return
    const url = new URL(window.location.href)
    url.searchParams.set('section', id)
    window.history.pushState(null, '', url)
    setSection(id)
  }
  return { section, select }
}

