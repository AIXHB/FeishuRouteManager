import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {botSkillRoot,botSkillPrompt} from '../integrations/pi-feishu/patched-package/dist/skills/bot-skills.js';

test('same workspace bots get independent skill catalogs and removed skills disappear on next run',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'FeishuRouterManager.Skills-'));
  try {
    for(const [app,id] of [['cli_one','only-one'],['cli_two','only-two']]) {
      const folder=path.join(botSkillRoot(app,root),id);fs.mkdirSync(folder,{recursive:true});
      fs.writeFileSync(path.join(folder,'SKILL.md'),`---\nname: ${id}\ndescription: Skill for ${app}\n---\nUse scripts/example.js.\n`);
    }
    const first=botSkillPrompt('cli_one',root),second=botSkillPrompt('cli_two',root);
    assert.ok(first.includes('only-one'));assert.equal(first.includes('only-two'),false);
    assert.ok(second.includes('only-two'));assert.equal(second.includes('only-one'),false);
    assert.ok(botSkillPrompt('cli_empty',root).includes('\n[]\n'));
    assert.ok(first.includes('read its SKILL.md'));
    fs.renameSync(path.join(botSkillRoot('cli_one',root),'only-one'),path.join(root,'uninstalled'));
    const removed=botSkillPrompt('cli_one',root);
    assert.equal(removed.includes('only-one'),false);assert.ok(removed.includes('uninstalled'));
    assert.ok(botSkillPrompt('cli_two',root).includes('only-two'));
    assert.throws(()=>botSkillRoot('../cli_two',root),/Invalid/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('skill catalogs refuse junctions to another bot instead of leaking their contents',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'FeishuRouterManager.SkillLinks-'));
  try {
    const target=botSkillRoot('cli_two',root);fs.mkdirSync(target,{recursive:true});
    const parent=botSkillRoot('cli_one',root);fs.mkdirSync(parent,{recursive:true});
    fs.symlinkSync(target,path.join(parent,'linked-skill'),'junction');
    assert.throws(()=>botSkillPrompt('cli_one',root),/links/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
