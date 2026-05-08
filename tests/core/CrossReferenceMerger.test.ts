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

  it('appends the section into the incoming fence body when existing has entries but incoming omits the section', () => {
    // Real scenario: re-importing a different selection where the faction is no
    // longer cast in any of the export's narratives. Server omits "## Appears in"
    // entirely — see ObsidianMarkdownRenderer.cs which only emits the heading
    // when narrativeRoles.Count > 0.
    const existing = [
      '> [!jaya-faction] The Circle of Hellbound Slaughter',
      '> *Kobold warren*',
      '',
      '## Appears in',
      '',
      "- [[Jaya/Kobald World/Narratives/Plague's Wake!|Plague's Wake!]] — scenario-complication faction",
    ].join('\n');

    const incoming = [
      '> [!jaya-faction] The Circle of Hellbound Slaughter',
      '> *Kobold warren*',
      '',
      '## Description',
      '',
      'Circle described round.',
      '',
      '## Goals',
      '',
      '- [[Jaya/Kobald World/Goals/Faction Goal - Kobald Champ|Faction Goal - Kobald Champ]]',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'faction',
      new Set(["Plague's Wake!", 'Faction Goal - Kobald Champ']),
    );

    expect(result).toContain('## Description');
    expect(result).toContain('Circle described round.');
    expect(result).toContain('## Goals');
    expect(result).toContain('- [[Jaya/Kobald World/Goals/Faction Goal - Kobald Champ|Faction Goal - Kobald Champ]]');
    expect(result).toContain('## Appears in');
    expect(result).toContain(
      "- [[Jaya/Kobald World/Narratives/Plague's Wake!|Plague's Wake!]] — scenario-complication faction",
    );

    // Appears in must be at the END (server convention — see C# renderer).
    expect(result.indexOf('## Appears in')).toBeGreaterThan(result.indexOf('## Goals'));
  });

  it('appends "## Narratives" into the incoming fence body when existing Goal has entries but incoming omits it', () => {
    const existing = [
      '## Narratives',
      '',
      '- [[Jaya/W/Narratives/Old Quest|Old Quest]]',
    ].join('\n');

    const incoming = [
      '> [!jaya-goal-major] G',
      '',
      '## Description',
      '',
      'goal text',
    ].join('\n');

    const result = mergeCrossReferenceSection(
      existing,
      incoming,
      'goal',
      new Set(['Old Quest']),
    );

    expect(result).toContain('## Description');
    expect(result).toContain('## Narratives');
    expect(result).toContain('- [[Jaya/W/Narratives/Old Quest|Old Quest]]');
  });

  it('omits the appended section when all existing entries are dangling (matches server: emit nothing when empty)', () => {
    const existing = [
      '## Appears in',
      '',
      '- [[Phantom Quest]] — antagonist',
    ].join('\n');

    const incoming = [
      '> [!jaya-faction] F',
      '',
      '## Description',
      '',
      'desc',
    ].join('\n');

    // Phantom Quest is in neither vault nor incoming export — should drop.
    const result = mergeCrossReferenceSection(existing, incoming, 'faction', new Set());

    expect(result).toBe(incoming);
    expect(result).not.toContain('## Appears in');
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
