import { describe, it, expect } from 'vitest';
import { pruneNarrativeAndGoalSections } from '../../src/core/DefaultStylesPruner';

const FULL_DEFAULTS =
  '/* @jaya-section layout */\n' +
  '.callout[data-callout^="jaya-narrative-"] { position: relative; }\n' +
  '/* @jaya-section-end layout */\n' +
  '\n' +
  '/* @jaya-section narrative-defaults */\n' +
  '.callout[data-callout="jaya-narrative-quest"] { border-left: 4px solid #8bc97b; }\n' +
  '/* @jaya-section-end narrative-defaults */\n' +
  '\n' +
  '/* @jaya-section goal-defaults */\n' +
  '.callout[data-callout="jaya-goal-major"] { border-left: 4px solid #c9a227; }\n' +
  '/* @jaya-section-end goal-defaults */\n' +
  '\n' +
  '/* @jaya-section location-defaults */\n' +
  '.callout[data-callout="jaya-location-settlement"] { border-left: 4px solid #b8860b; }\n' +
  '/* @jaya-section-end location-defaults */\n';

describe('pruneNarrativeAndGoalSections', () => {
  it('removes narrative-defaults and goal-defaults sections', () => {
    const pruned = pruneNarrativeAndGoalSections(FULL_DEFAULTS);
    expect(pruned).not.toContain('@jaya-section narrative-defaults');
    expect(pruned).not.toContain('@jaya-section goal-defaults');
    expect(pruned).not.toContain('jaya-narrative-quest');
    expect(pruned).not.toContain('jaya-goal-major');
  });

  it('preserves layout and location-defaults sections', () => {
    const pruned = pruneNarrativeAndGoalSections(FULL_DEFAULTS);
    expect(pruned).toContain('@jaya-section layout');
    expect(pruned).toContain('@jaya-section location-defaults');
    expect(pruned).toContain('jaya-location-settlement');
    expect(pruned).toContain('position: relative;');
  });

  it('is idempotent on already-pruned input', () => {
    const a = pruneNarrativeAndGoalSections(FULL_DEFAULTS);
    const b = pruneNarrativeAndGoalSections(a);
    expect(b).toBe(a);
  });

  it('leaves input unchanged when no matching sections exist', () => {
    const noMatch = '/* @jaya-section layout */\nfoo\n/* @jaya-section-end layout */\n';
    expect(pruneNarrativeAndGoalSections(noMatch)).toBe(noMatch);
  });
});
