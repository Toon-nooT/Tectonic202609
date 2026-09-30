import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, CheckCircle2, ChevronDown, FileText, Headphones, Radio, Search, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import './knowledge-desk.css';

const apiBase = (import.meta.env.VITE_TOON_API_URL || '').replace(/\/+$/, '');
async function get(path, signal) {
  const response = await fetch(`${apiBase === 'local' ? '' : apiBase}${path}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Knowledge service returned ${response.status}.`);
  return response.json();
}
const sourcesOf = (conflict) => [conflict?.source_a, conflict?.source_b, ...(conflict?.additional_sources || [])].filter(Boolean);
const dateLabel = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Time unavailable';
const initials = (name = '') => name.split(' (')[0].split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('');

function Evidence({ conflict, conflictId }) {
  const [record, setRecord] = useState(conflict || null);
  const [error, setError] = useState('');
  useEffect(() => {
    setRecord(conflict || null); setError('');
    if (conflict || !conflictId) return;
    const controller = new AbortController();
    get(`/api/conflicts/${encodeURIComponent(conflictId)}`, controller.signal).then(setRecord).catch((err) => { if (err.name !== 'AbortError') setError('Source evidence could not be loaded.'); });
    return () => controller.abort();
  }, [conflict, conflictId]);
  const sources = sourcesOf(record);
  return <details className="kd-evidence" open={!conflictId}>
    <summary><span><FileText size={16} /> {sources.length ? `${sources.length} original sources` : 'Original sources'} <small>Preserved for context</small></span><ChevronDown size={16}/></summary>
    {error ? <p className="kd-source-error">{error}</p> : !sources.length ? <p className="kd-source-error">Loading evidence…</p> : <div className="kd-source-grid">{sources.map((source, index) => <article className="kd-source" key={`${source.source_id}-${index}`}><div className="kd-source-top"><span>{String(index + 1).padStart(2, '0')}</span><small>{source.type || source.format || 'Document'}</small></div><h4>{source.title}</h4><blockquote>“{source.excerpt}”</blockquote><footer>{source.owner_team}{source.raw_path && <span title={source.raw_path}>{source.raw_path}</span>}</footer></article>)}</div>}
  </details>;
}

function ResultCard({ result, fresh }) {
  const fact = result.verified;
  const conflict = result.conflict;
  const verified = result.kind === 'VERIFIED' && fact;
  return <article className={`kd-result ${verified ? 'is-verified' : 'is-unresolved'} ${fresh ? 'is-fresh' : ''}`}>
    <div className="kd-result-top"><span className={`kd-badge ${verified ? 'verified' : 'warning'}`}>{verified ? <ShieldCheck size={15}/> : <TriangleAlert size={15}/>} {verified ? 'Expert-confirmed' : 'Needs context'}</span><span className="kd-client">{result.client_context}</span></div>
    <h2>{result.topic}</h2>
    {verified ? <>
      <p className="kd-answer">{fact.verified_answer}</p>
      {(fact.scope || fact.explanation) && <div className="kd-context">{fact.scope && <div><span>Applies to</span><p>{fact.scope}</p></div>}{fact.explanation && <div><span>Expert context</span><p>{fact.explanation}</p></div>}</div>}
      <div className="kd-verifier"><span className="kd-avatar">{initials(fact.verified_by)}</span><div><strong>{fact.verified_by}</strong><span>Confirmed {dateLabel(fact.verified_at)}</span></div><CheckCircle2 size={20}/></div>
      <div className="kd-record-line"><Headphones size={14}/><span>{fact.verification_source}</span><span className="kd-record-id">{fact.id}</span></div>
    </> : <>
      <p className="kd-warning-copy">The documents disagree. The missing context is with the expert.</p>
      <div className="kd-owner"><span className="kd-avatar">{initials(conflict?.assigned_sme?.name)}</span><div><strong>{conflict?.assigned_sme?.name || 'Assigned expert'}</strong><span>{conflict?.assigned_sme?.role || 'Awaiting clarification'}</span></div><span className="kd-waiting">Awaiting confirmation</span></div>
      {Number.isFinite(conflict?.active_tickets_count) && <p className="kd-ticket-note">{conflict.active_tickets_count} related open tickets · confirmation will appear here automatically</p>}
    </>}
    <Evidence conflict={conflict} conflictId={fact?.resolved_conflict_id}/>
  </article>;
}

