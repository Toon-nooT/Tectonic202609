import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronRight, FileText, ScanLine, ShieldCheck, TriangleAlert, Users, Waves, LoaderCircle, RefreshCw, Car, Search, X, FlaskConical } from 'lucide-react';
import './sentinel.css';

const target = (import.meta.env.VITE_TOON_API_URL || '').replace(/\/+$/, '');
async function api(path, method = 'GET') {
  const response = await fetch(`${target === 'local' ? '' : target}${path}`, { method, headers: { Accept: 'application/json' } });
  let data;
  try { data = await response.json(); } catch { throw new Error('The scanner returned an invalid response. Check that the backend is running.'); }
  if (!response.ok) throw Object.assign(new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`), { status: response.status });
  return data;
}
const filename = (path) => (path || '').split(/[\\/]/).pop();

export default function SentinelDesk() {
  const [report, setReport] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('regex');
  const [error, setError] = useState('');
  const [showDocuments, setShowDocuments] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  async function refresh() {
    setLoading(true); setError('');
    try {
      const [scan, pending] = await Promise.all([
        api('/api/sentinel/last-scan').catch(e => { if (e.status === 404) return null; throw e; }),
        api('/api/conflicts/pending'),
      ]);
      setReport(scan); setConflicts(pending);
      setSelected(prev => pending.some(c => c.id === prev) ? prev : pending.find(c => c.id === 'conf_106')?.id || pending[0]?.id || '');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function scan() {
    setBusy(true); setError('');
    try {
      const result = await api(`/api/sentinel/scan?extractor=${mode}`, 'POST');
      setReport(result);
      const pending = await api('/api/conflicts/pending');
      setConflicts(pending);
      setSelected(pending.find(c => c.id === 'conf_106')?.id || pending[0]?.id || '');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const current = conflicts.find(c => c.id === selected);
  const sources = current ? [current.source_a, current.source_b, ...(current.additional_sources || [])] : [];
  const documents = report?.documents || [];
  const parsed = documents.filter(d => d.status === 'PARSED').length;

  return <div className="sentinel-page">
    <header className="sentinel-header">
      <a className="sentinel-brand" href="/?view=sentinel"><span><Waves size={24}/></span>KnowledgePulse <small>SENTINEL</small></a>
      <nav aria-label="Demo views"><a className="active" href="/?view=sentinel"><ScanLine size={16}/>Find</a><a href="/"><Car size={16}/>Capture</a><a href="/?view=knowledge"><Search size={16}/>Reuse</a></nav>
      <span className="sentinel-demo">FICTIONAL DEMO DATA</span>
    </header>
    <main className="sentinel-main">
      <div className="sentinel-intro"><div><p className="sentinel-eyebrow">THE KNOWLEDGE BEHIND THE CONVERSATION</p><h1>Conflicting documents.<br/><em>One answer missing.</em></h1><p className="sentinel-subtitle">Find conflicting guidance. Ask the person who knows.<br/>Make their answer useful to everyone.</p></div><div className="sentinel-scanbox"><span className="sentinel-mini">SCAN RAW DOCUMENTS</span><label htmlFor="sentinel-mode">Extraction method</label><select id="sentinel-mode" value={mode} onChange={e => setMode(e.target.value)} disabled={busy}><option value="regex">Reproducible rule scan</option><option value="llm">AI extraction · configured API key required</option></select><button className="sentinel-run" disabled={busy || loading} onClick={scan}>{busy ? <LoaderCircle className="sentinel-spin" size={20}/> : <ScanLine size={20}/>} {busy ? 'Reading documents…' : 'Find contradictions'}{!busy && <ArrowRight size={19}/>}</button><small>{busy ? 'Waiting for the actual scan result. AI extraction may take a minute.' : mode === 'llm' ? 'Runs the backend’s AI extractor. May incur provider usage.' : 'Reads the actual files. No AI API calls in rule mode.'}</small></div></div>
      {error && <div role="alert" className="sentinel-error"><TriangleAlert size={20}/><span>{error}</span><button onClick={refresh}>Retry</button></div>}
      <section className="sentinel-pipeline" aria-label="Knowledge workflow">
        <div><span className="sentinel-step-icon"><FileText size={21}/></span><span><strong>{report ? `${parsed} documents parsed` : 'Raw documents'}</strong><small>{report ? `${report.facts_extracted} facts extracted` : 'Policies, chats, payroll files'}</small></span></div><ChevronRight/>
        <div><span className="sentinel-step-icon amber"><ScanLine size={21}/></span><span><strong>{report ? `${report.conflicts_detected} conflicts detected` : 'Find contradictions'}</strong><small>{report ? `${report.extractor_mode} extraction · last scan` : 'Compare source claims'}</small></span></div><ChevronRight/>
        <div><span className="sentinel-step-icon"><Users size={21}/></span><span><strong>Route to the expert</strong><small>{conflicts.length} questions currently open</small></span></div><ChevronRight/>
        <a href="/?view=knowledge"><span className="sentinel-step-icon"><ShieldCheck size={21}/></span><span><strong>Reusable knowledge</strong><small>Confirmed answer + provenance</small></span><ArrowRight size={17}/></a>
      </section>
      <div className="sentinel-section-head"><div><h2>Where the documents disagree</h2><p>{report ? `Last scan ${new Date(report.run_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}. Open conflicts below reflect the current backend state.` : 'Current open questions. Run a scan to trace them back to raw documents.'}</p></div><div><button className="sentinel-quiet" onClick={() => setShowDocuments(true)} disabled={!report}><FileText size={16}/>Scan evidence</button><button className="sentinel-quiet" onClick={refresh} disabled={busy || loading} aria-label="Refresh current state"><RefreshCw size={16} className={loading ? 'sentinel-spin' : ''}/></button></div></div>
      <div className="sentinel-workspace"><aside className="sentinel-queue" aria-label="Open conflicts">{loading && !conflicts.length ? <p className="sentinel-empty">Loading the expert queue…</p> : !conflicts.length ? <p className="sentinel-empty">No open questions. Run a scan to inspect the source documents.</p> : conflicts.map(c => <button key={c.id} onClick={() => setSelected(c.id)} className={c.id === selected ? 'selected' : ''}><span className="sentinel-queue-client">{c.client_context}<span className={`severity ${c.conflict_severity.toLowerCase()}`}>{c.conflict_severity}</span></span><strong>{c.topic}</strong><small>{2 + (c.additional_sources?.length || 0)} source claims <span>·</span> {c.active_tickets_count} related tickets</small><ChevronRight size={17}/></button>)}</aside>
      <section className="sentinel-detail">{current ? <><div className="sentinel-detail-heading"><span className="sentinel-eyebrow">{current.client_context} / {current.id}</span><h2>{current.topic}</h2><p>The sources disagree. The scan has not decided which is correct.</p></div><div className="sentinel-sources">{sources.map((source, index) => <article key={`${source.source_id}-${index}`} className="sentinel-source"><div className="sentinel-source-top"><span>CLAIM {String(index + 1).padStart(2, '0')}</span><small>{source.format}</small></div><blockquote>“{source.excerpt}”</blockquote><div className="sentinel-source-meta"><FileText size={16}/><span><strong>{source.title}</strong><small>{source.owner_team}</small></span></div>{source.raw_path && <code title={source.raw_path}>{filename(source.raw_path)}</code>}</article>)}</div><button className="sentinel-challenge" onClick={() => setShowPreview(true)}><FlaskConical size={17}/><span>Challenge the scanner<small>Try your own wording in an isolated preview</small></span><ArrowRight size={17}/></button><div className="sentinel-expert"><div className="sentinel-avatar">{current.assigned_sme.name.split(' ').map(n => n[0]).slice(0,2).join('')}</div><div><span className="sentinel-mini">ASSIGNED EXPERT</span><strong>{current.assigned_sme.name}</strong><small>{current.assigned_sme.role}</small></div><a href={`/?conflict=${encodeURIComponent(current.id)}`} className="sentinel-ask">Ask the expert <ArrowRight size={18}/></a></div><p className="sentinel-next"><Car size={15}/> Continue in the car demo. Nothing is published until the expert confirms.</p></> : <div className="sentinel-detail-empty"><ShieldCheck size={44}/><h2>{loading ? 'Connecting to Sentinel' : 'No unresolved question selected'}</h2><p>Select an open conflict or scan the documents.</p></div>}</section></div>
      <footer className="sentinel-footer"><span><ShieldCheck size={14}/>Source evidence stays attached. Expert confirmation stays explicit.</span><a href="/?view=knowledge">See what a colleague finds <ArrowRight size={14}/></a></footer>
    </main>
    {showPreview && current && <ScannerPreview conflict={current} sources={sources} onClose={() => setShowPreview(false)}/> }
    {showDocuments && <div className="sentinel-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowDocuments(false); }}><section className="sentinel-modal" role="dialog" aria-modal="true" aria-labelledby="scan-evidence-title"><header><div><p className="sentinel-eyebrow">ACTUAL SCAN OUTPUT</p><h2 id="scan-evidence-title">Every file, accounted for.</h2></div><button aria-label="Close scan evidence" onClick={() => setShowDocuments(false)}><X/></button></header><div className="sentinel-document-list">{documents.map(d => <article key={d.source_id}><span className={`sentinel-file-state ${d.status.toLowerCase()}`}>{d.status === 'PARSED' ? <Check size={17}/> : <TriangleAlert size={17}/>}</span><div><strong>{filename(d.raw_path)}</strong><small>{d.status} · {d.lines} lines · {d.extractor} {d.error ? `· ${d.error}` : ''}</small></div><b>{d.facts_found}<small>facts</small></b></article>)}</div>{report?.steps?.length > 0 && <details><summary>Backend processing log</summary><ol>{report.steps.map((step,i) => <li key={i}>{step}</li>)}</ol></details>}<p className="sentinel-modal-note">Counts describe this scan only. Rule coverage is limited to configured topics; an unflagged document is not proof of correctness.</p></section></div>}
  </div>;
}


function ScannerPreview({ conflict, sources, onClose }) {
  const [sourceId, setSourceId] = useState(sources[0].source_id);
  const [text, setText] = useState(sources[0].excerpt);
  const [extractor, setExtractor] = useState('llm');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  function selectSource(id) {
    setSourceId(id); setText(sources.find(source => source.source_id === id)?.excerpt || '');
    setResult(null); setError('');
  }
  async function runPreview(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('/lab/preview', { method: 'POST', headers: {'Content-Type':'application/json', Accept:'application/json'}, body: JSON.stringify({conflict_id:conflict.id, source_id:sourceId, text:text.trim(), extractor}) });
      let data;
      try { data = await response.json(); } catch { throw new Error('The preview service returned an invalid response. Check that the lab service is running.'); }
      if (!response.ok) throw new Error(data.error || (typeof data.detail === 'string' ? data.detail : '') || `Preview failed (${response.status}).`);
      if (!data.preview || !data.report || !Array.isArray(data.report.conflicts)) throw new Error('The preview response is missing its scan evidence.');
      setResult(data);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  const changedDocument = result?.report.documents?.find(document => document.source_id === result.changed_source?.source_id);
  return <div className="sentinel-modal-backdrop" onClick={e => {if (e.target === e.currentTarget && !busy) onClose();}}>
    <section className="sentinel-modal sentinel-lab" role="dialog" aria-modal="true" aria-labelledby="scanner-lab-title">
      <header><div><p className="sentinel-eyebrow"><FlaskConical size={14}/> ISOLATED PREVIEW</p><h2 id="scanner-lab-title">What if the wording changes?</h2></div><button aria-label="Close scanner preview" onClick={onClose} disabled={busy}><X/></button></header>
      <p className="sentinel-lab-intro">Try a new statement. This preview never changes shared documents or answers.</p>
      <form onSubmit={runPreview}>
        <label htmlFor="preview-source">Source to replace in this preview</label>
        <select id="preview-source" value={sourceId} onChange={e => selectSource(e.target.value)} disabled={busy}>{sources.map((source,i) => <option key={`${source.source_id}-${i}`} value={source.source_id}>{source.title}</option>)}</select>
        <div className="sentinel-lab-label"><label htmlFor="preview-text">Your fictional statement</label><span>{text.length.toLocaleString()} / 5,000</span></div>
        <textarea id="preview-text" maxLength={5000} rows={4} value={text} onChange={e => {setText(e.target.value);setResult(null);}} disabled={busy} required/>
        <p className="sentinel-lab-help">Starts with the quoted excerpt, not the full document. Other sources stay unchanged inside the preview.</p>
        {conflict.id === 'conf_101' && <button type="button" className="sentinel-lab-example" disabled={busy} onClick={() => {setText('Overtime at 150 percent begins once 9 hours have been worked.');setResult(null);}}>Try unfamiliar wording <span>Fictional what-if: 9 hours</span></button>}
        <div className="sentinel-lab-controls"><div><label htmlFor="preview-extractor">Extraction method</label><select id="preview-extractor" value={extractor} onChange={e => {setExtractor(e.target.value);setResult(null);}} disabled={busy}><option value="llm">AI extraction</option><option value="regex">Rule extraction · compare coverage</option></select></div><button type="submit" className="sentinel-run" disabled={busy || !text.trim()}>{busy ? <LoaderCircle className="sentinel-spin" size={18}/> : <ScanLine size={18}/>} {busy ? 'Testing your statement…' : 'Run preview'}</button></div>
        <p className="sentinel-lab-help">{busy ? 'Waiting for the real extractor. This can take a minute.' : extractor === 'llm' ? 'Uses the configured AI provider; may incur usage. No request runs until you press Run preview.' : 'Uses configured patterns without AI API calls. New wording may not match a rule.'}</p>
      </form>
      {error && <div role="alert" className="sentinel-error"><TriangleAlert size={18}/><span>{error}</span></div>}
      {result && <section className="sentinel-lab-result" aria-live="polite"><div className="sentinel-lab-result-head"><span className="sentinel-eyebrow">ACTUAL PREVIEW RESULT</span><span>{result.report.extractor_mode} extraction</span></div><h3>{result.report.conflicts_detected} discrepancy {result.report.conflicts_detected === 1 ? 'candidate' : 'candidates'}</h3><p>{result.report.facts_extracted} facts extracted across {result.report.documents?.length || 0} preview documents.{changedDocument && ` Changed source: ${changedDocument.facts_found} facts (${changedDocument.status.toLowerCase()}).`}</p>
        {!result.report.conflicts.length && <div className="sentinel-lab-empty"><TriangleAlert size={20}/><span>{!changedDocument || changedDocument.status !== 'PARSED' || !changedDocument.facts_found ? 'No usable fact was extracted from the changed statement. This is missing evidence, not proof that the sources agree.' : 'No discrepancy candidate was detected among the extracted facts. This does not establish that the guidance is correct or complete.'}</span></div>}
        {result.report.conflicts.map(candidate => <article className="sentinel-lab-candidate" key={candidate.id}><h4>{candidate.topic}</h4><div className="sentinel-lab-quotes">{[candidate.source_a,candidate.source_b,...(candidate.additional_sources || [])].filter(Boolean).map((source,index) => <blockquote key={`${source.source_id}-${index}`}><p>“{source.excerpt}”</p><cite>{source.title}</cite></blockquote>)}</div><p className="sentinel-lab-assignee"><Users size={15}/> Routed in preview to {candidate.assigned_sme?.name || 'unassigned expert'}{candidate.assigned_sme?.role ? ` · ${candidate.assigned_sme.role}` : ''}</p></article>)}
        {result.report.documents?.some(document => document.error) && <details><summary>Extraction warnings</summary><ul>{result.report.documents.filter(document => document.error).map(document => <li key={document.source_id}>{filename(document.raw_path)}: {document.error}</li>)}</ul></details>}
        <p className="sentinel-lab-notice"><ShieldCheck size={16}/>{result.notice || 'Preview only. Shared documents and verified answers are unchanged.'}</p>
      </section>}
      <p className="sentinel-modal-note">Tests wording within this configured topic: {conflict.topic}. Different scopes can explain different values; candidates still need an expert. This preview does not demonstrate coverage of new topics.</p>
    </section>
  </div>;
}
