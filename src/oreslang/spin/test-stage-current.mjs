import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {renderCurrent,stageCurrent} from './stage-current.mjs';
const source=['import module spin from "../src/spin.atto";','define actor BenchmarkHandler as','request.set_header("X-Actor-Mode", "shared");','self.end(); // LIFECYCLE_END',...Array(4).fill('http.handler("BenchmarkHandler")/* POOL_SUFFIX */')].join('\n');
for(const mode of ['shared','isolated'])for(const life of ['fresh','pooled'])test(mode+' '+life,()=>{
  const result=renderCurrent(source,mode,life);
  assert.ok(result.includes('define '+(mode==='shared'?'actor':'isoactor')+' BenchmarkHandler as'));
  assert.ok(result.includes('"X-Actor-Mode", "'+mode+'"'));
  assert.equal(result.split('.pooled(32)').length-1,life==='pooled'?4:0);
  assert.equal(result.includes('self.end();'),life==='fresh');
  assert.ok(result.includes('"../src/spin.atto"'));
  assert.ok(!result.includes('POOL_SUFFIX')&&!result.includes('LIFECYCLE_END'));
});
for(const marker of ['define actor BenchmarkHandler as','"X-Actor-Mode", "shared"','self.end(); // LIFECYCLE_END','/* POOL_SUFFIX */'])test('reject missing or duplicated marker '+marker,()=>{
  assert.throws(()=>renderCurrent(source.replace(marker,''),'shared','fresh'));
  assert.throws(()=>renderCurrent(source+'\n'+marker,'shared','fresh'));
});
test('staging creates unique private directories and preserves unrelated file',()=>{
  const root=mkdtempSync(join(tmpdir(),'spin-stage-'));
  try{
    const existing=join(root,'benchmark-current-existing.atto');writeFileSync(existing,'preserve');
    const a=stageCurrent(source,root,'shared','fresh'),b=stageCurrent(source,root,'shared','pooled');
    assert.notEqual(dirname(a),dirname(b));assert.equal(dirname(dirname(a)),root);
    assert.equal(readFileSync(existing,'utf8'),'preserve');
    assert.equal(readFileSync(a,'utf8'),renderCurrent(source,'shared','fresh'));
    assert.equal(readFileSync(b,'utf8'),renderCurrent(source,'shared','pooled'));
    const before=readdirSync(root);assert.throws(()=>stageCurrent('invalid',root,'shared','fresh'));assert.deepEqual(readdirSync(root),before);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('invalid variant rejects before staging',()=>{
  assert.throws(()=>renderCurrent(source,'foreign','fresh'));assert.throws(()=>renderCurrent(source,'shared','unknown'));
});
