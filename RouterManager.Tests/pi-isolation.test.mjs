import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('two pi bots have isolated package roots, files and credentials only in child environment',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'FeishuRouterManager.PiIsolation-'));
  const children=[],pids=[];
  try{
    const source=path.join(root,'source');
    fs.mkdirSync(path.join(source,'.pi'),{recursive:true});fs.mkdirSync(path.join(source,'.agent'),{recursive:true});
    fs.writeFileSync(path.join(source,'.pi/feishu.json'),JSON.stringify({appId:'cli_source',appSecret:'fixture-secret',sessions:{},files:{}}));
    const pkg=path.join(source,'node_modules/pi-remote-feishu');
    fs.mkdirSync(path.join(pkg,'dist/bin'),{recursive:true});
    fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({type:'module'}));
    fs.writeFileSync(path.join(source,'service-runtime.mjs'),`import fs from 'node:fs';import {fileURLToPath} from 'node:url';export function acquireBridgeLock(){fs.writeFileSync(new URL('./isolated-root.txt',import.meta.url),fileURLToPath(new URL('.',import.meta.url)));}`);
    fs.writeFileSync(path.join(pkg,'dist/bin/pi-remote-feishu.js'),`import fs from 'node:fs';import {acquireBridgeLock} from ${JSON.stringify(pathToFileURL(path.join(source,'service-runtime.mjs')).href)};
      acquireBridgeLock();if(process.env.FEISHU_APP_SECRET!=='fixture-secret')process.exit(2);
      const sample=()=>fs.writeFileSync(process.env.PI_FEISHU_HEALTH_PATH,JSON.stringify({time:new Date().toISOString(),pid:process.pid,state:'connected'}));sample();setInterval(sample,500);`);
    const helper=fileURLToPath(new URL('../RouterManager.App/Assets/manager.mjs',import.meta.url));
    for(const name of ['one','two']){
      const runtime=path.join(root,name);fs.mkdirSync(runtime);
      const manifest={backend:'pi',runtimeRoot:runtime,sourceBridge:1,sourceRoot:source,piRoot:source,workspace:root,model:'default',appId:'cli_'+name,name,profile:name,nodeBinary:process.execPath};
      const file=path.join(runtime,'route.json');fs.writeFileSync(file,JSON.stringify(manifest));
      const child=spawn(process.execPath,[helper,'--serve',file],{env:{...process.env,DEEPSEEK_API_KEY:'fixture-no-network'},windowsHide:true,stdio:['ignore','pipe','pipe']});
      let errors='';child.stderr.on('data',c=>errors+=c.toString());children.push(child);
      let health;
      for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));try{health=JSON.parse(fs.readFileSync(path.join(runtime,'health.json')));if(health.state==='running')break;}catch{}if(child.exitCode!==null)throw new Error(errors);}
      assert.equal(health?.state,'running',errors);pids.push(health.pid);
      assert.ok(fs.readFileSync(path.join(runtime,'isolated-root.txt'),'utf8').includes(name));
      const config=JSON.parse(fs.readFileSync(path.join(runtime,'pi-config.json')));
      assert.equal(config.appSecret,undefined);assert.equal(config.appId,'cli_'+name);
      assert.equal(config.files.tempDir,path.join(runtime,'pi-files'));
    }
    assert.equal(fs.existsSync(path.join(source,'isolated-root.txt')),false);
    assert.notEqual(pids[0],pids[1]);
  }finally{
    for(const child of children)child.kill();for(const pid of pids){try{process.kill(pid);}catch{}}
    await new Promise(r=>setTimeout(r,500));fs.rmSync(root,{recursive:true,force:true});
  }
});
