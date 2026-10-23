import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {autoRouteTick,quotaDecision,isQuotaFailure,notify,savePolicy,routeLock,shouldLaunch} from '../RouterManager.App/Assets/auto-route.mjs';
import {apply} from '../RouterManager.App/Assets/manager.mjs';

const bridgeEntry=path.resolve('integrations/lark-channel-bridge/bin/lark-channel-bridge.mjs');
const now=Date.parse('2026-10-22T04:00:00Z');
const exhausted={status:'available',windows:[{label:'5h',remainingPercent:0,resetsAt:(now+60000)/1000}]};
const recovered={status:'available',windows:[{label:'5h',remainingPercent:60,resetsAt:(now+3600000)/1000}]};
const unavailable={status:'unavailable',windows:[]};
const write=(p,o)=>fs.writeFileSync(p,JSON.stringify(o));
function fixture(t,error='You have reached your usage limit',enabled=true){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'Router.AutoRoute-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const m={appId:'cli_fixture',id:'one',name:'fixture',profile:'one',backend:'codex',model:'original',workspace:root,runtimeRoot:path.join(root,'bots/cli_fixture'),managerRoot:root,channelHome:root,bridgeEntry,piRoot:root,nodeBinary:process.execPath,taskName:'FeishuRouterManager.cli_fixture'};
  fs.mkdirSync(m.runtimeRoot,{recursive:true});fs.mkdirSync(path.join(root,'profiles/one/logs'),{recursive:true});
  const piEntry=path.join(root,'node_modules/pi-remote-feishu/dist/bin/pi-remote-feishu.js');fs.mkdirSync(path.dirname(piEntry),{recursive:true});fs.writeFileSync(piEntry,'');
  write(path.join(m.runtimeRoot,'route.json'),m);
  write(path.join(m.runtimeRoot,'auto-route.json'),{enabled,fallbackModel:'provider/model',enabledAt:new Date(now-60000).toISOString()});
  write(path.join(root,'config.json'),{profiles:{one:{codex:{binaryPath:process.execPath,inheritCodexHome:false},preferences:{model:'custom'},accounts:{app:{id:m.appId}}}}});
  const event={ts:new Date(now-1000).toISOString(),phase:'run',event:'failed',agent:'codex',chatId:'oc_fixture',runId:'run1',error};
  const log=path.join(root,'profiles/one/logs/bridge-2026-10-22.jsonl');fs.writeFileSync(log,JSON.stringify(event)+'\n');
  const messages=[],calls=[];
  const hooks={now:()=>now,query:async()=>exhausted,assertIdle:()=>{},notify:async(_m,chat,text,key)=>messages.push({chat,text,key}),apply:async(current,model)=>{calls.push(model);write(path.join(m.runtimeRoot,'route.json'),{...current,backend:'pi',model});}};
  return {m,hooks,messages,calls,log,event,state:()=>JSON.parse(fs.readFileSync(path.join(m.runtimeRoot,'auto-route-state.json')))};
}
test('quota windows use latest exhausted reset and never invent missing reset or availability',()=>{
  assert.deepEqual(quotaDecision(unavailable,now),{exhausted:false,recovered:false,resetAt:null});
  assert.equal(quotaDecision({status:'available',windows:[{remainingPercent:0,resetsAt:(now+1000)/1000},{remainingPercent:0,resetsAt:(now+6000)/1000}]},now).resetAt,now+6000);
  assert.equal(quotaDecision({status:'available',windows:[{remainingPercent:0,resetsAt:null}]},now).resetAt,null);
  assert.equal(quotaDecision(recovered,now).recovered,true);
  assert.equal(quotaDecision({status:'available',windows:[{limitId:'other-model',remainingPercent:0,resetsAt:(now+1000)/1000}]},now).exhausted,false);
});
test('only explicit exhaustion is classified; generic 429, network, auth and tool output are not',()=>{
  for(const text of ['usage_limit_reached','insufficient_quota','You\'ve hit your usage limit','额度已耗尽'])assert.equal(isQuotaFailure(text),true,text);
  for(const text of ['429 Too many requests','network timeout','unauthorized','tool failed','rate limit exceeded'])assert.equal(isQuotaFailure(text),false,text);
});
test('disabled switch does not query, notify or route',async t=>{
  const f=fixture(t,undefined,false);f.hooks.query=()=>{throw Error('must not query');};
  await autoRouteTick(f.m,f.hooks);assert.deepEqual(f.calls,[]);assert.equal(shouldLaunch(f.m,now),false);
});
test('explicit exhaustion switches only target, persists original route and reports reset without replay',async t=>{
  const f=fixture(t);await autoRouteTick(f.m,f.hooks);
  assert.deepEqual(f.calls,['provider/model']);assert.equal(f.messages.length,2);
  assert.match(f.messages[0].text,/剩余 0%/);assert.match(f.messages[1].text,/重发/);
  assert.equal(f.state().original.model,'custom');assert.equal(f.state().resetAt,now+60000);
  assert.equal(f.state().switchNotified,true);
  assert.equal(shouldLaunch({...f.m,backend:'pi'},now+20000),false);
});
test('timeout queries quota but positive or unavailable quota never switches',async t=>{
  for(const q of [recovered,unavailable]){
    const f=fixture(t,'request timed out');f.hooks.query=async()=>q;
    await autoRouteTick(f.m,f.hooks);assert.equal(f.calls.length,0);assert.equal(f.messages.length,0);
  }
  const f=fixture(t,'request timed out');await autoRouteTick(f.m,f.hooks);assert.equal(f.calls.length,1);
  const noResponse=fixture(t,'codex stream ended before a terminal event');await autoRouteTick(noResponse.m,noResponse.hooks);assert.equal(noResponse.calls.length,1);
});
test('busy protects tasks and does not consume pending failure',async t=>{
  const f=fixture(t);f.hooks.assertIdle=()=>{throw Error('busy');};
  await assert.rejects(()=>autoRouteTick(f.m,f.hooks),/busy/);assert.equal(f.calls.length,0);
  assert.equal(shouldLaunch(f.m,now),true);
});
test('stale events, wrong agent and ordinary output cannot trigger a switch',async t=>{
  const f=fixture(t);fs.writeFileSync(f.log,[{...f.event,ts:new Date(now-3600000).toISOString()},{...f.event,agent:'pi'},{...f.event,phase:'agent',event:'output'}].map(JSON.stringify).join('\n'));
  await autoRouteTick(f.m,f.hooks);assert.equal(f.calls.length,0);assert.equal(shouldLaunch(f.m,now),false);
});
test('reminder survives worker restart, runs once and never switches back automatically',async t=>{
  const f=fixture(t);await autoRouteTick(f.m,f.hooks);f.hooks.now=()=>now+60001;f.hooks.query=async()=>recovered;
  const pi={...f.m,backend:'pi'};await autoRouteTick(pi,f.hooks);await autoRouteTick(pi,f.hooks);
  assert.equal(f.calls.length,1);assert.equal(f.messages.length,3);assert.match(f.messages[2].text,/已恢复/);assert.equal(f.state().reminded,true);
});
test('missing reset is explicitly unknown, checked again after five minutes',async t=>{
  const f=fixture(t);f.hooks.query=async()=>unavailable;await autoRouteTick(f.m,f.hooks);
  assert.equal(f.state().resetAt,null);assert.equal(f.state().nextCheckAt,now+300000);assert.match(f.messages[0].text,/未提供刷新时间/);
});
test('exhausted later reset is recorded and reported instead of announcing recovered',async t=>{
  const f=fixture(t);await autoRouteTick(f.m,f.hooks);f.hooks.now=()=>now+60001;
  f.hooks.query=async()=>({status:'available',windows:[{label:'weekly',remainingPercent:0,resetsAt:(now+500000)/1000}]});
  await autoRouteTick({...f.m,backend:'pi'},f.hooks);assert.equal(f.state().resetAt,now+500000);assert.equal(f.state().reminded,false);assert.match(f.messages.at(-1).text,/仍不足/);
});
test('delivery failure after committed switch is retried without routing again',async t=>{
  const f=fixture(t);f.hooks.notify=async(_m,_chat,_text,key)=>{if(key.endsWith(':switched'))throw Error('delivery');};
  await assert.rejects(()=>autoRouteTick(f.m,f.hooks),/delivery/);assert.equal(f.state().phase,'switched');
  f.hooks.now=()=>now+60001;f.hooks.notify=async()=>{};f.hooks.query=async()=>recovered;
  await autoRouteTick({...f.m,backend:'pi'},f.hooks);assert.equal(f.calls.length,1);assert.equal(f.state().switchNotified,true);
});
test('failed transaction reports failure and does not loop or replay request',async t=>{
  const f=fixture(t);f.hooks.apply=async()=>{throw Error('rollback fixture');};
  await assert.rejects(()=>autoRouteTick(f.m,f.hooks),/rollback fixture/);assert.equal(f.state().phase,'failed');assert.match(f.messages.at(-1).text,/恢复原路由/);
  f.hooks.now=()=>now+60001;await autoRouteTick(f.m,f.hooks);assert.equal(f.messages.length,2);
});
test('policy writes and route apply use same per-bot lock; disabled auto cancels before update',async t=>{
  const f=fixture(t);await routeLock(f.m,async()=>{
    await assert.rejects(()=>savePolicy(f.m,{enabled:false,fallbackModel:'default'}),e=>e.code==='ELOCKED');
  });
  await savePolicy(f.m,{enabled:false,fallbackModel:'default'},now);
  await assert.rejects(()=>apply({bot:{id:'one',name:'fixture',appId:f.m.appId,busy:false},paths:f.m,target:{backend:'pi',workspace:f.m.workspace,model:'default'},expectedBackend:'codex',automatic:true}),/自动路由已关闭/);
  assert.equal(fs.existsSync(path.join(f.m.runtimeRoot,'route-paused')),false);
});
test('notification uses encrypted secret provider only in HTTP body and stable idempotency key',async()=>{
  const requests=[];
  const fetcher=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {json:async()=>url.includes('/auth/')?{code:0,tenant_access_token:'fixture-token'}:{code:0}};};
  const m={appId:'cli_fixture'};
  await notify(m,'oc_fixture','test','event:switched',()=> 'fixture-secret',fetcher);
  await notify(m,'oc_fixture','test','event:switched',()=> 'fixture-secret',fetcher);
  assert.equal(requests[0].body.app_secret,'fixture-secret');assert.equal(requests[1].body.uuid,requests[3].body.uuid);assert.equal(requests[1].body.receive_id,'oc_fixture');
});
test('still exhausted with unknown new reset keeps checking until actual recovery',async t=>{
  const f=fixture(t);await autoRouteTick(f.m,f.hooks);f.hooks.now=()=>now+60001;
  f.hooks.query=async()=>({status:'available',windows:[{remainingPercent:0,resetsAt:null}]});
  const pi={...f.m,backend:'pi'};await autoRouteTick(pi,f.hooks);
  assert.equal(f.state().reminded,false);assert.equal(f.state().waitNotified,true);
  assert.match(f.messages.at(-1).text,/仍显示.*耗尽/);
  f.hooks.now=()=>now+400002;f.hooks.query=async()=>recovered;await autoRouteTick(pi,f.hooks);
  assert.equal(f.state().reminded,true);assert.match(f.messages.at(-1).text,/已恢复/);
});
test('policy disabled while on pi prevents quota checks and reminder delivery',async t=>{
  const f=fixture(t);await autoRouteTick(f.m,f.hooks);await savePolicy(f.m,{enabled:false,fallbackModel:'default'},now);
  f.hooks.now=()=>now+60001;f.hooks.query=()=>{throw Error('must not query');};
  await autoRouteTick({...f.m,backend:'pi'},f.hooks);assert.equal(f.messages.length,2);
});
test('due reminder query failure distinguishes estimated refresh from confirmed recovery',async t=>{
  const f=fixture(t);await autoRouteTick(f.m,f.hooks);f.hooks.now=()=>now+60001;f.hooks.query=async()=>unavailable;
  await autoRouteTick({...f.m,backend:'pi'},f.hooks);assert.match(f.messages.at(-1).text,/尚未确认恢复/);assert.equal(f.state().reminded,true);
});
test('real automatic transaction publishes pi route under gate and preserves config fields',async t=>{
  const f=fixture(t);const cfg=JSON.parse(fs.readFileSync(path.join(f.m.channelHome,'config.json')));
  cfg.unknown='preserved';cfg.profiles.other={preferences:{model:'other'}};write(path.join(f.m.channelHome,'config.json'),cfg);
  const pause=path.join(f.m.runtimeRoot,'route-paused');
  await apply({bot:{id:'one',name:'fixture',appId:f.m.appId,busy:false,bridge:0,root:f.m.channelHome,taskName:f.m.taskName},paths:f.m,target:{backend:'pi',workspace:f.m.workspace,model:'provider/model'},expectedBackend:'codex',automatic:true},{provision:async()=>{},stop:async()=>assert.equal(fs.existsSync(pause),true),wait:async()=>{},start:async()=>{},ready:async()=>{}});
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.m.runtimeRoot,'route.json'))).backend,'pi');
  const result=JSON.parse(fs.readFileSync(path.join(f.m.channelHome,'config.json')));
  assert.equal(result.unknown,'preserved');assert.deepEqual(result.profiles.other,cfg.profiles.other);assert.equal(fs.existsSync(pause),false);
});
