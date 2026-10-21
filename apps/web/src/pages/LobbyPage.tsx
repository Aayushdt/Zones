import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Copy,
  Share2,
  QrCode,
  Dices,
  Play,
  AlertCircle,
  MessageSquare,
  ArrowLeft,
  Settings,
  HelpCircle,
  Users,
} from 'lucide-react'
import QRCode from 'qrcode'
import { HIDE_AND_SEEK_CONFIG, type Role } from '@xzones/game-core'
import { supabaseGameApi } from '../services/supabase-api'
import { ChatPanel } from '../components/ChatPanel'
import type { LobbyView } from '../services/game-api'
import { useLocationStore } from '../stores/location-store'
import { TeamCard } from '../components/ui/TeamCard'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { Card } from '../components/ui/Card'
import { Toast } from '../components/ui/Toast'
import { playSound, triggerHaptic } from '../utils/feedback'

export function LobbyPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const [lobby, setLobby] = useState<LobbyView | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const [hunterCount, setHunterCount] = useState(1)
  const [itemsEnabled, setItemsEnabled] = useState(false)
  const [spectatorMode, setSpectatorMode] = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [chatOpen, setChatOpen] = useState(false)

  const enableLocation = useLocationStore((state) => state.enable)
  const clearLocation = useLocationStore((state) => state.clearMatch)

  const refresh = useCallback(async () => {
    setPending(true)
    const result = await supabaseGameApi.getLobby(matchId)
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError('')
    setLobby(result.data)
    const items = await supabaseGameApi.setItemsEnabled(matchId, null)
    if (items.ok) setItemsEnabled(items.data.items_enabled)
    const totalPlayers = result.data.players.length
    const defaultHunters = Math.min(
      Math.max(Math.ceil(totalPlayers / HIDE_AND_SEEK_CONFIG.players.hunterCountDivisor.default), 1),
      Math.max(1, Math.floor(totalPlayers / 2))
    )
    setHunterCount(defaultHunters)
  }, [matchId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const lobbyCode = lobby
    ? sessionStorage.getItem(`xzones.lobby.${lobby.id}.code`) ||
      lobby.id.slice(0, 6).toUpperCase()
    : ''

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join?code=${encodeURIComponent(lobbyCode)}`
    : ''

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(lobbyCode)
      setToastMsg(`Lobby code ${lobbyCode} copied to clipboard!`)
    } catch {
      setToastMsg(`Lobby code is ${lobbyCode}`)
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my XZones Hide & Seek Match',
          text: `Join my private GPS game with code: ${lobbyCode}`,
          url: shareUrl,
        })
      } catch {
        /* User cancelled share */
      }
    } else {
      await handleCopyCode()
    }
  }

  async function handleOpenQr() {
    try {
      const url = await QRCode.toDataURL(shareUrl, {
        width: 280,
        margin: 2,
        color: { dark: '#00FF89', light: '#060606' },
      })
      setQrDataUrl(url)
      setQrModalOpen(true)
    } catch {
      setError('Could not generate QR code.')
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'c' || e.key === 'C') {
        const active = document.activeElement
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
        e.preventDefault()
        void handleCopyCode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lobbyCode])

  async function selectTeam(role: Role | 'RANDOM') {
    if (!lobby) return
    const prevLobby = lobby
    // Optimistic UI
    if (role !== 'RANDOM') {
      setLobby((current) => {
        if (!current) return current
        const updated = current.players.map((p) =>
          p.id === current.you.id ? { ...p, role } : p,
        )
        return {
          ...current,
          you: { ...current.you, role },
          players: updated,
        }
      })
    }
    triggerHaptic(20)
    playSound('click')
    setPending(true)
    const result = await supabaseGameApi.selectTeam(matchId, role)
    setPending(false)
    if (!result.ok) {
      setLobby(prevLobby) // Rollback on error
      setError(result.error.message)
      playSound('warning')
      return
    }
    await refresh()
  }

  async function setReady(ready: boolean) {
    let consentedLocation = false
    if (ready && !lobby?.you.ready) {
      if (!window.isSecureContext || !navigator.geolocation) {
        setError('Location permission requires HTTPS on a phone (localhost is allowed for development).')
        return
      }
      setPending(true)
      setError('Allow location to verify GPS before readying. Coordinates are not retained by this check.')
      const permission = await new Promise<boolean>((resolve) =>
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
        ),
      )
      setPending(false)
      if (!permission) {
        setError('Location permission or a GPS fix is required before readying. Allow location and try again.')
        return
      }
      consentedLocation = true
    }
    setPending(true)
    const result = await supabaseGameApi.setReady(matchId, ready)
    setPending(false)
    if (!result.ok) {
      if (ready) clearLocation(matchId)
      setError(result.error.message)
      return
    }
    if (consentedLocation) enableLocation(matchId)
    if (!ready) clearLocation(matchId)
    await refresh()
  }

  async function removePlayer(playerId: string) {
    if (!lobby || lobby.you.id !== lobby.controller_player_id || playerId === lobby.you.id) return
    setPending(true)
    const result = await supabaseGameApi.removeLobbyPlayer(matchId, playerId)
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    await refresh()
  }

  async function startMatch() {
    if (!lobby || lobby.you.id !== lobby.controller_player_id) return
    setPending(true)
    const result = await supabaseGameApi.startMatch(matchId)
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    navigate(`/match/${matchId}`)
  }

  if (error && !lobby) {
    return (
      <main className="lobby-screen">
        <div className="lobby-content-wrap">
          <Card variant="raised" className="lobby-error-card">
            <AlertCircle size={32} className="text-red" />
            <h2 className="lobby-error-title">Could not load lobby</h2>
            <p className="lobby-error-desc">{error}</p>
            <div className="lobby-error-actions">
              <Button size="md" variant="primary-green" onClick={() => void refresh()}>
                Retry connection
              </Button>
              <Link to="/">
                <Button size="md" variant="secondary-outline">
                  Return to Home
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </main>
    )
  }

  if (!lobby) {
    return (
      <main className="lobby-screen">
        <div className="lobby-content-wrap">
          <Card variant="raised" className="lobby-loading-card">
            <span className="font-mono text-sm text-muted">CONNECTING TO LOBBY…</span>
          </Card>
        </div>
      </main>
    )
  }

  const hunters = lobby.players.filter((p) => p.role === 'HUNTER')
  const runners = lobby.players.filter((p) => p.role === 'RUNNER')
  const unassigned = lobby.players.filter((p) => p.role === null)
  const isController = lobby.you.id === lobby.controller_player_id

  const minPlayersMet = lobby.players.length >= HIDE_AND_SEEK_CONFIG.players.min.default
  const allReady = lobby.players.length > 0 && lobby.players.every((p) => p.ready)

  let startDisabledReason = ''
  if (!minPlayersMet) {
    startDisabledReason = `Need at least ${HIDE_AND_SEEK_CONFIG.players.min.default} players to begin (currently ${lobby.players.length})`
  } else if (unassigned.length > 0) {
    startDisabledReason = `${unassigned.length} player(s) still unassigned to a team`
  } else if (hunters.length === 0 || runners.length === 0) {
    startDisabledReason = 'Both Seekers and Hiders require at least 1 player'
  } else if (!allReady) {
    const notReadyCount = lobby.players.filter((p) => !p.ready).length
    startDisabledReason = `Waiting for ${notReadyCount} player(s) to ready up`
  }

  const canStart = !startDisabledReason && isController

  return (
    <main className="lobby-screen">
      {toastMsg && <Toast message={toastMsg} type="success" onClose={() => setToastMsg('')} durationMs={3000} />}

      <div className="lobby-content-wrap">
        {/* Header pattern: Back, Big Mono Code + Copy, Version Chip, Share, QR, Settings */}
        <header className="lobby-header">
          <div className="lobby-header__top">
            <Link to="/" className="lobby-back-btn" title="Back to Home" aria-label="Back">
              <ArrowLeft size={20} />
            </Link>

            <div className="lobby-header__title-group">
              <span className="lobby-header__overline font-mono">ROOM CODE</span>
              <div className="lobby-header__code-row">
                <span className="lobby-header__code font-mono" title="Private Lobby Code">
                  {lobbyCode}
                </span>
                <span className="lobby-version-chip font-mono text-xs">v0.1.0</span>
              </div>
            </div>

            <div className="lobby-header__actions">
              <Button
                size="sm"
                variant="secondary-outline"
                icon={<Copy size={14} />}
                onClick={handleCopyCode}
                title="Copy lobby code"
              >
                Copy
              </Button>
              <Button
                size="sm"
                variant="secondary-outline"
                icon={<Share2 size={14} />}
                onClick={handleShare}
                title="Share lobby link"
              >
                Share
              </Button>
              <Button
                size="sm"
                variant="secondary-outline"
                icon={<QrCode size={14} />}
                onClick={handleOpenQr}
                title="Show QR Code"
              >
                QR
              </Button>
              <Link to="/settings" className="lobby-settings-btn" title="Settings" aria-label="Settings">
                <Settings size={18} />
              </Link>
            </div>
          </div>

          <div className="lobby-mode-line text-xs text-muted" title="Hide & Seek (Seekers vs Hiders) · GPS outdoor hide-and-seek">
            <span className="font-mono text-green">MODE:</span> Hide & Seek · Scheduled snapshots · Physical QR tagging
          </div>
        </header>

        {/* Scoreboard Card: n Seekers vs n Hiders + Target Balance + Max Players */}
        <Card variant="raised" className="lobby-scoreboard-card">
          <div className="lobby-scoreboard__counts">
            <div className="scoreboard-team scoreboard-team--seeker">
              <span className="scoreboard-number font-mono">{hunters.length}</span>
              <span className="scoreboard-label font-mono">SEEKERS</span>
            </div>
            <div className="scoreboard-vs font-mono">VS</div>
            <div className="scoreboard-team scoreboard-team--hider">
              <span className="scoreboard-number font-mono">{runners.length}</span>
              <span className="scoreboard-label font-mono">HIDERS</span>
            </div>
          </div>

          <div className="lobby-scoreboard__meta">
            <span className="scoreboard-roster-total font-mono text-xs">
              <Users size={14} /> {lobby.players.length} / {HIDE_AND_SEEK_CONFIG.players.max.default} PLAYERS (MIN {HIDE_AND_SEEK_CONFIG.players.min.default})
            </span>
            <span className="scoreboard-balance-hint text-xs text-muted">
              Target balance: {hunterCount} Seeker{hunterCount > 1 ? 's' : ''} vs{' '}
              {Math.max(1, lobby.players.length - hunterCount)} Hider{lobby.players.length - hunterCount > 1 ? 's' : ''}
            </span>
          </div>
        </Card>

        {/* Tactical Actions Bar: Auto-Balance, Neutral How To Play, Spectate, Items */}
        <div className="lobby-quick-actions">
          <div className="lobby-quick-actions__buttons">
            <Button
              size="sm"
              variant="secondary-outline"
              icon={<Dices size={16} />}
              onClick={() => selectTeam('RANDOM')}
              title="Automatically balance teams"
            >
              Auto-Balance
            </Button>

            {/* NEUTRAL outline How to Play button */}
            <Link to="/guide">
              <Button
                size="sm"
                variant="secondary-outline"
                icon={<HelpCircle size={16} />}
                title="View rules and how to play"
              >
                How to play
              </Button>
            </Link>
          </div>

          <div className="lobby-toggles-group">
            <Toggle
              label="Spectate"
              checked={spectatorMode}
              onChange={(e) => setSpectatorMode(e.currentTarget.checked)}
              className="lobby-mini-toggle"
            />
            {isController && (
              <Toggle
                label="Tactical Items"
                checked={itemsEnabled}
                onChange={(e) => {
                  setItemsEnabled(e.currentTarget.checked)
                  void supabaseGameApi.setItemsEnabled(matchId, e.currentTarget.checked)
                }}
                className="lobby-mini-toggle"
              />
            )}
          </div>
        </div>

        {/* Dual Team Cards: Seekers (Red) vs Hiders (Green) - Shared Page Gutter */}
        <div className="lobby-teams-grid">
          <TeamCard
            role="HUNTER"
            players={hunters}
            currentUserId={lobby.you.id}
            hostId={lobby.controller_player_id}
            isSelected={lobby.you.role === 'HUNTER'}
            onSelectTeam={selectTeam}
            canRemovePlayer={isController}
            onRemovePlayer={removePlayer}
            disabled={pending}
          />

          <TeamCard
            role="RUNNER"
            players={runners}
            currentUserId={lobby.you.id}
            hostId={lobby.controller_player_id}
            isSelected={lobby.you.role === 'RUNNER'}
            onSelectTeam={selectTeam}
            canRemovePlayer={isController}
            onRemovePlayer={removePlayer}
            disabled={pending}
          />
        </div>

        {/* Unassigned Roster if any */}
        {unassigned.length > 0 && (
          <Card variant="surface" className="unassigned-card">
            <span className="unassigned-title font-mono">UNASSIGNED PLAYERS ({unassigned.length})</span>
            <div className="unassigned-list">
              {unassigned.map((p) => (
                <div key={p.id} className="unassigned-chip">
                  <span>{p.display_name}</span>
                  {p.id === lobby.you.id && <span className="unassigned-self font-mono">(YOU)</span>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Error notice if any */}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {/* In-Lobby Radio & Chat Drawer Trigger */}
        <div className="lobby-chat-bar">
          <Button
            variant="ghost"
            icon={<MessageSquare size={16} />}
            onClick={() => setChatOpen((prev) => !prev)}
          >
            {chatOpen ? 'Hide Lobby Chat' : 'Open Lobby Chat'}
          </Button>
          {chatOpen && <ChatPanel matchId={matchId} />}
        </div>
      </div>

      {/* Sticky Bottom Bar for Ready & Start Match: flex: 1, min-width: 0, non-overlapping */}
      <footer className="lobby-sticky-footer">
        <div className="lobby-sticky-footer__inner">
          <Button
            size="lg"
            variant={lobby.you.ready ? 'primary-green' : 'secondary-outline'}
            onClick={() => setReady(!lobby.you.ready)}
            disabled={pending}
            className="lobby-footer-btn lobby-ready-btn"
          >
            {lobby.you.ready ? '✓ READY' : 'CLICK TO READY'}
          </Button>

          {isController ? (
            <Button
              size="lg"
              variant="seeker-red"
              onClick={startMatch}
              disabled={!canStart || pending}
              disabledReason={startDisabledReason}
              icon={<Play size={18} />}
              className="lobby-footer-btn lobby-start-btn"
            >
              START MATCH
            </Button>
          ) : (
            <div className="lobby-waiting-hint font-mono text-xs">
              WAITING FOR HOST TO START
            </div>
          )}
        </div>
      </footer>

      {/* QR Code Modal */}
      {qrModalOpen && (
        <div className="modal-backdrop" onClick={() => setQrModalOpen(false)} role="dialog" aria-modal="true">
          <div className="qr-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="qr-modal-title">Join Lobby QR</h3>
            <p className="qr-modal-desc font-mono">Code: {lobbyCode}</p>
            {qrDataUrl && <img src={qrDataUrl} alt="Lobby QR Code" className="qr-modal-img" />}
            <Button size="md" variant="secondary-outline" onClick={() => setQrModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
