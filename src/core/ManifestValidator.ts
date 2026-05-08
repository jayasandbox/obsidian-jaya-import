import { Manifest, SUPPORTED_FORMAT_VERSIONS } from './types';

export function validateManifest(bytes: Uint8Array): Manifest {
  const text = new TextDecoder('utf-8').decode(bytes);
  let parsed: Manifest;
  try {
    parsed = JSON.parse(text) as Manifest;
  } catch (e) {
    throw new Error(`Failed to parse _jaya/manifest.json: ${(e as Error).message}`);
  }
  if (!SUPPORTED_FORMAT_VERSIONS.includes(parsed.formatVersion as 1 | 2)) {
    throw new Error(
      `Zip declares formatVersion=${parsed.formatVersion}, but this plugin supports ` +
      `${JSON.stringify(SUPPORTED_FORMAT_VERSIONS)}. Update the plugin.`,
    );
  }
  return parsed;
}
