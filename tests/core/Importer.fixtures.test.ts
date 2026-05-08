import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Importer } from '../../src/core/Importer';
import { VaultIO } from '../../src/core/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FsBackedVault implements VaultIO {
  constructor(private readonly root: string) {}
  async listAllMarkdown(): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    await walk(this.root, async (full) => {
      if (!full.endsWith('.md')) return;
      const rel = path.relative(this.root, full).replace(/\\/g, '/');
      out.set(rel, await fs.readFile(full, 'utf-8'));
    });
    return out;
  }
  async readFile(rel: string) { return fs.readFile(path.join(this.root, rel), 'utf-8'); }
  async writeFile(rel: string, content: string) {
    const full = path.join(this.root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
  }
  async exists(rel: string) {
    try { await fs.access(path.join(this.root, rel)); return true; } catch { return false; }
  }
  async writeConfigFile(rel: string, content: string) {
    const full = path.join(this.root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
  }
  async enableSnippet(_name: string) { return true; }
}

async function walk(root: string, fn: (filePath: string) => Promise<void>) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) await walk(full, fn);
    else await fn(full);
  }
}

async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

describe('Importer fixture parity', () => {
  it.each([
    '01-fresh-import',
    '02-update-preserves-gm-prose',
    '03-rename-adds-alias',
    '06-fingerprint-skips-unchanged',
  ])('%s — produces expected vault', async (fixture) => {
    const dir = path.join(FIXTURES, fixture);

    // Skip if the fixture isn't authored yet (only 01 ships in Plan A Phase 0)
    if (!(await exists(path.join(dir, 'input.zip')))) return;

    const tmpVault = path.join(dir, '__work-vault');
    await fs.rm(tmpVault, { recursive: true, force: true });

    const preexisting = path.join(dir, 'preexisting-vault');
    if (await exists(preexisting)) await fs.cp(preexisting, tmpVault, { recursive: true });
    else await fs.mkdir(tmpVault, { recursive: true });

    const zipBytes = await fs.readFile(path.join(dir, 'input.zip'));
    await new Importer(new FsBackedVault(tmpVault), { conflictPolicy: 'splice', targetFolder: 'Jaya' })
      .run(new Uint8Array(zipBytes));

    // Compare every file in expected-vault to the work-vault
    const expectedRoot = path.join(dir, 'expected-vault');
    await walk(expectedRoot, async (expectedFull) => {
      if (!expectedFull.endsWith('.md')) return;
      const rel = path.relative(expectedRoot, expectedFull);
      const actual = (await fs.readFile(path.join(tmpVault, rel), 'utf-8')).replace(/\r\n/g, '\n');
      const expected = (await fs.readFile(expectedFull, 'utf-8')).replace(/\r\n/g, '\n');
      expect(actual).toBe(expected);
    });

    await fs.rm(tmpVault, { recursive: true, force: true });
  });
});
