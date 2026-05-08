import { describe, it, expect } from 'vitest';
import { mergeCrossReferenceSection } from '../../src/core/CrossReferenceMerger';

describe('mergeCrossReferenceSection', () => {
  it('unions existing and incoming "## Appears in" entries for an NPC dossier', () => {
    const existing = [
      '> [!jaya-npc] Tomas',
      '',
      '## Appears in',
      '',
      '- [[Wraiths Beneath the Tower]] — antagonist',
      '- [[The Old Tomb]] — informant',
    ].join('\n');

    const incoming = [
      '> [!jaya-npc] Tomas',
      '',
      '## Appears in',
      '',
      '- [[Curse of the Reliquary]] — antagonist',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'npc',
      new Set(['Wraiths Beneath the Tower', 'The Old Tomb', 'Curse of the Reliquary']),
    );

    const lines = result.split('\n');
    const idx = lines.indexOf('## Appears in');
    expect(idx).toBeGreaterThanOrEqual(0);

    const entryLines = lines.slice(idx + 1).filter((l) => l.startsWith('- '));
    expect(entryLines).toEqual([
      '- [[Curse of the Reliquary]] — antagonist',
      '- [[The Old Tomb]] — informant',
      '- [[Wraiths Beneath the Tower]] — antagonist',
    ]);
  });

  it('unions "## Narratives" entries for a Goal dossier', () => {
    const existing = [
      '## Narratives',
      '',
      '- [[Wraiths Beneath the Tower]]',
      '- [[The Old Tomb]]',
    ].join('\n');

    const incoming = [
      '## Narratives',
      '',
      '- [[Curse of the Reliquary]]',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'goal',
      new Set(['Wraiths Beneath the Tower', 'The Old Tomb', 'Curse of the Reliquary']),
    );

    const entryLines = result.split('\n').filter((l) => l.startsWith('- '));
    expect(entryLines).toEqual([
      '- [[Curse of the Reliquary]]',
      '- [[The Old Tomb]]',
      '- [[Wraiths Beneath the Tower]]',
    ]);
  });

  it('unions "## Appears in" entries for a Faction dossier', () => {
    const existing = [
      '## Appears in',
      '',
      '- [[Wraiths Beneath the Tower]] — antagonist faction',
    ].join('\n');

    const incoming = [
      '## Appears in',
      '',
      '- [[Curse of the Reliquary]] — neutral faction',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'faction',
      new Set(['Wraiths Beneath the Tower', 'Curse of the Reliquary']),
    );

    const entryLines = result.split('\n').filter((l) => l.startsWith('- '));
    expect(entryLines).toEqual([
      '- [[Curse of the Reliquary]] — neutral faction',
      '- [[Wraiths Beneath the Tower]] — antagonist faction',
    ]);
  });

  it('prefers incoming role text on target conflict', () => {
    const existing = [
      '## Appears in',
      '',
      '- [[Wraiths Beneath the Tower]] — informant',
    ].join('\n');

    const incoming = [
      '## Appears in',
      '',
      '- [[Wraiths Beneath the Tower]] — antagonist',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'npc',
      new Set(['Wraiths Beneath the Tower']),
    );

    const entryLines = result.split('\n').filter((l) => l.startsWith('- '));
    expect(entryLines).toEqual(['- [[Wraiths Beneath the Tower]] — antagonist']);
  });

  it('prunes entries whose target is in neither vault nor incoming export', () => {
    const existing = [
      '## Appears in',
      '',
      '- [[Wraiths Beneath the Tower]] — antagonist',
      '- [[Phantom Quest]] — antagonist',
    ].join('\n');

    const incoming = [
      '## Appears in',
      '',
      '- [[Curse of the Reliquary]] — antagonist',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'npc',
      new Set(['Wraiths Beneath the Tower', 'Curse of the Reliquary']),
      // Phantom Quest deliberately absent — should be dropped.
    );

    const entryLines = result.split('\n').filter((l) => l.startsWith('- '));
    expect(entryLines).toEqual([
      '- [[Curse of the Reliquary]] — antagonist',
      '- [[Wraiths Beneath the Tower]] — antagonist',
    ]);
  });

  it('keeps entries whose target appears in the incoming export even if absent from vault', () => {
    // Re-import scenario: a peer narrative is being added by THIS export.
    // It is not yet in the vault but IS in the export, so it must not be pruned.
    const existing = [
      '## Appears in',
      '',
      '- [[Wraiths Beneath the Tower]] — antagonist',
    ].join('\n');

    const incoming = [
      '## Appears in',
      '',
      '- [[Brand New Quest]] — antagonist',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'npc',
      new Set(['Wraiths Beneath the Tower', 'Brand New Quest']),
    );

    const entryLines = result.split('\n').filter((l) => l.startsWith('- '));
    expect(entryLines).toEqual([
      '- [[Brand New Quest]] — antagonist',
      '- [[Wraiths Beneath the Tower]] — antagonist',
    ]);
  });

  it('is a no-op for entity types without a cross-reference section', () => {
    const existing = [
      '## Appears in',
      '',
      '- [[Some Entry]] — role',
    ].join('\n');
    const incoming = '## Appears in\n\n- [[Other]] — role';

    // adventure / location / narrative / world have no consumer-side merge contract
    expect(
      mergeCrossReferenceSection(existing, incoming, 'adventure', new Set(['Some Entry', 'Other'])),
    ).toBe(incoming);
    expect(
      mergeCrossReferenceSection(existing, incoming, 'location', new Set(['Some Entry', 'Other'])),
    ).toBe(incoming);
    expect(
      mergeCrossReferenceSection(existing, incoming, 'narrative', new Set(['Some Entry', 'Other'])),
    ).toBe(incoming);
  });

  it('treats v1 bare wikilinks and v2 path-qualified wikilinks as the same entry (basename dedupe)', () => {
    // Existing dossier was imported under v1 (bare links); incoming is v2 (path-qualified).
    // The same logical narrative should appear once, in the incoming form (incoming wins).
    const existing = [
      '## Appears in',
      '',
      '- [[Wraiths Beneath the Tower]] — informant',
    ].join('\n');

    const incoming = [
      '## Appears in',
      '',
      '- [[Jaya/Curse of the Bone-Magician/Narratives/Wraiths Beneath the Tower|Wraiths Beneath the Tower]] — antagonist',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'npc',
      new Set(['Wraiths Beneath the Tower']),
    );

    const entryLines = result.split('\n').filter((l) => l.startsWith('- '));
    expect(entryLines).toEqual([
      '- [[Jaya/Curse of the Bone-Magician/Narratives/Wraiths Beneath the Tower|Wraiths Beneath the Tower]] — antagonist',
    ]);
  });

  it('returns incoming unchanged when existing has no matching section', () => {
    const existing = [
      '> [!jaya-npc] Tomas',
      '',
      '## Description',
      '',
      'Body text.',
    ].join('\n');

    const incoming = [
      '> [!jaya-npc] Tomas',
      '',
      '## Appears in',
      '',
      '- [[Wraiths Beneath the Tower]] — antagonist',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'npc',
      new Set(['Wraiths Beneath the Tower']),
    );
    expect(result).toBe(incoming);
  });

  it('preserves content surrounding the cross-reference section in the incoming fence body', () => {
    const existing = [
      '## Appears in',
      '',
      '- [[Wraiths Beneath the Tower]] — antagonist',
    ].join('\n');

    const incoming = [
      '> [!jaya-npc] Tomas',
      '> *Member » [[The Black Crown]]*',
      '',
      '## Description',
      '',
      'A wiry man with restless hands.',
      '',
      '## Goals',
      '',
      '- [[Steal the Reliquary]]',
      '',
      '## Appears in',
      '',
      '- [[Curse of the Reliquary]] — antagonist',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'npc',
      new Set(['Wraiths Beneath the Tower', 'Curse of the Reliquary', 'Steal the Reliquary']),
    );

    expect(result).toContain('## Description');
    expect(result).toContain('A wiry man with restless hands.');
    expect(result).toContain('## Goals');
    expect(result).toContain('- [[Steal the Reliquary]]');
    expect(result).toContain('> *Member » [[The Black Crown]]*');
    const entryLines = result
      .split('\n## Appears in')[1]!
      .split('\n')
      .filter((l) => l.startsWith('- '));
    expect(entryLines).toEqual([
      '- [[Curse of the Reliquary]] — antagonist',
      '- [[Wraiths Beneath the Tower]] — antagonist',
    ]);
  });
});
