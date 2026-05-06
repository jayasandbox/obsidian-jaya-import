import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readZipEntries } from '../../src/core/ZipReader';

describe('readZipEntries', () => {
  it('returns text contents keyed by entry path', async () => {
    const zip = new JSZip();
    zip.file('_jaya/manifest.json', '{"formatVersion":1}');
    zip.file('Jaya/W/NPCs/A.md', '---\njaya-public-id: x\n---\nbody');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const entries = await readZipEntries(bytes);
    expect(entries.get('_jaya/manifest.json')).toBe('{"formatVersion":1}');
    expect(entries.get('Jaya/W/NPCs/A.md')).toContain('jaya-public-id: x');
  });
});
