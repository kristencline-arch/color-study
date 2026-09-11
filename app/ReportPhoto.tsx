"use client";
import {useState, type FormEvent} from "react";
import {REPOSITORY} from "./links";

export default function ReportPhoto({id, type = "curated"}: {id: string; type?: "curated" | "community"}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [reference, setReference] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const response = await fetch('/api/reports', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({photo_id: id, photo_type: type, reason: data.get('reason'), details: data.get('details'), website: data.get('website')})});
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The report could not be saved.');
      setReference(result.reference);
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'The report could not be saved.');}
    finally {setBusy(false);}
  }
  return <details className="photo-report"><summary>Report this photograph or its context</summary>
    {reference ? <p role="status">Report saved for the site owner to review. Your reference is <code>{reference}</code>. Reports are private.</p> : <form onSubmit={submit}>
      <p>No account needed. Describe the concern; please avoid including private contact details.</p>
      <label>Reason<select name="reason"><option value="rights">Image rights or permission</option><option value="attribution">Photographer credit</option><option value="context">Date, place or historical context</option><option value="privacy">Privacy or culturally sensitive material</option><option value="content">Inappropriate content</option><option value="other">Other concern</option></select></label>
      <label>What needs attention?<textarea name="details" required minLength={10} maxLength={1800} rows={4} /></label>
      <label className="form-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <button className="button ghost" disabled={busy}>{busy ? 'Saving report…' : 'Send private report'}</button>
      {error && <p role="alert">{error} <a href={`${REPOSITORY}/issues/new?title=${encodeURIComponent('Photo report: ' + id)}`} target="_blank" rel="noopener noreferrer">Report through GitHub ↗</a></p>}
    </form>}
  </details>;
}
