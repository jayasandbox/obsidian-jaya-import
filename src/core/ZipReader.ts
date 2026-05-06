import JSZip from 'jszip';

export async function readZipEntries(bytes: Uint8Array): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(bytes);
  const entries = new Map<string, string>();
  const promises: Promise<void>[] = [];
  zip.forEach((path, file) => {
    if (file.dir) return;
    promises.push(file.async('string').then((s) => { entries.set(path, s); }));
  });
  await Promise.all(promises);
  return entries;
}
