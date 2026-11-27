import http from 'node:http';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeWorkers} from './check-spin-worker-reuse.mjs';
const expected={health:'{"status":"ok"}',plaintext:'hello, world!',json:'{"message":"hello, world!"}',echo:'worker-proof'};
async function withServer(mode,life,fault,fn){
  const counts=new Map();
  const server=http.createServer(async(q,r)=>{
    const route=q.url.slice(1),i=counts.get(route)??0;
    counts.set(route,i+1);
    if(fault==='hang')return;
    const id=life==='pooled'?i%32:i;
    let body=expected[route];
    if(route==='echo'){
      const chunks=[];for await(const c of q)chunks.push(c);
      assert.equal(q.method,'POST');assert.equal(q.headers['content-type'],'application/octet-stream');
      body=Buffer.concat(chunks).toString();
    }else assert.equal(q.method,'GET');
    if(fault==='bad-body'&&route==='echo')body='wrong';
    r.writeHead(fault==='status'?503:200,{'X-Actor-Mode':mode,'X-Worker':(fault==='cross-route'?'all':route)+'-'+id,'X-Reused':life==='pooled'&&i>=32?'yes':'no'});
    r.end(body);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{await fn({port:server.address().port,timeout:fault==='hang'?40:2000});}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
for(const mode of ['shared','isolated'])for(const life of ['fresh','pooled'])test(mode+' '+life+' wire proof',async()=>{
  await withServer(mode,life,null,async opts=>{
    const {summary,samples}=await probeWorkers(mode,life,opts);
    assert.equal(samples.length,384);assert.equal(summary.routes.echo.distinct_workers,life==='pooled'?32:96);
    assert.equal(summary.routes.json.reused,life==='pooled'?64:0);
  });
});
for(const fault of ['hang','bad-body','cross-route','status'])test('reject '+fault,async()=>{
  await withServer('shared','pooled',fault,async opts=>assert.rejects(probeWorkers('shared','pooled',opts)));
});
