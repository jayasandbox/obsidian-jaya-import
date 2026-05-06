import { Plugin, Notice } from 'obsidian';
import { ImportModal } from './obsidian/ImportModal';
import { JayaImportSettingsTab, JayaImportSettings, DEFAULT_SETTINGS } from './obsidian/SettingsTab';

export default class JayaImportPlugin extends Plugin {
  settings: JayaImportSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: 'jaya-import-adventure',
      name: 'Import Jaya adventure ZIP',
      callback: () => new ImportModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'jaya-rescan-vault',
      name: 'Re-scan vault for Jaya notes',
      callback: () => {
        // Obsidian rebuilds metadata caches automatically; this command exists
        // for users who want a visible confirmation that the next import will
        // pick up freshly-moved/renamed notes. The Importer rebuilds its own
        // public-id index per run from a live vault snapshot, so manual
        // rescanning is a no-op here — surfacing it as a Notice closes the loop.
        new Notice('Vault metadata is rebuilt automatically by Obsidian. Future imports will pick up moves.');
      },
    });

    this.addSettingTab(new JayaImportSettingsTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
