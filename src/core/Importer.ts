import { ConflictPolicy, ImportSummary, ParsedNote, VaultIO } from './types';
import { readZipEntries } from './ZipReader';
import { validateManifest } from './ManifestValidator';
import { parseFrontmatter, serializeFrontmatter, mergeAliases } from './FrontmatterParser';
import { spliceMarkers, fingerprintFromMarker } from './MarkerSplicer';
import { buildIndexFromFiles } from './PublicIdIndex';

export interface ImporterOptions {
  conflictPolicy: ConflictPolicy;
  targetFolder: string; // e.g. "Jaya" — paths in the zip already start with this
}

export class Importer {
  constructor(private readonly vault: VaultIO, private readonly opts: ImporterOptions) {}

  async run(zipBytes: Uint8Array): Promise<ImportSummary> {
    const summary: ImportSummary = { created: 0, updated: 0, skippedUnchanged: 0, errors: [] };
    const entries = await readZipEntries(zipBytes);

    const manifestBytes = entries.get('_jaya/manifest.json');
    if (manifestBytes === undefined) throw new Error('Zip is missing _jaya/manifest.json — not a Jaya export.');
    validateManifest(new TextEncoder().encode(manifestBytes));

    const allMarkdown = await this.vault.listAllMarkdown();
    const index = buildIndexFromFiles(allMarkdown);

    for (const [name, content] of entries) {
      if (!name.endsWith('.md')) continue;
      if (name.startsWith('_jaya/')) continue;
      if (name === 'README.md') {
        await this.vault.writeFile(`${this.opts.targetFolder}/README.md`, content);
        continue;
      }

      const note = this.parseNote(name, content);
      const existingPath = index.get(note.publicId);

      if (existingPath === undefined) {
        await this.vault.writeFile(name, content);
        summary.created++;
        continue;
      }

      const existingContent = await this.vault.readFile(existingPath);
      const existingFp = fingerprintFromMarker(existingContent);
      const incomingFp = fingerprintFromMarker(content);
      if (existingFp !== null && existingFp === incomingFp) {
        summary.skippedUnchanged++;
        continue;
      }

      const merged = this.merge(existingContent, content, this.opts.conflictPolicy);
      await this.vault.writeFile(existingPath, merged);
      summary.updated++;
    }

    return summary;
  }

  private parseNote(relPath: string, content: string): ParsedNote {
    const { fm } = parseFrontmatter(content);
    return {
      relPath,
      title: typeof fm.title === 'string' ? fm.title : '',
      aliases: Array.isArray(fm.aliases) ? fm.aliases : [],
      publicId: typeof fm['jaya-public-id'] === 'string' ? fm['jaya-public-id'] : '',
      entityType: typeof fm['jaya-entity-type'] === 'string' ? fm['jaya-entity-type'] : '',
      fullContent: content,
    };
  }

  private merge(existing: string, incoming: string, policy: ConflictPolicy): string {
    if (policy === 'replace') return incoming;
    // 'new' policy is handled at orchestration level (different filename); here treated as splice
    const splicedContent = spliceMarkers(existing, incoming);

    // Re-write the spliced file's frontmatter aliases as union of incoming + existing
    const { fm: existingFm } = parseFrontmatter(existing);
    const { fm: incomingFm } = parseFrontmatter(incoming);
    const existingAliases = Array.isArray(existingFm.aliases) ? existingFm.aliases : [];
    const incomingAliases = Array.isArray(incomingFm.aliases) ? incomingFm.aliases : [];
    const mergedAliases = mergeAliases(incomingAliases, existingAliases);

    const { fm: splicedFm, body: splicedBody } = parseFrontmatter(splicedContent);
    splicedFm.aliases = mergedAliases;
    return serializeFrontmatter(splicedFm) + splicedBody;
  }
}
