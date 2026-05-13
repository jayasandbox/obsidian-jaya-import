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

    const renderCssRow = (label: string, written: boolean, enabled: boolean, name: string) => {
      if (!written) return;
      if (enabled) {
        list.createEl('li', { text: `${label}: installed and enabled.` });
      } else {
        const li = list.createEl('li', {
          text: `${label}: installed. Enable it in Settings → Appearance → CSS snippets ("${name}").`,
        });
        li.style.fontWeight = 'bold';
      }
    };

    renderCssRow('Default styles', summary.defaultCssWritten, summary.defaultCssEnabled, 'jaya-default-styles');
    renderCssRow('Curated styles', summary.curatedCssWritten, summary.curatedCssEnabled, 'jaya-curated-styles');
    renderCssRow('User styles',    summary.userCssWritten,    summary.userCssEnabled,    'jaya-user-styles');

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
