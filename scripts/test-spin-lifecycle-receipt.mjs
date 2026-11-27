import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateReceipt,profiles,currentTargets,comparisonTargets} from './http-speed-receipt.mjs';
import {routes,summarizeWorkers} from './spin-worker-proof.mjs';
function fixture(){
  const env={source_sha:'a'.repeat(40),contract_sha256:'b'.repeat(64),profile:'smoke',config:structuredClone(profiles.smoke),selected:[...currentTargets],ranking_eligible:false,spin_pins:{spin:'66662e7b8977283c357bcc7c21601547953baa49',compiler:'e6098659c2e1641564bb5835b4dbb92a6a00b1a8',routing:'4c28fe37178f52ebe4bd504d608ff42215f1ec48'}};
  const phase=s=>({valid:true,requested_seconds:s,elapsed_seconds:s,requests_ok:10,requests_failed:0,histogram_overflow:0,errors:{},reused_requests:8,throughput_rps:10/s,latency_ms:{p50:1,p95:2,p99:3}});
  const rows=[],workerProofs={};
  for(const target of currentTargets){
    const mode=target.includes('-isolated-')?'isolated':'shared',life=target.endsWith('-pooled')?'pooled':'fresh';
    const samples=routes.flatMap(route=>Array.from({length:96},(_,i)=>({route,mode,id:route+'-'+(life==='pooled'?i%32:i),flag:life==='pooled'&&i>=32?'yes':'no'})));
    workerProofs[target]={samples,summary:summarizeWorkers(samples,mode,life)};
    for(const scenario of ['plaintext','json','echo-1k'])for(const concurrency of [1,8])rows.push({target,scenario,concurrency,trial:1,keep_alive:true,profile:'smoke',source_sha:env.source_sha,contract_sha256:env.contract_sha256,valid:true,ranking_eligible:false,startup_ms:1,warmup:phase(1),measurement:phase(2)});
  }
  return {env,rows,options:{expectedTargets:[...currentTargets],expectedSha:env.source_sha,expectedContract:env.contract_sha256,workerProofs}};
}
const accept=f=>validateReceipt(f.env,f.rows,f.options);
test('complete current paired lifecycle receipt',()=>assert.equal(accept(fixture()).trials,24));
const pooled=currentTargets[1], fresh=currentTargets[0];
for(const [name,mutate] of [
 ['missing worker proof',f=>delete f.options.workerProofs[pooled]],
 ['truncated samples',f=>f.options.workerProofs[pooled].samples.pop()],
 ['forged summary',f=>f.options.workerProofs[pooled].summary.routes.echo.reused=0],
 ['wrong lifecycle',f=>f.options.workerProofs[pooled]=f.options.workerProofs[fresh]],
 ['wrong actor mode',f=>f.options.workerProofs[pooled].samples[0].mode='isolated'],
 ['reused identity falsely marked fresh',f=>f.options.workerProofs[pooled].samples[32].flag='no'],
 ['cross-route identity',f=>f.options.workerProofs[pooled].samples[96].id=f.options.workerProofs[pooled].samples[0].id],
 ['wrong compiler pin',f=>f.env.spin_pins.compiler='c'.repeat(40)],
 ['missing timed trial',f=>f.rows.pop()],
 ['wrong contract digest',f=>f.options.expectedContract='c'.repeat(64)],
 ['wrong source head',f=>f.options.expectedSha='c'.repeat(40)],
])test(name,()=>{const f=fixture();mutate(f);assert.throws(()=>accept(f));});

function comparison(){
  const f=fixture(),selected=[...comparisonTargets];
  const spinRows=f.rows.filter(r=>selected.includes(r.target));
  const template=spinRows.filter(r=>r.target===comparisonTargets[4]);
  f.rows=[...selected.slice(0,4).flatMap(target=>template.map(r=>({...structuredClone(r),target}))),...spinRows];
  f.env.selected=selected;f.options.expectedTargets=selected;
  return f;
}
test('same-host five-language comparison with two pooled Spin modes',()=>assert.equal(accept(comparison()).trials,36));
test('comparison rejects omission of Java reference',()=>{const f=comparison();f.rows=f.rows.filter(r=>r.target!=='java-vertx');assert.throws(()=>accept(f));});
test('comparison rejects omission of pooled identity proof',()=>{const f=comparison();delete f.options.workerProofs[comparisonTargets[5]];assert.throws(()=>accept(f));});
test('historical defaults unchanged and extra Java target is explicit',()=>{const f=comparison();assert.throws(()=>validateReceipt(f.env,f.rows));});
