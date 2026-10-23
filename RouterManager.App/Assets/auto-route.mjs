import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {query} from './agent-data.mjs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const optional=p=>{try{return read(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const write=(p,value)=>{const tmp=p+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');fs.renameSync(tmp,p);};
const file=(m,name)=>path.join(m.runtimeRoot,name);
export const policyFor=m=>optional(file(m,'auto-route.json'))??{enabled:false,fallbackModel:'default'};
const stateFor=m=>optional(file(m,'auto-route-state.json'))??{};

export async function routeLock(m,action){
  fs.mkdirSync(m.runtimeRoot,{recursive:true});
  const require=createRequire(path.resolve(m.bridgeEntry,'../../package.json'));
  const lock=require('proper-lockfile');
  const release=await lock.lock(file(m,'route-operation'),{realpath:false,stale:180000,update:10000,retries:0});
  try{return await action();}finally{await release();}
}
export async function savePolicy(m,policy,now=Date.now()){
  if(typeof policy.enabled!=='boolean'||typeof policy.fallbackModel!=='string'||!/^default$|^[A-Za-z0-9][A-Za-z0-9_.:/@+\-]{0,159}$/.test(policy.fallbackModel))throw new Error('自动路由配置无效');
  return routeLock(m,()=>{
    const current=read(file(m,'route.json'));
    if(current.appId!==m.appId)throw new Error('机器人已变更');
    if(policy.enabled&&current.backend!=='codex'&&!(current.backend==='pi'&&stateFor(m).phase==='switched'&&stateFor(m).original))throw new Error('请先将主路由设为 Codex 再启用自动路由');
    if(policy.enabled&&!fs.existsSync(path.join(m.piRoot,'node_modules/pi-remote-feishu/dist/bin/pi-remote-feishu.js')))throw new Error('请先配置可用的 pi 备用 Agent');
    const old=policyFor(m);
    write(file(m,'auto-route.json'),{...old,...policy,fallbackBackend:'pi',enabledAt:old.enabled?old.enabledAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
  });
}
export function quotaDecision(quota,now=Date.now()){
  const all=quota?.status==='available'?quota.windows??[]:[];
  const windows=all.filter(w=>!w.limitId||w.limitId==='codex');
  const exhausted=windows.filter(w=>Number.isFinite(w.remainingPercent)&&w.remainingPercent<=0);
  const resets=exhausted.map(w=>Number(w.resetsAt)*1000);
  // Every exhausted window must be known; a shorter window's reset is not full recovery.
  const resetAt=exhausted.length&&resets.every(t=>Number.isSafeInteger(t)&&t>now&&t<=8640000000000000)?Math.max(...resets):null;
  return {exhausted:exhausted.length>0,recovered:all.length>0&&all.every(w=>Number.isFinite(w.remainingPercent)&&w.remainingPercent>0),resetAt};
}
export function isQuotaFailure(error){
  return /\b(?:usage[_ -]?limit[_ -]?(?:reached|exceeded)|insufficient[_ -]?quota|quota[_ -]?(?:exhausted|exceeded)|(?:weekly|daily|monthly) (?:usage )?limit (?:reached|exceeded)|you(?:'ve| have) (?:hit|reached) your usage limit)\b|额度(?:已)?(?:耗尽|用尽)|用量(?:已)?(?:达到|超出)上限/i.test(String(error));
}
export function recentFailure(m,policy,state,now=Date.now()){
  const logs=path.join(m.channelHome,'profiles',m.profile,'logs');
  if(!fs.existsSync(logs))return null;
  const cutoff=Math.max(Date.parse(policy.enabledAt)||now,now-15*60*1000,state.handledAt??0);
  let found=null;
  for(const name of fs.readdirSync(logs).filter(n=>/^bridge-.*\.jsonl$/.test(n)).sort().slice(-2)){
    const fd=fs.openSync(path.join(logs,name),'r');let data;
    try{const size=fs.fstatSync(fd).size,buf=Buffer.alloc(Math.min(size,2*1024*1024));fs.readSync(fd,buf,0,buf.length,size-buf.length);data=buf.toString('utf8');}finally{fs.closeSync(fd);}
    for(const line of data.split('\n')){
      let e;try{e=JSON.parse(line);}catch{continue;}
      const at=Date.parse(e.ts);
      if(e.phase!=='run'||e.event!=='failed'||e.agent!=='codex'||!Number.isFinite(at)||at<=cutoff||at>now||!/^oc_[A-Za-z0-9]+$/.test(e.chatId??''))continue;
      // A terminal timeout may justify a read-only quota query, never a switch on its own.
      if(!isQuotaFailure(e.error)&&!/(?:timeout|timed out|no response|stream ended before a terminal event|无响应|超时)/i.test(e.error??'')&&e.result!=='timeout')continue;
      if(!found||at>found.at)found={at,chatId:e.chatId,explicit:isQuotaFailure(e.error),id:e.runId??String(at)};
    }
  }
  return found;
}
export function quotaRequest(m){
  const config=read(path.join(m.channelHome,'config.json')).profiles?.[m.profile];
  if(config?.accounts?.app?.id!==m.appId||!config.codex?.binaryPath)throw new Error('Codex 账号上下文不可用');
  const c=config.codex;
  return {action:'quota',backend:'codex',binary:c.binaryPath,codexHome:c.codexHome||(c.inheritCodexHome===false?path.join(m.channelHome,'profiles',m.profile,'codex-home'):'')};
}
export function resetText(resetAt){return resetAt?new Date(resetAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间，接口预计）':'接口未提供刷新时间，后台每 5 分钟复查'};
export function quotaFeedback(quota){
  return quota?.status==='available'&&quota.windows?.length?quota.windows.map(w=>`${w.label}：剩余 ${w.remainingPercent}%`).join('；'):'额度接口暂不可用；依据 Codex 返回的额度耗尽错误';
}
export function shouldLaunch(m,now=Date.now()){
  if(!policyFor(m).enabled)return false;
  const state=stateFor(m);
  if((state.retryAt??0)>now||state.phase==='switching'&&now-(state.startedAt??0)<180000)return false;
  if(state.phase==='switched'&&m.backend!=='pi')return true;
  if(m.backend==='codex')return Boolean(recentFailure(m,policyFor(m),state,now));
  return state.phase==='switching'||state.phase==='switched'&&(!state.switchNotified||!state.reminded&&(state.nextCheckAt??0)<=now);
}

export async function notify(m,chatId,text,key,secretFor,fetcher=fetch){
  if(!/^oc_[A-Za-z0-9]+$/.test(chatId??''))throw new Error('通知会话无效');
  const secret=secretFor(m);
  const auth=await fetcher('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app_id:m.appId,app_secret:secret}),signal:AbortSignal.timeout(15000)}).then(r=>r.json());
  if(auth.code!==0||!auth.tenant_access_token)throw new Error('自动路由通知认证失败');
  const uuid=createHash('sha256').update(m.appId+':'+key).digest('hex').slice(0,40);
  const result=await fetcher('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${auth.tenant_access_token}`},body:JSON.stringify({receive_id:chatId,msg_type:'text',content:JSON.stringify({text}),uuid}),signal:AbortSignal.timeout(15000)}).then(r=>r.json());
  if(result.code!==0)throw new Error('自动路由通知发送失败（请检查消息权限和会话访问）');
}

// WMI starts outside the scheduled task's job. A detached Node child can still
// be terminated by Stop-ScheduledTask together with its supervisor on Windows.
export async function launchWorker(m,helper,spawnFactory=spawn){
  const requests=path.join(m.managerRoot??path.dirname(path.dirname(m.runtimeRoot)),'auto-route-requests');
  fs.mkdirSync(requests,{recursive:true});
  const request=path.join(requests,randomUUID()+'.json');write(request,{runtimeRoot:m.runtimeRoot});
  const args=[m.nodeBinary,helper,'--auto-route-file',request];
  const quote=s=>{if(/["\r\n]/.test(s))throw new Error('后台启动路径无效');return '"'+s+'"';};
  const script="$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.Encoding]::UTF8;$r=[Console]::In.ReadToEnd()|ConvertFrom-Json;$s=New-CimInstance -CimClass (Get-CimClass Win32_ProcessStartup) -ClientOnly -Property @{ShowWindow=[uint16]0};$p=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$r.command;ProcessStartupInformation=$s};if($p.ReturnValue -ne 0){throw '后台工作进程启动失败'}";
  let launched=false;
  try{
    const child=spawnFactory('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{stdio:['pipe','ignore','pipe'],windowsHide:true});
    child.stderr.resume();child.stdin.on('error',()=>{});
    const timer=setTimeout(()=>child.kill(),25000);
    try{
      const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('无法启动独立自动路由进程')));});
      child.stdin.end(JSON.stringify({command:args.map(quote).join(' ')}));await exit;launched=true;
    }finally{clearTimeout(timer);}
  }finally{if(!launched&&fs.existsSync(request))fs.unlinkSync(request);}
}
export async function autoRouteTick(m,hooks){
  const now=hooks.now?.()??Date.now(),policy=policyFor(m);
  if(!policy.enabled)return;
  let state=stateFor(m);
  // Recover after supervisor/worker restart without replaying a user task.
  if(state.phase==='switching'&&now-(state.startedAt??0)<180000)return;
  if((state.retryAt??0)>now)return;
  const persist=()=>write(file(m,'auto-route-state.json'),state);
  if(state.phase==='switching'){
    state.phase=m.backend==='pi'?'switched':'failed';
    persist();
  }
  if(state.phase==='switched'){
    if(m.backend!=='pi'){state.phase='returned';persist();return;}
    if(!state.switchNotified){
      await hooks.notify(m,state.chatId,`自动路由：Codex 额度耗尽，已切换到 pi Agent（${policy.fallbackModel}）。\n预计刷新：${resetText(state.resetAt)}。\n原请求未自动重放，请重发；两套历史会话分别保留。`,state.eventId+':switched');
      state.switchNotified=true;persist();
    }
    if(state.reminded||(state.nextCheckAt??0)>now)return;
    const q=await hooks.query(quotaRequest(m));const decision=quotaDecision(q,now);
    state.checkedAt=now;state.nextCheckAt=now+300000;
    if(decision.exhausted&&decision.resetAt){
      if(state.resetAt&&now>=state.resetAt)await hooks.notify(m,state.chatId,`原预计刷新时间已到，复查显示额度仍不足。\n${quotaFeedback(q)}\n新的预计刷新：${resetText(decision.resetAt)}；当前继续使用 pi。`,state.eventId+':extended:'+decision.resetAt);
      state.resetAt=decision.resetAt;state.nextCheckAt=decision.resetAt;persist();return;
    }
    if(decision.exhausted){
      if(state.resetAt&&now>=state.resetAt&&!state.waitNotified){
        await hooks.notify(m,state.chatId,'预计刷新时间已到，但复查仍显示 Codex 额度耗尽，新的刷新时间未知。当前继续使用 pi，后台每 5 分钟复查恢复情况。',state.eventId+':still-exhausted');
        state.waitNotified=true;
      }
      persist();return;
    }
    if(decision.recovered||(state.resetAt&&now>=state.resetAt)){
      const text=decision.recovered?'Codex 额度查询显示已恢复，可以在控制台切换回 Codex。':'Codex 预计额度刷新时间已到，当前查询尚未确认恢复；可在控制台查询额度后切回。';
      // Persist the refresh time even if delivery fails; retry notification separately.
      persist();await hooks.notify(m,state.chatId,text+'\n当前继续使用 pi，不会自动切回或中断任务。',state.eventId+':reminder');
      state.reminded=true;state.remindedAt=now;
    }
    persist();return;
  }
  if(m.backend!=='codex')return;
  const failure=recentFailure(m,policy,state,now);if(!failure)return;
  const q=await hooks.query(quotaRequest(m)),decision=quotaDecision(q,now);
  state.handledAt=failure.at;state.checkedAt=now;
  if(!failure.explicit&&!decision.exhausted){persist();return;}
  // Recheck policy, identity and busy status immediately before the transaction.
  if(!policyFor(m).enabled)return;
  hooks.assertIdle(m,m);
  state={...state,phase:'switching',startedAt:now,eventId:failure.id,chatId:failure.chatId,resetAt:decision.resetAt,nextCheckAt:decision.resetAt??now+300000,original:{backend:'codex',model:read(path.join(m.channelHome,'config.json')).profiles[m.profile].preferences?.model??m.model,workspace:m.workspace},switchNotified:false,reminded:false,waitNotified:false};
  persist();
  try{
    // Notify before stopping the bridge, so the user sees the reason even during rollback.
    await hooks.notify(m,state.chatId,`Codex 额度耗尽，正在自动切换到 pi Agent。\n${quotaFeedback(q)}\n预计刷新：${resetText(state.resetAt)}。切换结束后会通知，请暂勿重复提交。`,state.eventId+':starting');
    await hooks.apply(m,policy.fallbackModel);
    state.phase='switched';persist();
    await hooks.notify(m,state.chatId,`已切换到 pi Agent（${policy.fallbackModel}）。请重发未完成请求；不会自动重复执行可能已产生的操作。\n预计刷新：${resetText(state.resetAt)}；到点提醒可切回 Codex。`,state.eventId+':switched');
    state.switchNotified=true;persist();
  }catch(e){
    const current=optional(file(m,'route.json'));
    // A delivery failure after commit must not masquerade as a failed route transaction.
    state.phase=current?.backend==='pi'?'switched':'failed';state.retryAt=now+60000;state.lastError='切换或通知未完成，请查看后台日志';persist();
    if(state.phase==='failed')await hooks.notify(m,state.chatId,'自动切换未完成，已尝试恢复原路由。请查看控制台；本次请求未重放。',state.eventId+':failed').catch(()=>{});
    throw e;
  }
}
export async function runAutoRoute(runtimeRoot,manager){
  const m=read(path.join(runtimeRoot,'route.json'));
  if(!/^cli_[A-Za-z0-9]+$/.test(m.appId)||path.resolve(runtimeRoot)!==path.resolve(m.managerRoot??path.dirname(path.dirname(runtimeRoot)),'bots',m.appId))throw new Error('自动路由目录身份不匹配');
  const require=createRequire(path.resolve(m.bridgeEntry,'../../package.json'));
  let release;
  try{release=await require('proper-lockfile').lock(file(m,'auto-worker'),{realpath:false,stale:180000,update:10000,retries:0});}catch(e){if(e.code==='ELOCKED')return;throw e;}
  try{
    await autoRouteTick(m,{query,assertIdle:manager.assertIdle,notify:(...args)=>notify(...args,manager.secretFor),apply:async(current,model)=>{
      await manager.apply({bot:{id:current.id,name:current.name,appId:current.appId,bridge:current.sourceBridge,root:current.sourceRoot,taskName:current.taskName,busy:false},target:{backend:'pi',model,workspace:current.workspace},paths:{channelHome:current.channelHome,bridgeEntry:current.bridgeEntry,piRoot:current.piRoot,nodeBinary:current.nodeBinary,managerRoot:current.managerRoot??path.dirname(path.dirname(current.runtimeRoot))},expectedBackend:'codex',automatic:true});
    }});
  }finally{await release();}
}
