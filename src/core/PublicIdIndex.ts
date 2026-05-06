import { parseFrontmatter } from './FrontmatterParser';

export type PublicIdIndex = Map<string, string>;

export function buildIndexFromFiles(files: Map<string, string>): PublicIdIndex {
  const index: PublicIdIndex = new Map();
  for (const [path, content] of files) {
    try {
      const { fm } = parseFrontmatter(content);
      const pid = fm['jaya-public-id'];
      if (typeof pid === 'string' && pid.length > 0) index.set(pid, path);
    } catch { /* skip malformed */ }
  }
  return index;
}
