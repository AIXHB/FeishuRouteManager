import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {updateProfile,stopTask,register,waitOnline,assertIdle,ps,validateRequest} from './manager.mjs';
import {routeLock} from './auto-route.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const atomic=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});const t=p+'.'+process.pid+'.tmp';fs.writeFileSync(t,JSON.stringify(v,null,2)+'\n');fs.renameSync(t,p);};
const helper=fileURLToPath(new URL('./manager.mjs',import.meta.url));
async function configLock(paths,action){
 const require=createRequire(path.resolve(paths.bridgeEntry,'../../package.json'));
 const release=await require('proper-lockfile').lock(path.join(paths.channelHome,'config.json.lock'),{realpath:false,stale:60000,retries:{retries:20,minTimeout:100,maxTimeout:250}});
 try{return await action();}finally{await release();}
}
function identity(req){
 if(!/^cli_[a-zA-Z0-9]+$/.test(req.bot.appId))throw new Error('无效的 App ID');
 if(!req.paths.managerRoot||!path.isAbsolute(req.paths.managerRoot))throw new Error('管理目录无效');
}
function nativeConfig(paths){const p=path.join(paths.piRoot||paths.managerRoot,'.pi/feishu.json');return fs.existsSync(p)?{path:p,config:read(p)}:null;}
function createManifest(req){
 const profile='managed-'+req.bot.appId.slice(4);
 return {...req.paths,id:profile,profile,name:req.bot.name.trim(),appId:req.bot.appId,sourceBridge:0,sourceRoot:req.paths.channelHome,sourceTask:'',backend:req.target.backend,workspace:req.target.workspace,model:req.target.model||'default',permission:req.permission||'workspace',autoStart:req.autoStart===true,runtimeRoot:path.join(req.paths.managerRoot,'bots',req.bot.appId),taskName:'FeishuRouterManager.'+req.bot.appId,createdByManager:true,updatedAt:new Date().toISOString()};
}
export async function provision(m,secret,bootstrap){
 // Bootstrap against an isolated root: the bridge CLI normalizes its entire
 // config on save. Only merge the new profile into the live root under lock.
 const staging=path.join(m.runtimeRoot,'bootstrap',String(Date.now()));fs.mkdirSync(staging,{recursive:true});
 const input={...m,channelHome:staging,secret};
 const r=bootstrap?await bootstrap(input):spawnSync(m.nodeBinary,[helper,'--bootstrap'],{input:JSON.stringify(input),encoding:'utf8',windowsHide:true,timeout:45000});
 if(r.status!==0)throw new Error('飞书凭据验证或配置创建失败，请检查 App ID、App Secret 和网络。');
 const staged=read(path.join(staging,'config.json')),profile=staged.profiles?.[m.profile];
 if(profile?.accounts?.app?.id!==m.appId||typeof profile.accounts.app.secret!=='object')throw new Error('桥接未返回加密凭据引用，未写入配置');
 const provider=structuredClone(staged.secrets?.providers?.bridge);
 if(!provider)throw new Error('桥接未返回加密凭据读取器');
 const wrapper=path.join(m.channelHome,'secrets-getter.cmd');provider.command=wrapper;
 profile.secrets={providers:{bridge:provider}};
 await configLock(m,()=>{
  const configPath=path.join(m.channelHome,'config.json'),cfg=read(configPath);
  if(cfg.profiles?.[m.profile]||Object.values(cfg.profiles??{}).some(p=>p.accounts?.app?.id===m.appId))throw new Error('该 App ID 已配置');
  const from=path.join(staging,'profiles',m.profile),to=path.join(m.channelHome,'profiles',m.profile);fs.mkdirSync(to,{recursive:true});
  for(const name of ['secrets.enc','.keystore.salt']){
   const dest=path.join(to,name);if(fs.existsSync(dest)){const old=path.join(m.runtimeRoot,'backups','credentials-'+path.basename(staging));fs.mkdirSync(old,{recursive:true});fs.copyFileSync(dest,path.join(old,name));}
   fs.copyFileSync(path.join(from,name),dest);
  }
  if(!fs.existsSync(wrapper)){const dq=s=>'"'+s.replaceAll('"','""')+'"';fs.writeFileSync(wrapper,'@echo off\r\nset "LARK_CHANNEL_HOME='+m.channelHome.replaceAll('"','""')+'"\r\n'+dq(m.nodeBinary)+' '+dq(m.bridgeEntry)+' secrets get %*\r\n');}
  cfg.profiles??={};cfg.profiles[m.profile]=profile;if(!cfg.activeProfile)cfg.activeProfile=m.profile;atomic(configPath,cfg);
 });
}
async function removeProfile(paths,profile,appId,restore){
 return configLock(paths,()=>{
  const p=path.join(paths.channelHome,'config.json'),cfg=read(p),old=cfg.profiles?.[profile];
  if(restore){if(old)throw new Error('恢复位置已有配置，请从备份手动恢复');cfg.profiles[profile]=restore;}
  else if(old){if(old.accounts?.app?.id!==appId)throw new Error('App ID 已变化，拒绝删除其他机器人');delete cfg.profiles[profile];}
  if(!cfg.profiles?.[cfg.activeProfile])cfg.activeProfile=Object.keys(cfg.profiles??{}).sort()[0]??'';
  atomic(p,cfg);
  const active=path.join(paths.channelHome,'active-profile');if(fs.existsSync(active)&&(!fs.readFileSync(active,'utf8').trim()||fs.readFileSync(active,'utf8').trim()===profile))fs.writeFileSync(active,cfg.activeProfile+'\n');
  return old;
 });
}
async function taskSnapshot(tasks){return JSON.parse(await ps(`$result=@(foreach($name in $req.tasks){$t=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue;if($t){[pscustomobject]@{name=$name;xml=(Export-ScheduledTask -TaskName $name);running=($t.State -eq 'Running');enabled=$t.Settings.Enabled}}});ConvertTo-Json -InputObject $result -Compress`,{tasks}));}
async function unregister(task){await ps(`if(Get-ScheduledTask -TaskName $req.task -ErrorAction SilentlyContinue){Unregister-ScheduledTask -TaskName $req.task -Confirm:$false}`,{task});}
async function restoreTasks(tasks){await ps(`foreach($t in $req.tasks){Register-ScheduledTask -TaskName $t.name -Xml $t.xml -Force|Out-Null;if(-not $t.enabled){Disable-ScheduledTask -TaskName $t.name|Out-Null};if($t.running){Start-ScheduledTask -TaskName $t.name}}`,{tasks});}
export async function createBot(req,hooks={}){
 identity(req);validateRequest({...req,bot:{...req.bot,busy:false}});
 if(!['codex','antigravity','pi'].includes(req.target.backend))throw new Error('不支持的后端');
 if(!req.bot.name?.trim()||req.bot.name.length>60)throw new Error('机器人名称须为 1–60 字符');
 if(typeof req.secret!=='string'||!req.secret.trim()||req.secret.length>512)throw new Error('请填写 App Secret');
 if(!['read-only','workspace','full'].includes(req.permission))throw new Error('无效权限');
 if(!/^[A-Za-z0-9][A-Za-z0-9_.:/@+\-]{0,159}$/.test(req.target.model||'default'))throw new Error('模型 ID 无效');
 const m=createManifest(req),route=path.join(m.runtimeRoot,'route.json'),cfg=read(path.join(m.channelHome,'config.json'));
 if(Object.values(cfg.profiles??{}).some(p=>p.accounts?.app?.id===m.appId)||nativeConfig(req.paths)?.config.appId===m.appId||fs.existsSync(route)||cfg.profiles?.[m.profile])throw new Error('该 App ID 已配置，请选择已有机器人修改路由');
 if(m.backend==='codex'&&!Object.values(cfg.profiles??{}).some(p=>p.codex?.binaryPath&&fs.existsSync(p.codex.binaryPath)))throw new Error('请先配置可用的 Codex 程序');
 if(m.backend==='antigravity'&&!fs.existsSync(path.join(process.env.LOCALAPPDATA||'', 'agy/bin/agy.exe')))throw new Error('未安装 Antigravity CLI');
 const sys={provision,update:updateProfile,start:register,ready:waitOnline,stop:stopTask,unregister,snapshot:taskSnapshot,...hooks};
 if((await sys.snapshot([m.taskName])).length)throw new Error('该机器人已有后台任务，请先检查或移除原配置');
 // Backups contain references to encrypted secrets; never serialize the incoming plaintext secret.
 const backup=path.join(m.runtimeRoot,'backups','create-'+Date.now());fs.mkdirSync(backup,{recursive:true});atomic(path.join(backup,'channel.json'),cfg);
 let taskAttempted=false,provisioned=false;
 try{
  await sys.provision(m,req.secret);provisioned=true;
  await sys.update(m);
  await configLock(req.paths,()=>{const p=path.join(m.channelHome,'config.json'),root=read(p),profile=root.profiles[m.profile];profile.permissions={...profile.permissions,defaultAccess:m.permission,maxAccess:m.permission};profile.mode='personal';atomic(p,root);});
  atomic(route,m);taskAttempted=true;await sys.start(m,req.startNow===true);if(req.startNow)await sys.ready(m);
  return {success:true,appId:m.appId,message:req.startNow?'机器人已新增并连接':'机器人已新增，可点击“启动”上线'};
 }catch(e){
  const rollback=[];if(taskAttempted){try{await sys.stop(m.taskName,m);await sys.unregister(m.taskName);}catch(r){rollback.push(r.message);}}
  if(provisioned){try{await removeProfile(req.paths,m.profile,m.appId);}catch(r){rollback.push(r.message);}}
  if(!rollback.length&&fs.existsSync(route))fs.unlinkSync(route);
  if(rollback.length)throw new Error(e.message+'；清理未完成，请查看备份：'+backup);
  throw e;
 }
}
export async function deleteBot(req,hooks={}){
 identity(req);if(req.bot.busy)throw new Error('机器人仍有任务执行中，请完成后再删除');
 const runtimeRoot=path.join(req.paths.managerRoot,'bots',req.bot.appId);
 const previous=fs.existsSync(path.join(runtimeRoot,'route.json'))?read(path.join(runtimeRoot,'route.json')):null;
 return previous?routeLock(previous,()=>deleteBotLocked(req,hooks)):deleteBotLocked(req,hooks);
}
async function deleteBotLocked(req,hooks={}){
 identity(req);if(req.bot.busy)throw new Error('机器人仍有任务执行中，请完成后再删除');
 const route=path.join(req.paths.managerRoot,'bots',req.bot.appId,'route.json');
 const previous=fs.existsSync(route)?read(route):null;
 if(previous?.appId&&previous.appId!==req.bot.appId)throw new Error('机器人配置不匹配');
 const m=previous??{...req.paths,...req.bot,profile:req.bot.id,sourceBridge:req.bot.bridge,sourceRoot:req.bot.root,sourceTask:req.bot.taskName,runtimeRoot:path.dirname(route)};
 const cfg=read(path.join(req.paths.channelHome,'config.json'));
 const profile=cfg.profiles?.[m.profile];
 if(profile&&profile.accounts?.app?.id!==req.bot.appId)throw new Error('App ID 已变化，请刷新后再试');
 const native=nativeConfig(req.paths),source=m.sourceBridge===1?nativeConfig({...req.paths,piRoot:m.sourceRoot}):null;
 const pi=[source,native].find(p=>p?.config.appId===req.bot.appId)??null;
 if(!previous&&!profile&&!pi)throw new Error('机器人已移除，请刷新列表');
 assertIdle(m,previous);
 const sourceTask=m.sourceBridge!==1||pi?m.sourceTask:null;
 const tasks=[...new Set([req.bot.taskName,m.taskName,sourceTask,profile?'LarkChannelBridge.Bot.'+m.profile:null].filter(Boolean))];
 const sys={snapshot:taskSnapshot,stop:stopTask,unregister,restore:restoreTasks,...hooks};
 const states=await sys.snapshot(tasks);
 const activePath=path.join(req.paths.channelHome,'active-profile');const activeBefore=fs.existsSync(activePath)?fs.readFileSync(activePath,'utf8'):null;
 const archive=path.join(req.paths.managerRoot,'archives',req.bot.appId+'-'+Date.now());fs.mkdirSync(archive,{recursive:true});
 atomic(path.join(archive,'channel.json'),cfg);atomic(path.join(archive,'tasks.json'),states);if(previous)atomic(path.join(archive,'route.json'),previous);if(pi)atomic(path.join(archive,'feishu.json'),pi.config);
 let removed,piRemoved=false,routeRemoved=false;
 try{
  for(const task of tasks)await sys.stop(task,m);
  if(profile)removed=await removeProfile(req.paths,m.profile,req.bot.appId);
  if(pi){fs.unlinkSync(pi.path);piRemoved=true;}
  if(previous){fs.unlinkSync(route);routeRemoved=true;}
  for(const task of tasks)await sys.unregister(task);
  return {success:true,message:'机器人配置已删除；历史会话、工作目录和加密凭据保留',archive};
 }catch(e){
  try{if(removed){await removeProfile(req.paths,m.profile,req.bot.appId,removed);await configLock(req.paths,()=>{const p=path.join(req.paths.channelHome,'config.json'),now=read(p);const fallback=Object.keys(cfg.profiles).filter(k=>k!==m.profile).sort()[0]??'';if(cfg.activeProfile===m.profile&&now.activeProfile===fallback){now.activeProfile=cfg.activeProfile;atomic(p,now);}if(activeBefore?.trim()===m.profile&&fs.existsSync(activePath)&&fs.readFileSync(activePath,'utf8').trim()===fallback)fs.writeFileSync(activePath,activeBefore);});}if(piRemoved)atomic(pi.path,pi.config);if(routeRemoved)atomic(route,previous);await sys.restore(states);}
  catch{throw new Error(e.message+'；自动恢复未完成，备份位置：'+archive);}
  throw e;
 }
}
export async function runLifecycle(req){
 if(!['create','delete'].includes(req.action))throw new Error('无效机器人操作');identity(req);
 fs.mkdirSync(req.paths.managerRoot,{recursive:true});
 const require=createRequire(path.resolve(req.paths.bridgeEntry,'../../package.json'));
 const release=await require('proper-lockfile').lock(path.join(req.paths.managerRoot,'lifecycle.lock'),{realpath:false,stale:120000,retries:0});
 try{return req.action==='create'?await createBot(req):await deleteBot(req);}finally{await release();}
}
