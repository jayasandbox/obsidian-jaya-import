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
  async readConfigFile(p: string): Promise<string | null> {
    return this.configFiles.get(p) ?? null;
  }
  async deleteConfigFile(p: string): Promise<void> {
    this.configFiles.delete(p);
  }
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

  it('preserves accumulated "## Appears in" entries even when the new export OMITS the section', async () => {
    // Real-world scenario from a user bug report. The server only emits
    // `## Appears in` when the export has at least one narrative referencing
    // the entity (see Jaya's ObsidianMarkdownRenderer.cs). If a re-import's
    // selection includes the faction but no narratives that cast it, the
    // incoming faction file ships with NO "## Appears in" section at all —
    // wholesale-splice would erase the user's accumulated cross-export entry.
    const existingDossier =
      '---\ntitle: F\naliases:\n  - F\njaya-public-id: faction-1\njaya-entity-type: faction\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:OLD -->\n' +
      "> [!jaya-faction] F\n" +
      '\n' +
      '## Appears in\n' +
      '\n' +
      "- [[Plague's Wake!]] — scenario-complication faction\n" +
      '<!-- jaya:end -->\n';

    const wraithsNarrative =
      "---\ntitle: Plague's Wake!\njaya-public-id: nar-1\n---\nbody\n";

    // Re-export's faction file has Description + Goals but no Appears in
    // (because this export's selection has no narratives casting the faction).
    const newDossier =
      '---\ntitle: F\naliases:\n  - F\njaya-public-id: faction-1\njaya-entity-type: faction\n---\n' +
      '<!-- jaya:begin v=1 fingerprint=sha256:NEW -->\n' +
      '> [!jaya-faction] F\n' +
      '\n' +
      '## Description\n' +
      '\n' +
      'Circle described round.\n' +
      '\n' +
      '## Goals\n' +
      '\n' +
      '- [[Faction Goal - Kobald Champ]]\n' +
      '<!-- jaya:end -->\n';
    const newGoal =
      '---\ntitle: Faction Goal - Kobald Champ\njaya-public-id: goal-1\n---\nbody\n';

    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({
      formatVersion: 2, exportedAt: '', jayaVersion: '',
      world: { publicId: 'w', name: '', slug: '' },
      adventure: { title: '', publicId: '', selectionFingerprint: '' },
      entityCounts: {},
    }));
    zip.file('Jaya/W/Factions/F.md', newDossier);
    zip.file('Jaya/W/Goals/Faction Goal - Kobald Champ.md', newGoal);
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const vault = new InMemoryVault();
    vault.files.set('Jaya/W/Factions/F.md', existingDossier);
    vault.files.set("Jaya/W/Narratives/Plague's Wake!.md", wraithsNarrative);

    await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    const merged = vault.files.get('Jaya/W/Factions/F.md')!;
    // New content from re-export
    expect(merged).toContain('## Description');
    expect(merged).toContain('Circle described round.');
    expect(merged).toContain('## Goals');
    expect(merged).toContain('- [[Faction Goal - Kobald Champ]]');
    // Preserved cross-export entry — even though the incoming had no Appears in
    expect(merged).toContain('## Appears in');
    expect(merged).toContain("- [[Plague's Wake!]] — scenario-complication faction");
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

  async function makeV3Zip(extras: { defaultCss?: string; curatedCss?: string; userCss?: string }) {
    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({
      formatVersion: 3, exportedAt: 'now', jayaVersion: 'x',
      world: { publicId: 'w', name: 'W', slug: 'w' },
      adventure: { title: 'A', publicId: 'a', selectionFingerprint: 'f' },
      entityCounts: {},
    }));
    if (extras.defaultCss !== undefined) zip.file('_jaya/jaya-default-styles.css', extras.defaultCss);
    if (extras.curatedCss !== undefined) zip.file('_jaya/jaya-curated-styles.css', extras.curatedCss);
    if (extras.userCss !== undefined)    zip.file('_jaya/jaya-user-styles.css', extras.userCss);
    return zip.generateAsync({ type: 'uint8array' });
  }

  const SAMPLE_DEFAULT_CSS =
    '/* @jaya-section layout */\nlayout-rule\n/* @jaya-section-end layout */\n' +
    '/* @jaya-section narrative-defaults */\nnarrative-rule\n/* @jaya-section-end narrative-defaults */\n' +
    '/* @jaya-section goal-defaults */\ngoal-rule\n/* @jaya-section-end goal-defaults */\n' +
    '/* @jaya-section location-defaults */\nlocation-rule\n/* @jaya-section-end location-defaults */\n';

  const SAMPLE_CURATED_CSS =
    '/* @jaya-entity faction:1a2b3c4d */\nfaction-rule\n/* @jaya-entity-end faction:1a2b3c4d */\n';

  const SAMPLE_USER_CSS =
    '/* @jaya-section layout */\nlayout-rule\n/* @jaya-section-end layout */\n' +
    '/* @jaya-entity faction:99887766 */\nuser-faction-rule\n/* @jaya-entity-end faction:99887766 */\n';

  it('Case 1: fresh vault + user export → writes user-styles only', async () => {
    const bytes = await makeV3Zip({ userCss: SAMPLE_USER_CSS });
    const vault = new InMemoryVault();
    const summary = await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(vault.configFiles.has('.obsidian/snippets/jaya-user-styles.css')).toBe(true);
    expect(vault.configFiles.has('.obsidian/snippets/jaya-default-styles.css')).toBe(false);
    expect(vault.configFiles.has('.obsidian/snippets/jaya-curated-styles.css')).toBe(false);
    expect(summary.userCssWritten).toBe(true);
    expect(summary.userCssEnabled).toBe(true);
  });

  it('Case 2: fresh vault + curated → writes defaults + curated', async () => {
    const bytes = await makeV3Zip({ defaultCss: SAMPLE_DEFAULT_CSS, curatedCss: SAMPLE_CURATED_CSS });
    const vault = new InMemoryVault();
    const summary = await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(vault.configFiles.get('.obsidian/snippets/jaya-default-styles.css')).toBe(SAMPLE_DEFAULT_CSS);
    expect(vault.configFiles.get('.obsidian/snippets/jaya-curated-styles.css')).toContain('faction:1a2b3c4d');
    expect(vault.configFiles.has('.obsidian/snippets/jaya-user-styles.css')).toBe(false);
    expect(summary.defaultCssWritten).toBe(true);
    expect(summary.curatedCssWritten).toBe(true);
  });

  it('Case 3: existing user-styles, then curated → user-styles untouched, curated/default added', async () => {
    const vault = new InMemoryVault();
    vault.configFiles.set('.obsidian/snippets/jaya-user-styles.css', SAMPLE_USER_CSS);
    const bytes = await makeV3Zip({ defaultCss: SAMPLE_DEFAULT_CSS, curatedCss: SAMPLE_CURATED_CSS });
    await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(vault.configFiles.get('.obsidian/snippets/jaya-user-styles.css')).toBe(SAMPLE_USER_CSS);
    expect(vault.configFiles.get('.obsidian/snippets/jaya-default-styles.css')).toBe(SAMPLE_DEFAULT_CSS);
    expect(vault.configFiles.get('.obsidian/snippets/jaya-curated-styles.css')).toContain('faction:1a2b3c4d');
  });

  it('Case 4: existing default-styles, then user export → default-styles narrative/goal pruned', async () => {
    const vault = new InMemoryVault();
    vault.configFiles.set('.obsidian/snippets/jaya-default-styles.css', SAMPLE_DEFAULT_CSS);
    const bytes = await makeV3Zip({ userCss: SAMPLE_USER_CSS });
    await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    const prunedDefault = vault.configFiles.get('.obsidian/snippets/jaya-default-styles.css')!;
    expect(prunedDefault).not.toContain('narrative-rule');
    expect(prunedDefault).not.toContain('goal-rule');
    expect(prunedDefault).toContain('layout-rule');
    expect(prunedDefault).toContain('location-rule');
    expect(vault.configFiles.get('.obsidian/snippets/jaya-user-styles.css')).toBe(SAMPLE_USER_CSS);
  });

  it('Case 5: existing curated-styles, then another curated → UNION', async () => {
    const vault = new InMemoryVault();
    vault.configFiles.set('.obsidian/snippets/jaya-curated-styles.css',
      '/* @jaya-entity faction:11111111 */\nold-rule\n/* @jaya-entity-end faction:11111111 */\n');
    const bytes = await makeV3Zip({ defaultCss: SAMPLE_DEFAULT_CSS, curatedCss: SAMPLE_CURATED_CSS });
    await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    const merged = vault.configFiles.get('.obsidian/snippets/jaya-curated-styles.css')!;
    expect(merged).toContain('faction:11111111'); // preserved
    expect(merged).toContain('faction:1a2b3c4d'); // new
  });

  it('Case 6: legacy v2 zip with jaya-styles.css → treated as user-styles', async () => {
    const zip = new JSZip();
    zip.file('_jaya/manifest.json', JSON.stringify({
      formatVersion: 2, exportedAt: 'now', jayaVersion: 'x',
      world: { publicId: 'w', name: 'W', slug: 'w' },
      adventure: { title: 'A', publicId: 'a', selectionFingerprint: 'f' },
      entityCounts: {},
    }));
    zip.file('_jaya/jaya-styles.css', '/* legacy css */');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const vault = new InMemoryVault();
    await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(vault.configFiles.get('.obsidian/snippets/jaya-user-styles.css')).toBe('/* legacy css */');
  });

  it('cleans up legacy jaya-styles.css when any new-format file is present', async () => {
    const vault = new InMemoryVault();
    vault.configFiles.set('.obsidian/snippets/jaya-styles.css', '/* stale */');
    const bytes = await makeV3Zip({ userCss: SAMPLE_USER_CSS });
    await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(vault.configFiles.has('.obsidian/snippets/jaya-styles.css')).toBe(false);
  });

  it('reports *CssEnabled=false when snippet adapter cannot enable', async () => {
    // Graceful degradation: when Obsidian's undocumented customCss API is
    // unavailable, enableSnippet() returns false. The CSS file should still
    // be written, but the *CssEnabled flags should be false. No error pushed.
    const bytes = await makeV3Zip({ userCss: SAMPLE_USER_CSS });
    const vault = new InMemoryVault();
    vault.enableSnippetReturnValue = false;
    const summary = await new Importer(vault, { conflictPolicy: 'splice', targetFolder: 'Jaya' }).run(bytes);

    expect(summary.userCssWritten).toBe(true);
    expect(summary.userCssEnabled).toBe(false);
    expect(summary.errors).toEqual([]);
  });
});
