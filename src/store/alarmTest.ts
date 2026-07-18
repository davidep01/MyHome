import { create } from 'zustand'
import type { CriticalAlert, CriticalAlertKind } from '../lib/criticalAlerts'

export type AlarmTestScenario = 'intrusion' | 'siren' | 'smoke'

export const ALARM_TEST_DURATION_MS = 20_000

const TEST_META: Record<AlarmTestScenario, {
  kind: CriticalAlertKind
  title: string
  detail: string
}> = {
  intrusion: {
    kind: 'intrusion',
    title: 'TEST · Allarme intrusione',
    detail: 'Simulazione locale del sensore perimetrale.',
  },
  siren: {
    kind: 'siren',
    title: 'TEST · Sirena attiva',
    detail: 'Simulazione locale del segnale acustico.',
  },
  smoke: {
    kind: 'smoke',
    title: 'TEST · Fumo rilevato',
    detail: 'Simulazione locale di un rilevatore antincendio.',
  },
}

interface AlarmTestState {
  alert: CriticalAlert | null
  expiresAt: number | null
  start: (scenario: AlarmTestScenario) => void
  stop: () => void
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null

function clearExpiryTimer() {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
}

function testAlert(scenario: AlarmTestScenario, now: number): CriticalAlert {
  const meta = TEST_META[scenario]
  return {
    id: `test:${scenario}`,
    entityId: `test_alarm.${scenario}`,
    kind: meta.kind,
    title: meta.title,
    detail: `${meta.detail} Nessun comando è stato inviato a Home Assistant.`,
    instruction: 'Verifica overlay, suono e pulsanti; poi premi “Termina test”.',
    priority: 99,
    changedAt: new Date(now).toISOString(),
    test: true,
  }
}

export const useAlarmTestStore = create<AlarmTestState>((set) => ({
  alert: null,
  expiresAt: null,
  start: (scenario) => {
    clearExpiryTimer()
    const now = Date.now()
    set({ alert: testAlert(scenario, now), expiresAt: now + ALARM_TEST_DURATION_MS })
    expiryTimer = setTimeout(() => {
      expiryTimer = null
      set({ alert: null, expiresAt: null })
    }, ALARM_TEST_DURATION_MS)
  },
  stop: () => {
    clearExpiryTimer()
    set({ alert: null, expiresAt: null })
  },
}))
