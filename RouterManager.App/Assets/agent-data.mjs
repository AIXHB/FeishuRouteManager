import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const clean=s=>String(s).replace(/(token|secret|api[_-]?key)(["'\s:=]+)[^"'\s,}]+/gi,'$1$2[hidden]').replace(/\b(?:sk-[\w-]{16,}|[A-Za-z0-9]{32,})\b/g,'[hidden]');
export function parseAgyModels(text){
  return text.split(/\r?\n/).flatMap(line=>{const parts=line.split('\t');return parts.length>=2&&/^[\w.-]+$/.test(parts[0])?[{id:parts[0],name:parts.slice(1).join(' ').trim(),source:'Antigravity CLI'}]:[];});
}
export function codexModels(cache){return (cache?.models??[]).filter(m=>m.visibility!=='hide'&&m.visibility!=='hidden').map(m=>({id:m.slug??m.model??m.id,name:m.display_name??m.displayName??m.slug,source:'Codex 本地模型缓存'})).filter(m=>m.id);}
export function parseQuota(result){
  const buckets=result.rateLimitsByLimitId&&Object.keys(result.rateLimitsByLimitId).length?Object.entries(result.rateLimitsByLimitId):[['codex',result.rateLimits]];
  const windows=[];
  for(const [id,b] of buckets){if(!b)continue;for(const key of ['primary','secondary']){
    const w=b[key];if(!w||typeof w.usedPercent!=='number'||!Number.isFinite(w.usedPercent))continue;
    const minutes=w.windowDurationMins;
    windows.push({limitId:b.limitId??id,label:`${b.limitName??id} · ${minutes?minutes>=1440?`${Math.round(minutes/1440)}天`:minutes>=60?`${minutes/60}小时`:`${minutes}分钟`:key}`,
      remainingPercent:Math.max(0,Math.min(100,100-w.usedPercent)),resetsAt:typeof w.resetsAt==='number'?w.resetsAt:null});
  }}
  return {status:windows.length?'available':'unavailable',summary:windows.length?'已读取账号额度（同账号机器人共享）':'Agent 未返回可用额度数据',windows,source:'Codex account/rateLimits/read'};
}
async function capture(binary,args,env,timeout=20000){
  const child=spawn(binary,args,{env,stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';
  const timer=setTimeout(()=>child.kill(),timeout);
  try{await new Promise((resolve,reject)=>{child.stdout.on('data',c=>{stdout+=c;if(stdout.length>4*1024*1024)child.kill();});child.stderr.on('data',c=>stderr+=c);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(clean(stderr||'Agent 查询超时或退出失败'))));});return stdout;}
  finally{clearTimeout(timer);}
}
export async function rpcRead(binary,env,method,params={},spawnFactory=spawn){
  if(!['model/list','account/rateLimits/read'].includes(method))throw new Error('Only read-only discovery methods are allowed');
  const child=spawnFactory(binary,['app-server','--stdio'],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
  let buffer='',next=1;const pending=new Map();let exitError;
  const rejectAll=e=>{exitError=e;for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();};
  child.on('error',rejectAll);child.on('exit',()=>rejectAll(new Error('Codex 查询进程已退出')));child.stderr.resume();
  child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let r;try{r=JSON.parse(line);}catch{continue;}const p=pending.get(r.id);if(!p)continue;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(new Error(clean(r.error.message))):p.resolve(r.result);}});
  child.stdin.on('error',rejectAll);
  const request=(name,body)=>new Promise((resolve,reject)=>{
    if(exitError){reject(exitError);return;}const id=next++;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Agent 查询超时'));},20000);
    pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method:name,params:body})+'\n');
  });
  try{
    await request('initialize',{clientInfo:{name:'feishu_router_manager',title:'Feishu Router Manager',version:'0.2.0'}});
    child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    const first=await request(method,params);
    if(method!=='model/list')return first;
    let cursor=first.nextCursor;const data=[...(first.data??[])];
    for(let page=0;cursor&&page<10;page++){const r=await request(method,{...params,cursor});data.push(...(r.data??[]));cursor=r.nextCursor;}
    return {...first,data};
  }finally{child.stdin.end();child.kill();rejectAll(new Error('Query completed'));}
}
export async function query(req){
  const env={...process.env};delete env.HERMES_HOME;
  if(req.codexHome)env.CODEX_HOME=req.codexHome;
  if(req.action==='quota'){
    if(req.backend!=='codex')return {status:'unsupported',summary:req.backend==='pi'?'pi 额度由模型服务商管理，当前未提供统一查询接口':'Antigravity CLI 当前未提供额度查询命令',source:'本地 Agent 能力检测',windows:[]};
    try{return parseQuota(await rpcRead(req.binary,env,'account/rateLimits/read'));}
    catch(e){return {status:'unavailable',summary:clean(e.message),source:'Codex account/rateLimits/read',windows:[]};}
  }
  if(req.backend==='codex'){
    const dir=req.codexHome||path.join(os.homedir(),'.codex');
    const cache=path.join(dir,'models_cache.json');let fallback=[];
    if(fs.existsSync(cache)){try{fallback=codexModels(read(cache));}catch{}}
    if(!req.refresh&&fallback.length)return {models:fallback,note:'读取 Codex 已有模型缓存'};
    try{const r=await rpcRead(req.binary,env,'model/list',{limit:100,includeHidden:false});return {models:(r.data??[]).map(m=>({id:m.model??m.id,name:m.displayName??m.model??m.id,source:'Codex model/list'})),note:'已读取 Codex Agent 模型列表'};}
    catch(e){return {models:fallback,note:fallback.length?'在线读取失败，使用已有缓存：'+clean(e.message):clean(e.message)};}
  }
  if(req.backend==='antigravity')return {models:parseAgyModels(await capture(req.binary,['models'],env)),note:'已读取 Antigravity CLI models'};
  if(req.backend==='pi'){
    const agentDir=req.agentDir,models=[];
    const files=[path.join(os.homedir(),'.pi/agent/models.json'),path.join(agentDir,'models.json')];
    const settingsFile=path.join(agentDir,'settings.json');const settings=fs.existsSync(settingsFile)?read(settingsFile):{};
    const providers=new Set(settings.defaultProvider?[settings.defaultProvider]:[]);
    for(const file of files){if(!fs.existsSync(file))continue;const cfg=read(file);for(const [provider,p] of Object.entries(cfg.providers??{})){providers.add(provider);for(const m of p.models??[])models.push({id:`${provider}/${m.id}`,name:m.name??m.id,source:`pi ${provider}`});}}
    try{
      const require=createRequire(path.join(req.piRoot,'package.json'));
      const mod=await import(pathToFileURL(require.resolve('@earendil-works/pi-coding-agent')).href);
      const runtime=await mod.ModelRuntime.create({authPath:path.join(agentDir,'auth.json'),modelsPath:path.join(agentDir,'models.json'),modelsStorePath:path.join(agentDir,'models-store.json'),allowModelNetwork:false});
      for(const m of runtime.getModels())if(providers.has(m.provider)||runtime.hasConfiguredAuth(m.provider))models.push({id:`${m.provider}/${m.id}`,name:m.name??m.id,source:`pi ${m.provider}`});
    }catch{}
    return {models:[...new Map(models.map(m=>[m.id,m])).values()],note:'读取 pi 已配置的模型与服务商目录'};
  }
  return {models:[],note:'该 Agent 暂不支持模型发现'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let input='';for await(const chunk of process.stdin)input+=chunk;
  try{const result=await query(JSON.parse(input));console.log(JSON.stringify(result));}
  catch(e){console.log(JSON.stringify({models:[],note:clean(e.message),status:'unavailable',summary:clean(e.message),windows:[]}));}
}
