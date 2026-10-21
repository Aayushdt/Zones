import { useEffect, useState } from 'react'
import { Command, X, CornerDownLeft, Copy, Target, HelpCircle } from 'lucide-react'
import { Card } from './Card'
import { IconButton } from './IconButton'

export function ShortcutsModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const activeEl = document.activeElement
      const isInput = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLSelectElement
      if (isInput) return

      if (event.key === '?' && !event.shiftKey) {
        event.preventDefault()
        setOpen((prev) => !prev)
      } else if (event.key === '?' && event.shiftKey) {
        event.preventDefault()
        setOpen((prev) => !prev)
      } else if (event.key === 'Escape' && open) {
        event.preventDefault()
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open) {
    return (
      <aside className="shortcuts-floating-trigger" aria-label="Keyboard shortcuts helper">
        <button
          type="button"
          className="shortcuts-trigger-btn font-mono"
          onClick={() => setOpen(true)}
          title="Keyboard shortcuts (?)"
          aria-label="Open keyboard shortcuts"
        >
          <HelpCircle size={15} />
          <span className="shortcuts-trigger-badge">?</span>
        </button>
      </aside>
    )
  }

  return (
    <div className="shortcuts-modal-backdrop" onClick={() => setOpen(false)} role="presentation">
      <Card
        variant="raised"
        className="shortcuts-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal-header">
          <div className="shortcuts-modal-title-group">
            <Command size={18} className="text-green" />
            <h2 className="shortcuts-modal-title font-mono text-sm">KEYBOARD SHORTCUTS</h2>
          </div>
          <IconButton
            icon={<X size={16} />}
            label="Close shortcuts"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          />
        </div>

        <div className="shortcuts-list">
          <div className="shortcut-row">
            <span className="shortcut-desc">Submit / Join Lobby / Confirm</span>
            <kbd className="shortcut-key font-mono"><CornerDownLeft size={13} /> Enter</kbd>
          </div>
          <div className="shortcut-row">
            <span className="shortcut-desc">Dismiss Sheet / Close Modal</span>
            <kbd className="shortcut-key font-mono">Esc</kbd>
          </div>
          <div className="shortcut-row">
            <span className="shortcut-desc">Copy Room Code / Share Link</span>
            <kbd className="shortcut-key font-mono"><Copy size={13} /> C</kbd>
          </div>
          <div className="shortcut-row">
            <span className="shortcut-desc">Open Tag Action (Seekers)</span>
            <kbd className="shortcut-key font-mono"><Target size={13} /> T</kbd>
          </div>
          <div className="shortcut-row">
            <span className="shortcut-desc">Toggle Shortcuts Cheat-sheet</span>
            <kbd className="shortcut-key font-mono">?</kbd>
          </div>
        </div>

        <p className="shortcuts-modal-hint text-xs text-muted font-mono">
          Shortcuts are active when focus is not inside an active text input field.
        </p>
      </Card>
    </div>
  )
}
