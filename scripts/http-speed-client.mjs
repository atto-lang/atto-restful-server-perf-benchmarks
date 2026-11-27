import http from 'node:http';
import {performance} from 'node:perf_hooks';
const mime = v => String(v??'').split(';').map(x=>x.trim().toLowerCase()).join(';');
export function request(s,agent,{port=8080,timeout=10000}={}) {
  return new Promise((resolve) => {
    const start=performance.now();
    let settled=false, timer;
    const finish=(error)=>{if(!settled){settled=true;clearTimeout(timer);resolve({error,ms:performance.now()-start,reused:req.reusedSocket===true});}};
    const req=http.request({hostname:'127.0.0.1',port,path:s.path,method:s.method,agent,
      headers:{'Accept-Encoding':'identity',...(s.body?{'Content-Type':'application/octet-stream','Content-Length':s.body.length}:{})}},res=>{
      let size=0;const chunks=[];
      const reject=error=>{finish(error);res.destroy();};
      if(res.statusCode!==200)return reject('http_'+res.statusCode);
      if(res.httpVersion!=='1.1'||mime(res.headers['content-type'])!==mime(s.type))return reject('protocol_or_type');
      if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')return reject('content_encoding');
      if(res.headers['content-length']!==undefined&&res.headers['content-length']!==String(s.expected.length))return reject('body_size');
      res.on('data',chunk=>{size+=chunk.length;if(size>s.expected.length)reject('body_size');else chunks.push(chunk);});
      res.on('error',()=>finish('response_error'));
      res.on('aborted',()=>finish('aborted'));
      res.on('end',()=>finish(Buffer.concat(chunks).equals(s.expected)?null:'body_mismatch'));
    });
    req.on('error',()=>finish('socket_error'));
    timer=setTimeout(()=>{finish('timeout');req.destroy();},timeout);
    req.end(s.body);
  });
}
export async function phase(s,concurrency,seconds,reuse,options={}) {
  if(!Number.isInteger(concurrency)||concurrency<1||!Number.isFinite(seconds)||seconds<=0)throw Error('invalid phase limits');
  const agent=reuse?new http.Agent({keepAlive:true,maxSockets:concurrency,maxFreeSockets:concurrency}):false;
  const hist=new Uint32Array(100001);
  const errors={};let ok=0,overflow=0,reused=0;
  const start=performance.now(),deadline=start+seconds*1000;
  try {
    await Promise.all(Array.from({length:concurrency},async()=>{
      while(performance.now()<deadline){
        const result=await request(s,agent,options);
        if(result.error)errors[result.error]=(errors[result.error]??0)+1;
        else {ok++;if(result.reused)reused++;const bucket=Math.ceil(result.ms*10);if(bucket>=hist.length)overflow++;else hist[bucket]++;}
      }
    }));
  } finally {if(agent)agent.destroy();}
  const elapsed=(performance.now()-start)/1000;
  const quantile=p=>{if(!ok)return null;let count=0;for(let i=0;i<hist.length;i++){count+=hist[i];if(count>=Math.ceil(ok*p))return i/10;}return null;};
  const failed=Object.values(errors).reduce((a,b)=>a+b,0);
  return {requested_seconds:seconds,elapsed_seconds:elapsed,requests_ok:ok,requests_failed:failed,
    errors,throughput_rps:ok/elapsed,latency_ms:{p50:quantile(.5),p95:quantile(.95),p99:quantile(.99)},
    histogram_overflow:overflow,reused_requests:reused,valid:ok>0&&failed===0&&overflow===0&&(reuse?reused>0:reused===0)};
}
