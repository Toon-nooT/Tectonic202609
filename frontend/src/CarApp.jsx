import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, BatteryFull, Check, CheckCheck, Grid2X2, MapPin, Mic, Music2, Navigation, Pause, Play, Settings2, ShieldCheck, Signal, Volume2, VolumeX, X } from 'lucide-react';
import CarMap from './car/CarMap.jsx';
import { getQuestion, submitAnswer, resetDemo } from './car/api.js';
import './car-screen.css';

const STAGES = ['map', 'incoming', 'briefing', 'listening', 'review', 'done'];
function PulseMark({ small = false }) { return <span className={`pulse-mark ${small ? 'small' : ''}`} aria-hidden="true"><i/><i/><i/><i/><i/></span>; }
function Wave({ active }) { return <div className={`voice-wave ${active ? 'active' : ''}`} aria-hidden="true">{Array.from({length:35},(_,i)=><i key={i} style={{'--height':`${12+Math.sin(i*.87)**2*60}px`,'--delay':`${i*-.11}s`}}/>)}</div>; }

export default function CarApp() {
  const [stage,setStage]=useState('map'),[question,setQuestion]=useState(null),[answer,setAnswer]=useState(''),[choice,setChoice]=useState('B'),[result,setResult]=useState(null);
  const [director,setDirector]=useState(false),[sound,setSound]=useState(true),[speaking,setSpeaking]=useState(false),[recording,setRecording]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false),[music,setMusic]=useState(false),[sources,setSources]=useState(false);
  const recognition=useRef(null),generation=useRef(0),controls=useRef({});
  useEffect(()=>{let alive=true;getQuestion().then(q=>alive&&setQuestion(q)).catch(e=>alive&&setError(e.message));return()=>{alive=false}},[]);
  useEffect(()=>()=>{recognition.current?.abort();window.speechSynthesis?.cancel()},[]);
  function stopAudio(){generation.current++;window.speechSynthesis?.cancel();recognition.current?.abort();setSpeaking(false);setRecording(false)}
  function speak(text){
    const current=++generation.current;window.speechSynthesis?.cancel();if(!sound||!window.speechSynthesis)return;
    const utterance=new SpeechSynthesisUtterance(text),voices=window.speechSynthesis.getVoices();
    utterance.voice=voices.find(v=>v.lang==='en-GB'&&/Google|Microsoft|Natural/i.test(v.name))||voices.find(v=>v.lang.startsWith('en'))||null;
    utterance.lang='en-GB';utterance.rate=.98;utterance.onend=utterance.onerror=()=>{if(generation.current===current)setSpeaking(false)};setSpeaking(true);window.speechSynthesis.speak(utterance);
  }
  function notify(){
    if(!question||loading)return;stopAudio();setStage('incoming');setError('');
    if(sound)try{const audio=new(window.AudioContext||window.webkitAudioContext)();[660,880].forEach((f,i)=>{const osc=audio.createOscillator(),gain=audio.createGain();osc.connect(gain);gain.connect(audio.destination);osc.frequency.value=f;gain.gain.setValueAtTime(0,audio.currentTime+i*.13);gain.gain.linearRampToValueAtTime(.06,audio.currentTime+i*.13+.015);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+i*.13+.3);osc.start(audio.currentTime+i*.13);osc.stop(audio.currentTime+i*.13+.3)});setTimeout(()=>audio.close(),700)}catch{}
  }
  function accept(){stopAudio();setStage('briefing');speak(question.question)}
  function beginAnswer(){stopAudio();setStage('listening');setAnswer('')}
  function microphone(){
    if(recording){recognition.current?.stop();return}
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){setError('Voice capture is unavailable. Director controls can play the demo response.');return}
    const rec=new Recognition();rec.lang='en-GB';rec.continuous=true;rec.interimResults=false;
    rec.onresult=e=>{let text='';for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)text+=e.results[i][0].transcript+' ';setAnswer(a=>`${a} ${text}`.trim())};
    rec.onend=()=>setRecording(false);rec.onerror=()=>{setRecording(false);setError('Microphone unavailable. The scripted film mode still works.')};recognition.current=rec;
    try{rec.start();setRecording(true)}catch{setError('Could not start the microphone.')}
  }
  function review(scripted=false){
    stopAudio();const text=scripted?(question.suggestedAnswer||question.optionB):answer.trim();
    if(!text){setError('Record an answer, or use the scripted response in director controls.');return}
    setAnswer(text);setChoice(scripted?'B':'custom');setStage('review');setError('');speak(`Here is what I captured. ${text} Shall I share that?`);
  }
  async function confirm(){
    if(loading)return;stopAudio();setLoading(true);setError('');
    try{const saved=await submitAnswer(question,{choice,explanation:answer});setResult(saved);setStage('done');speak(['verified','resolved'].includes(saved.status)?'Thank you. Your clarification is now available to your colleagues.':'Thank you. Your explanation is saved for review.')}catch(e){setError(e.message)}finally{setLoading(false)}
  }
  async function restart(){
    if(loading)return;stopAudio();setLoading(true);setError('');
    try{await resetDemo();setQuestion(await getQuestion());setAnswer('');setResult(null);setStage('map');setSources(false)}catch(e){setError(e.message)}finally{setLoading(false)}
  }
  function fullscreen(){if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{})}
  function next(){if(stage==='map')notify();else if(stage==='incoming')accept();else if(stage==='briefing')beginAnswer();else if(stage==='listening')review(!answer.trim());else if(stage==='review')confirm();else if(stage==='done'){stopAudio();setStage('map')}}
  controls.current={next,notify,restart,fullscreen};
  useEffect(()=>{const key=e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(e.code==='Space'){e.preventDefault();controls.current.next()}else if(k==='n')controls.current.notify();else if(k==='r')controls.current.restart();else if(k==='f')controls.current.fullscreen();else if(k==='d')setDirector(d=>!d);else if(e.key==='Escape'){setDirector(false);setSources(false)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
  const conversation=!['map','incoming'].includes(stage),verified=result&&['verified','resolved'].includes(result.status);
  return <div className="car-demo">
    <div className="head-unit">
      <aside className="car-rail">
        <div className="car-clock">17:42</div><div className="rail-status"><Signal size={17}/><BatteryFull size={19}/></div>
        <nav aria-label="Car apps">
          <button className={`rail-app ${!conversation?'selected':''}`} aria-label="Open navigation" onClick={()=>{stopAudio();setStage('map')}}><Navigation size={27} fill="currentColor"/></button>
          <button className={`rail-app pulse-app ${conversation?'selected':''}`} aria-label="Open KnowledgePulse" onClick={notify}><PulseMark small/></button>
          <button className={`rail-app ${music?'music-active':''}`} aria-label="Toggle media tile" onClick={()=>setMusic(!music)}><Music2 size={27}/></button>
          <button className="rail-app" aria-label="Open demo controls" onClick={()=>setDirector(true)}><Grid2X2 size={25}/></button>
        </nav>
        <button className="rail-mic" aria-label="Voice input" onClick={()=>{if(conversation){stopAudio();setStage('listening');microphone()}else notify()}}><Mic size={26}/></button>
      </aside>
      <main className={`car-screen ${conversation?'in-conversation':''}`}>
        <div className="map-stage"><CarMap traffic={true}/>
          <div className="maneuver"><div className="maneuver-arrow"><ArrowUp size={43} strokeWidth={3}/></div><div><strong>8.2 km</strong><span>Stay on E17</span><small>Antwerpen</small></div><span className="road-badge">E17</span></div>
          <div className="traffic-note"><span/><strong>Slow traffic ahead</strong><span className="traffic-delay">+8 min</span></div>
          <div className="route-summary"><div><strong>25 <small>min</small></strong><span>18 km <i/> 18:07</span></div><button aria-label="Route overview" onClick={()=>setDirector(true)}><Navigation size={22}/></button></div>
          <div className="music-tile"><div className="album-art"><Music2 size={26}/></div><div><strong>Your daily mix</strong><span>{music?'Demo media tile':'Ready when you are'}</span></div><button aria-label="Toggle music tile" onClick={()=>setMusic(!music)}>{music?<Pause size={25} fill="currentColor"/>:<Play size={25} fill="currentColor"/>}</button></div>
          <div className="maps-wordmark"><span className="map-pin-logo"><MapPin size={20}/></span>Maps</div>
        </div>
        {stage==='incoming'&&<section className="incoming-card" aria-label="Incoming KnowledgePulse invitation"><div className="incoming-top"><PulseMark small/><span>KnowledgePulse</span><span className="incoming-time">now</span></div><h1>A little of what you know.</h1><p>{question?.expertName?.split(' ')[0]}, your team could use your expertise.</p><div className="incoming-topic"><span/>{question?.client}<i/> About 45 seconds</div><div className="incoming-actions"><button className="car-button quiet" onClick={()=>setStage('map')}>Later</button><button className="car-button green" onClick={accept}><Mic size={20}/>Let’s hear it</button></div></section>}
        {conversation&&<section className="conversation-screen" aria-label="KnowledgePulse conversation">
          <header className="conversation-header"><button className="round-button" aria-label="Back to map" onClick={()=>{stopAudio();setStage('map')}}><ArrowLeft size={24}/></button><div className="car-brand"><PulseMark small/><span>KnowledgePulse</span></div><span className="private-call"><span/>Your expertise, shared</span><button className="round-button" aria-label={sound?'Mute assistant':'Unmute assistant'} onClick={()=>{setSound(!sound);if(sound)stopAudio()}}>{sound?<Volume2 size={23}/>:<VolumeX size={23}/>}</button></header>
          <div className="conversation-body">
            {stage==='briefing'&&<><div className="voice-avatar"><PulseMark/></div><div className="conversation-kicker">ONE QUESTION · {question?.client?.toUpperCase()}</div><h1>{question?.mode==='local'?<>One approval.<br/>Or two?</>:<>Two sources.<br/>One question.</>}</h1><p className="spoken-question">{question?.question}</p><Wave active={speaking}/><div className="conversation-actions"><button className="car-button quiet" onClick={()=>{stopAudio();setStage('map')}}>Not now</button><button className="car-button green" onClick={beginAnswer}><Mic size={22}/>I can help</button></div></>}
            {stage==='listening'&&<><div className={`voice-avatar listening ${recording?'recording':''}`}><Mic size={49}/></div><div className="conversation-kicker">YOUR EXPERIENCE MAKES THE DIFFERENCE</div><h1>{recording?'I’m listening.':'What’s the missing context?'}</h1><p className="spoken-question">{answer||'Tell us which instruction applies, and when.'}</p><Wave active={recording}/><div className="conversation-actions"><button className="car-button quiet" onClick={microphone}><Mic size={21}/>{recording?'Stop microphone':'Start microphone'}</button><button className="car-button green" disabled={!answer.trim()} onClick={()=>review(false)}>Review my answer<ArrowRight size={20}/></button></div></>}
            {stage==='review'&&<><div className="conversation-kicker">LET’S GET THIS RIGHT</div><h1>Here’s what I captured.</h1><div className="captured-answer"><span className="quote-mark">“</span><p>{answer}</p><div className="answer-scope"><MapPin size={16}/>{question?.client}</div></div><div className="review-byline"><ShieldCheck size={19}/><span>Shared with your name, context and source references.</span></div><div className="conversation-actions"><button className="car-button quiet" onClick={beginAnswer}>Try again</button><button className="car-button green" disabled={loading} onClick={confirm}>{loading?<span className="small-spinner"/>:<Check size={22}/>} {loading?'Saving…':'Confirm & share'}</button></div></>}
            {stage==='done'&&<><div className="success-orbit"><CheckCheck size={48}/></div><div className="conversation-kicker">A SMALL MOMENT. A CLEARER ANSWER.</div><h1>{verified?<>One less unknown.<br/><em>For everyone.</em></>:<>Your experience,<br/><em>captured.</em></>}</h1><p className="spoken-question">{verified?'Your clarification is now available to your colleagues.':'Your explanation is saved for the responsible owner to review.'}</p><div className="knowledge-receipt"><ShieldCheck size={23}/><div><strong>{verified?'Verified':'Contributed'} by {result?.verifiedBy||question?.expertName}</strong><span>{question?.client} · Source references retained</span></div><span className="receipt-status">{verified?'SHARED':'IN REVIEW'}</span></div><div className="conversation-actions"><button className="car-button quiet" onClick={()=>setSources(true)}>See the evidence</button><button className="car-button green" onClick={()=>{stopAudio();setStage('map')}}>Back to the road<Navigation size={20}/></button></div></>}
          </div>
          <footer className="conversation-footer"><span><Navigation size={15}/>E17 towards Antwerpen</span><span>25 min <i/> +8 min traffic</span></footer>
        </section>}
      </main>
    </div>
    <div className="demo-edge"><span>KnowledgePulse <i/> Car display prototype</span><button onClick={()=>setDirector(!director)}><Settings2 size={13}/>Director controls<kbd>D</kbd></button></div>
    {error&&<div className="car-error" role="alert"><span>{error}</span><button aria-label="Dismiss message" onClick={()=>setError('')}><X size={18}/></button></div>}
    {director&&<aside className="director-panel" aria-label="Director controls"><div className="director-heading"><div><span>FILM MODE</span><h2>You call the shots.</h2></div><button className="round-button" aria-label="Close director controls" onClick={()=>setDirector(false)}><X size={20}/></button></div><p>Staged car display. The map and demo response are scripted. Confirmation is saved to the backend.</p><div className="scene-list">{STAGES.map((s,i)=><div key={s} className={stage===s?'current':''}><span>{i+1}</span>{({map:'Navigation',incoming:'Incoming invitation',briefing:'The question',listening:'Expert answer',review:'Read it back',done:'Shared knowledge'})[s]}</div>)}</div><button className="car-button green full" disabled={loading||!question} onClick={next}>Next scene<kbd>Space</kbd></button><div className="director-grid"><button onClick={notify} disabled={!question}>Invitation<kbd>N</kbd></button><button onClick={fullscreen}>Fullscreen<kbd>F</kbd></button><button onClick={restart} disabled={loading}>Reset take<kbd>R</kbd></button><button onClick={()=>{setSound(!sound);stopAudio()}}>{sound?'Mute voice':'Enable voice'}</button></div>{stage==='listening'&&<><label htmlFor="director-answer">Expert’s answer</label><textarea id="director-answer" value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Type the expert’s explanation here…"/><button className="car-button quiet full" onClick={()=>review(true)}>Use scripted demo response</button></>}<small>{question?`Backend: ${question.mode==='toon'?'Toon’s API':'local demo'} · ${question.expertName}`:'Connecting to backend…'}<br/>D hides these controls before you film.</small></aside>}
    {sources&&<div className="evidence-overlay"><section role="dialog" aria-modal="true" aria-label="Source evidence"><button className="round-button close-evidence" aria-label="Close evidence" onClick={()=>setSources(false)}><X size={23}/></button><span className="conversation-kicker">WHY COLLEAGUES CAN RELY ON IT</span><h2>The answer keeps its evidence.</h2><p>{result?.answer||question?.suggestedAnswer}</p><div className="source-pair">{[question?.sourceA,question?.sourceB,question?.sourceC].filter(Boolean).map((s,i)=><article key={i}><span>SOURCE {i+1}</span><h3>{s.title}</h3><blockquote>{s.excerpt}</blockquote></article>)}</div><div className="evidence-signature"><ShieldCheck size={23}/>{result?.verifiedBy||question?.expertName}<span>{verified?'Approved this clarification':'Contributed this explanation'}</span></div></section></div>}
  </div>;
}
