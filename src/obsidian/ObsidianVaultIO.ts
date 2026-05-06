import { App, TFile, normalizePath } from 'obsidian';
import { VaultIO } from '../core/types';

export class ObsidianVaultIO implements VaultIO {
  constructor(private readonly app: App) {}

  async listAllMarkdown(): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const mdFiles = this.app.vault.getMarkdownFiles();
    for (const f of mdFiles) {
      out.set(f.path, await this.app.vault.read(f));
    }
    return out;
  }

  async readFile(relPath: string): Promise<string> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(relPath));
    if (!(f instanceof TFile)) throw new Error(`Not a file: ${relPath}`);
    return this.app.vault.read(f);
  }

  async writeFile(relPath: string, content: string): Promise<void> {
    const norm = normalizePath(relPath);
    await this.ensureFolderExists(norm);
    const existing = this.app.vault.getAbstractFileByPath(norm);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(norm, content);
    }
  }

  async exists(relPath: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(normalizePath(relPath)) !== null;
  }

  private async ensureFolderExists(filePath: string): Promise<void> {
    const idx = filePath.lastIndexOf('/');
    if (idx <= 0) return;
    const folder = filePath.slice(0, idx);
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
  }
}
