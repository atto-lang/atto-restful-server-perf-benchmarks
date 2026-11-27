// Sequential loopback HTTP benchmark. Smoke numbers are diagnostics, not rankings.
import {request,phase} from './http-speed-client.mjs';
import net from 'node:net';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {mkdirSync, openSync, closeSync, appendFileSync, writeFileSync, readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
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
const historicalTargets=Object.keys(targets);
targets['java-vertx']=['bash','src/java/vertx/run.sh'];
for(const mode of ['shared','isolated'])for(const life of ['fresh','pooled'])targets['spin-current-jvm-'+mode+'-'+life]=['bash','src/oreslang/spin/run-current.sh',mode,life];
const [profile, output, ...chosen] = process.argv.slice(2);
if (!['smoke','full'].includes(profile) || !output ||
    chosen.some(x => !Object.hasOwn(targets,x)) || new Set(chosen).size !== chosen.length) {
  throw Error('usage: node scripts/http-speed.mjs smoke|full NEW_OUTPUT_DIRECTORY [target ...]');
}
const selected = chosen.length ? chosen : historicalTargets;
if(selected.some(t=>t.startsWith('spin-current-'))&&selected.some(t=>t.startsWith('spin-legacy-')))throw Error('separate compiler pins require separate invocations');
const config = profile === 'smoke'
  ? {warmup: 1, duration: 2, trials: 1, concurrency: [1,8], reuse: [true]}
  : {warmup: 30, duration: 60, trials: 5, concurrency: [1,8,32,128], reuse: [true,false]};
if (process.platform !== 'linux' && process.platform !== 'darwin') throw Error('POSIX process groups required');
const dirty = execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();
if (dirty) throw Error('tracked benchmark source differs from HEAD');
const fixtureHash = createHash('sha256').update(readFileSync('contracts/conformance/cases.json')).digest('hex');
const root = resolve(output);
mkdirSync(root); // Never overwrite earlier measurements.
const sha = dir => execFileSync('git',['rev-parse','HEAD'],{cwd:dir,encoding:'utf8'}).trim();
const version = (cmd,args) => {
  try {const r=spawnSync(cmd,args,{encoding:'utf8',timeout:10000});return r.status===0 ? [r.stdout,r.stderr].filter(Boolean).join('\n').trim() : null;}
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
  java_home:process.env.JAVA_HOME ?? null, spin_pins:spinPins, contract_sha256:fixtureHash,
  java_tool_options:process.env.JAVA_TOOL_OPTIONS ?? null, gomaxprocs:process.env.GOMAXPROCS ?? null,
  node_options:process.env.NODE_OPTIONS ?? null,
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
async function occupied() {
  return new Promise((resolve,reject)=>{
    const socket=net.connect(8080,'127.0.0.1');
    socket.setTimeout(1000);
    socket.once('connect',()=>{socket.destroy();resolve(true);});
    socket.once('error',e=>e.code==='ECONNREFUSED'?resolve(false):reject(e));
    socket.once('timeout',()=>{socket.destroy();reject(Error('port check timeout'));});
  });
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
    if(receipt.passed!==true||receipt.checks!==36||receipt.failures.length||receipt.target!==target||receipt.contract_sha256!==fixtureHash)throw Error('incomplete HTTP conformance receipt');
    if(target.startsWith('spin-current-')){
      const proof=spawnSync('node',['scripts/check-spin-worker-reuse.mjs',target.includes('-isolated-')?'isolated':'shared',target.endsWith('-pooled')?'pooled':'fresh'],{encoding:'utf8',timeout:240000});
      writeFileSync(join(root,target+'.worker-reuse.log'),(proof.stdout??'')+'\n'+(proof.stderr??''));
      if(proof.error||proof.status!==0)throw Error('worker lifecycle proof failed');
      const evidence=JSON.parse(proof.stdout.trim());
      writeFileSync(join(root,target+'.worker-reuse.json'),JSON.stringify(evidence)+'\n');
      console.log(JSON.stringify(evidence.summary));
    }
    for(const s of scenarios)for(const reuse of config.reuse)for(const concurrency of config.concurrency)for(let trial=1;trial<=config.trials;trial++){
      if(child.exitCode!==null||child.signalCode!==null)throw Error('server stopped');
      const warmup=await phase(s,concurrency,config.warmup,reuse);
      const measured=await phase(s,concurrency,config.duration,reuse);
      const row={target,source_sha:environment.source_sha,scenario:s.id,concurrency,keep_alive:reuse,trial,
        startup_ms,warmup,measurement:measured,valid:warmup.valid&&measured.valid&&child.exitCode===null&&child.signalCode===null,
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
