import { describe, expect, it } from 'vitest';
import { ActiveRuns } from '../../../src/bot/active-runs';
import { ProcessPool } from '../../../src/bot/process-pool';
import type { RunPolicyAllow } from '../../../src/policy/run-policy';
import { RunExecutor } from '../../../src/runtime/run-executor';
import { FakeAgentAdapter } from '../../helpers/fake-agent';
import { managerRoutePaused } from '../../../src/runtime/run-executor';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('RunExecutor policy runtime options', () => {
  it('blocks new work during manager transaction and admits it after expiry or removal', async () => {
    const root=mkdtempSync(join(tmpdir(),'manager-gate-'));
    const previous=process.env.FEISHU_ROUTER_PAUSE_FILE;
    try {
      const file=join(root,'paused');process.env.FEISHU_ROUTER_PAUSE_FILE=file;
      expect(managerRoutePaused()).toBe(false);
      writeFileSync(file,JSON.stringify({until:Date.now()+60000}));
      const agent=new FakeAgentAdapter();
      const executor=new RunExecutor({agent,pool:new ProcessPool(()=>1),activeRuns:new ActiveRuns(),now:()=>1000});
      await expect(executor.submit({scopeId:'blocked',policy:policy()})).rejects.toMatchObject({code:'reconnect-in-progress'});
      expect(agent.runOptions).toHaveLength(0);
      writeFileSync(file,JSON.stringify({until:Date.now()-1}));expect(managerRoutePaused()).toBe(false);
      writeFileSync(file,'broken');expect(managerRoutePaused()).toBe(true);
    } finally {
      if(previous===undefined)delete process.env.FEISHU_ROUTER_PAUSE_FILE;else process.env.FEISHU_ROUTER_PAUSE_FILE=previous;
      rmSync(root,{recursive:true,force:true});
    }
  });
  it('passes policy sandbox and permission mode into each agent run', async () => {
    const agent = new FakeAgentAdapter({
      events: [{ type: 'done', terminationReason: 'normal' }],
    });
    const executor = new RunExecutor({
      agent,
      pool: new ProcessPool(() => 1),
      activeRuns: new ActiveRuns(),
      createRunId: () => 'run-policy',
      now: () => 1000,
      postDoneExitGraceMs: 10,
    });

    const execution = await executor.submit({
      scopeId: 'scope-policy',
      policy: policy({
        sandbox: 'workspace-write',
        permissionMode: 'acceptEdits',
      }),
    });

    expect(agent.runOptions[0]).toMatchObject({
      runId: 'run-policy',
      sandbox: 'workspace-write',
      permissionMode: 'acceptEdits',
    });

    await collect(execution.subscribe());
  });
});

function policy(overrides: Partial<RunPolicyAllow> = {}): RunPolicyAllow {
  return {
    ok: true,
    prompt: 'hello',
    requestedCwd: '/tmp/repo',
    cwdRealpath: '/tmp/repo',
    accessMode: 'workspace',
    sandbox: 'workspace-write',
    permissionMode: 'acceptEdits',
    access: { ok: true, reason: 'allowed-user' },
    attachments: [],
    policyFingerprint: 'fp',
    expiresAt: 2000,
    ...overrides,
  };
}

async function collect(events: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const event of events) out.push(event);
  return out;
}
