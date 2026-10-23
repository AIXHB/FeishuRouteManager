import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { CodexAdapter } from '../../../src/agent/codex/adapter';
import { AntigravityAdapter } from '../../../src/agent/antigravity/adapter';
import { createRuntimeAgent } from '../../../src/runtime/agent-runtime';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema';
import type { AgentRun, AgentRunOptions } from '../../../src/agent/types';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});

it.each(['codex','antigravity'] as const)('%s runtime forwards only its bot skill catalog and preserves session/model/permissions',kind=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'Bridge.BotSkills-'));
  vi.stubEnv('FEISHU_ROUTER_MANAGER_ROOT',root);
  try {
    for(const app of ['cli_one','cli_two']) {
      const folder=path.join(root,'bots',app,'skills',app==='cli_one'?'first-skill':'second-skill');fs.mkdirSync(folder,{recursive:true});
      fs.writeFileSync(path.join(folder,'SKILL.md'),'---\nname: example\ndescription: Example\n---\nInstructions');
    }
    const run={} as AgentRun;
    const spy=kind==='codex'?vi.spyOn(CodexAdapter.prototype,'run').mockReturnValue(run):vi.spyOn(AntigravityAdapter.prototype,'run').mockReturnValue(run);
    const agent=createRuntimeAgent(createDefaultProfileConfig({agentKind:kind,accounts:{app:{id:'cli_one',secret:'fixture',tenant:'feishu'}},...(kind==='codex'?{codex:{binaryPath:process.execPath}}:{})}),{profileDir:root});
    const options:AgentRunOptions={runId:'run',prompt:'User task',cwd:root,model:'test-model',threadId:'original-thread',sessionId:'original-session',sandbox:'workspace-write'};
    expect(agent.run(options)).toBe(run);
    const forwarded=spy.mock.calls[0]![0];
    expect(forwarded.prompt).toContain('first-skill');expect(forwarded.prompt).not.toContain('second-skill');
    expect(forwarded.prompt.endsWith('User task')).toBe(true);
    expect({...forwarded,prompt:options.prompt}).toEqual(options);
    fs.renameSync(path.join(root,'bots/cli_one/skills/first-skill'),path.join(root,'archived'));
    agent.run(options);expect(spy.mock.calls[1]![0].prompt).not.toContain('first-skill');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
