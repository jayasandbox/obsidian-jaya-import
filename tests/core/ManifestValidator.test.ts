import { describe, it, expect } from 'vitest';
import { validateManifest } from '../../src/core/ManifestValidator';

describe('validateManifest', () => {
  it('accepts formatVersion 1', () => {
    const m = JSON.stringify({
      formatVersion: 1, exportedAt: 'now', jayaVersion: 'x',
      world: { publicId: 'w', name: 'W', slug: 'w' },
      adventure: { title: 'A', publicId: 'a', selectionFingerprint: 'f' },
      entityCounts: {},
    });
    const parsed = validateManifest(new TextEncoder().encode(m));
    expect(parsed.formatVersion).toBe(1);
  });

  it('accepts formatVersion 2', () => {
    const m = JSON.stringify({
      formatVersion: 2, exportedAt: 'now', jayaVersion: 'x',
      world: { publicId: 'w', name: 'W', slug: 'w' },
      adventure: { title: 'A', publicId: 'a', selectionFingerprint: 'f' },
      entityCounts: {},
    });
    const parsed = validateManifest(new TextEncoder().encode(m));
    expect(parsed.formatVersion).toBe(2);
  });

  it('rejects unknown formatVersion with helpful error', () => {
    const m = JSON.stringify({ formatVersion: 999 });
    expect(() => validateManifest(new TextEncoder().encode(m))).toThrow(/formatVersion/);
  });

  it('rejects malformed JSON', () => {
    expect(() => validateManifest(new TextEncoder().encode('not json'))).toThrow();
  });
});
