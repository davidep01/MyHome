const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
interface ModalEntry { root: HTMLElement; panel: HTMLElement; close: () => void; priority: number; previous: HTMLElement | null; order: number }
const entries: ModalEntry[] = []
const inertValues = new Map<HTMLElement, boolean>()
let sequence = 0
function top() { return [...entries].sort((a, b) => a.priority - b.priority || a.order - b.order).at(-1) }
function focusable(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'))
}
function focus(entry: ModalEntry) { (focusable(entry.panel)[0] ?? entry.panel).focus({ preventScroll: true }) }
function synchronize() {
  for (const [element, previous] of inertValues) element.inert = previous
  inertValues.clear()
  const active = top()
  if (!active) return
  let allowed: HTMLElement = active.root
  while (allowed.parentElement) {
    for (const sibling of allowed.parentElement.children) {
      if (sibling !== allowed && sibling instanceof HTMLElement && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) {
        inertValues.set(sibling, sibling.inert)
        sibling.inert = true
      }
    }
    if (allowed.parentElement === document.body) break
    allowed = allowed.parentElement
  }
}
function onKey(event: KeyboardEvent) {
  const active = top()
  if (!active) return
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopImmediatePropagation(); active.close(); return
  }
  if (event.key !== 'Tab') return
  const items = focusable(active.panel)
  const current = document.activeElement
  if (!items.length || !active.panel.contains(current)) {
    event.preventDefault(); focus(active); return
  }
  if (event.shiftKey && current === items[0]) {
    event.preventDefault(); items.at(-1)!.focus()
  } else if (!event.shiftKey && current === items.at(-1)) {
    event.preventDefault(); items[0].focus()
  }
}
function onFocus(event: FocusEvent) {
  const active = top()
  if (active && event.target instanceof Node && !active.panel.contains(event.target)) focus(active)
}

/** Only the visually highest modal receives focus, Escape and interaction. */
export function registerModal(root: HTMLElement, panel: HTMLElement, close: () => void, priority: number): () => void {
  const entry: ModalEntry = { root, panel, close, priority, order: ++sequence,
    previous: document.activeElement instanceof HTMLElement ? document.activeElement : null }
  entries.push(entry)
  if (entries.length === 1) {
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus, true)
  }
  synchronize()
  const frame = requestAnimationFrame(() => { if (top() === entry) focus(entry) })
  return () => {
    cancelAnimationFrame(frame)
    const wasTop = top() === entry
    entries.splice(entries.indexOf(entry), 1)
    synchronize()
    if (!entries.length) {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus, true)
    }
    if (!wasTop) return
    const next = top()
    if (entry.previous?.isConnected && !entry.previous.closest('[inert]') && (!next || next.panel.contains(entry.previous))) {
      entry.previous.focus({ preventScroll: true })
    } else if (next) focus(next)
  }
}
