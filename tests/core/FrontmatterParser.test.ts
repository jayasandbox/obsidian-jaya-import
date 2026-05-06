import { describe, it, expect } from 'vitest';
import { parseFrontmatter, serializeFrontmatter, mergeAliases } from '../../src/core/FrontmatterParser';

describe('parseFrontmatter', () => {
  it('extracts scalar keys', () => {
    const md = '---\ntitle: Tomas the Quiet\njaya-public-id: abc-123\n---\nbody here\n';
    const { fm, body } = parseFrontmatter(md);
    expect(fm.title).toBe('Tomas the Quiet');
    expect(fm['jaya-public-id']).toBe('abc-123');
    expect(body).toBe('body here\n');
  });

  it('extracts list keys', () => {
    const md = '---\naliases:\n  - Tomas the Quiet\n  - Old Tom\n---\nbody\n';
    const { fm } = parseFrontmatter(md);
    expect(fm.aliases).toEqual(['Tomas the Quiet', 'Old Tom']);
  });

  it('returns empty fm when no frontmatter', () => {
    const { fm, body } = parseFrontmatter('just body\n');
    expect(fm).toEqual({});
    expect(body).toBe('just body\n');
  });
});

describe('serializeFrontmatter', () => {
  it('round-trips through parseFrontmatter', () => {
    const fm = {
      title: 'Tomas the Quiet',
      aliases: ['Tomas the Quiet', 'Old Tom'],
      'jaya-public-id': 'abc-123',
    };
    const serialized = serializeFrontmatter(fm);
    const { fm: parsed } = parseFrontmatter(serialized + 'body\n');
    expect(parsed).toEqual(fm);
  });
});

describe('mergeAliases', () => {
  it('unions preserving incoming order', () => {
    expect(mergeAliases(['New', 'Old'], ['Old', 'Older'])).toEqual(['New', 'Old', 'Older']);
  });
});
