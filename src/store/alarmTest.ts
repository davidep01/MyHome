import { create } from 'zustand'
import type { CriticalAlert, CriticalAlertKind } from '../lib/criticalAlerts'
import type { AlarmTestRemoteState, AlarmTestScenario } from '../api/backend'

export type { AlarmTestScenario } from '../api/backend'

export const ALARM_TEST_DURATION_MS = 20_000

const TEST_META: Record<AlarmTestScenario, {
  kind: CriticalAlertKind
  title: string
  detail: string
}> = {
  intrusion: {
    kind: 'intrusion',
    title: 'TEST · Allarme intrusione',
    detail: 'Simulazione condivisa del sensore perimetrale.',
  },
  siren: {
    kind: 'siren',
    title: 'TEST · Sirena attiva',
    detail: 'Simulazione condivisa del segnale acustico.',
  },
  smoke: {
    kind: 'smoke',
    title: 'TEST · Fumo rilevato',
    detail: 'Simulazione condivisa di un rilevatore antincendio.',
  },
}

interface AlarmTestState {
  alert: CriticalAlert | null
  expiresAt: number | null
  testId: string | null
  sync: (remote: AlarmTestRemoteState) => void
  stop: () => void
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null

function clearExpiryTimer() {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
}

function testAlert(scenario: AlarmTestScenario, startedAt: string): CriticalAlert {
  const meta = TEST_META[scenario]
  return {
    id: `test:${scenario}`,
    entityId: `test_alarm.${scenario}`,
    kind: meta.kind,
    title: meta.title,
    detail: `${meta.detail} Nessun comando è stato inviato a Home Assistant.`,
    instruction: 'Verifica overlay, suono e pulsanti; poi premi “Termina test”.',
    priority: 99,
    changedAt: startedAt,
    test: true,
  }
}

export const useAlarmTestStore = create<AlarmTestState>((set) => ({
  alert: null,
  expiresAt: null,
  testId: null,
  sync: (remote) => {
    clearExpiryTimer()
    if (!remote.active) {
      set({ alert: null, expiresAt: null, testId: null })
      return
    }
    const serverNow = Date.parse(remote.serverNow)
    const expiresAt = Date.parse(remote.expiresAt)
    const remaining = Math.max(0, expiresAt - serverNow)
    set({
      alert: testAlert(remote.scenario, remote.startedAt),
      expiresAt: Date.now() + remaining,
      testId: remote.id,
    })
    expiryTimer = setTimeout(() => {
      expiryTimer = null
      set((state) => state.testId === remote.id
        ? { alert: null, expiresAt: null, testId: null }
        : state)
    }, remaining)
  },
  stop: () => {
    clearExpiryTimer()
    set({ alert: null, expiresAt: null, testId: null })
  },
}))
