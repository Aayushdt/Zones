import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { HIDE_AND_SEEK_CONFIG } from '@xzones/game-core'
import { supabaseGameApi } from '../services/supabase-api'

export function BugReportPage() {
  const [report, setReport] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = report.trim()
    if (!text) { setError('Describe the issue before sending.'); return }
    setSending(true); setError(''); setNotice('')
    const result = await supabaseGameApi.submitBugReport(text)
    setSending(false)
    if (result.ok) { setReport(''); setNotice('Thanks. Your report was submitted.') }
    else setError(result.error.message)
  }
  return <main className="route-shell">
    <div className="route-shell__heading"><p className="welcome__eyebrow">Help improve XZones</p><h1>Report a bug</h1>
      <p className="welcome__copy">Only the text you enter is submitted. Do not include coordinates, access codes, tokens, passwords, or other sensitive information.</p></div>
    <section className="state-panel">
      <form onSubmit={submit}>
        <label className="field" htmlFor="bug-report-text"><span>What went wrong?</span>
          <textarea id="bug-report-text" className="form-control" rows={6} maxLength={HIDE_AND_SEEK_CONFIG.bugReport.maxCharacters.default} value={report} onChange={(event) => setReport(event.currentTarget.value)} /></label>
        <p className="field-help">{report.length}/{HIDE_AND_SEEK_CONFIG.bugReport.maxCharacters.default}</p>
        <button className="welcome__secondary" disabled={sending || !report.trim()} type="submit">{sending ? 'Sending…' : 'Send report'}</button>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="field-help" role="status">{notice}</p> : null}
      <Link className="welcome__secondary" to="/settings">Back to settings</Link>
    </section>
  </main>
}
