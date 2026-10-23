import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CodexAdapter } from '../../../src/agent/codex/adapter';
import { AntigravityAdapter } from '../../../src/agent/antigravity/adapter';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema';
import { createRootConfig, loadRootConfig, saveRootConfig } from '../../../src/config/profile-store';
import { Supervisor } from '../../../src/runtime/supervisor';
import type { StartChannelDeps } from '../../../src/bot/channel';

let root: string;
let sup: Supervisor;
let latest: StartChannelDeps;
let idle = true;
let connectionFailure = false;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'agent-switch-'));
  await mkdir(join(root, 'profiles', 'codex'), {recursive:true});
  idle = true;
  connectionFailure = false;
  vi.spyOn(CodexAdapter.prototype, 'checkAvailability').mockResolvedValue({ok:true});
  vi.spyOn(AntigravityAdapter.prototype, 'checkAvailability').mockResolvedValue({ok:true});
  const profile = createDefaultProfileConfig({agentKind:'codex', accounts:{app:{id:'cli_switch',secret:'${APP_SECRET}',tenant:'feishu'}},codex:{binaryPath:'codex'},permissions:{defaultAccess:'workspace',maxAccess:'workspace'}});
  await saveRootConfig(createRootConfig('codex',profile),join(root,'config.json'));
  sup = new Supervisor({configPath:join(root,'config.json'),rootDir:root,runPreflight:false,startChannelFn:async(deps)=>{
    if(connectionFailure && deps.agent.id==='antigravity') throw new Error('handshake failed');
    latest=deps;
    return {channel:{botIdentity:{name:'test'}} as never,isIdle:()=>idle,pauseForSwitch:()=>()=>{},disconnect:async()=>{await deps.sessions.flush();await deps.sessionCatalog?.flush();}};
  }});
  await sup.startProfile('codex');
});
afterEach(async()=>{await sup.shutdown();vi.restoreAllMocks();await rm(root,{recursive:true,force:true});});

it('switches both ways, isolates sessions, and persists selection across restart',async()=>{
  latest.sessions.set('chat','codex-session','C:/workspace');
  await sup.controlsFor('codex')!.switchAgent!('antigravity');
  expect(latest.agent.id).toBe('antigravity');
  expect(latest.sessions.resumeFor('chat','C:/workspace')).toBeUndefined();
  latest.sessions.set('chat','agy-conversation','C:/workspace');
  await sup.controlsFor('codex')!.switchAgent!('codex');
  expect(latest.sessions.resumeFor('chat','C:/workspace')).toBe('codex-session');
  await sup.controlsFor('codex')!.switchAgent!('antigravity');
  expect(latest.sessions.resumeFor('chat','C:/workspace')).toBe('agy-conversation');
  await sup.stopProfile('codex');
  await sup.startProfile('codex');
  expect(latest.agent.id).toBe('antigravity');
  expect(latest.sessions.resumeFor('chat','C:/workspace')).toBe('agy-conversation');
});
it('refuses switching while work is active without changing config',async()=>{
  idle=false;
  await expect(sup.controlsFor('codex')!.switchAgent!('antigravity')).rejects.toThrow('排队');
  expect((await loadRootConfig(join(root,'config.json')))!.profiles.codex!.agentKind).toBe('codex');
  expect(latest.agent.id).toBe('codex');
});
it('keeps the original backend and configuration if the replacement fails to connect',async()=>{
  connectionFailure=true;
  await expect(sup.controlsFor('codex')!.switchAgent!('antigravity')).rejects.toThrow('handshake failed');
  expect(latest.agent.id).toBe('codex');
  expect((await loadRootConfig(join(root,'config.json')))!.profiles.codex!.agentKind).toBe('codex');
});
it('refuses switching to a backend whose CLI is unavailable',async()=>{
  vi.mocked(AntigravityAdapter.prototype.checkAvailability).mockResolvedValue({ok:false,error:new Error('missing agy')} as never);
  await expect(sup.controlsFor('codex')!.switchAgent!('antigravity')).rejects.toThrow('missing agy');
  expect(latest.agent.id).toBe('codex');
});
