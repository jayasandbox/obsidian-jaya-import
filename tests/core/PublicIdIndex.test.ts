import { describe, it, expect } from 'vitest';
import { buildIndexFromFiles } from '../../src/core/PublicIdIndex';

describe('buildIndexFromFiles', () => {
  it('maps publicId to relative path', () => {
    const files = new Map<string, string>([
      ['World/NPCs/Alice.md', '---\njaya-public-id: aaa\n---\nbody\n'],
      ['World/Factions/Crew.md', '---\njaya-public-id: bbb\n---\nbody\n'],
      ['Random.md', 'no frontmatter\n'],
    ]);
    const index = buildIndexFromFiles(files);
    expect(index.get('aaa')).toBe('World/NPCs/Alice.md');
    expect(index.get('bbb')).toBe('World/Factions/Crew.md');
    expect(index.size).toBe(2);
  });
});
