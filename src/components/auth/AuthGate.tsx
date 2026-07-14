import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Home, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react'
import { authApi } from '../../api/backend'

function isKioskPath(path: string) {
  return path === '/kiosk' || path === '/tablet' || path === '/dashboard'
    || path.startsWith('/kiosk/') || path.startsWith('/tablet/')
}

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const tokenId = useId()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const status = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.status,
    retry: false,
    staleTime: 30_000,
  })

  const kioskRedirect = status.data?.authenticated
    && status.data.role === 'kiosk'
    && !isKioskPath(window.location.pathname)

  useEffect(() => {
    if (kioskRedirect) window.location.replace('/kiosk')
  }, [kioskRedirect])

  useEffect(() => {
    const refresh = () => { void status.refetch() }
    window.addEventListener('myhome:auth-required', refresh)
    return () => window.removeEventListener('myhome:auth-required', refresh)
  }, [status])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    if (!token.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await authApi.login(token)
      setToken('')
      await queryClient.invalidateQueries({ queryKey: ['auth-status'] })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Accesso non riuscito')
    } finally {
      setSubmitting(false)
    }
  }

  if (status.isPending || kioskRedirect) {
    return <GateFrame><LoaderCircle className="animate-spin text-[#0066cc]" aria-label="Verifica accesso in corso" /></GateFrame>
  }

  if (status.isError) {
    return (
      <GateFrame>
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-600"><RefreshCw size={21} /></div>
          <h1 className="mt-4 text-xl font-semibold text-[#1d1d1f]">Server MyHome non raggiungibile</h1>
          <p className="mt-2 text-sm text-black/55">Controlla che l’add-on sia avviato nella rete locale.</p>
          <button type="button" onClick={() => status.refetch()} className="mt-5 min-h-11 rounded-full bg-[#0066cc] px-5 text-sm font-semibold text-white">
            Riprova
          </button>
        </div>
      </GateFrame>
    )
  }

  if (status.data.mode === 'misconfigured') {
    return (
      <GateFrame>
        <div className="w-full max-w-md rounded-[22px] border border-orange-700/15 bg-white/80 p-6 shadow-sm">
          <ShieldCheck className="text-orange-700" size={28} />
          <h1 className="mt-4 text-xl font-semibold text-[#1d1d1f]">Protezione da configurare</h1>
          <p className="mt-2 text-sm leading-6 text-black/60">{status.data.message}</p>
          <p className="mt-3 rounded-xl bg-black/[0.045] p-3 font-mono text-xs text-black/65">MYHOME_ADMIN_TOKEN<br />MYHOME_KIOSK_TOKEN</p>
        </div>
      </GateFrame>
    )
  }

  if (status.data.authenticated) return <>{children}</>

  const kiosk = isKioskPath(window.location.pathname)
  return (
    <GateFrame>
      <form onSubmit={login} className="w-full max-w-sm rounded-[24px] border border-black/10 bg-white/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0066cc] text-white">
          {kiosk ? <Home size={22} /> : <LockKeyhole size={22} />}
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#1d1d1f]">{kiosk ? 'Attiva il pannello' : 'Accedi a MyHome'}</h1>
        <p className="mt-2 text-sm leading-6 text-black/55">
          {kiosk ? 'Inserisci una volta il codice kiosk configurato nell’add-on.' : 'Inserisci il codice amministratore per gestire la casa.'}
        </p>
        <div className="mt-5 space-y-2">
          <label htmlFor={tokenId} className="block text-sm font-medium text-[#1d1d1f]">Codice di accesso</label>
          <input
            id={tokenId}
            name="access-code"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={submitting}
            className="min-h-12 w-full rounded-[14px] border border-black/10 bg-black/[0.035] px-4 text-base text-[#1d1d1f] outline-none transition-colors focus:border-[#0066cc] focus:bg-white disabled:opacity-50"
          />
        </div>
        <p role="alert" aria-live="polite" className="mt-2 min-h-5 text-sm font-medium text-red-600">{error}</p>
        <button
          type="submit"
          disabled={submitting || !token.trim()}
          className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0052a3] disabled:opacity-45"
        >
          {submitting && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
          {submitting ? 'Verifica…' : 'Continua'}
        </button>
        <p className="mt-4 text-center text-xs text-black/40">Connessione locale · sessione protetta sul dispositivo</p>
      </form>
    </GateFrame>
  )
}

function GateFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-full w-full items-center justify-center bg-[#f5f5f7] px-5 py-8" id="main-content">
      {children}
    </main>
  )
}
