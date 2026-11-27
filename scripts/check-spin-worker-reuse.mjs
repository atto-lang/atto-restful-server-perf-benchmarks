import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {routes,summarizeWorkers} from './spin-worker-proof.mjs';
export async function probeWorkers(mode,lifecycle,{port=8080,timeout=5000}={}){
  assert.ok(['shared','isolated'].includes(mode)&&['fresh','pooled'].includes(lifecycle));
  const agent=new http.Agent({keepAlive:true,maxSockets:1}),samples=[];
  const expected={health:'{"status":"ok"}',plaintext:'hello, world!',json:'{"message":"hello, world!"}',echo:'worker-proof'};
  try{
    for(const route of routes)for(let i=0;i<96;i++){
      const r=await new Promise((resolve,reject)=>{
        const payload=route==='echo'?Buffer.from(expected.echo):undefined;
        let timer,settled=false;
        const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value);};
        const q=http.request({host:'127.0.0.1',port,path:'/'+route,method:payload?'POST':'GET',agent,headers:payload?{'Content-Type':'application/octet-stream','Content-Length':payload.length}:{}},res=>{
          let body='';res.setEncoding('utf8');res.on('data',x=>{body+=x;if(body.length>64)q.destroy(Error('oversized response'));});
          res.on('error',finish);res.on('aborted',()=>finish(Error('aborted')));res.on('end',()=>finish(null,{status:res.statusCode,headers:res.headers,body}));
        });
        timer=setTimeout(()=>{finish(Error('deadline'));q.destroy();},timeout);
        q.on('error',finish);q.end(payload);
      });
      assert.equal(r.status,200);assert.equal(r.body,expected[route]);
      samples.push({route,mode:r.headers['x-actor-mode'],id:r.headers['x-worker'],flag:r.headers['x-reused']});
    }
    return {summary:summarizeWorkers(samples,mode,lifecycle),samples};
  }finally{agent.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  console.log(JSON.stringify(await probeWorkers(...process.argv.slice(2))));
}
