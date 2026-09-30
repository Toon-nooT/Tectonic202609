import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Conversation } from '@elevenlabs/client';
import { useVoiceConversation } from './useVoiceConversation.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const text='The allowance applies to eligible bicycle commutes from January 2026.';

// Render only to obtain the real hook callbacks. Provider/network boundaries
// are fakes; the real confirmation guard and delayed room-audio gate run here.
function harness() {
  const originalFetch=globalThis.fetch,originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),originalStart=Conversation.startSession;
  const phases=[],saved=[],errors=[],muted=[],events=[];
  let provider,hook,release,writes=0,ended=0;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}}});
  globalThis.fetch=async url=>{
    if(url==='/voice/session')return Response.json({signedUrl:'wss://example.invalid/session'});
    if(url==='/api/conflicts/resolve'){writes++;return new Promise(resolve=>{release=resolve})}
    throw new Error(`Unexpected request: ${url}`);
  };
  Conversation.startSession=async callbacks=>{provider=callbacks;return{setMicMuted:value=>muted.push(value),endSession:async()=>{}}};
  function Harness(){hook=useVoiceConversation({
    question:{id:'test-conflict',mode:'toon',question:'Which rate applies?',expertName:'Demo expert',client:'Demo client',title:'Allowance',scope:'Demo scope',_toon:{smeId:'test-expert'}},
    noisyRoom:true,
    onPhase:value=>{phases.push(value);events.push(`phase:${value}`)},
    onSaved:value=>{saved.push(value);events.push('saved')},onError:value=>errors.push(value),onEnded:()=>ended++,
  });return null}
  renderToString(createElement(Harness));
  return{
    get hook(){return hook},get provider(){return provider},get writes(){return writes},get ended(){return ended},phases,saved,errors,muted,events,
    async authorize(){
      await hook.start();
      const draft=JSON.parse(provider.clientTools.prepare_clarification({text}));
      provider.onModeChange({mode:'speaking'});
      provider.onMessage({source:'ai',message:`${text} Shall I save that clarification with your name?`});
      provider.onModeChange({mode:'listening'});
      await wait(280);
      provider.onMessage({source:'user',message:'Yes, share it'});
      return draft.id;
    },
    resolve(status=200){release(Response.json(status===200?{resolved_conflict_id:'test-conflict',verified_answer:text,verified_by:'Demo expert',verified_at:'2026-09-30T12:00:00.000Z',status:'VERIFIED'}:{error:'Save unavailable'},{status}))},
    async cleanup(){await hook.stop();globalThis.fetch=originalFetch;Conversation.startSession=originalStart;if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator},
  };
}

test('confirmed save stays terminal through delayed microphone opening and farewell',async()=>{
  const h=harness();
  try{
    const id=await h.authorize();
    const pending=h.provider.clientTools.confirm_clarification({draft_id:id});
    h.provider.onModeChange({mode:'speaking'});
    h.provider.onModeChange({mode:'listening'});
    await wait(280);
    assert.equal(h.phases.at(-1),'review','waiting for persistence must retain readback');
    assert.equal(h.saved.length,0);
    h.resolve();await pending;
    assert.equal(h.saved.length,1);
    assert.deepEqual(h.events.slice(-2),['saved','phase:done']);
    const phaseCount=h.phases.length;
    h.provider.onMessage({source:'ai',message:'Thank you. Your clarification is saved.'});
    h.provider.onModeChange({mode:'speaking'});
    assert.equal(h.muted.at(-1),true,'farewell still uses the normal audio gate');
    h.provider.onModeChange({mode:'listening'});
    await wait(280);
    assert.equal(h.muted.at(-1),false,'farewell can finish and release the microphone');
    assert.equal(h.phases.length,phaseCount,'microphone readiness cannot overwrite done');
    assert.equal(h.phases.at(-1),'done');
    h.provider.clientTools.prepare_clarification({text:'Another draft'});
    await h.provider.clientTools.confirm_clarification({draft_id:id});
    assert.equal(h.writes,1,'late tool calls cannot reopen or save the completed session again');
    assert.equal(h.phases.at(-1),'done');
    h.provider.onError('Farewell connection closed');
    assert.equal(h.errors.length,0,'a late transport error must not obscure the stored result');
    assert.equal(h.ended,1);
  }finally{await h.cleanup()}
});

test('failed persistence does not latch completion or emit a saved result',async()=>{
  const h=harness();
  try{
    const id=await h.authorize();
    const pending=h.provider.clientTools.confirm_clarification({draft_id:id});
    h.resolve(503);await pending;
    assert.equal(h.saved.length,0);
    assert.equal(h.phases.includes('done'),false);
    assert.equal(h.errors.length,1);
    assert.equal(JSON.parse(h.provider.clientTools.prepare_clarification({text})).text,text,'a failed save has not terminally locked the session');
  }finally{await h.cleanup()}
});
