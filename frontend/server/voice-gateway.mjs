import http from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { agentConfig } from './agent-config.mjs';
import { handleDocumentPreview } from './preview-handler.mjs';
const rootEnv=fileURLToPath(new URL('../../.env',import.meta.url));
if(existsSync(rootEnv))process.loadEnvFile(rootEnv);
const key=process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
const cache=fileURLToPath(new URL('../.voice-agent.json',import.meta.url));
const config=agentConfig(process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM');
const configHash=createHash('sha256').update(JSON.stringify(config)).digest('hex');
let cached={},agentId=process.env.ELEVENLABS_AGENT_ID || '';
if(!agentId && existsSync(cache)){try{cached=JSON.parse(readFileSync(cache,'utf8'));agentId=cached.agentId || '';}catch{}}
let provisionPromise, upstreamActive=0;
const allowed=new Set(['http://localhost:4280','http://127.0.0.1:4280','http://localhost:4282','http://127.0.0.1:4282']);
for(const origin of (process.env.KP_ALLOWED_ORIGINS || '').split(',').map(value=>value.trim()).filter(Boolean)){
  try{const parsed=new URL(origin);if(parsed.origin===origin && ['http:','https:'].includes(parsed.protocol))allowed.add(origin);}catch{}
}
const requests=[];
async function upstream(path,body,method=body?'POST':'GET'){
  const response=await fetch(`https://api.elevenlabs.io/v1/${path}`,{method,headers:{'xi-api-key':key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  if(!response.ok){console.error(`ElevenLabs request failed: HTTP ${response.status}`);throw new Error(`ElevenLabs returned ${response.status}. Check key permissions, agent access and account credits.`);}
  return response.json();
}
async function ensureAgent(){
  if(agentId){
    if(!process.env.ELEVENLABS_AGENT_ID && cached.managedBy==='knowledgepulse-car' && cached.configHash!==configHash){
      await upstream(`convai/agents/${encodeURIComponent(agentId)}`,config,'PATCH');
      cached={agentId,managedBy:'knowledgepulse-car',configHash};writeFileSync(cache,JSON.stringify(cached,null,2),{mode:0o600});
    }
    return agentId;
  }
  if(!provisionPromise)provisionPromise=(async()=>{const created=await upstream('convai/agents/create',config);if(!created.agent_id)throw new Error('Agent creation returned no ID.');agentId=created.agent_id;cached={agentId,managedBy:'knowledgepulse-car',configHash};writeFileSync(cache,JSON.stringify(cached,null,2),{mode:0o600});console.log('Dedicated KnowledgePulse voice agent provisioned.');return agentId;})().finally(()=>{provisionPromise=null;});
  return provisionPromise;
}
const server=http.createServer(async(req,res)=>{
  try { if(await handleDocumentPreview(req,res)) return; }
  catch { res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'The isolated preview could not complete.'}));return; }
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  const origin=req.headers.origin;
  if(origin && !allowed.has(origin))return reply(403,{error:'Origin not allowed.'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);return res.end();}
  if(req.url==='/voice/status' && req.method==='GET')return reply(200,{available:Boolean(key),provider:'ElevenLabs',configuredAgent:Boolean(agentId),reason:key?null:'Add ELEVENLABS_API_KEY to the repository .env and restart the voice gateway.'});
  if(req.url!=='/voice/session' || req.method!=='POST')return reply(404,{error:'Not found.'});
  // Session minting is browser-only. No arbitrary provider request passthrough.
  if(!origin || !allowed.has(origin))return reply(403,{error:'A permitted browser origin is required.'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return reply(415,{error:'Use application/json.'});
  if(!key)return reply(503,{error:'ElevenLabs key is not configured.'});
  let size=0;try{for await(const chunk of req){size+=chunk.length;if(size>1024)return reply(413,{error:'Request is too large.'});}}catch{return reply(400,{error:'Invalid request.'});}
  const now=Date.now();while(requests.length && requests[0]<now-60000)requests.shift();
  if(requests.length>=8 || upstreamActive>=2)return reply(429,{error:'Voice is busy. Please try again in a moment.'});
  requests.push(now);upstreamActive++;
  try{const id=await ensureAgent();const result=await upstream(`convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`);if(!result.signed_url)throw new Error('No voice session was returned.');reply(200,{signedUrl:result.signed_url});}
  catch(error){reply(502,{error:error.name==='TimeoutError'?'Voice provider timed out. Please retry.':error.message});}
  finally{upstreamActive--;}
});
server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=75000;
server.listen(8002,'127.0.0.1',()=>console.log('KnowledgePulse voice gateway http://127.0.0.1:8002'));
