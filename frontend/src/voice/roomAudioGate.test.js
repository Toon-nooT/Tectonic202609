import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomAudioGate} from './roomAudioGate.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setup(){const events=[];const gate=new RoomAudioGate({setMuted:value=>events.push(['muted',value]),onReady:value=>events.push(['ready',value]),delay:10});return{gate,events};}
test('noisy room mutes playback, then automatically opens microphone',async()=>{const{gate,events}=setup();gate.update({speaking:true});assert.deepEqual(events.slice(-2),[['muted',true],['ready',false]]);gate.update({speaking:false});await wait(25);assert.deepEqual(events.slice(-2),[['muted',false],['ready',true]]);gate.close();});
test('new audio cancels a pending microphone opening',async()=>{const{gate,events}=setup();gate.update({speaking:false});gate.update({speaking:true});await wait(25);assert.equal(events.some(([key,value])=>key==='muted'&&!value),false);gate.close();});
test('quiet mode preserves interruption microphone',()=>{const{gate,events}=setup();gate.update({enabled:false,speaking:true});assert.deepEqual(events.slice(-2),[['muted',false],['ready',false]]);gate.close();});
test('ending a session cancels delayed unmute',async()=>{const{gate,events}=setup();gate.update({speaking:false});gate.close();const count=events.length;await wait(25);assert.equal(events.length,count);});
