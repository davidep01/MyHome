import { useEffect, useRef, useState, type ComponentProps } from 'react'
import ReactGridLayout from 'react-grid-layout/legacy'

type Props = Omit<ComponentProps<typeof ReactGridLayout>, 'width'> & {
  placeholderClassName?: string
}

export function MeasuredGridLayout({
  className,
  placeholderClassName = 'min-h-[140px]',
  ...props
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const next = Math.floor(el.getBoundingClientRect().width)
      setWidth((current) => (current === next ? current : next))
    }

    measure()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="min-w-0 w-full">
      {width > 0 ? (
        <ReactGridLayout {...props} width={width} className={className} />
      ) : (
        <div className={placeholderClassName} />
      )}
    </div>
  )
}
