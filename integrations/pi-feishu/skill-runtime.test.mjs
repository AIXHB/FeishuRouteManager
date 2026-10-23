import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RuntimeHost} from './patched-package/dist/bridge/runtime-host.js';

test('pi prompt loads only this bot skills, preserves UI context and sees uninstall on next request',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'Pi.BotSkills-'));const previous=process.env.FEISHU_ROUTER_MANAGER_ROOT;
  process.env.FEISHU_ROUTER_MANAGER_ROOT=root;
  try {
    for(const [app,skill] of [['cli_one','first-skill'],['cli_two','second-skill']]) {
      const folder=path.join(root,'bots',app,'skills',skill);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'SKILL.md'),'# Example\nExample skill.');
    }
    const seen=[],contexts=[];
    const host=new RuntimeHost({sessionKey:'dm:user',config:{appId:'cli_one',rendering:{mode:'text'},files:{tempDir:path.join(root,'temp')}},channel:{},runtime:{session:{
      extensionRunner:{getUIContext:()=> 'original-ui',setUIContext:ctx=>contexts.push(ctx)},
      prompt:async text=>seen.push(text),
    }}});
    const input={chatId:'chat',messageId:'msg',images:[],text:'Task'};
    await host.prompt(input);
    assert.ok(seen[0].includes('first-skill'));assert.equal(seen[0].includes('second-skill'),false);assert.ok(seen[0].endsWith('Task'));
    assert.equal(contexts.at(-1),'original-ui');
    fs.renameSync(path.join(root,'bots/cli_one/skills/first-skill'),path.join(root,'archive'));
    await host.prompt(input);assert.equal(seen[1].includes('first-skill'),false);
  } finally {if(previous===undefined)delete process.env.FEISHU_ROUTER_MANAGER_ROOT;else process.env.FEISHU_ROUTER_MANAGER_ROOT=previous;fs.rmSync(root,{recursive:true,force:true});}
});
