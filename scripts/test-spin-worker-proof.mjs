import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routes,summarizeWorkers} from './spin-worker-proof.mjs';
const fixture=(life='pooled')=>routes.flatMap(route=>Array.from({length:96},(_,i)=>({route,mode:'shared',id:route+'-'+(life==='pooled'?i%32:i),flag:life==='pooled'&&i>=32?'yes':'no'})));
test('pooled proof all routes',()=>assert.equal(summarizeWorkers(fixture(),'shared','pooled').routes.echo.reused,64));
test('fresh proof all routes',()=>assert.equal(summarizeWorkers(fixture('fresh'),'shared','fresh').routes.json.distinct_workers,96));
for(const [name,mutate] of [
  ['missing sample',s=>s.pop()],['wrong route',s=>s[0].route='missing'],['wrong mode',s=>s[0].mode='isolated'],['repeat denies reuse',s=>s[32].flag='no'],['cross-route identity',s=>s[96].id=s[0].id],['pool over capacity',s=>s[32].id='extra'],['missing id',s=>s[0].id=''],['bad flag',s=>s[0].flag='maybe'],
])test(name,()=>{const s=fixture();mutate(s);assert.throws(()=>summarizeWorkers(s,'shared','pooled'));});
test('fresh rejects reused worker',()=>assert.throws(()=>summarizeWorkers(fixture(),'shared','fresh')));
