import assert from 'node:assert/strict';
export const routes=['health','plaintext','json','echo'];
export function summarizeWorkers(samples,mode,lifecycle){
  assert.ok(['shared','isolated'].includes(mode));
  assert.ok(['fresh','pooled'].includes(lifecycle));
  assert.equal(samples.length,384);
  const global=new Set(), summaries={};
  for(const route of routes){
    const rows=samples.filter(s=>s.route===route), seen=new Set();let reused=0;
    assert.equal(rows.length,96);
    for(const s of rows){
      assert.equal(s.mode,mode);assert.ok(typeof s.id==='string'&&s.id.length>0&&s.id.length<=256);
      assert.ok(['yes','no'].includes(s.flag));
      if(seen.has(s.id))assert.equal(s.flag,'yes','repeat identity must indicate reuse');
      else assert.ok(!global.has(s.id),'worker identity crossed route pools');
      if(lifecycle==='fresh'){assert.equal(s.flag,'no');assert.ok(!seen.has(s.id));}
      if(s.flag==='yes')reused++;
      seen.add(s.id);global.add(s.id);
    }
    if(lifecycle==='pooled'){assert.ok(seen.size<=32);assert.ok(reused>=96-seen.size);}
    summaries[route]={requests:96,distinct_workers:seen.size,reused};
  }
  return {mode,lifecycle,requests:384,routes:summaries,valid:true};
}
