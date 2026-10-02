import { parentPort, workerData } from 'node:worker_threads'
import { parseCalendarSource } from './calendar-parser.js'

const { source, now, horizonDays } = workerData as { source: string; now: string; horizonDays: number }
void parseCalendarSource(source, new Date(now), horizonDays).then(
  (events) => parentPort?.postMessage({ events }),
  () => parentPort?.postMessage({ error: 'Calendario non valido o troppo complesso' }),
)
