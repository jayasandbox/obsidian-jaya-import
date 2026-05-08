import { App, Modal } from 'obsidian';
import type { ImportSummary } from '../core/types';

export class SummaryModal extends Modal {
  constructor(app: App, private readonly summary: ImportSummary) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, summary } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Jaya import — summary' });

    const list = contentEl.createEl('ul');
    list.createEl('li', { text: `Created: ${summary.created}` });
    list.createEl('li', { text: `Updated: ${summary.updated}` });
    list.createEl('li', { text: `Skipped (unchanged): ${summary.skippedUnchanged}` });

    if (summary.cssWritten) {
      if (summary.cssEnabled) {
        list.createEl('li', { text: 'Style snippet installed and enabled.' });
      } else {
        const li = list.createEl('li', {
          text: 'Style snippet installed. Enable it in Settings → Appearance → CSS snippets ("jaya-styles").',
        });
        li.style.fontWeight = 'bold';
      }
    }

    if (summary.errors.length > 0) {
      const errEl = contentEl.createEl('div');
      errEl.createEl('h3', { text: 'Errors' });
      const errList = errEl.createEl('ul');
      for (const e of summary.errors) errList.createEl('li', { text: e });
    }

    const btn = contentEl.createEl('button', { text: 'Close' });
    btn.addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
