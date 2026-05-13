/**
 * Merges curated-style entity blocks. Existing entries not present in
 * incoming are preserved (additive UNION); overlapping short-ids are
 * overwritten by incoming (curated regen is the latest truth).
 *
 * Entity blocks are delimited by:
 *   / * @jaya-entity <kind>:<8hex> * /
 *   ... rules ...
 *   / * @jaya-entity-end <kind>:<8hex> * /
 * where kind ∈ {faction, loc}.
 */

const HEADER = '/* Jaya Obsidian Vault Export — per-curated-adventure entity colors. Auto-merged by obsidian-jaya-import. */\n\n';

interface EntityBlock {
  key: string;
  text: string;
}

const BLOCK_RE = /\/\*\s*@jaya-entity\s+(faction|loc):([0-9a-fA-F]{8})\s*\*\/[\s\S]*?\/\*\s*@jaya-entity-end\s+\1:\2\s*\*\/\n?/g;

function parseBlocks(css: string | null): Map<string, EntityBlock> {
  const out = new Map<string, EntityBlock>();
  if (!css) return out;
  for (const match of css.matchAll(BLOCK_RE)) {
    const kind = match[1]!;
    const shortId = match[2]!.toLowerCase();
    const key = `${kind}:${shortId}`;
    out.set(key, { key, text: match[0] });
  }
  return out;
}

export function mergeCuratedStyles(existing: string | null, incoming: string): string {
  const existingBlocks = parseBlocks(existing);
  const incomingBlocks = parseBlocks(incoming);

  // Incoming wins on overlap; existing entries not in incoming are preserved.
  const merged = new Map(existingBlocks);
  for (const [key, block] of incomingBlocks) {
    merged.set(key, block);
  }

  // Stable order: lexicographic by key. 'faction:...' sorts before 'loc:...'.
  const sortedKeys = [...merged.keys()].sort((a, b) => a.localeCompare(b));

  let body = HEADER;
  for (const key of sortedKeys) {
    body += merged.get(key)!.text;
    if (!body.endsWith('\n')) body += '\n';
  }
  return body;
}
