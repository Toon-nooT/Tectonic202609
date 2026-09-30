import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './shell.css';

const CarApp = lazy(() => import('./CarApp.jsx'));
const KnowledgeDesk = lazy(() => import('./knowledge/KnowledgeDesk.jsx'));
const SentinelDesk = lazy(() => import('./sentinel/SentinelDesk.jsx'));
const view = new URLSearchParams(window.location.search).get('view');
const App = view === 'knowledge' ? KnowledgeDesk : view === 'sentinel' ? SentinelDesk : CarApp;
const frame = { minHeight: '100vh', boxSizing: 'border-box', background: '#101719', color: '#e9eee7', display: 'grid', placeContent: 'center', padding: '32px', fontFamily: 'system-ui', lineHeight: 1.5 };

class DemoBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main style={frame}><h1>Let’s reconnect.</h1><p>The demo could not load. Your saved answers remain in the running backend.</p><button onClick={() => window.location.reload()} style={{ padding: '14px 22px', border: 0, borderRadius: 12, background: '#d4ecb8', fontSize: 16, cursor: 'pointer' }}>Reload KnowledgePulse</button></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<React.StrictMode><DemoBoundary><Suspense fallback={<main style={frame}><p>Opening KnowledgePulse…</p></main>}><App /></Suspense></DemoBoundary></React.StrictMode>);
