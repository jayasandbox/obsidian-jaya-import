export const SUPPORTED_FORMAT_VERSIONS = [1] as const;

export interface ParsedNote {
  relPath: string;
  title: string;
  aliases: string[];
  publicId: string;
  entityType: string;
  fullContent: string;
}

export interface ImportSummary {
  created: number;
  updated: number;
  skippedUnchanged: number;
  errors: string[];
}

export interface ManifestWorld { publicId: string; name: string; slug: string; }
export interface ManifestAdventure { title: string; publicId: string; selectionFingerprint: string; }
export interface Manifest {
  formatVersion: number;
  exportedAt: string;
  jayaVersion: string;
  world: ManifestWorld;
  adventure: ManifestAdventure;
  entityCounts: Record<string, number>;
}

export type ConflictPolicy = 'splice' | 'replace' | 'new';

export interface VaultIO {
  /** Snapshot of all .md files in the vault: relative path -> content. */
  listAllMarkdown(): Promise<Map<string, string>>;
  /** Reads a file by relative path; throws if missing. */
  readFile(relPath: string): Promise<string>;
  /** Creates or overwrites a file; auto-creates parent folders. */
  writeFile(relPath: string, content: string): Promise<void>;
  /** Returns true if a file exists at relPath. */
  exists(relPath: string): Promise<boolean>;
}
