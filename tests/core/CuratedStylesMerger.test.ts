import { describe, it, expect } from 'vitest';
import { mergeCuratedStyles } from '../../src/core/CuratedStylesMerger';

const ENTITY_BLOCK_A =
  '/* @jaya-entity faction:1a2b3c4d */\n' +
  '.jaya-faction-color-1a2b3c4d .callout[data-callout="jaya-npc"] { border-left: 4px solid #aaa; }\n' +
  '.jaya-faction-color-1a2b3c4d .callout[data-callout="jaya-faction"] { border-left: 4px solid #aaa; }\n' +
  '.callout[data-callout="jaya-faction"]:has(.jaya-fc-1a2b3c4d) { border-left: 4px solid #aaa; }\n' +
  '/* @jaya-entity-end faction:1a2b3c4d */\n';

const ENTITY_BLOCK_B =
  '/* @jaya-entity faction:5e6f7a8b */\n' +
  '.jaya-faction-color-5e6f7a8b .callout[data-callout="jaya-npc"] { border-left: 4px solid #bbb; }\n' +
  '.jaya-faction-color-5e6f7a8b .callout[data-callout="jaya-faction"] { border-left: 4px solid #bbb; }\n' +
  '.callout[data-callout="jaya-faction"]:has(.jaya-fc-5e6f7a8b) { border-left: 4px solid #bbb; }\n' +
  '/* @jaya-entity-end faction:5e6f7a8b */\n';

const ENTITY_BLOCK_A_NEWCOLOR = ENTITY_BLOCK_A.replaceAll('#aaa', '#fff');

describe('mergeCuratedStyles', () => {
  it('returns incoming when existing is null', () => {
    const merged = mergeCuratedStyles(null, ENTITY_BLOCK_A);
    expect(merged).toContain('faction:1a2b3c4d');
  });

  it('returns existing entries when incoming has no entity blocks', () => {
    const existing = ENTITY_BLOCK_A;
    const merged = mergeCuratedStyles(existing, '/* header only, no entities */\n');
    expect(merged).toContain('faction:1a2b3c4d');
  });

  it('unions two disjoint entity sets', () => {
    const merged = mergeCuratedStyles(ENTITY_BLOCK_A, ENTITY_BLOCK_B);
    expect(merged).toContain('faction:1a2b3c4d');
    expect(merged).toContain('faction:5e6f7a8b');
    // Deterministic ordering — alphabetical by short-id.
    expect(merged.indexOf('1a2b3c4d')).toBeLessThan(merged.indexOf('5e6f7a8b'));
  });

  it('incoming wins on overlapping short-id', () => {
    const merged = mergeCuratedStyles(ENTITY_BLOCK_A, ENTITY_BLOCK_A_NEWCOLOR);
    expect(merged).toContain('#fff');
    expect(merged).not.toContain('#aaa');
  });

  it('preserves existing entries not present in incoming (additive UNION)', () => {
    // Two existing entities, incoming has only one of them — both should remain.
    const merged = mergeCuratedStyles(ENTITY_BLOCK_A + ENTITY_BLOCK_B, ENTITY_BLOCK_A_NEWCOLOR);
    expect(merged).toContain('faction:1a2b3c4d');
    expect(merged).toContain('faction:5e6f7a8b'); // preserved!
    expect(merged).toContain('#fff'); // incoming color
    expect(merged).toContain('#bbb'); // existing unchanged
  });

  it('handles malformed existing as empty (defensive)', () => {
    const merged = mergeCuratedStyles('this is not valid css with no markers', ENTITY_BLOCK_A);
    expect(merged).toContain('faction:1a2b3c4d');
  });

  it('handles loc:* entities (not just faction)', () => {
    const locBlock =
      '/* @jaya-entity loc:abcdef12 */\n' +
      '.jaya-loc-color-abcdef12 .callout[data-callout="jaya-location-adventure-site"] { border-left: 4px solid #ccc; }\n' +
      '.callout[data-callout="jaya-location-adventure-site"]:has(.jaya-lc-abcdef12) { border-left: 4px solid #ccc; }\n' +
      '/* @jaya-entity-end loc:abcdef12 */\n';
    const merged = mergeCuratedStyles(ENTITY_BLOCK_A, locBlock);
    expect(merged).toContain('faction:1a2b3c4d');
    expect(merged).toContain('loc:abcdef12');
  });

  it('tolerates whitespace and uppercase hex in entity sentinels', () => {
    // Defense-in-depth against future generator-side format drift (extra
    // whitespace, uppercase hex). The merger must still parse the existing
    // file rather than silently dropping its blocks (which would cause data
    // loss on the next curated import).
    const loosenedExisting =
      '/*  @jaya-entity  faction:ABCD1234  */\n' +
      '.jaya-faction-color-abcd1234 { border-left: 4px solid #abc; }\n' +
      '/*  @jaya-entity-end  faction:ABCD1234  */\n';
    const incoming =
      '/* @jaya-entity faction:5e6f7a8b */\n' +
      'incoming-rule\n' +
      '/* @jaya-entity-end faction:5e6f7a8b */\n';

    const merged = mergeCuratedStyles(loosenedExisting, incoming);

    // Existing entry survives the relaxed parse (lowercased key for dedupe).
    expect(merged).toContain('abcd1234');
    // New entry is appended.
    expect(merged).toContain('5e6f7a8b');
  });
});
