// Sequential loopback HTTP benchmark. Smoke numbers are diagnostics, not rankings.
import http from 'node:http';
import net from 'node:net';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {mkdirSync, openSync, closeSync, appendFileSync, writeFileSync, readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {setTimeout as sleep} from 'node:timers/promises';

const targets = {
  'js-nodejs': ['node','src/js/nodejs/server.mjs'],
  'golang-gin': ['./src/golang/gin/server'],
  'rust-axum': ['./src/rust/axum/target/release/oreslang-benchmark-axum'],
  'erlang-otp': ['bash','src/erlang/otp/run.sh'],
  'spin-legacy-jvm-shared': ['bash','src/oreslang/spin/run.sh','shared'],
  'spin-legacy-jvm-isolated': ['bash','src/oreslang/spin/run.sh','isolated'],
};
const [profile, output, ...chosen] = process.argv.slice(2);
if (!['smoke','full'].includes(profile) || !output ||
    chosen.some(x => !Object.hasOwn(targets,x)) || new Set(chosen).size !== chosen.length) {
  throw Error('usage: node scripts/http-speed.mjs smoke|full NEW_OUTPUT_DIRECTORY [target ...]');
}
const selected = chosen.length ? chosen : Object.keys(targets);
const config = profile === 'smoke'
  ? {warmup: 1, duration: 2, trials: 1, concurrency: [1,8], reuse: [true]}
  : {warmup: 30, duration: 60, trials: 5, concurrency: [1,8,32,128], reuse: [true,false]};
const root = resolve(output);
mkdirSync(root); // Never overwrite earlier measurements.
const sha = dir => execFileSync('git',['rev-parse','HEAD'],{cwd:dir,encoding:'utf8'}).trim();
const version = (cmd,args) => {
  try {return execFileSync(cmd,args,{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();}
  catch {return null;}
};
const spinDir = process.env.ORESLANG_SPIN_DIR;
const compilerDir = process.env.ORESLANG_SOURCE_DIR;
const spinPins = spinDir && compilerDir ? {
  spin:sha(spinDir), compiler:sha(compilerDir),
  routing:sha(join(spinDir,'dependencies/http-routing'))
} : null;
const environment = {source_sha:sha('.'), profile, config, selected,
  os:os.platform(), kernel:os.release(), arch:os.arch(), cpu:os.cpus()[0]?.model,
  logical_cpus:os.cpus().length, available_parallelism:os.availableParallelism(),
  ram_bytes:os.totalmem(), node:process.version, go:version('go',['version']),
  rust:version('rustc',['-V']), erlang:version('erl',['-noshell','-eval','io:format("~s", [erlang:system_info(otp_release)]), halt().']),
  java:version('java',['-XshowSettings:properties','-version']),
  java_home:process.env.JAVA_HOME ?? null, spin_pins:spinPins,
  ci:process.env.GITHUB_RUN_ID ?? null, topology:'single-host loopback; client shares CPU with server',
  latency_model:'closed-loop; one outstanding request per worker; coordinated omission possible',
  cpu_rss:'not sampled in this initial runner', ranking_eligible:false};
writeFileSync(join(root,'environment.json'),JSON.stringify(environment,null,2)+'\n');
const raw=join(root,'trials.jsonl');
writeFileSync(raw,'',{flag:'wx'});
const scenarios = [
  {id:'plaintext',path:'/plaintext',method:'GET',type:'text/plain; charset=utf-8',expected:Buffer.from('hello, world!')},
  {id:'json',path:'/json',method:'GET',type:'application/json',expected:Buffer.from('{"message":"hello, world!"}')},
  {id:'echo-1k',path:'/echo',method:'POST',type:'application/octet-stream',body:Buffer.from(Array.from({length:1024},(_,i)=>i%256))},
];
scenarios[2].expected=scenarios[2].body;
const health={path:'/health',method:'GET',type:'application/json',expected:Buffer.from('{"status":"ok"}')};
const mime = v => String(v??'').split(';').map(x=>x.trim().toLowerCase()).join(';');
function request(s,agent) {
  return new Promise((resolve) => {
    const start=performance.now();
    let settled=false;
    let timer;
    const finish=(error)=>{if(!settled){settled=true;clearTimeout(timer);resolve({error,ms:performance.now()-start});}};
    const req=http.request({hostname:'127.0.0.1',port:8080,path:s.path,method:s.method,agent,
      headers:{'Accept-Encoding':'identity',...(s.body?{'Content-Type':'application/octet-stream','Content-Length':s.body.length}:{})}},
    res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>s.expected.length){finish('body_size');res.destroy();}else chunks.push(chunk);});
      res.on('error',()=>finish('response_error'));
      res.on('aborted',()=>finish('aborted'));
      res.on('end',()=>{
        if(res.statusCode!==200) return finish('http_'+res.statusCode);
        if(res.httpVersion!=='1.1'||mime(res.headers['content-type'])!==mime(s.type)) return finish('protocol_or_type');
        if(!Buffer.concat(chunks).equals(s.expected)) return finish('body_mismatch');
        finish(null);
      });
    });
    req.on('error',()=>finish('socket_error'));
    timer=setTimeout(()=>{finish('timeout');req.destroy();},10000);
    req.end(s.body);
  });
}
async function occupied() {
  return new Promise((resolve,reject)=>{
    const socket=net.connect(8080,'127.0.0.1');
    socket.setTimeout(1000);
    socket.once('connect',()=>{socket.destroy();resolve(true);});
    socket.once('error',e=>e.code==='ECONNREFUSED'?resolve(false):reject(e));
    socket.once('timeout',()=>{socket.destroy();reject(Error('port check timeout'));});
  });
}
async function phase(s, concurrency, seconds, reuse) {
  const agent=new http.Agent({keepAlive:reuse,maxSockets:concurrency,maxFreeSockets:concurrency});
  // 0.1 ms histogram, bounded at the request timeout (overflow reported).
  const hist=new Uint32Array(100001);
  const errors={}; let ok=0, overflow=0;
  const start=performance.now(), deadline=start+seconds*1000;
  try {
    await Promise.all(Array.from({length:concurrency},async()=>{
      while(performance.now()<deadline){
        const result=await request(s,agent);
        if(result.error) errors[result.error]=(errors[result.error]??0)+1;
        else {ok++;const bucket=Math.ceil(result.ms*10);if(bucket>=hist.length)overflow++;else hist[bucket]++;}
      }
    }));
  } finally {agent.destroy();}
  const elapsed=(performance.now()-start)/1000;
  const quantile=p=>{
    if(!ok)return null;
    let count=0;for(let i=0;i<hist.length;i++){count+=hist[i];if(count>=Math.ceil(ok*p))return i/10;}
    return null;
  };
  const failed=Object.values(errors).reduce((a,b)=>a+b,0);
  return {requested_seconds:seconds,elapsed_seconds:elapsed,requests_ok:ok,requests_failed:failed,
    errors,throughput_rps:ok/elapsed,latency_ms:{p50:quantile(.5),p95:quantile(.95),p99:quantile(.99)},
    histogram_overflow:overflow,valid:ok>0&&failed===0&&overflow===0};
}
let active=null;
function signalGroup(child,signal) {
  if(!child?.pid)return;
  try {process.kill(-child.pid,signal);} catch(e){if(e.code!=='ESRCH')throw e;}
}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{signalGroup(active,'SIGKILL');process.exit(128+(sig==='SIGINT'?2:15));});
let failed=false;
for(const target of selected){
  let child, log, spawnError;
  try{
    if(await occupied())throw Error('port 8080 already occupied');
    log=openSync(join(root,target+'.server.log'),'wx');
    const [cmd,...args]=targets[target];
    const start=performance.now();
    child=spawn(cmd,args,{detached:true,env:{...process.env,HOST:'127.0.0.1',PORT:'8080'},stdio:['ignore',log,log]});
    active=child;
    child.on('error',e=>{spawnError=e;});
    const deadline=start+45000;
    let ready=false;
    while(performance.now()<deadline){
      if(spawnError || child.exitCode!==null || child.signalCode!==null)throw Error('server exited before readiness: '+(spawnError??child.exitCode??child.signalCode));
      if(!(await request(health,false)).error){ready=true;break;}
      await sleep(150);
    }
    if(!ready)throw Error('readiness timeout');
    const startup_ms=performance.now()-start;
    const conformance=spawnSync('python3',['scripts/conformance.py','--target',target],{encoding:'utf8',timeout:180000});
    writeFileSync(join(root,target+'.conformance.log'),(conformance.stdout??'')+'\n'+(conformance.stderr??''));
    if(conformance.error || conformance.status!==0)throw Error('HTTP conformance failed');
    const receipt=JSON.parse(conformance.stdout.trim());
    if(receipt.passed!==true||receipt.checks!==36||receipt.failures.length)throw Error('incomplete HTTP conformance receipt');
    for(const s of scenarios)for(const reuse of config.reuse)for(const concurrency of config.concurrency)for(let trial=1;trial<=config.trials;trial++){
      if(child.exitCode!==null||child.signalCode!==null)throw Error('server stopped');
      const warmup=await phase(s,concurrency,config.warmup,reuse);
      const measured=await phase(s,concurrency,config.duration,reuse);
      const row={target,source_sha:environment.source_sha,scenario:s.id,concurrency,keep_alive:reuse,trial,
        startup_ms,warmup,measurement:measured,valid:warmup.valid&&measured.valid,
        contract_sha256:receipt.contract_sha256,profile,ranking_eligible:false};
      appendFileSync(raw,JSON.stringify(row)+'\n');
      console.log(JSON.stringify(row));
      if(!row.valid)failed=true;
    }
  }catch(e){failed=true;appendFileSync(raw,JSON.stringify({target,status:'failed',error:String(e),valid:false})+'\n');console.error(target,e);}
  finally{
    if(child){signalGroup(child,'SIGTERM');await sleep(1000);signalGroup(child,'SIGKILL');}
    active=null;if(log!==undefined)closeSync(log);
  }
}
if(failed)process.exitCode=1;
