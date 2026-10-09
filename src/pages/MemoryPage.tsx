import { useQuery } from '@tanstack/react-query'
import { AdminSections } from '../components/layout/AdminSections'
import { useAdminSection } from '../hooks/useAdminSection'
import { homeAiApi } from '../api/homeAi'
import { Badge } from '../components/memory/MemoryUi'
import { NowPanel } from '../components/memory/NowPanel'
import { ObservedPanel } from '../components/memory/ObservedPanel'
import { HabitsPanel } from '../components/memory/HabitsPanel'
import { ManualPanel } from '../components/memory/ManualPanel'
import { WastePanel } from '../components/memory/WastePanel'
import { SimulationsPanel } from '../components/memory/SimulationsPanel'
import { SettingsPanel } from '../components/memory/SettingsPanel'
import { StatusPanel } from '../components/memory/StatusPanel'

/**
 * Regia — Memoria (HOME AI CORE): il core locale che osserva in sola lettura,
 * impara abitudini statistiche e propone. Nessuna sezione comanda dispositivi:
 * le approvazioni salvano preferenze o autorizzano simulazioni.
 */
const MEMORY_SECTIONS = [
  { id: 'now', label: 'Adesso', description: 'Proposte attive, promemoria e contesto corrente' },
  { id: 'observed', label: 'Cosa ho osservato', description: 'Eventi registrati, rientri riconosciuti e lacune di copertura' },
  { id: 'habits', label: 'Abitudini', description: 'Ipotesi statistiche con campione, controesempi e preferenze esplicite' },
  { id: 'manual', label: 'Manuale della casa', description: 'Ciò che il futuro modello locale saprà della casa: fatti con la loro fonte e le tue note' },
  { id: 'waste', label: 'Raccolta differenziata', description: 'Calendario, regole ed eccezioni con prossimi ritiri' },
  { id: 'simulations', label: 'Simulazioni', description: 'Esecuzioni a secco su una copia dello stato, senza effetti fisici' },
  { id: 'settings', label: 'Impostazioni e privacy', description: 'Modalità, entità osservate, consensi, conservazione, esportazione e oblio' },
  { id: 'status', label: 'Stato del sistema', description: 'Salute del core, copertura, backup e registro delle decisioni' },
] as const

const PANELS: Record<(typeof MEMORY_SECTIONS)[number]['id'], () => React.JSX.Element> = {
  now: NowPanel,
  observed: ObservedPanel,
  habits: HabitsPanel,
  manual: ManualPanel,
  waste: WastePanel,
  simulations: SimulationsPanel,
  settings: SettingsPanel,
  status: StatusPanel,
}

const MODE_LABEL: Record<string, string> = { observe: 'Sola osservazione', shadow: 'In ombra', suggest: 'Suggerimenti' }

export function MemoryPage() {
  const { section, select } = useAdminSection(MEMORY_SECTIONS)
  const status = useQuery({ queryKey: ['home-ai', 'status'], queryFn: homeAiApi.status, refetchInterval: 20_000 })
  const Panel = PANELS[section as keyof typeof PANELS]

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1 pb-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--ink)] sm:text-3xl">Memoria</h1>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">Osserva in sola lettura, impara in locale, propone. Non comanda mai la casa.</p>
        {status.data && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="blue">{MODE_LABEL[status.data.health.mode] ?? status.data.health.mode}</Badge>
            {status.data.health.demo && <Badge tone="warn">Demo · dati sintetici</Badge>}
            {status.data.flags.guests && <Badge>Ospiti in casa</Badge>}
            <Badge>Esecuzione fisica disattivata</Badge>
          </div>
        )}
      </div>

      <AdminSections sections={MEMORY_SECTIONS} active={section} onSelect={select} />
      <p className="text-sm text-[var(--ink-secondary)]">{MEMORY_SECTIONS.find((item) => item.id === section)?.description}</p>
      <Panel />
    </div>
  )
}
