import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Importer } from '../../src/core/Importer';
import { VaultIO } from '../../src/core/types';

class InMemoryVault implements VaultIO {
  files = new Map<string, string>();
  async listAllMarkdown() { return new Map([...this.files].filter(([p]) => p.endsWith('.md'))); }
  async readFile(p: string) {
    const v = this.files.get(p);
    if (v === undefined) throw new Error(`missing: ${p}`);
    return v;
  }
  async writeFile(p: string, c: string) { this.files.set(p, c); }
  async exists(p: string) { return this.files.has(p); }
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
});
