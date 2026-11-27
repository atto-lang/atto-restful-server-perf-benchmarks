// Node transport regression only; no guest or performance claim.
import http from 'node:http';
import assert from 'node:assert/strict';
const server=http.createServer((q,r)=>r.end('ok'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
function request(agent){return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,agent},res=>{
    res.resume();res.on('end',()=>resolve(req.reusedSocket===true));
  });
  req.on('error',reject);req.end();
});}
try {
  for(const c of [1,8])for(const reuse of [true,false]){
    const agent=reuse?new http.Agent({keepAlive:true,maxSockets:c,maxFreeSockets:c}):false;
    let hits=0;
    await Promise.all(Array.from({length:c},async()=>{
      for(let i=0;i<25;i++)if(await request(agent))hits++;
    }));
    if(agent)agent.destroy();
    assert.equal(hits>0,reuse);
    console.log(JSON.stringify({concurrency:c,keep_alive:reuse,requests:c*25,reused:hits,pass:true}));
  }
} finally {server.close();}
