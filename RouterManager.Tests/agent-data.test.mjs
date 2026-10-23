import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {parseQuota,parseAgyModels,codexModels,rpcRead,query} from '../RouterManager.App/Assets/agent-data.mjs';

test('quota uses all buckets, calculates remaining and handles missing windows',()=>{
  const r=parseQuota({rateLimits:{primary:{usedPercent:99}},rateLimitsByLimitId:{a:{primary:{usedPercent:20,windowDurationMins:300,resetsAt:123}},b:{secondary:{usedPercent:105,windowDurationMins:10080}}}});
  assert.equal(r.windows.length,2);assert.equal(r.windows[0].remainingPercent,80);assert.equal(r.windows[1].remainingPercent,0);
  assert.equal(parseQuota({rateLimits:{primary:{usedPercent:null}}}).status,'unavailable');
  assert.equal(parseQuota({}).windows.length,0);
});
test('model lists read existing catalogs and CLI TSV without manufacturing IDs',()=>{
  assert.deepEqual(parseAgyModels('Fetching available models...\nmodel-a\tReadable Name\n').map(m=>m.id),['model-a']);
  assert.deepEqual(codexModels({models:[{slug:'a',display_name:'A',visibility:'list'},{slug:'hidden',visibility:'hide'}]}).map(m=>m.id),['a']);
});
test('unsupported agents have no fabricated zero balance',async()=>{
  const r=await query({backend:'antigravity',action:'quota'});
  assert.equal(r.status,'unsupported');assert.deepEqual(r.windows,[]);
});
test('Codex discovery performs initialize handshake and paginates read-only model list',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'router-rpc-test-'));
  try{
    const fake=path.join(root,'rpc.mjs');
    fs.writeFileSync(fake,`import readline from 'node:readline';let ready=false,ack=false;
      readline.createInterface({input:process.stdin}).on('line',line=>{const q=JSON.parse(line);
      if(q.method==='initialize'){ready=true;console.log(JSON.stringify({id:q.id,result:{}}));return;}
      if(q.method==='initialized'){ack=true;return;}
      if(!ready||!ack){console.log(JSON.stringify({id:q.id,error:{message:'handshake missing'}}));return;}
      console.log(JSON.stringify({id:q.id,result:{data:[{id:q.params.cursor?'b':'a',model:q.params.cursor?'model-b':'model-a'}],nextCursor:q.params.cursor?null:'page2'}}));});`);
    const result=await rpcRead('fixture',process.env,'model/list',{limit:1},(_binary,_args,options)=>spawn(process.execPath,[fake],options));
    assert.deepEqual(result.data.map(m=>m.model),['model-a','model-b']);
    await assert.rejects(()=>rpcRead('never-run',process.env,'account/sendAddCreditsNudgeEmail'),/read-only/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
