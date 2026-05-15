import { useState, useEffect } from 'react'

export type TimeOfDay = 'mattina' | 'giorno' | 'sera' | 'notte'

export interface TimeOfDayInfo {
  period: TimeOfDay
  greeting: string
  hour: number
}

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 6 && hour < 10) return 'mattina'
  if (hour >= 10 && hour < 17) return 'giorno'
  if (hour >= 17 && hour < 22) return 'sera'
  return 'notte'
}

function getGreeting(period: TimeOfDay): string {
  switch (period) {
    case 'mattina': return 'Buongiorno'
    case 'giorno': return 'Buon pomeriggio'
    case 'sera': return 'Buonasera'
    case 'notte': return 'Buonanotte'
  }
}

export function useTimeOfDay(): TimeOfDayInfo {
  const [info, setInfo] = useState<TimeOfDayInfo>(() => {
    const hour = new Date().getHours()
    const period = getTimeOfDay(hour)
    return { period, greeting: getGreeting(period), hour }
  })

  useEffect(() => {
    const update = () => {
      const hour = new Date().getHours()
      const period = getTimeOfDay(hour)
      setInfo({ period, greeting: getGreeting(period), hour })
    }
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])

  return info
}
