import { App, Modal, Notice } from 'obsidian';
import type MyPlugin from '../main';
import { Importer } from '../core/Importer';
import { ObsidianVaultIO } from './ObsidianVaultIO';
import { SummaryModal } from './SummaryModal';

export class ImportModal extends Modal {
  constructor(app: App, private readonly plugin: MyPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Import Jaya Adventure' });
    contentEl.createEl('p', {
      text: 'Choose the .zip you exported from Jaya. The plugin matches existing notes by jaya-public-id and splices new content while preserving anything outside the markers.',
    });

    const fileInput = contentEl.createEl('input', { attr: { type: 'file', accept: '.zip' } });
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files || fileInput.files.length === 0) return;
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        new Notice('Jaya import: starting…');
        const importer = new Importer(new ObsidianVaultIO(this.app), {
          conflictPolicy: this.plugin.settings.conflictPolicy,
          targetFolder: this.plugin.settings.targetFolder,
        });
        const summary = await importer.run(new Uint8Array(buffer));
        this.close();
        if (this.plugin.settings.showSummaryModal) {
          new SummaryModal(this.app, summary).open();
        } else {
          new Notice(
            `Jaya import: created ${summary.created}, updated ${summary.updated}, skipped ${summary.skippedUnchanged}.`,
          );
        }
      } catch (e) {
        new Notice(`Jaya import failed: ${(e as Error).message}`);
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
