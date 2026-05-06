import yaml from 'js-yaml';

export type FrontmatterValue = string | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedMd {
  fm: Frontmatter;
  body: string;
}

const FM_DELIM = '---\n';

export function parseFrontmatter(md: string): ParsedMd {
  if (!md.startsWith(FM_DELIM)) return { fm: {}, body: md };
  const end = md.indexOf('\n---\n', FM_DELIM.length);
  if (end === -1) return { fm: {}, body: md };

  const fmText = md.slice(FM_DELIM.length, end);
  const body = md.slice(end + 5);
  const parsed = yaml.load(fmText);
  if (parsed === null || parsed === undefined) return { fm: {}, body };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) return { fm: {}, body };

  const fm: Frontmatter = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string') fm[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) fm[k] = v as string[];
    else if (typeof v === 'number' || typeof v === 'boolean') fm[k] = String(v);
  }
  return { fm, body };
}

export function serializeFrontmatter(fm: Frontmatter): string {
  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}

export function mergeAliases(incoming: string[], existing: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const a of [...incoming, ...existing]) {
    if (!seen.has(a)) { merged.push(a); seen.add(a); }
  }
  return merged;
}
