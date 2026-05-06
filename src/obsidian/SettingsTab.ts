import { App, PluginSettingTab, Setting } from 'obsidian';
import type MyPlugin from '../main';

export interface JayaImportSettings {
  targetFolder: string;
  conflictPolicy: 'splice' | 'replace' | 'new';
  showSummaryModal: boolean;
}

export const DEFAULT_SETTINGS: JayaImportSettings = {
  targetFolder: 'Jaya',
  conflictPolicy: 'splice',
  showSummaryModal: true,
};

export class JayaImportSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: MyPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Target vault folder')
      .setDesc('Where new notes will land. Existing notes are matched by jaya-public-id regardless of folder.')
      .addText((t) =>
        t
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (v) => {
            this.plugin.settings.targetFolder = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Conflict policy')
      .setDesc('How to handle existing notes that match an incoming jaya-public-id.')
      .addDropdown((d) =>
        d
          .addOptions({
            splice: 'Splice (preserve content outside Jaya markers — recommended)',
            replace: 'Replace whole file',
            new: 'Always create new file with -N suffix',
          })
          .setValue(this.plugin.settings.conflictPolicy)
          .onChange(async (v) => {
            this.plugin.settings.conflictPolicy = v as 'splice' | 'replace' | 'new';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show import summary modal')
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showSummaryModal)
          .onChange(async (v) => {
            this.plugin.settings.showSummaryModal = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