export default function KnowledgeDesk() {
  const initialQuery = new URLSearchParams(window.location.search).get('q') || 'Volvo overtime';
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [pending, setPending] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);
  const [freshIds, setFreshIds] = useState([]);
  const knownIds = useRef(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    let activeController;
    const update = async (first = false) => {
      activeController?.abort();
      const controller = new AbortController(); activeController = controller;
      if (first) setLoading(true);
      try {
        const [search, open, saved] = await Promise.all([
          query.trim().length >= 2 ? get(`/api/search?q=${encodeURIComponent(query.trim())}`, controller.signal) : Promise.resolve({ results: [] }),
          get('/api/conflicts/pending', controller.signal), get('/api/knowledge', controller.signal),
        ]);
        if (disposed || controller.signal.aborted) return;
        const ids = saved.map((fact) => fact.id);
        if (knownIds.current) setFreshIds(ids.filter((id) => !knownIds.current.includes(id)));
        knownIds.current = ids;
        setResults(search.results); setPending(open); setKnowledge(saved); setUpdated(new Date()); setError('');
      } catch (err) { if (!disposed && err.name !== 'AbortError') setError('Cannot reach the knowledge service. Showing the last loaded information.'); }
      finally { if (!disposed && !controller.signal.aborted) setLoading(false); }
    };
    update(true);
    const timer = setInterval(() => update(false), 5000);
    return () => { disposed = true; activeController?.abort(); clearInterval(timer); };
  }, [query, refresh]);
  function select(value) { setInput(value); setQuery(value); setResults([]); }
  function search(event) { event.preventDefault(); setQuery(input.trim()); setRefresh((v) => v + 1); }
  const confirmedCount = results.filter((result) => result.kind === 'VERIFIED').length;
  return <div className="kd-app">
    <aside className="kd-sidebar">
      <a className="kd-brand" href="?view=knowledge"><span className="kd-brand-mark"><Radio size={21}/></span><span>Knowledge<span>Pulse</span></span></a>
      <div className="kd-space-label">THE SHARED KNOWLEDGE DESK</div>
      <div className="kd-sidebar-intro"><span className="kd-online-dot"/> One team's knowledge.<br/><strong>Ready for the next person.</strong></div>
      <nav className="kd-queue" aria-label="Knowledge topics"><div className="kd-queue-heading"><span>Needs an expert</span><span>{pending.length}</span></div>{pending.slice(0, 8).map((conflict) => <button key={conflict.id} onClick={() => select(`${conflict.client_context} ${conflict.topic}`)} className={query === `${conflict.client_context} ${conflict.topic}` ? 'active' : ''}><span className="kd-queue-dot"/><span><strong>{conflict.topic}</strong><small>{conflict.client_context}</small></span><ArrowUpRight size={14}/></button>)}{!pending.length && !loading && <p className="kd-queue-empty">No open questions.</p>}</nav>
      <nav className="kd-queue kd-recent" aria-label="Recently confirmed answers"><div className="kd-queue-heading"><span>Recently confirmed</span><span>{knowledge.length}</span></div>{knowledge.slice(0, 5).map((fact) => <button key={fact.id} onClick={() => select(`${fact.client_context} ${fact.topic}`)}><Check size={15}/><span><strong>{fact.topic}</strong><small>{fact.client_context}</small></span></button>)}{!knowledge.length && <p className="kd-queue-empty">The next conversation becomes the first answer.</p>}</nav>
      <a className="kd-back" href="/"><ArrowLeft size={16}/> Open car experience</a>
      <p className="kd-prototype">Hackathon prototype · fictional data</p>
    </aside>
    <main className="kd-main">
      <header className="kd-topbar"><span><span className="kd-breadcrumb">Workspace</span><span>/</span> Knowledge</span><span className={`kd-sync ${error ? 'offline' : ''}`}><span className="kd-online-dot"/>{error ? 'Connection interrupted' : updated ? 'Live · updates every 5s' : 'Connecting…'}</span></header>
      <div className="kd-content">
        <div className="kd-eyebrow"><Sparkles size={15}/> FROM EXPERTISE TO EVERYDAY ANSWERS</div>
        <h1>Don't search harder.<br/><span>Know what applies.</span></h1>
        <p className="kd-subtitle">Source documents tell part of the story. Your colleagues complete it.</p>
        <form className="kd-search" onSubmit={search}><Search size={22}/><input aria-label="Search shared knowledge" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Search a client or topic…"/><button type="submit">Find answer <ArrowUpRight size={17}/></button></form>
        <div className="kd-search-hints"><span>Try</span>{['Volvo overtime', 'IKEA bicycle', 'meal voucher'].map((hint) => <button key={hint} onClick={() => select(hint)}>{hint}</button>)}</div>
        {error && <div role="alert" className="kd-error"><TriangleAlert size={18}/><span>{error}</span><button onClick={() => setRefresh((v) => v + 1)}>Retry</button></div>}
        <div className="kd-results-heading"><span>{loading ? 'Searching shared knowledge…' : `${results.length} ${results.length === 1 ? 'result' : 'results'} for “${query}”`}</span>{confirmedCount > 0 && <span><ShieldCheck size={14}/>{confirmedCount} expert-confirmed</span>}</div>
        <div className="kd-results" aria-live="polite" aria-busy={loading}>{loading && !results.length ? <div className="kd-skeleton"><div/><div/><div/></div> : results.map((result) => <ResultCard key={result.verified?.id || result.conflict?.id || result.topic} result={result} fresh={freshIds.includes(result.verified?.id)}/>)}{!loading && !results.length && !error && <div className="kd-empty"><Search size={30}/><h2>No matching knowledge yet.</h2><p>Try a client name or a topic from the left. Answers appear once an expert confirms them.</p></div>}</div>
        <footer className="kd-bottom-note"><ShieldCheck size={15}/><span>Expert attribution. Original evidence. Context you can trace.</span></footer>
      </div>
    </main>
  </div>;
}
