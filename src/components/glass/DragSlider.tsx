import { useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

interface DragSliderProps {
  value: number          // 0–100
  onChange: (v: number) => void
  onChangeEnd?: (v: number) => void
  color?: string
  className?: string
  label?: string
}

export function DragSlider({
  value,
  onChange,
  onChangeEnd,
  color = '#3b82f6',
  className,
  label,
}: DragSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const clamp = (v: number) => Math.min(100, Math.max(0, v))

  const getValueFromX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return value
    const { left, width } = track.getBoundingClientRect()
    return clamp(((clientX - left) / width) * 100)
  }, [value])

  // Pointer-based handler (works on both mouse and touch)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const v = getValueFromX(e.clientX)
    onChange(Math.round(v))
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 && e.pressure === 0) return
    const v = getValueFromX(e.clientX)
    onChange(Math.round(v))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = getValueFromX(e.clientX)
    const rounded = Math.round(v)
    onChange(rounded)
    onChangeEnd?.(rounded)
  }

  const pct = `${clamp(value)}%`

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex justify-between text-sm">
          <span className="text-white/50">{label}</span>
          <span className="font-semibold text-white">{Math.round(value)}%</span>
        </div>
      )}

      {/* Track — tall enough (44px) for comfortable touch */}
      <div
        ref={trackRef}
        className="relative flex items-center h-11 cursor-pointer select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background rail */}
        <div className="absolute inset-x-0 h-2 rounded-full bg-white/10" />

        {/* Filled portion */}
        <div
          className="absolute left-0 h-2 rounded-full transition-none"
          style={{ width: pct, background: color }}
        />

        {/* Thumb */}
        <motion.div
          className="absolute h-5 w-5 rounded-full bg-white shadow-lg"
          style={{
            left: pct,
            x: '-50%',
            boxShadow: `0 0 0 3px ${color}55, 0 2px 8px rgba(0,0,0,0.4)`,
          }}
          whileTap={{ scale: 1.25 }}
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
        />
      </div>
    </div>
  )
}
