// Reject incomplete or internally inconsistent diagnostic evidence.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const targets = ['js-nodejs','golang-gin','rust-axum','erlang-otp','spin-legacy-jvm-shared','spin-legacy-jvm-isolated'];
export const profiles = {
  smoke:{warmup:1,duration:2,trials:1,concurrency:[1,8],reuse:[true]},
  full:{warmup:30,duration:60,trials:5,concurrency:[1,8,32,128],reuse:[true,false]},
};
const scenarios=['plaintext','json','echo-1k'];
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function checkPhase(p,seconds,reuse){
  ensure(p&&p.valid===true&&p.requested_seconds===seconds,'phase invalid or duration mismatch');
  ensure(finite(p.elapsed_seconds)&&p.elapsed_seconds>=seconds,'elapsed duration too short');
  ensure(Number.isSafeInteger(p.requests_ok)&&p.requests_ok>0&&p.requests_failed===0&&p.histogram_overflow===0,'request failure or invalid counts');
  ensure(p.errors&&Object.keys(p.errors).length===0,'nonempty error counts');
  ensure(Number.isSafeInteger(p.reused_requests)&&p.reused_requests<=p.requests_ok&&(reuse?p.reused_requests>0:p.reused_requests===0),'socket reuse mismatch');
  ensure(finite(p.throughput_rps)&&Math.abs(p.throughput_rps-p.requests_ok/p.elapsed_seconds)<=1e-6*Math.max(1,p.throughput_rps),'throughput arithmetic mismatch');
  const {p50,p95,p99}=p.latency_ms??{};
  ensure([p50,p95,p99].every(x=>finite(x)&&x>=0)&&p50<=p95&&p95<=p99,'invalid latency distribution');
}
export function validateReceipt(env,rows,{expectedTargets=targets,expectedSha,expectedContract}={}){
  ensure(env&&sha(env.source_sha)&&digest(env.contract_sha256)&&env.ranking_eligible===false,'invalid environment provenance');
  if(expectedSha!==undefined)ensure(env.source_sha===expectedSha,'source SHA mismatch');
  if(expectedContract!==undefined)ensure(env.contract_sha256===expectedContract,'contract SHA mismatch');
  ensure(Array.isArray(expectedTargets)&&expectedTargets.length>0&&new Set(expectedTargets).size===expectedTargets.length&&expectedTargets.every(t=>targets.includes(t)),'invalid expected targets');
  ensure(same(env.selected,expectedTargets),'target selection mismatch');
  const c=profiles[env.profile];ensure(c&&same(env.config,c),'profile/config mismatch');
  if(expectedTargets.some(t=>t.startsWith('spin-')))ensure(env.spin_pins?.spin==='8f29b2f75f13beb3e03357e6b15839129c33d72b'&&env.spin_pins?.compiler==='3f709fbf59abb2c13313725d2d648e6b560b17b8'&&env.spin_pins?.routing==='41b2cbff35be3cb5dca7d33fe30c3892498f9b75','historical Spin pin mismatch');
  const key=(t,s,n,k,i)=>JSON.stringify([t,s,n,k,i]);
  const remaining=new Set();
  for(const t of expectedTargets)for(const s of scenarios)for(const n of c.concurrency)for(const k of c.reuse)for(let i=1;i<=c.trials;i++)remaining.add(key(t,s,n,k,i));
  ensure(Array.isArray(rows),'trial rows missing');
  for(const r of rows){
    ensure(r&&r.valid===true&&r.ranking_eligible===false&&!r.status,'failed or ranking-eligible trial');
    ensure(r.source_sha===env.source_sha&&r.contract_sha256===env.contract_sha256&&r.profile===env.profile,'trial provenance mismatch');
    ensure(remaining.delete(key(r.target,r.scenario,r.concurrency,r.keep_alive,r.trial)),'unexpected or duplicate trial');
    ensure(finite(r.startup_ms)&&r.startup_ms>=0,'invalid startup timing');
    checkPhase(r.warmup,c.warmup,r.keep_alive);checkPhase(r.measurement,c.duration,r.keep_alive);
  }
  ensure(remaining.size===0,'missing trial rows');
  return {valid:true,profile:env.profile,targets:expectedTargets.length,trials:rows.length,ranking_eligible:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [dir,expectedSha,expectedContract,...selected]=process.argv.slice(2);
  ensure(dir&&sha(expectedSha)&&digest(expectedContract),'usage: node http-speed-receipt.mjs DIRECTORY EXPECTED_SHA CONTRACT_SHA [target ...]');
  const env=JSON.parse(readFileSync(join(dir,'environment.json'),'utf8'));
  const rows=readFileSync(join(dir,'trials.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  console.log(JSON.stringify(validateReceipt(env,rows,{expectedSha,expectedContract,expectedTargets:selected.length?selected:targets})));
}
