import http from 'node:http';
import assert from 'node:assert/strict';
const [mode,lifecycle]=process.argv.slice(2);
assert.ok(['shared','isolated'].includes(mode)&&['fresh','pooled'].includes(lifecycle));
const agent=new http.Agent({keepAlive:true,maxSockets:1});
const seen=new Set();let reused=0;
try{
  for(let i=0;i<96;i++){
    const r=await new Promise((resolve,reject)=>{
      const q=http.get({host:'127.0.0.1',port:8080,path:'/plaintext',agent},res=>{
        let body='';res.setEncoding('utf8');res.on('data',x=>{body+=x;if(body.length>64)q.destroy(Error('oversized response'));});
        res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
      });q.setTimeout(5000,()=>q.destroy(Error('timeout')));q.on('error',reject);
    });
    assert.equal(r.status,200);assert.equal(r.body,'hello, world!');assert.equal(r.headers['x-actor-mode'],mode);
    const id=r.headers['x-worker'], flag=r.headers['x-reused'];
    assert.ok(typeof id==='string'&&id.length>0&&id.length<=256);assert.ok(['yes','no'].includes(flag));
    if(lifecycle==='fresh'){assert.equal(flag,'no');assert.ok(!seen.has(id));}
    if(flag==='yes')reused++;
    seen.add(id);
  }
  if(lifecycle==='pooled'){assert.ok(seen.size<=32);assert.ok(reused>0);}
  console.log(JSON.stringify({mode,lifecycle,requests:96,distinct_workers:seen.size,reused,valid:true}));
}finally{agent.destroy();}
