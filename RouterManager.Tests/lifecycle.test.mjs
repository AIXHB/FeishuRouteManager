import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createBot,deleteBot,provision} from '../RouterManager.App/Assets/lifecycle.mjs';
const repo=process.env.FEISHU_TEST_BRIDGE_ENTRY;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'FeishuRouterManager.Lifecycle-'));
 const cfg={schemaVersion:2,activeProfile:'one',unknown:{keep:99},profiles:{one:{agentKind:'codex',accounts:{app:{id:'cli_original',secret:{id:'encrypted-original'}}},codex:{binaryPath:process.execPath,inheritCodexHome:true},workspaces:{default:root},preferences:{model:'default'},permissions:{defaultAccess:'workspace',maxAccess:'workspace'}}}};
 const config=path.join(root,'config.json');fs.writeFileSync(config,JSON.stringify(cfg));fs.writeFileSync(path.join(root,'active-profile'),'one\n');
 const req={action:'create',bot:{name:'测试机器人',appId:'cli_added'},target:{backend:'codex',workspace:root,model:'gpt-new'},permission:'workspace',secret:'secret-only-in-memory-123',autoStart:false,startNow:false,paths:{channelHome:root,bridgeEntry:repo,nodeBinary:process.execPath,piRoot:path.join(root,'pi'),managerRoot:path.join(root,'manager')}};
 const calls=[];const hooks={snapshot:async()=>[],provision:async m=>{const c=read(config);c.profiles[m.profile]={agentKind:'antigravity',accounts:{app:{id:m.appId,secret:{id:'encrypted-added'}}},workspaces:{default:root},preferences:{model:'default'}};fs.writeFileSync(config,JSON.stringify(c));},start:async(m,launch)=>calls.push({action:'register',launch,autoStart:m.autoStart}),stop:async t=>calls.push({action:'stop',task:t}),unregister:async t=>calls.push({action:'unregister',task:t}),ready:async()=>calls.push({action:'ready'}),restore:async states=>calls.push({action:'restore',states})};
 return {root,cfg,config,req,calls,hooks,clean:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('isolated credential bootstrap merges only new profile and transfers encrypted store, preserving all existing settings',{skip:!repo},async()=>{
 const f=fixture();try{
  const m={...f.req.paths,runtimeRoot:path.join(f.root,'manager/bots/cli_added'),profile:'managed-added',appId:'cli_added',workspace:f.root};
  await provision(m,f.req.secret,async input=>{
   assert.notEqual(input.channelHome,f.root);assert.equal(input.secret,f.req.secret);
   const p=path.join(input.channelHome,'profiles',m.profile);fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'secrets.enc'),'encrypted-fixture');fs.writeFileSync(path.join(p,'.keystore.salt'),'salt-fixture');
   fs.writeFileSync(path.join(input.channelHome,'config.json'),JSON.stringify({profiles:{[m.profile]:{agentKind:'antigravity',accounts:{app:{id:m.appId,secret:{source:'exec',provider:'bridge',id:'app-'+m.appId}}}}},secrets:{providers:{bridge:{source:'exec',command:'staging-wrapper',args:[]}}}}));return {status:0};
  });
  const cfg=read(f.config);assert.deepEqual(cfg.profiles.one,f.cfg.profiles.one);assert.deepEqual(cfg.unknown,f.cfg.unknown);assert.equal(cfg.activeProfile,'one');assert.equal(cfg.profiles[m.profile].secrets.providers.bridge.command,path.join(f.root,'secrets-getter.cmd'));assert.equal(fs.readFileSync(path.join(f.root,'profiles',m.profile,'secrets.enc'),'utf8'),'encrypted-fixture');assert.equal(fs.readFileSync(f.config,'utf8').includes(f.req.secret),false);
 }finally{f.clean();}
});
test('create saves stopped bot with isolated manifest, encrypted reference and permission, preserving other profiles',{skip:!repo},async()=>{
 const f=fixture();try{
  await createBot(f.req,f.hooks);const c=read(f.config);assert.deepEqual(c.profiles.one,f.cfg.profiles.one);assert.deepEqual(c.unknown,f.cfg.unknown);
  const p=c.profiles['managed-added'];assert.equal(p.agentKind,'codex');assert.equal(p.preferences.model,'gpt-new');assert.equal(p.permissions.maxAccess,'workspace');assert.equal(p.mode,'personal');
  assert.deepEqual(f.calls,[{action:'register',launch:false,autoStart:false}]);
  const route=path.join(f.root,'manager/bots/cli_added/route.json');assert.equal(read(route).createdByManager,true);assert.equal(read(route).sourceTask,'');
  for(const file of [route,f.config,path.join(f.root,'manager/bots/cli_added/backups',fs.readdirSync(path.join(f.root,'manager/bots/cli_added/backups'))[0],'channel.json')])assert.equal(fs.readFileSync(file,'utf8').includes(f.req.secret),false);
  await assert.rejects(()=>createBot(f.req,f.hooks),/已配置/);
 }finally{f.clean();}
});
test('duplicate native pi App ID and invalid name/secret/model fail before provisioning',{skip:!repo},async()=>{
 const f=fixture();try{
  for(const req of [{...f.req,bot:{...f.req.bot,name:''}},{...f.req,secret:''},{...f.req,target:{...f.req.target,model:'bad model'}}])await assert.rejects(()=>createBot(req,f.hooks));
  fs.mkdirSync(path.join(f.req.paths.piRoot,'.pi'),{recursive:true});fs.writeFileSync(path.join(f.req.paths.piRoot,'.pi/feishu.json'),JSON.stringify({appId:'cli_added'}));await assert.rejects(()=>createBot(f.req,f.hooks),/已配置/);assert.equal(f.calls.length,0);assert.deepEqual(read(f.config),f.cfg);
 }finally{f.clean();}
});
test('failed new service connection rolls back only new profile and task',{skip:!repo},async()=>{
 const f=fixture();try{
  await assert.rejects(()=>createBot({...f.req,startNow:true},{...f.hooks,ready:async()=>{throw new Error('fixture connection failure');}}),/fixture connection/);
  assert.deepEqual(read(f.config),f.cfg);assert.equal(fs.existsSync(path.join(f.root,'manager/bots/cli_added/route.json')),false);assert.ok(f.calls.some(c=>c.action==='unregister'));assert.equal(f.calls.some(c=>c.task==='LarkChannelBridge.Bot.one'),false);
 }finally{f.clean();}
});
test('delete archives stopped managed bot, retains files and credentials and removes native rediscovery source',{skip:!repo},async()=>{
 const f=fixture();try{
  await createBot(f.req,f.hooks);const runtime=path.join(f.root,'manager/bots/cli_added');const route=path.join(runtime,'route.json');const manifest=read(route);manifest.sourceBridge=1;manifest.sourceRoot=f.req.paths.piRoot;manifest.sourceTask='Pi-Feishu-Autostart';fs.writeFileSync(route,JSON.stringify(manifest));
  fs.mkdirSync(path.join(f.req.paths.piRoot,'.pi'),{recursive:true});fs.writeFileSync(path.join(f.req.paths.piRoot,'.pi/feishu.json'),JSON.stringify({appId:'cli_added',appSecret:'old-existing-secret'}));fs.writeFileSync(path.join(runtime,'session-preserve.txt'),'history');
  const r=await deleteBot({...f.req,bot:{id:'managed-added',name:'测试',appId:'cli_added',bridge:0,taskName:'FeishuRouterManager.cli_added',busy:false}},f.hooks);
  assert.deepEqual(read(f.config),f.cfg);assert.equal(fs.existsSync(route),false);assert.equal(fs.existsSync(path.join(f.req.paths.piRoot,'.pi/feishu.json')),false);assert.equal(fs.readFileSync(path.join(runtime,'session-preserve.txt'),'utf8'),'history');assert.equal(read(path.join(r.archive,'feishu.json')).appSecret,'old-existing-secret');assert.ok(f.calls.some(c=>c.task==='Pi-Feishu-Autostart'&&c.action==='unregister'));
 }finally{f.clean();}
});
test('delete failure restores active profile, route, native config and task state; busy or changed identity rejects',{skip:!repo},async()=>{
 const f=fixture();try{
  await createBot(f.req,f.hooks);const req={...f.req,bot:{id:'managed-added',name:'测试',appId:'cli_added',bridge:0,root:f.root,taskName:'FeishuRouterManager.cli_added',busy:false}};
  const cfg=read(f.config);cfg.activeProfile='managed-added';fs.writeFileSync(f.config,JSON.stringify(cfg));fs.writeFileSync(path.join(f.root,'active-profile'),'managed-added\n');
  const states=[{name:req.bot.taskName,xml:'fixture xml',running:false,enabled:false}];
  await assert.rejects(()=>deleteBot(req,{...f.hooks,snapshot:async()=>states,unregister:async()=>{throw new Error('fixture task remove failure');}}),/fixture task/);
  assert.deepEqual(read(f.config),cfg);assert.equal(fs.readFileSync(path.join(f.root,'active-profile'),'utf8'),'managed-added\n');assert.equal(fs.existsSync(path.join(f.root,'manager/bots/cli_added/route.json')),true);assert.deepEqual(f.calls.at(-1),{action:'restore',states});
  await assert.rejects(()=>deleteBot({...req,bot:{...req.bot,busy:true}},f.hooks),/任务/);
  const changed=read(f.config);changed.profiles['managed-added'].accounts.app.id='cli_someoneelse';fs.writeFileSync(f.config,JSON.stringify(changed));await assert.rejects(()=>deleteBot(req,f.hooks),/App ID/);
 }finally{f.clean();}
});
