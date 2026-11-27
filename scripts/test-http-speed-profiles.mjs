import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profiles,profileConfig,timedSeconds} from './http-speed-profiles.mjs';
test('historical smoke and full profiles unchanged',()=>{
  assert.deepEqual(profileConfig('smoke'),{warmup:1,duration:2,trials:1,concurrency:[1,8],reuse:[true]});
  assert.deepEqual(profileConfig('full'),{warmup:30,duration:60,trials:5,concurrency:[1,8,32,128],reuse:[true,false]});
});
test('steady profile uses longer warmup and independent repeated phases',()=>{
  assert.deepEqual(profileConfig('steady'),{warmup:10,duration:10,trials:2,concurrency:[8,32],reuse:[true]});
  assert.equal(timedSeconds('steady',6),1440);
});
test('six target smoke and full timing budgets are explicit',()=>{
  assert.equal(timedSeconds('smoke',6),108);
  assert.equal(timedSeconds('full',6),64800);
});
test('configuration mutations never alter canonical profile',()=>{
  const copy=profileConfig('steady');copy.concurrency.push(128);copy.duration=1;
  assert.deepEqual(profiles.steady.concurrency,[8,32]);assert.equal(profiles.steady.duration,10);
});
test('unknown names including inherited keys fail closed',()=>{
  for(const name of ['unknown','constructor','__proto__'])assert.throws(()=>profileConfig(name));
});
test('invalid or unsafe matrix sizes fail closed',()=>{
  for(const n of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>timedSeconds('steady',n));
  assert.throws(()=>timedSeconds('steady',6,0));
});
