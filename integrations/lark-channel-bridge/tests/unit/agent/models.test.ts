import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL,
  isDefaultModel,
  modelLabel,
  normalizeModelSelection,
  resolveModelArg,
  supportedModels,
  modelOptions,
} from '../../../src/agent/models.js';

describe('agent model catalog', () => {
  it('preserves valid manual IDs in settings and adds them to picker options', () => {
    for (const kind of ['codex', 'antigravity'] as const) {
      expect(normalizeModelSelection(kind, 'gpt-6.1-sol')).toBe('gpt-6.1-sol');
      expect(modelOptions(kind, 'gpt-6.1-sol').some(m => m.value === 'gpt-6.1-sol')).toBe(true);
      expect(normalizeModelSelection(kind, 'bad model')).toBe(DEFAULT_MODEL);
    }
    expect(supportedModels('codex').some(m => m.value === 'gpt-6.1-sol')).toBe(false);
  });
  it('forwards newly discovered Codex and Antigravity IDs without static catalog truncation', () => {
    expect(resolveModelArg('codex', 'vendor-future-model-123')).toBe('vendor-future-model-123');
    expect(resolveModelArg('antigravity', 'gemini-test-id')).toBe('gemini-test-id');
    expect(modelLabel('codex', 'vendor-future-model-123')).toBe('vendor-future-model-123');
    expect(resolveModelArg('antigravity', '--broken input')).toBeUndefined();
  });
  it('offers a distinct catalog per agent kind, each led by the default sentinel', () => {
    const claude = supportedModels('claude');
    const codex = supportedModels('codex');
    expect(claude[0]?.value).toBe(DEFAULT_MODEL);
    expect(codex[0]?.value).toBe(DEFAULT_MODEL);
    expect(claude.map((m) => m.value)).toContain('claude-opus-4-8');
    expect(codex.map((m) => m.value)).toContain('gpt-5-codex');
    expect(claude.map((m) => m.value)).not.toContain('gpt-5-codex');
  });

  it('treats unset and the default sentinel as "use agent default"', () => {
    expect(isDefaultModel(undefined)).toBe(true);
    expect(isDefaultModel('')).toBe(true);
    expect(isDefaultModel(DEFAULT_MODEL)).toBe(true);
    expect(isDefaultModel('claude-opus-4-8')).toBe(false);
  });

  it('coerces unknown / cross-agent selections back to the default option', () => {
    expect(normalizeModelSelection('claude', 'claude-opus-4-8')).toBe('claude-opus-4-8');
    // A Codex model left over after switching a profile to Claude is invalid.
    expect(normalizeModelSelection('claude', 'gpt-5-codex')).toBe(DEFAULT_MODEL);
    expect(normalizeModelSelection('claude', undefined)).toBe(DEFAULT_MODEL);
  });

  it('resolves the --model argument, omitting it for the default', () => {
    expect(resolveModelArg('claude', 'claude-sonnet-5')).toBe('claude-sonnet-5');
    expect(resolveModelArg('claude', DEFAULT_MODEL)).toBeUndefined();
    expect(resolveModelArg('claude', undefined)).toBeUndefined();
    // Cross-agent value → no flag rather than a broken model.
    expect(resolveModelArg('codex', 'claude-opus-4-8')).toBeUndefined();
  });

  it('labels a stored value using the picker option text', () => {
    expect(modelLabel('claude', 'claude-opus-4-8')).toBe('Opus 4.8（最新）');
    expect(modelLabel('claude', DEFAULT_MODEL)).toContain('跟随默认');
  });
});
