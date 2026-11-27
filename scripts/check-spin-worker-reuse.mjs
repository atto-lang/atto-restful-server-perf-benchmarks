import http from 'node:http';
import assert from 'node:assert/strict';
import {routes,summarizeWorkers} from './spin-worker-proof.mjs';
const [mode,lifecycle]=process.argv.slice(2);
assert.ok(['shared','isolated'].includes(mode)&&['fresh','pooled'].includes(lifecycle));
const agent=new http.Agent({keepAlive:true,maxSockets:1}), samples=[];
const expected={health:'{"status":"ok"}',plaintext:'hello, world!',json:'{"message":"hello, world!"}',echo:'worker-proof'};
try{
  for(const route of routes)for(let i=0;i<96;i++){
    const r=await new Promise((resolve,reject)=>{
      const payload=route==='echo'?Buffer.from(expected.echo):undefined;
      const q=http.request({host:'127.0.0.1',port:8080,path:'/'+route,method:payload?'POST':'GET',agent,headers:payload?{'Content-Type':'application/octet-stream','Content-Length':payload.length}:{}},res=>{
        let body='';res.setEncoding('utf8');res.on('data',x=>{body+=x;if(body.length>64)q.destroy(Error('oversized response'));});
        res.on('error',reject);res.on('aborted',()=>reject(Error('aborted')));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
      });
      const deadline=setTimeout(()=>q.destroy(Error('deadline')),5000);q.once('close',()=>clearTimeout(deadline));q.on('error',reject);q.end(payload);
    });
    assert.equal(r.status,200);assert.equal(r.body,expected[route]);
    samples.push({route,mode:r.headers['x-actor-mode'],id:r.headers['x-worker'],flag:r.headers['x-reused']});
  }
  console.log(JSON.stringify({summary:summarizeWorkers(samples,mode,lifecycle),samples}));
}finally{agent.destroy();}
