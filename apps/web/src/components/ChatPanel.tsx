import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { HIDE_AND_SEEK_CONFIG } from '@xzones/game-core'
import { supabaseGameApi } from '../services/supabase-api'
import type { ChatMessage } from '../services/game-api'

export function ChatPanel({ matchId }: { matchId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const result = await supabaseGameApi.listChat(matchId)
    if (result.ok) { setMessages(result.data.messages); setError('') }
    else setError(result.error.message)
  }, [matchId])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), HIDE_AND_SEEK_CONFIG.chat.pollSeconds.default * 1000)
    return () => window.clearInterval(timer)
  }, [refresh])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setError('')
    const result = await supabaseGameApi.sendChat(matchId, body)
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setDraft('')
    await refresh()
  }

  return <section className="chat-panel state-panel" aria-label="Match chat">
    <h2>Chat</h2>
    <ol className="chat-messages" aria-live="polite">
      {messages.map((message) => <li key={message.id}>
        <strong>{message.author}</strong><span>{message.role ? ` · ${message.role === 'RUNNER' ? 'Runner' : 'Hunter'}` : ''}</span>
        <p>{message.body}</p>
      </li>)}
      {!messages.length && <li className="field-help">No messages yet.</li>}
    </ol>
    <form className="chat-compose" onSubmit={(event) => void send(event)}>
      <label className="field"><span>Message</span><input autoComplete="off" maxLength={HIDE_AND_SEEK_CONFIG.chat.maxCharacters.default}
        onChange={(event) => setDraft(event.currentTarget.value)} value={draft} /></label>
      <button className="welcome__action" disabled={busy || !draft.trim()} type="submit">{busy ? 'Sending…' : 'Send'}</button>
    </form>
    {error && <p className="form-error" role="status">{error}</p>}
  </section>
}
