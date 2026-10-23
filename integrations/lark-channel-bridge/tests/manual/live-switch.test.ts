import { expect, it } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Supervisor } from '../../src/runtime/supervisor';

// Explicit manual verification only. Uses real WS connections, never sends chat messages.
it.skipIf(process.env.LARK_LIVE_SWITCH_TEST !== '1')('connects the configured bot and switches both backends', async () => {
  const root = join(homedir(), '.lark-channel');
  const sup = new Supervisor({rootDir:root,configPath:join(root,'config.json'),runPreflight:false});
  try {
    await sup.startProfile('codex');
    expect(sup.list()[0]?.agentKind).toBe('codex');
    await sup.controlsFor('codex')!.switchAgent!('antigravity');
    expect(sup.list()[0]?.agentKind).toBe('antigravity');
    await sup.controlsFor('codex')!.switchAgent!('codex');
    expect(sup.list()[0]?.agentKind).toBe('codex');
  } finally {
    if(sup.controlsFor('codex')?.profileConfig.agentKind==='antigravity') await sup.controlsFor('codex')!.switchAgent!('codex');
    await sup.shutdown();
  }
}, 90000);
