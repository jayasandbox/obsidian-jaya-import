import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Importer } from '../../src/core/Importer';
import { VaultIO } from '../../src/core/types';

class InMemoryVault implements VaultIO {
  files = new Map<string, string>();
  configFiles = new Map<string, string>();
  enabledSnippets = new Set<string>();
  enableSnippetReturnValue = true;

  async listAllMarkdown() {
    return new Map([...this.files].filter(([p]) => p.endsWith('.md')));
  }
  async readFile(p: string) {
    const v = this.files.get(p);
    if (v === undefined) throw new Error(`missing: ${p}`);
    return v;
  }
  async writeFile(p: string, c: string) { this.files.set(p, c); }
  async exists(p: string) { return this.files.has(p); }
  async writeConfigFile(p: string, c: string) { this.configFiles.set(p, c); }
  async enableSnippet(name: string): Promise<boolean> {
    if (!this.enableSnippetReturnValue) return false;
    this.enabledSnippets.add(name);
    return true;
  }
}

describe('Importer.run', () => {
  it('creates fresh files when vault is empty', async () => {
    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({
      formatVersion: 1, exportedAt: 'now', jayaVersion: 'x',
      world: { publicId: 'w', name: 'W', slug: 'w' },
      adventure: { title: 'A', publicId: 'a', selectionFingerprint: 'f' },
      entityCounts: {},
    }));
    zip.file('Jaya/W/NPCs/Alice.md',
      '---\njaya-public-id: a-1\naliases:\n  - Alice\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:abc -->\nbody\n<!-- jaya:end -->\n');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const vault = new InMemoryVault();
    const importer = new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' });
    const summary = await importer.run(bytes);

    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(0);
    expect(vault.files.has('Jaya/W/NPCs/Alice.md')).toBe(true);
  });

  it('skips on fingerprint match', async () => {
    const noteContent =
      '---\ntitle: Alice\naliases:\n  - Alice\njaya-public-id: a-1\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:abc -->\nbody\n<!-- jaya:end -->\n';

    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({ formatVersion: 1, exportedAt:'',jayaVersion:'',world:{publicId:'w',name:'',slug:''},adventure:{title:'',publicId:'',selectionFingerprint:''},entityCounts:{} }));
    zip.file('Jaya/W/NPCs/Alice.md', noteContent);
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const vault = new InMemoryVault();
    vault.files.set('Jaya/W/NPCs/Alice.md', noteContent);

    const summary = await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.skippedUnchanged).toBe(1);
  });

  it('splices content and merges aliases on update', async () => {
    const oldContent =
      '---\ntitle: Alice\naliases:\n  - Old Alice\njaya-public-id: a-1\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:OLD -->\nold body\n<!-- jaya:end -->\n' +
      'GM notes\n';
    const newZipContent =
      '---\ntitle: Alice\naliases:\n  - Alice\njaya-public-id: a-1\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:NEW -->\nnew body\n<!-- jaya:end -->\n';

    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({ formatVersion: 1, exportedAt:'',jayaVersion:'',world:{publicId:'w',name:'',slug:''},adventure:{title:'',publicId:'',selectionFingerprint:''},entityCounts:{} }));
    zip.file('Jaya/W/NPCs/Alice.md', newZipContent);
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const vault = new InMemoryVault();
    vault.files.set('Jaya/W/NPCs/Alice.md', oldContent);

    await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    const merged = vault.files.get('Jaya/W/NPCs/Alice.md')!;
    expect(merged).toContain('new body');
    expect(merged).not.toContain('old body');
    expect(merged).toContain('GM notes');
    // Aliases unioned
    expect(merged).toMatch(/aliases:[\s\S]*Alice[\s\S]*Old Alice/);
  });

  it('writes _jaya/jaya-styles.css to .obsidian/snippets/ and enables it', async () => {
    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({
      formatVersion: 1, exportedAt: 'now', jayaVersion: 'x',
      world: { publicId: 'w', name: 'W', slug: 'w' },
      adventure: { title: 'A', publicId: 'a', selectionFingerprint: 'f' },
      entityCounts: {},
    }));
    zip.file('_jaya/jaya-styles.css', '/* test snippet */');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const vault = new InMemoryVault();
    const summary = await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(vault.configFiles.get('.obsidian/snippets/jaya-styles.css')).toBe('/* test snippet */');
    expect(vault.enabledSnippets.has('jaya-styles')).toBe(true);
    expect(summary.cssWritten).toBe(true);
    expect(summary.cssEnabled).toBe(true);
  });

  it('reports cssEnabled=false when adapter cannot enable snippet', async () => {
    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({
      formatVersion: 1, exportedAt: '', jayaVersion: '',
      world: { publicId: 'w', name: '', slug: '' },
      adventure: { title: '', publicId: '', selectionFingerprint: '' },
      entityCounts: {},
    }));
    zip.file('_jaya/jaya-styles.css', '/* x */');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const vault = new InMemoryVault();
    vault.enableSnippetReturnValue = false;
    const summary = await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(summary.cssWritten).toBe(true);
    expect(summary.cssEnabled).toBe(false);
    expect(summary.errors).toEqual([]);
  });

  it('unions cross-export "## Appears in" entries instead of wiping them on re-import', async () => {
    // Existing NPC dossier in vault has accumulated 2 narrative entries from prior exports.
    const existingDossier =
      '---\ntitle: Tomas\naliases:\n  - Tomas\njaya-public-id: npc-1\njaya-entity-type: npc\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:OLD -->\n' +
      '> [!jaya-npc] Tomas\n' +
      '\n' +
      '## Appears in\n' +
      '\n' +
      '- [[Wraiths Beneath the Tower]] — antagonist\n' +
      '- [[The Old Tomb]] — informant\n' +
      '<!-- jaya:end -->\n' +
      'GM notes\n';

    // Vault also has the two existing peer narratives (so they\'re not pruned as dangling).
    const wraithsNarrative =
      '---\ntitle: Wraiths Beneath the Tower\njaya-public-id: nar-1\n---\nbody\n';
    const oldTombNarrative =
      '---\ntitle: The Old Tomb\njaya-public-id: nar-2\n---\nbody\n';

    // New export ships with ONLY the new narrative (selection-scoped) — pre-fix this would wipe the others.
    const newDossier =
      '---\ntitle: Tomas\naliases:\n  - Tomas\njaya-public-id: npc-1\njaya-entity-type: npc\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:NEW -->\n' +
      '> [!jaya-npc] Tomas\n' +
      '\n' +
      '## Appears in\n' +
      '\n' +
      '- [[Curse of the Reliquary]] — antagonist\n' +
      '<!-- jaya:end -->\n';
    const newNarrative =
      '---\ntitle: Curse of the Reliquary\njaya-public-id: nar-3\n---\nbody\n';

    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({
      formatVersion: 2, exportedAt: '', jayaVersion: '',
      world: { publicId: 'w', name: '', slug: '' },
      adventure: { title: '', publicId: '', selectionFingerprint: '' },
      entityCounts: {},
    }));
    zip.file('Jaya/W/NPCs/Tomas.md', newDossier);
    zip.file('Jaya/W/Narratives/Curse of the Reliquary.md', newNarrative);
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const vault = new InMemoryVault();
    vault.files.set('Jaya/W/NPCs/Tomas.md', existingDossier);
    vault.files.set('Jaya/W/Narratives/Wraiths Beneath the Tower.md', wraithsNarrative);
    vault.files.set('Jaya/W/Narratives/The Old Tomb.md', oldTombNarrative);

    await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    const merged = vault.files.get('Jaya/W/NPCs/Tomas.md')!;
    expect(merged).toContain('- [[Wraiths Beneath the Tower]] — antagonist');
    expect(merged).toContain('- [[The Old Tomb]] — informant');
    expect(merged).toContain('- [[Curse of the Reliquary]] — antagonist');
    // GM notes outside the fence stay untouched.
    expect(merged).toContain('GM notes');
  });

  it('prunes a cross-reference entry that exists in neither vault nor incoming export', async () => {
    const existingDossier =
      '---\ntitle: Tomas\naliases:\n  - Tomas\njaya-public-id: npc-1\njaya-entity-type: npc\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:OLD -->\n' +
      '## Appears in\n' +
      '\n' +
      '- [[Wraiths Beneath the Tower]] — antagonist\n' +
      '- [[Phantom Quest]] — informant\n' + // dangler — note never existed in vault
      '<!-- jaya:end -->\n';

    // No "Phantom Quest.md" anywhere in vault.
    const wraithsNarrative =
      '---\ntitle: Wraiths Beneath the Tower\njaya-public-id: nar-1\n---\nbody\n';

    const newDossier =
      '---\ntitle: Tomas\naliases:\n  - Tomas\njaya-public-id: npc-1\njaya-entity-type: npc\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:NEW -->\n' +
      '## Appears in\n' +
      '\n' +
      '- [[Curse of the Reliquary]] — antagonist\n' +
      '<!-- jaya:end -->\n';
    const newNarrative =
      '---\ntitle: Curse of the Reliquary\njaya-public-id: nar-3\n---\nbody\n';

    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({
      formatVersion: 2, exportedAt: '', jayaVersion: '',
      world: { publicId: 'w', name: '', slug: '' },
      adventure: { title: '', publicId: '', selectionFingerprint: '' },
      entityCounts: {},
    }));
    zip.file('Jaya/W/NPCs/Tomas.md', newDossier);
    zip.file('Jaya/W/Narratives/Curse of the Reliquary.md', newNarrative);
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const vault = new InMemoryVault();
    vault.files.set('Jaya/W/NPCs/Tomas.md', existingDossier);
    vault.files.set('Jaya/W/Narratives/Wraiths Beneath the Tower.md', wraithsNarrative);

    await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    const merged = vault.files.get('Jaya/W/NPCs/Tomas.md')!;
    expect(merged).toContain('- [[Wraiths Beneath the Tower]] — antagonist');
    expect(merged).toContain('- [[Curse of the Reliquary]] — antagonist');
    expect(merged).not.toContain('Phantom Quest');
  });

  it('cssWritten=false when zip has no jaya-styles.css', async () => {
    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({
      formatVersion: 1, exportedAt: '', jayaVersion: '',
      world: { publicId: 'w', name: '', slug: '' },
      adventure: { title: '', publicId: '', selectionFingerprint: '' },
      entityCounts: {},
    }));
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const summary = await new Importer(new InMemoryVault(), { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(summary.cssWritten).toBe(false);
    expect(summary.cssEnabled).toBe(false);
  });
});
