import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateRequest,updateProfile,apply,waitOnline,createHealthWriter,connectionRecovery} from '../RouterManager.App/Assets/manager.mjs';

const repo=process.env.FEISHU_TEST_BRIDGE_ENTRY;
test('connection recovery measures uninterrupted downtime instead of total process age',()=>{
  assert.deepEqual(connectionRecovery(true,0,120000),{since:null,restart:false});
  assert.deepEqual(connectionRecovery(false,null,120001),{since:120001,restart:false});
  assert.equal(connectionRecovery(false,120001,210000).restart,false);
  assert.equal(connectionRecovery(false,120001,210001).restart,true);
  assert.deepEqual(connectionRecovery(true,120001,210001),{since:null,restart:false});
});
test('locked heartbeat replacement retries without terminating bridge and reports recovery once',()=>{
  let locked=true,time=0;const events=[],written=[];
  const write=createHealthWriter(os.tmpdir(),{publish:(_file,value)=>{if(locked)throw Object.assign(new Error('Windows reader denies rename'),{code:'EPERM'});written.push(value);},log:event=>events.push(event),now:()=>time});
  assert.equal(write({pid:123,state:'running'}),false);time=2000;
  assert.equal(write({pid:123,state:'running'}),false);
  assert.deepEqual(events,['supervisor.health.write.failed']);
  locked=false;time=4000;assert.equal(write({pid:123,state:'running'}),true);
  assert.equal(write({pid:123,state:'running'}),true);
  assert.deepEqual(events,['supervisor.health.write.failed','supervisor.health.recovered']);assert.equal(written.length,2);
});
test('persistent heartbeat failures are rate limited and unavailable diagnostic disk cannot crash supervisor',()=>{
  let time=0;const events=[];
  const write=createHealthWriter(os.tmpdir(),{publish:()=>{throw Object.assign(new Error('disk unavailable'),{code:'EACCES'});},log:event=>{events.push(event);throw Error('log disk also unavailable');},now:()=>time});
  assert.equal(write({state:'running'}),false);time=29999;assert.equal(write({state:'running'}),false);time=30000;assert.equal(write({state:'running'}),false);
  assert.equal(events.length,2);
});
test('online failure reports scheduled task exit status instead of implying invalid model',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'FeishuRouterManager.Online-'));
  try{
    await assert.rejects(()=>waitOnline({runtimeRoot:root,taskName:'fixture'},{wait:async()=>{},taskStatus:async()=>({state:'Disabled',result:1})}),/退出码：1.*未保存本次修改/);
    fs.writeFileSync(path.join(root,'health.json'),JSON.stringify({state:'running',at:new Date().toISOString()}));
    await waitOnline({runtimeRoot:root},{wait:async()=>{},taskStatus:async()=>{throw new Error('must not query task for healthy service');}});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('routing rejects unsupported backend and busy bot before any writes',()=>{
  assert.throws(()=>validateRequest({target:{backend:'unknown'}}),/不支持/);
  assert.throws(()=>validateRequest({target:{backend:'codex',workspace:os.tmpdir()},bot:{appId:'cli_test',busy:true}}),/任务/);
});
test('failed service switch restores old config and original startup task', {skip:!repo},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'FeishuRouterManager.RollbackTest-'));
  try{
    const config={profiles:{one:{agentKind:'codex',codex:{binaryPath:process.execPath},accounts:{app:{id:'cli_test',secret:{id:'encrypted'}}},preferences:{model:'default'},permissions:{defaultAccess:'workspace'},workspaces:{default:root}}}};
    fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(config));fs.writeFileSync(path.join(root,'config.json.lock'),'');
    const calls=[];
    const req={target:{backend:'codex',workspace:root,model:'changed'},bot:{id:'one',name:'test',appId:'cli_test',bridge:0,root,taskName:'LarkChannelBridge.Bot.one',busy:false},paths:{channelHome:root,bridgeEntry:repo,nodeBinary:process.execPath,managerRoot:path.join(root,'manager'),piRoot:''}};
    await assert.rejects(()=>apply(req,{
      provision:async()=>{},stop:async t=>calls.push('stop:'+t),wait:async()=>{},
      start:async()=>{throw new Error('fixture launch failure');},restore:async t=>calls.push('restore:'+t)
    }),/fixture launch failure/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'config.json'))),config);
    assert.deepEqual(calls,['stop:LarkChannelBridge.Bot.one','stop:FeishuRouterManager.cli_test','restore:LarkChannelBridge.Bot.one']);
    assert.equal(fs.existsSync(path.join(root,'manager/bots/cli_test/route.json')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('locked profile migration preserves credentials, unknown fields and other robots; rollback restores profile', {skip:!repo},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'FeishuRouterManager.RouteTest-'));
  try{
    const config={schemaVersion:2,activeProfile:'one',unknownRoot:{preserve:42},profiles:{one:{agentKind:'codex',codex:{binaryPath:process.execPath,inheritCodexHome:true},accounts:{app:{id:'cli_one',secret:{source:'exec',id:'encrypted-one'}}},permissions:{defaultAccess:'workspace',maxAccess:'full'},preferences:{model:'default'},workspaces:{default:'old'},unknownField:99},two:{agentKind:'antigravity',accounts:{app:{id:'cli_two',secret:{source:'exec',id:'encrypted-two'}}},permissions:{defaultAccess:'read-only',maxAccess:'read-only'},preferences:{model:'custom'},workspaces:{default:'old'}}}};
    fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(config));fs.writeFileSync(path.join(root,'config.json.lock'),'');
    const m={channelHome:root,bridgeEntry:repo,profile:'two',backend:'codex',workspace:root,model:'default'};
    const old=await updateProfile(m);
    const after=JSON.parse(fs.readFileSync(path.join(root,'config.json')));
    assert.deepEqual(after.profiles.one,config.profiles.one);
    assert.deepEqual(after.profiles.two.accounts,config.profiles.two.accounts);
    assert.deepEqual(after.profiles.two.permissions,config.profiles.two.permissions);
    assert.equal(after.profiles.two.codex.binaryPath,process.execPath);
    assert.deepEqual(after.unknownRoot,config.unknownRoot);
    await updateProfile(m,old);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'config.json'))),config);
    await Promise.all([updateProfile({...m,profile:'one',model:'model-A'}),updateProfile({...m,profile:'two',model:'model-B'})]);
    const raced=JSON.parse(fs.readFileSync(path.join(root,'config.json')));
    assert.equal(raced.profiles.one.preferences.model,'model-A');assert.equal(raced.profiles.two.preferences.model,'model-B');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
