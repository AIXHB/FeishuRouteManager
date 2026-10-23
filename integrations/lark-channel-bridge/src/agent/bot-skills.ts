import { botSkillPrompt } from '../../../pi-feishu/patched-package/dist/skills/bot-skills.js';
import type { AgentAdapter } from './types';

/** Keep the existing agent's auth, process, permission and session behavior. */
export function withBotSkills(agent: AgentAdapter, appId: string): AgentAdapter {
  return {
    id: agent.id,
    displayName: agent.displayName,
    isAvailable: () => agent.isAvailable(),
    ...(agent.checkAvailability ? { checkAvailability: () => agent.checkAvailability!() } : {}),
    ...(agent.prepareRun ? { prepareRun: (opts: Parameters<NonNullable<AgentAdapter['prepareRun']>>[0]) => agent.prepareRun!(opts) } : {}),
    ...(agent.setBotIdentity ? { setBotIdentity: (identity: Parameters<NonNullable<AgentAdapter['setBotIdentity']>>[0]) => agent.setBotIdentity!(identity) } : {}),
    run: opts => agent.run({ ...opts, prompt: botSkillPrompt(appId) + opts.prompt }),
  };
}
