import { useCallback, useEffect, useRef, useState } from 'react';
import { Conversation } from '@elevenlabs/client';
import { submitAnswer } from '../car/api.js';
import { ConfirmationGuard, normalize } from './confirmationGuard.js';
import { RoomAudioGate } from './roomAudioGate.js';

export function useVoiceConversation(props) {
  const latest = useRef(props); latest.current = props;
  const starting = useRef(false), audioGate = useRef(null);
  const session = useRef(null), generation = useRef(0), guard = useRef(new ConfirmationGuard());
  const [status,setStatus] = useState('idle'), [available,setAvailable] = useState(false), [isSpeaking,setSpeaking] = useState(false), [inputReady,setInputReady] = useState(false);
  useEffect(() => { let alive = true; const check = () => fetch('/voice/status').then(r=>r.json()).then(v=>{if(alive)setAvailable(v.available===true);}).catch(()=>{if(alive)setAvailable(false);});check();const timer=setInterval(check,10000);return()=>{alive=false;clearInterval(timer);}; },[]);
  const stop = useCallback(async () => {
    const stopped=++generation.current;audioGate.current?.close();audioGate.current=null;setInputReady(false);starting.current=false;guard.current.clear();const active=session.current;session.current=null;
    await active?.endSession();if(generation.current===stopped){setStatus('idle');setSpeaking(false);latest.current.onEnded?.();}
  },[]);
  useEffect(()=>()=>{generation.current++;audioGate.current?.close();void session.current?.endSession();},[]);
  useEffect(()=>{audioGate.current?.update({enabled:props.noisyRoom!==false});},[props.noisyRoom]);
  const start = useCallback(async () => {
    if(session.current || starting.current) return;
    const question=latest.current.question;
    if(!question?.id) { latest.current.onError?.(new Error('Load a question before starting voice.')); return; }
    starting.current=true;const run=++generation.current;guard.current.clear();setStatus('connecting');
    const current=()=>generation.current===run;
    // Audio can continue for the farewell after persistence. Its microphone
    // and playback callbacks must not take the UI out of the saved state.
    let completed=false,saving=false;
    const phase=value=>{if(current()&&!completed&&!saving)latest.current.onPhase?.(value);};
    audioGate.current?.close();
    const gate=new RoomAudioGate({setMuted:muted=>{if(current())session.current?.setMicMuted(muted);},onReady:ready=>{if(current()){setInputReady(ready);if(ready&&!completed&&!saving){guard.current.listening();if(!guard.current.draft)phase('listening');}}}});
    audioGate.current=gate;gate.update({enabled:latest.current.noisyRoom!==false,speaking:true});
    try {
      // Request permission while still in the click gesture; the SDK owns the
      // subsequent microphone stream and releases it on endSession.
      const permission=await navigator.mediaDevices.getUserMedia({audio:true});permission.getTracks().forEach(t=>t.stop());
      if(!current())return;
      const response=await fetch('/voice/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const credentials=await response.json();if(!response.ok)throw new Error(credentials.error || 'Voice service unavailable.');
      if(!current())return;
      phase('briefing');
      const active=await Conversation.startSession({
        signedUrl:credentials.signedUrl,connectionType:'websocket',
        dynamicVariables:{question:question.question,expert_name:question.expertName,client:question.client,topic:question.title},
        onConnect:()=>{if(current())setStatus('connected');},
        onDisconnect:()=>{if(current()){gate.close();setInputReady(false);session.current=null;starting.current=false;guard.current.clear();setStatus('idle');setSpeaking(false);latest.current.onEnded?.();}},
        onError:(message)=>{if(current()){gate.close();setInputReady(false);generation.current++;starting.current=false;guard.current.clear();const active=session.current;session.current=null;void active?.endSession();setSpeaking(false);if(completed){setStatus('idle');latest.current.onEnded?.();}else{setStatus('error');latest.current.onError?.(new Error(message));}}},
        onModeChange:({mode})=>{if(!current())return;setSpeaking(mode==='speaking');if(mode==='speaking'&&!completed&&!saving)guard.current.speaking();gate.update({enabled:latest.current.noisyRoom!==false,speaking:mode==='speaking'});},
        onInterruption:()=>{if(current()&&!completed&&!saving)guard.current.interrupt();},
        onAgentResponseCorrection:()=>{if(current()&&!completed&&!saving)guard.current.interrupt();},
        onMessage:({source,message})=>{
          if(!current())return;const role=source==='user'?'user':'agent';latest.current.onTranscript?.({role,text:message});
          if(role==='agent'){if(!completed&&!saving)guard.current.agent(message);gate.update({enabled:latest.current.noisyRoom!==false,speaking:true});}
          else {if(!completed&&!saving)guard.current.user(message);if(/^(stop|later|not now|cancel|leave it|stop please|maybe later)$/.test(normalize(message)))void stop();}
        },
        clientTools:{
          prepare_clarification:({text})=>{
            if(!current())return 'Session ended.';
            if(completed||saving)return JSON.stringify({error:completed?'The clarification is already saved. End the conversation.':'The confirmed clarification is being saved. Wait for the result.'});
            try {const draft=guard.current.prepare(text);latest.current.onDraft?.(draft.text);phase('review');return JSON.stringify({...draft,instruction:'Read text EXACTLY, then ask Shall I save that clarification with your name? Wait for user answer.'});}catch(error){return JSON.stringify({error:error.message});}
          },
          confirm_clarification:async({draft_id})=>{
            if(!current())return JSON.stringify({error:'Session ended.'});
            if(completed||saving)return JSON.stringify({saved:completed,error:completed?'The clarification is already saved. Do not save again.':'A save is already in progress.'});
            let text;try{text=guard.current.consume(draft_id);}catch(error){return JSON.stringify({saved:false,error:error.message,instruction:'Ask for a fresh explicit yes after reading the current draft and exact save question. Do not claim saved.'});}
            saving=true;
            try {const result=await submitAnswer(question,{choice:'custom',explanation:text});if(current()){completed=true;saving=false;latest.current.onSaved?.(result);latest.current.onPhase?.('done');}return JSON.stringify({saved:result.status==='verified',pending:result.status==='pending_review',text,status:result.status,instruction:result.status==='verified'?'Say a brief thank you. The clarification is saved. Do not ask another question.':'The answer is only a pending draft. Say it was submitted for review, not published.'});}
            catch(error){saving=false;if(current())latest.current.onError?.(error);return JSON.stringify({saved:false,error:error.message});}
          },
          end_session:()=>{setTimeout(()=>{if(current())void stop();},1000);return 'Ending without any further changes.';},
        },
      });
      if(!current()){await active.endSession();return;}session.current=active;gate.update({enabled:latest.current.noisyRoom!==false});starting.current=false;setStatus('connected');
    }catch(error){if(current()){gate.close();setInputReady(false);starting.current=false;setStatus('error');setSpeaking(false);latest.current.onError?.(error);}}
  },[status,stop]);
  return {start,stop,status,available,isSpeaking,isListening:status==='connected'&&inputReady&&!isSpeaking};
}
