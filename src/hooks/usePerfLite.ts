import { useEffect, useState } from 'react'
export function usePerfLite(): boolean {
  const [lite, setLite] = useState(() => document.documentElement.classList.contains('perf-lite'))
  useEffect(() => {
    const observer = new MutationObserver(() => setLite(document.documentElement.classList.contains('perf-lite')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return lite
}
