import http from 'node:http';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {request,phase} from './http-speed-client.mjs';
const s={path:'/',method:'GET',type:'text/plain',expected:Buffer.from('ok')};
async function withServer(handler,fn){
  const server=http.createServer(handler);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {await fn({port:server.address().port,timeout:1000});}
  finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
}
const send=(req,res)=>{res.setHeader('Content-Type','text/plain');res.end('ok');};
for(const concurrency of [1,8])for(const reuse of [true,false])test(`phase c=${concurrency} reuse=${reuse}`,async()=>{
  await withServer(send,async options=>{
    const r=await phase(s,concurrency,.2,reuse,options);
    assert.equal(r.valid,true);assert.equal(r.requests_failed,0);assert.ok(r.requests_ok>0);
    assert.equal(r.reused_requests>0,reuse);assert.ok(r.latency_ms.p99>=r.latency_ms.p50);
  });
});
for(const [name,status,headers,body,error] of [
  ['status',503,{'Content-Type':'text/plain'},'ok','http_503'],
  ['type',200,{'Content-Type':'application/json'},'ok','protocol_or_type'],
  ['bytes',200,{'Content-Type':'text/plain'},'no','body_mismatch'],
  ['size',200,{'Content-Type':'text/plain'},'long','body_size'],
  ['encoding',200,{'Content-Type':'text/plain','Content-Encoding':'gzip'},'ok','content_encoding'],
])test(name,async()=>{
  await withServer((q,r)=>{r.writeHead(status,headers);r.end(body);},async options=>assert.equal((await request(s,false,options)).error,error));
});
test('timeout settles and counts as failed',async()=>{
  await withServer(()=>{},async options=>{
    assert.equal((await request(s,false,{...options,timeout:30})).error,'timeout');
    const r=await phase(s,1,.1,false,{...options,timeout:30});
    assert.equal(r.valid,false);assert.equal(r.requests_ok,0);assert.ok(r.errors.timeout>0);assert.equal(r.latency_ms.p99,null);
  });
});
test('keepalive refusal invalidates persistent phase',async()=>{
  await withServer((q,r)=>{r.setHeader('Connection','close');send(q,r);},async options=>{
    const r=await phase(s,1,.2,true,options);assert.ok(r.requests_ok>0);assert.equal(r.reused_requests,0);assert.equal(r.valid,false);
  });
});
test('invalid phase inputs rejected',async()=>{
  await assert.rejects(phase(s,0,1,false));await assert.rejects(phase(s,1,0,false));
});
