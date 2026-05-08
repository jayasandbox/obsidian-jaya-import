import { ConflictPolicy, ImportSummary, ParsedNote, VaultIO } from './types';
import { readZipEntries } from './ZipReader';
import { validateManifest } from './ManifestValidator';
import { parseFrontmatter, serializeFrontmatter, mergeAliases } from './FrontmatterParser';
import { spliceMarkers, fingerprintFromMarker } from './MarkerSplicer';
import { buildIndexFromFiles } from './PublicIdIndex';
import { mergeCrossReferencesInContent } from './CrossReferenceMerger';

function basename(p: string): string {
  const slash = p.lastIndexOf('/');
  const stem = slash === -1 ? p : p.slice(slash + 1);
  return stem.endsWith('.md') ? stem.slice(0, -3) : stem;
}

export interface ImporterOptions {
  conflictPolicy: ConflictPolicy;
  targetFolder: string; // e.g. "Jaya" — paths in the zip already start with this
}

export class Importer {
  constructor(private readonly vault: VaultIO, private readonly opts: ImporterOptions) {}

  async run(zipBytes: Uint8Array): Promise<ImportSummary> {
    const summary: ImportSummary = {
      created: 0,
      updated: 0,
      skippedUnchanged: 0,
      errors: [],
      cssWritten: false,
      cssEnabled: false,
    };
    const entries = await readZipEntries(zipBytes);

    const manifestBytes = entries.get('_jaya/manifest.json');
    if (manifestBytes === undefined) throw new Error('Zip is missing _jaya/manifest.json — not a Jaya export.');
    validateManifest(new TextEncoder().encode(manifestBytes));

    const cssBytes = entries.get('_jaya/jaya-styles.css');
    if (cssBytes !== undefined) {
      try {
        await this.vault.writeConfigFile('.obsidian/snippets/jaya-styles.css', cssBytes);
        summary.cssWritten = true;
        summary.cssEnabled = await this.vault.enableSnippet('jaya-styles');
      } catch (e) {
        summary.errors.push(`Failed to install jaya-styles.css snippet: ${(e as Error).message}`);
      }
    }

    const allMarkdown = await this.vault.listAllMarkdown();
    const index = buildIndexFromFiles(allMarkdown);

    // Build the set of known target basenames (union of vault + incoming export
    // markdown notes) so the cross-reference merger can prune dangling entries.
    const knownTargetBasenames = new Set<string>();
    for (const p of allMarkdown.keys()) knownTargetBasenames.add(basename(p));
    for (const name of entries.keys()) {
      if (name.endsWith('.md') && !name.startsWith('_jaya/') && name !== 'README.md') {
        knownTargetBasenames.add(basename(name));
      }
    }

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

      const merged = this.merge(
        existingContent,
        content,
        this.opts.conflictPolicy,
        note.entityType,
        knownTargetBasenames,
      );
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

  private merge(
    existing: string,
    incoming: string,
    policy: ConflictPolicy,
    entityType: string,
    knownTargetBasenames: Set<string>,
  ): string {
    if (policy === 'replace') return incoming;
    // 'new' policy is handled at orchestration level (different filename); here treated as splice

    // Union the cross-export H2 sections (## Appears in / ## Narratives) BEFORE
    // splicing so the existing dossier's accumulated peer entries aren't wiped
    // when this export's selection is narrower than a previous one.
    const incomingMerged = mergeCrossReferencesInContent(
      existing,
      incoming,
      entityType,
      knownTargetBasenames,
    );

    const splicedContent = spliceMarkers(existing, incomingMerged);

    // Re-write the spliced file's frontmatter aliases as union of incoming + existing.
    // Use original `incoming` (not `incomingMerged`) — the cross-reference merger only
    // touches the fence body, so its frontmatter is byte-identical to incoming's.
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
