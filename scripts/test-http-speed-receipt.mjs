import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateReceipt,profiles,targets} from './http-speed-receipt.mjs';
function fixture(){
  const env={source_sha:'a'.repeat(40),contract_sha256:'b'.repeat(64),profile:'smoke',config:structuredClone(profiles.smoke),selected:[...targets],ranking_eligible:false,spin_pins:{spin:'8f29b2f75f13beb3e03357e6b15839129c33d72b',compiler:'3f709fbf59abb2c13313725d2d648e6b560b17b8',routing:'41b2cbff35be3cb5dca7d33fe30c3892498f9b75'}};
  const phase=s=>({valid:true,requested_seconds:s,elapsed_seconds:s,requests_ok:10,requests_failed:0,histogram_overflow:0,errors:{},reused_requests:8,throughput_rps:10/s,latency_ms:{p50:1,p95:2,p99:3}});
  const rows=[];for(const target of targets)for(const scenario of ['plaintext','json','echo-1k'])for(const concurrency of [1,8])rows.push({target,scenario,concurrency,trial:1,keep_alive:true,profile:'smoke',source_sha:env.source_sha,contract_sha256:env.contract_sha256,valid:true,ranking_eligible:false,startup_ms:1,warmup:phase(1),measurement:phase(2)});
  return {env,rows};
}
test('complete matrix',()=>{const {env,rows}=fixture();assert.equal(validateReceipt(env,rows).trials,36);});
for(const [name,mutate] of [
 ['missing row',({rows})=>rows.pop()],
 ['duplicate row',({rows})=>rows.push(rows[0])],
 ['forged source',({rows})=>rows[0].source_sha='c'.repeat(40)],
 ['changed Spin pin',({env})=>env.spin_pins.routing='c'.repeat(40)],
 ['wrong contract',({rows})=>rows[0].contract_sha256='c'.repeat(64)],
 ['zero requests',({rows})=>rows[0].measurement.requests_ok=0],
 ['nonempty errors',({rows})=>rows[0].warmup.errors.timeout=1],
 ['wrong throughput',({rows})=>rows[0].measurement.throughput_rps=100],
 ['wrong reuse',({rows})=>rows[0].measurement.reused_requests=0],
 ['invalid latency',({rows})=>rows[0].measurement.latency_ms.p99=0],
 ['short phase',({rows})=>rows[0].measurement.elapsed_seconds=1],
 ['false ranking',({rows})=>rows[0].ranking_eligible=true],
 ['reduced profile',({env})=>env.config.duration=1],
 ['target omission',({env,rows})=>{env.selected.pop();rows.splice(-6);}],
])test(name,()=>{const f=fixture();mutate(f);assert.throws(()=>validateReceipt(f.env,f.rows));});
test('reference-only explicitly selected',()=>{const {env,rows}=fixture();env.selected=targets.slice(0,4);const subset=rows.filter(r=>env.selected.includes(r.target));assert.equal(validateReceipt(env,subset,{expectedTargets:env.selected}).trials,24);assert.throws(()=>validateReceipt(env,subset));});
