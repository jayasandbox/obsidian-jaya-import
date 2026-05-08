/**
 * Implements the consumer-side cross-export continuity merge contract from
 * docs/obsidian-export-format/spec.md §"Cross-Export Continuity".
 *
 * Adventure exports are selection-scoped: each zip lists only peer entities
 * the user picked for that export. To prevent re-imports of a different
 * selection from wiping the user's accumulated cross-export context, the
 * consumer unions the existing in-fence sections with the incoming ones for
 * the named cross-reference H2 blocks of each entity type:
 *
 *   - NPC dossier:      "## Appears in"  +  "## Goals"
 *   - Faction dossier:  "## Appears in"
 *   - Goal dossier:     "## Narratives"
 *   - Location dossier: "## Appears in"
 *
 * Dedupe key is wikilink target *basename* so v1 (bare) and v2 (path-qualified)
 * forms collapse to the same logical entry. On conflict, the incoming entry
 * wins (server is authoritative for current-truth role naming). Entries whose
 * target basename is in neither the vault nor the incoming export are pruned
 * to avoid phantom-note clutter.
 *
 * Entries are stored as raw text lines so the merger doesn't need to introspect
 * the suffix shape: NPC/Faction/Location "Appears in" lines have a `— role`
 * suffix; NPC "Goals" lines have a `*as <role> in [[Narrative]]*` suffix; Goal
 * "Narratives" lines have no suffix at all. The first wikilink target on the
 * line drives dedupe + dangling-prune + sort, and the rest of the line is
 * preserved verbatim on emit.
 */

import { BEGIN_RE, END_MARKER } from './MarkerSplicer';

const SECTIONS_BY_ENTITY_TYPE: Record<string, readonly string[]> = {
  npc:      ['Appears in', 'Goals'],
  faction:  ['Appears in'],
  goal:     ['Narratives'],
  location: ['Appears in'],
};

interface Entry {
  target: string;
  raw: string;
}

// Matches `- [[<target>]]` or `- [[<target>|<alias>]]` at line start. Ignores
// whatever follows the closing `]]` so suffixes like ` — role` (Appears in),
// ` *as role in [[…]]*` (NPC Goals), or nothing (Goal Narratives) all work.
const FIRST_WIKILINK_RE = /^- \[\[([^\]|]+)(?:\|[^\]]+)?\]\]/;

function targetBasename(target: string): string {
  const slash = target.lastIndexOf('/');
  return slash === -1 ? target : target.slice(slash + 1);
}

function parseEntry(line: string): Entry | null {
  const m = FIRST_WIKILINK_RE.exec(line);
  if (!m) return null;
  return { target: m[1]!, raw: line };
}

interface SectionLocation {
  startLine: number;
  endLine: number;
  entries: Entry[];
}

function findSection(body: string, heading: string): SectionLocation | null {
  const lines = body.split('\n');
  const headingLine = `## ${heading}`;
  const start = lines.indexOf(headingLine);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith('## ')) {
      end = i;
      break;
    }
  }
  const entries: Entry[] = [];
  for (let i = start + 1; i < end; i++) {
    const e = parseEntry(lines[i]!);
    if (e) entries.push(e);
  }
  return { startLine: start, endLine: end, entries };
}

function compareTargetOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Single-section merge — replaces the named block in-place or appends it. */
function mergeOneSection(
  existingFenceBody: string,
  incomingFenceBody: string,
  heading: string,
  knownTargetBasenames: Set<string>,
): string {
  const existingSec = findSection(existingFenceBody, heading);
  if (!existingSec || existingSec.entries.length === 0) return incomingFenceBody;

  // The server emits the H2 block conditionally — only when this export has at
  // least one entry to list. So `incomingSec` may be null even though existing
  // has accumulated entries to preserve.
  const incomingSec = findSection(incomingFenceBody, heading);
  const incomingEntries = incomingSec?.entries ?? [];

  // Union by target basename; incoming wins on conflict.
  const merged = new Map<string, Entry>();
  for (const e of existingSec.entries) merged.set(targetBasename(e.target), e);
  for (const e of incomingEntries) merged.set(targetBasename(e.target), e);

  // Prune dangling.
  const kept: Entry[] = [];
  for (const e of merged.values()) {
    if (knownTargetBasenames.has(targetBasename(e.target))) kept.push(e);
  }
  // Nothing left — match the server's empty-skip convention.
  if (kept.length === 0) return incomingFenceBody;

  kept.sort((a, b) => compareTargetOrdinal(a.target, b.target));
  const newEntryLines = kept.map((e) => e.raw);

  if (incomingSec) {
    // Replace the existing block in place.
    const lines = incomingFenceBody.split('\n');
    const before = lines.slice(0, incomingSec.startLine);
    const after = lines.slice(incomingSec.endLine);
    const newSection = [`## ${heading}`, '', ...newEntryLines];
    if (after.length > 0 && after[0] !== '') newSection.push('');
    return [...before, ...newSection, ...after].join('\n');
  }

  // Append at end of fence body — server emits these sections at the bottom
  // of the body, so this matches convention.
  const lines = incomingFenceBody.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
  lines.push(`## ${heading}`, '', ...newEntryLines, '');
  return lines.join('\n');
}

export function mergeCrossReferenceSection(
  existingFenceBody: string,
  incomingFenceBody: string,
  entityType: string,
  knownTargetBasenames: Set<string>,
): string {
  const headings = SECTIONS_BY_ENTITY_TYPE[entityType];
  if (!headings || headings.length === 0) return incomingFenceBody;
  let result = incomingFenceBody;
  for (const heading of headings) {
    result = mergeOneSection(existingFenceBody, result, heading, knownTargetBasenames);
  }
  return result;
}

interface FenceRange {
  body: string;
  bodyStart: number;
  bodyEnd: number;
}

function findFenceBody(content: string): FenceRange | null {
  const beginMatch = BEGIN_RE.exec(content);
  if (!beginMatch) return null;
  const beginEnd = beginMatch.index + beginMatch[0].length;
  const endIndex = content.indexOf(END_MARKER, beginEnd);
  if (endIndex === -1) return null;
  return {
    body: content.slice(beginEnd, endIndex),
    bodyStart: beginEnd,
    bodyEnd: endIndex,
  };
}

/**
 * Whole-file form of the merge contract. Extracts the fence body of both
 * `existingContent` and `incomingContent`, applies `mergeCrossReferenceSection`,
 * and stitches the merged body back into `incomingContent`. Returns the
 * (possibly modified) incoming content; the caller still needs to splice it
 * into the existing file via MarkerSplicer for the outside-fence-preservation
 * invariant to hold.
 */
export function mergeCrossReferencesInContent(
  existingContent: string,
  incomingContent: string,
  entityType: string,
  knownTargetBasenames: Set<string>,
): string {
  if (!SECTIONS_BY_ENTITY_TYPE[entityType]) return incomingContent;
  const existingFence = findFenceBody(existingContent);
  const incomingFence = findFenceBody(incomingContent);
  if (existingFence === null || incomingFence === null) return incomingContent;

  const newBody = mergeCrossReferenceSection(
    existingFence.body,
    incomingFence.body,
    entityType,
    knownTargetBasenames,
  );
  if (newBody === incomingFence.body) return incomingContent;

  return (
    incomingContent.slice(0, incomingFence.bodyStart) +
    newBody +
    incomingContent.slice(incomingFence.bodyEnd)
  );
}
