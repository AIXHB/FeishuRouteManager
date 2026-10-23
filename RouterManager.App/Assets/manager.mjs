import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {routeLock,savePolicy,launchWorker,runAutoRoute,policyFor,shouldLaunch} from './auto-route.mjs';

const self=fileURLToPath(import.meta.url);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const atomic=(p,value)=>{fs.mkdirSync(path.dirname(p),{recursive:true}); const tmp=`${p}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');fs.renameSync(tmp,p);};
const safe=s=>String(s).replace(/(appSecret|token|apiKey)(["'\s:=]+)[^"'\s,}]+/gi,'$1$2[hidden]').replace(/\b(?:sk-[\w-]{16,}|[A-Za-z0-9]{32,})\b/g,'[hidden]');
function supervisorLog(root,event,error){
  try{
    const logs=path.join(root,'logs');fs.mkdirSync(logs,{recursive:true});
    fs.appendFileSync(path.join(logs,'bootstrap.log'),JSON.stringify({at:new Date().toISOString(),event,...(error?{code:error.code,error:safe(error.message??error)}:{})})+'\n');
  }catch{/* Diagnostics must not terminate a healthy bridge when storage is unavailable. */}
}
export function createHealthWriter(root,hooks={}){
  const publish=hooks.publish??atomic,log=hooks.log??((event,error)=>supervisorLog(root,event,error)),now=hooks.now??Date.now;
  let failed=false,lastReport=-Infinity;
  const report=(event,error)=>{try{log(event,error);}catch{}};
  return value=>{
    try{
      publish(path.join(root,'health.json'),value);
      if(failed)report('supervisor.health.recovered');
      failed=false;return true;
    }catch(error){
      failed=true;
      if(now()-lastReport>=30000){lastReport=now();report('supervisor.health.write.failed',error);}
      // Windows readers can deny rename briefly. Retry next heartbeat, keep the bridge alive.
      return false;
    }
  };
}
export function connectionRecovery(connected,unhealthySince,now=Date.now()){
  const since=connected?null:unhealthySince??now;
  return {since,restart:since!==null&&now-since>=90000};
}
async function stdin(){let s='';for await(const c of process.stdin)s+=c;return JSON.parse(s);}
export async function ps(script,input={}){
  const prefix="$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.Encoding]::UTF8;$req=[Console]::In.ReadToEnd()|ConvertFrom-Json;";
  const r=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(prefix+script,'utf16le').toString('base64')],{input:JSON.stringify(input),encoding:'utf8',windowsHide:true,timeout:25000});
  if(r.status!==0)throw new Error(safe(r.stderr||'Windows service operation failed'));
  return r.stdout.trim().replace(/^\uFEFF/,'');
}
export function validateRequest(req){
  if(!['codex','antigravity','pi','claude'].includes(req.target.backend))throw new Error('不支持的后端');
  if(!/^cli_[a-zA-Z0-9]+$/.test(req.bot.appId))throw new Error('无效的 App ID');
  if(!path.isAbsolute(req.target.workspace)||!fs.statSync(req.target.workspace).isDirectory())throw new Error('工作目录不存在');
  if(req.bot.busy)throw new Error('机器人仍有任务执行中，请完成任务后再切换');
  if(!fs.existsSync(req.paths.bridgeEntry))throw new Error('请先在集成设置指定 Lark Bridge 入口');
  if(!fs.existsSync(req.paths.nodeBinary))throw new Error('找不到 Node.js');
  if(req.target.backend==='pi'&&!fs.existsSync(path.join(req.paths.piRoot,'node_modules/pi-remote-feishu/dist/bin/pi-remote-feishu.js')))throw new Error('请先设置可用的 pi 桥接目录');
}
export function secretFor(m){
  if(m.sourceBridge===1)return read(path.join(m.sourceRoot,'.pi/feishu.json')).appSecret;
  const id=`app-${m.appId}`;
  const r=spawnSync(m.nodeBinary,[m.bridgeEntry,'secrets','get'],{input:JSON.stringify({protocolVersion:1,ids:[id]}),env:{...process.env,LARK_CHANNEL_HOME:m.channelHome},encoding:'utf8',windowsHide:true,timeout:15000});
  if(r.status!==0)throw new Error('无法读取原机器人加密凭据');
  const value=JSON.parse(r.stdout).values?.[id];if(!value)throw new Error('加密凭据不存在');return value;
}
async function ensureProfile(m){
  const root=read(path.join(m.channelHome,'config.json'));
  if(root.profiles?.[m.profile])return;
  const config={...m,secret:secretFor(m)};
  const r=spawnSync(m.nodeBinary,[self,'--bootstrap'],{input:JSON.stringify(config),encoding:'utf8',windowsHide:true,timeout:45000});
  if(r.status!==0)throw new Error('创建隔离桥接配置失败：'+safe(r.stderr||r.stdout));
}
export async function updateProfile(m,rollback){
  const configPath=path.join(m.channelHome,'config.json');
  const require=createRequire(path.resolve(m.bridgeEntry,'../../package.json'));
  const lockfile=require('proper-lockfile');
  const release=await lockfile.lock(`${configPath}.lock`,{realpath:false,stale:30000,update:10000,retries:{retries:20,minTimeout:100,maxTimeout:250}});
  try{
    const config=read(configPath),old=structuredClone(config.profiles[m.profile]);
    if(!old)throw new Error('目标 profile 不存在');
    if(m.appId&&old.accounts?.app?.id!==m.appId)throw new Error('App ID 已变化，未修改其他机器人');
    if(rollback===null){delete config.profiles[m.profile];}
    else if(rollback){config.profiles[m.profile]=rollback;}else{
      const p=config.profiles[m.profile];
      if(m.backend!=='pi')p.agentKind=m.backend;
      p.workspaces={...p.workspaces,default:m.workspace};
      p.preferences={...p.preferences,model:m.model||'default'};
      if(m.backend==='codex'&&!p.codex){
        const template=Object.values(config.profiles).find(p=>p.codex?.binaryPath);
        if(!template)throw new Error('未找到已配置的 Codex，请先在桥接中配置 Codex');
        p.codex=structuredClone(template.codex);
      }
    }
    atomic(configPath,config);return old;
  }finally{await release();}
}
export async function stopTask(task,m){
  if(!task)return;
  await ps(`
    $task=Get-ScheduledTask -TaskName $req.task -ErrorAction SilentlyContinue;
    if($task){Stop-ScheduledTask -TaskName $req.task;Disable-ScheduledTask -TaskName $req.task|Out-Null}
    $procs=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -in @('node.exe','powershell.exe')});
    foreach($p in $procs){
      if(-not $p.CommandLine){continue}
      $match=$false;
      if($req.task -like 'FeishuRouterManager.*'){$match=$p.CommandLine.Contains($req.runtimeRoot)}
      if($p.CommandLine -match 'lark-channel-bridge\\.mjs' -and $p.CommandLine -match ('--profile\\s+'+[regex]::Escape($req.profile)+'(?:\\s|"|$)')){$match=$true}
      if($req.task -eq $req.sourceTask -and $req.sourceBridge -eq 1){$match=$p.CommandLine.Contains($req.sourceRoot) -and $p.CommandLine -match 'pi-remote-feishu\\.js|autostart\\.ps1'}
      if($match){Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue}
    }
  `.replaceAll('\\\\','\\'),{task,runtimeRoot:m.runtimeRoot,sourceTask:m.sourceTask,sourceBridge:m.sourceBridge,sourceRoot:m.sourceRoot,profile:m.profile});
}
function makeLauncher(m){
  const quote=s=>s.replaceAll('"','""');
  const launcher=path.join(m.runtimeRoot,'run-hidden.vbs');
  const command=`"${m.nodeBinary}" "${self}" --serve "${path.join(m.runtimeRoot,'route.json')}"`;
  fs.writeFileSync(launcher,`Set shell = CreateObject("WScript.Shell")\r\nWScript.Quit shell.Run("${quote(command)}", 0, True)\r\n`);
  return launcher;
}
export async function register(m,launch=true){
  const launcher=makeLauncher(m);
  await ps(`$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name;
    $a=New-ScheduledTaskAction -Execute "$env:WINDIR\\System32\\wscript.exe" -Argument ('//B "'+$req.launcher+'"');
    $t=New-ScheduledTaskTrigger -AtLogOn -User $user;
    $p=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited;
    $s=New-ScheduledTaskSettingsSet -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries;
    $options=@{TaskName=$req.task;Action=$a;Principal=$p;Settings=$s;Force=$true};
    if($req.autoStart){$options.Trigger=$t};
    Register-ScheduledTask @options|Out-Null;
    if($req.launch){Start-ScheduledTask -TaskName $req.task}`,{task:m.taskName,launcher,launch,autoStart:m.autoStart!==false});
}
export async function waitOnline(m,hooks={}){
  const wait=hooks.wait??sleep;
  for(let i=0;i<40;i++){
    await wait(1000);
    try{const h=read(path.join(m.runtimeRoot,'health.json'));if(h.state==='running'&&Date.now()-Date.parse(h.at)<15000)return;}catch{}
  }
  let detail='';
  try{
    const status=await (hooks.taskStatus??(async()=>JSON.parse(await ps('$t=Get-ScheduledTask -TaskName $req.task -ErrorAction Stop;$i=Get-ScheduledTaskInfo -TaskName $req.task;@{state=[string]$t.State;result=$i.LastTaskResult}|ConvertTo-Json -Compress',{task:m.taskName}))))();
    if(status.result!==0&&status.result!==267009)detail=` 计划任务状态：${status.state}，退出码：${status.result}。`;
  }catch{}
  throw new Error('新后端未能上线。'+detail+' 正在恢复原路由，未保存本次修改；请查看任务结果及 logs/bootstrap.log。');
}
async function restoreTask(task){await ps('Enable-ScheduledTask -TaskName $req.task|Out-Null;Start-ScheduledTask -TaskName $req.task',{task});}
export function assertIdle(m,previous){
  let files=[];
  if((previous?.backend??(m.sourceBridge===1?'pi':'codex'))==='pi'){
    if(previous)files=[path.join(m.runtimeRoot,'logs/service.log')];
    else{try{files=[read(path.join(m.sourceRoot,'bridge-log-paths.json')).stdout];}catch{}}
  }else{
    const logs=path.join(m.channelHome,'profiles',m.profile,'logs');
    if(fs.existsSync(logs))files=fs.readdirSync(logs).filter(n=>/^bridge-.*\.jsonl$/.test(n)).sort().slice(-2).map(n=>path.join(logs,n));
  }
  let busy=false;const pending=new Set();
  for(const file of files){if(!file||!fs.existsSync(file))continue;
    // Read a bounded tail, including tool events so a long run with an older
    // start marker is still treated as busy.
    const fd=fs.openSync(file,'r');let data;
    try{const size=fs.fstatSync(fd).size,buffer=Buffer.alloc(Math.min(size,2*1024*1024));fs.readSync(fd,buffer,0,buffer.length,size-buffer.length);data=buffer.toString('utf8');}finally{fs.closeSync(fd);}
    for(const line of data.split('\n')){let e;try{e=JSON.parse(line);}catch{continue;}
      if(e.event==='bridge_started')pending.clear();
      if(e.event==='message_start')pending.add(e.messageId);
      if(['message_done','message_failed'].includes(e.event))pending.delete(e.messageId);
      if((e.phase==='run'&&e.event==='started')||(e.phase==='agent'&&['spawn','tool-in-flight'].includes(e.event)))busy=true;
      if(e.phase==='run'&&['completed','failed'].includes(e.event))busy=false;
      if(e.phase==='ws'&&e.event==='connected')busy=false;
    }
  }
  if(busy||pending.size)throw new Error('最新日志显示机器人仍有任务执行中，未改动路由。');
}
export async function apply(req,hooks={}){
  validateRequest(req);
  const runtimeRoot=path.join(req.paths.managerRoot,'bots',req.bot.appId);
  return routeLock({...req.paths,runtimeRoot},async()=>{
    const pause=path.join(runtimeRoot,'route-paused');
    try{
      if(req.automatic){atomic(pause,{until:Date.now()+300000});await sleep(200);}
      return await applyLocked(req,hooks);
    }finally{if(req.automatic&&fs.existsSync(pause))fs.unlinkSync(pause);}
  });
}
async function applyLocked(req,hooks={}){
  const system={provision:ensureProfile,stop:stopTask,update:updateProfile,wait:sleep,start:register,ready:waitOnline,restore:restoreTask,...hooks};
  validateRequest(req);
  const paths=req.paths;
  const runtimeRoot=path.join(paths.managerRoot,'bots',req.bot.appId);
  const routePath=path.join(runtimeRoot,'route.json');
  const previous=fs.existsSync(routePath)?read(routePath):null;
  if(req.expectedBackend&&previous?.backend!==req.expectedBackend)throw new Error('路由已被手动修改，取消自动切换');
  if(req.automatic&&!policyFor(previous).enabled)throw new Error('自动路由已关闭');
  const m={...paths,...previous,id:req.bot.id,name:req.bot.name,appId:req.bot.appId,
    sourceBridge:previous?.sourceBridge??req.bot.bridge,sourceRoot:previous?.sourceRoot??req.bot.root,
    sourceTask:previous?.sourceTask??req.bot.taskName,
    profile:previous?.profile??(req.bot.bridge===0?req.bot.id:`managed-${req.bot.appId.slice(4)}`),
    backend:req.target.backend,workspace:req.target.workspace,model:req.target.model||'default',
    runtimeRoot,taskName:`FeishuRouterManager.${req.bot.appId}`,updatedAt:new Date().toISOString()};
  assertIdle(m,previous);
  if(m.backend==='antigravity'&&!fs.existsSync(path.join(process.env.LOCALAPPDATA,'agy/bin/agy.exe')))throw new Error('未安装 Antigravity CLI');
  if(m.backend==='codex'){
    const cfg=read(path.join(paths.channelHome,'config.json'));
    const p=cfg.profiles?.[m.profile]??Object.values(cfg.profiles??{}).find(p=>p.codex?.binaryPath);
    if(!p?.codex?.binaryPath||!fs.existsSync(p.codex.binaryPath))throw new Error('Codex 程序不可用');
  }
  fs.mkdirSync(runtimeRoot,{recursive:true});
  const backup=path.join(runtimeRoot,'backups',String(Date.now()));fs.mkdirSync(backup,{recursive:true});
  fs.copyFileSync(path.join(paths.channelHome,'config.json'),path.join(backup,'channel.json'));
  if(previous)atomic(path.join(backup,'route.json'),previous);
  const profileExisted=Boolean(read(path.join(paths.channelHome,'config.json')).profiles?.[m.profile]);
  await system.provision(m);
  let old;
  try{
    await system.stop(previous?.taskName??m.sourceTask,m);
    old=await system.update(m);
    atomic(routePath,m);
    await system.wait(32000);
    await system.start(m);
    // A supervisor or scheduled-task wrapper alone does not prove its bridge connected.
    await system.ready(m);
    console.log(JSON.stringify({success:true,message:'路由已保存，独立后台服务已启动。'}));
  }catch(e){
    try{await system.stop(m.taskName,m);}catch{}
    if(old)await system.update(m,profileExisted?old:null);
    if(previous)atomic(routePath,previous);else if(fs.existsSync(routePath))fs.unlinkSync(routePath);
    await system.wait(32000);
    const task=previous?.taskName??m.sourceTask;
    try{await system.restore(task);}catch(restoreError){throw new Error(safe(e.message)+'；原服务恢复失败：'+safe(restoreError.message));}
    throw e;
  }
}
async function serve(manifest){
  const m=read(manifest);
  fs.mkdirSync(path.join(m.runtimeRoot,'logs'),{recursive:true});
  const writeHealth=createHealthWriter(m.runtimeRoot);
  const env={...process.env,LARK_CHANNEL_HOME:m.channelHome,FEISHU_ROUTER_MANAGER_ROOT:m.managerRoot??path.dirname(path.dirname(m.runtimeRoot)),FEISHU_ROUTER_PAUSE_FILE:path.join(m.runtimeRoot,'route-paused')};delete env.HERMES_HOME;
  let args;
  if(m.backend==='pi'){
    const original=read(path.join(m.piRoot,'.pi/feishu.json'));delete original.appSecret;
    original.appId=m.appId;original.botName=m.name;
    original.sessions={...original.sessions,defaultCwd:m.workspace};
    original.files={...original.files,tempDir:path.join(m.runtimeRoot,'pi-files'),allowedOutputDirs:[m.workspace]};
    const config=path.join(m.runtimeRoot,'pi-config.json');atomic(config,original);
    const agentDir=path.join(m.runtimeRoot,'pi-agent');fs.mkdirSync(agentDir,{recursive:true});
    for(const file of ['settings.json','models.json','auth.json','models-store.json']){
      const from=path.join(m.piRoot,'.agent',file),to=path.join(agentDir,file);
      if(fs.existsSync(from)&&!fs.existsSync(to))fs.copyFileSync(from,to);
    }
    if(m.model&&m.model!=='default'){
      const p=path.join(agentDir,'settings.json'),settings=fs.existsSync(p)?read(p):{};
      const slash=m.model.indexOf('/');
      if(slash>0){settings.defaultProvider=m.model.slice(0,slash);settings.defaultModel=m.model.slice(slash+1);}else settings.defaultModel=m.model;
      atomic(p,settings);
    }
    if(!env.DEEPSEEK_API_KEY)env.DEEPSEEK_API_KEY=await ps("[Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY','User')");
    const secret=secretFor(m);
    Object.assign(env,{PI_CODING_AGENT_DIR:agentDir,PI_FEISHU_HEALTH_PATH:path.join(m.runtimeRoot,'pi-health.json'),FEISHU_APP_ID:m.appId,FEISHU_APP_SECRET:secret});
    // Existing local pi has a root-scoped pipe lock. Give each bot a private
    // copy of the small bridge package while sharing its dependency directory.
    const pkg=path.join(m.runtimeRoot,'pi-package');fs.mkdirSync(pkg,{recursive:true});
    const dependencies=path.join(m.runtimeRoot,'node_modules');
    if(!fs.existsSync(dependencies))fs.symlinkSync(path.join(m.piRoot,'node_modules'),dependencies,'junction');
    const sourcePackage=path.join(m.piRoot,'node_modules/pi-remote-feishu');
    fs.copyFileSync(path.join(sourcePackage,'package.json'),path.join(pkg,'package.json'));
    fs.cpSync(path.join(sourcePackage,'dist'),path.join(pkg,'dist'),{recursive:true});
    const runtime=path.join(m.piRoot,'service-runtime.mjs');
    const entry=path.join(pkg,'dist/bin/pi-remote-feishu.js');
    if(fs.existsSync(runtime)){
      const localRuntime=path.join(m.runtimeRoot,'service-runtime.mjs');fs.copyFileSync(runtime,localRuntime);
      const code=fs.readFileSync(entry,'utf8').replace(/from\s+["'][^"']*service-runtime\.mjs["']/,`from ${JSON.stringify(pathToFileURL(localRuntime).href)}`);
      fs.writeFileSync(entry,code);
    }
    if(m.sourceBridge===0){
      const cfg=read(path.join(m.channelHome,'config.json')).profiles[m.profile];
      const auth=await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app_id:m.appId,app_secret:secret}),signal:AbortSignal.timeout(15000)}).then(r=>r.json());
      if(auth.code!==0)throw new Error('无法验证 pi 路由权限');
      const info=await fetch(`https://open.feishu.cn/open-apis/application/v6/applications/${m.appId}?lang=zh_cn&user_id_type=open_id`,{headers:{Authorization:`Bearer ${auth.tenant_access_token}`},signal:AbortSignal.timeout(15000)}).then(r=>r.json());
      const owner=info.data?.app?.owner?.owner_id;if(!owner)throw new Error('无法读取机器人所有者，拒绝扩大访问权限');
      const router=path.join(pkg,'dist/bridge/conversation-router.js');
      fs.copyFileSync(router,router.replace(/\.js$/,'.base.js'));
      const policy={owner,mode:cfg.mode,access:cfg.access};
      fs.writeFileSync(router,`import {routeConversation as base,buildSessionKey} from './conversation-router.base.js';
        export {buildSessionKey};
        const p=${JSON.stringify(policy)};
        export function routeConversation(config,message){
          const a=p.access??{},user=message.userOpenId,chat=message.chatId;
          const admin=user===p.owner||(a.admins??[]).includes(user);
          const allowed=p.mode==='team'||admin||(message.chatType==='private'?(a.allowedUsers??[]).includes(user):(a.allowedChats??[]).includes(chat));
          if(!allowed)return {accepted:false,reason:'User or chat is not allowed by original bridge policy'};
          const mention=a.chatRequireMention?.[chat]??a.requireMentionInGroup??true;
          return base({...config,policy:{...config.policy,allowUsers:undefined,allowChats:undefined,requireMention:mention}},message);
        }`);
    }
    args=[entry,'serve','--config',config,'--cwd',m.workspace];
  }else args=[m.bridgeEntry,'run','--profile',m.profile,'--skip-check-lark-cli'];
  let quitting=false,child;
  const stop=()=>{quitting=true;child?.kill();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
  while(!quitting){
    const log=fs.openSync(path.join(m.runtimeRoot,'logs','service.log'),'a');
    child=spawn(m.nodeBinary,args,{cwd:m.workspace,env,stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
    let unhealthySince=Date.now();
    const sample=()=>{
      let connected=false;
      if(m.backend==='pi'){try{const h=read(path.join(m.runtimeRoot,'pi-health.json'));connected=h.pid===child.pid&&h.state==='connected'&&Date.now()-Date.parse(h.time)<90000;}catch{}}
      else{try{const r=read(path.join(m.channelHome,'registry/processes.json'));connected=r.entries.some(e=>e.pid===child.pid&&e.profileName===m.profile&&e.agentKind===m.backend&&e.botName);}catch{}}
      writeHealth({at:new Date().toISOString(),pid:child.pid,supervisorPid:process.pid,state:connected?'running':'starting',backend:m.backend});
      const recovery=connectionRecovery(connected,unhealthySince);unhealthySince=recovery.since;
      if(recovery.restart)child.kill();
    };
    const timer=setInterval(sample,2000);
    let autoRunning=false;
    const autoTimer=setInterval(async()=>{
      if(autoRunning||quitting)return;
      autoRunning=true;
      try{if(shouldLaunch(m))await launchWorker(m,self);}catch(e){supervisorLog(m.runtimeRoot,'auto-route.launch.failed',e);}
      finally{autoRunning=false;}
    },15000);
    await new Promise(resolve=>{child.once('error',resolve);child.once('exit',resolve);});clearInterval(timer);clearInterval(autoTimer);
    writeHealth({at:new Date().toISOString(),supervisorPid:process.pid,state:'stopped',backend:m.backend});
    if(!quitting)await sleep(35000);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(self)){
  if(process.argv[2]==='--serve'&&process.argv[3]){
    process.on('uncaughtExceptionMonitor',error=>supervisorLog(path.dirname(path.resolve(process.argv[3])),'supervisor.uncaught',error));
  }
  try{
    if(process.argv[2]==='--bootstrap'){
      const m=await stdin();process.env.LARK_CHANNEL_HOME=m.channelHome;
      process.argv=[process.execPath,m.bridgeEntry,'profile','create',m.profile,'--agent','antigravity','--workspace',m.workspace,'--app-id',m.appId,'--app-secret',m.secret];
      await import(pathToFileURL(path.resolve(m.bridgeEntry,'../../dist/cli.js')).href);
    }else if(process.argv[2]==='--serve')await serve(process.argv[3]);
    else if(['--auto-route','--auto-route-file'].includes(process.argv[2])){
      const request=process.argv[2]==='--auto-route-file'?read(process.argv[3]):await stdin();
      if(process.argv[2]==='--auto-route-file')fs.unlinkSync(process.argv[3]);
      try{await runAutoRoute(request.runtimeRoot,{apply,assertIdle,secretFor});}
      catch(e){const logs=path.join(request.runtimeRoot,'logs');fs.mkdirSync(logs,{recursive:true});fs.appendFileSync(path.join(logs,'auto-route.log'),JSON.stringify({at:new Date().toISOString(),event:'auto-route.failed',error:safe(e.message)})+'\n');throw e;}
    }
    else if(process.argv[2]==='--auto-policy'){const request=await stdin();const m=read(path.join(request.runtimeRoot,'route.json'));await savePolicy(m,request.policy);console.log('{}');}
    else if(process.argv[2]==='--service'){
      const request=await stdin();const m=read(path.join(request.runtimeRoot,'route.json'));
      if(!['start','stop','restart'].includes(request.action))throw new Error('无效服务操作');
      await routeLock(m,async()=>{
        const pause=path.join(m.runtimeRoot,'route-paused');
        try{
          if(request.requireIdle){atomic(pause,{until:Date.now()+300000});await sleep(200);assertIdle(m,m);}
          if(request.action!=='start')await stopTask(m.taskName,m);
          if(request.action==='restart')await sleep(32000);
          if(request.action!=='stop')await restoreTask(m.taskName);
        }finally{if(request.requireIdle&&fs.existsSync(pause))fs.unlinkSync(pause);}
      });
    }
    else if(process.argv[2]==='--lifecycle'){const {runLifecycle}=await import('./lifecycle.mjs');console.log(JSON.stringify(await runLifecycle(await stdin())));}
    else await apply(await stdin());
  }catch(e){
    const message=safe(e.message);
    if(process.argv[2]==='--serve'&&process.argv[3]){
      try{const logs=path.join(path.dirname(path.resolve(process.argv[3])),'logs');fs.mkdirSync(logs,{recursive:true});fs.appendFileSync(path.join(logs,'bootstrap.log'),JSON.stringify({at:new Date().toISOString(),event:'supervisor.start.failed',error:message})+'\n');}catch{}
    }
    console.error(message);process.exitCode=1;
  }
}
