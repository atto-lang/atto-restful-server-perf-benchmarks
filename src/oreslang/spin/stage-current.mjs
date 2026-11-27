import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

export function renderCurrent(source, mode, lifecycle) {
  assert.ok(['shared','isolated'].includes(mode));
  assert.ok(['fresh','pooled'].includes(lifecycle));
  const replace = (text, marker, value, count) => {
    assert.equal(text.split(marker).length-1,count,'unexpected marker count: '+marker);
    return text.replaceAll(marker,value);
  };
  let body=replace(source,'define actor BenchmarkHandler as',mode==='shared'?'define actor BenchmarkHandler as':'define isoactor BenchmarkHandler as',1);
  body=replace(body,'"X-Actor-Mode", "shared"','"X-Actor-Mode", "'+mode+'"',1);
  body=replace(body,'/* POOL_SUFFIX */',lifecycle==='pooled'?'.pooled(32)':'',4);
  return replace(body,'self.end(); // LIFECYCLE_END',lifecycle==='pooled'?'// Reuse actor after response.':'self.end();',1);
}

export function stageCurrent(source, spinRoot, mode, lifecycle) {
  const rendered=renderCurrent(source,mode,lifecycle);
  const dir=mkdtempSync(join(spinRoot,'benchmark-current-'));
  const file=join(dir,'server.atto');
  try {writeFileSync(file,rendered,{flag:'wx',mode:0o600});return file;}
  catch(error){rmSync(dir,{recursive:true,force:true});throw error;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [src,spinRoot,mode,lifecycle]=process.argv.slice(2);
  console.log(stageCurrent(readFileSync(src,'utf8'),spinRoot,mode,lifecycle));
}
