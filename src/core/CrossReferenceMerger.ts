/**
 * Implements the consumer-side cross-export continuity merge contract from
 * docs/obsidian-export-format/spec.md §"Cross-Export Continuity".
 *
 * Adventure exports are selection-scoped: each zip lists only peer entities
 * the user picked for that export. To prevent re-imports of a different
 * selection from wiping the user's accumulated cross-export context, the
 * consumer unions the existing in-fence section with the incoming one for
 * the three named cross-reference H2 blocks:
 *
 *   - NPC dossier:     "## Appears in"
 *   - Faction dossier: "## Appears in"
 *   - Goal dossier:    "## Narratives"
 *
 * Dedupe key is wikilink target *basename* so v1 (bare) and v2 (path-qualified)
 * forms collapse to the same logical entry. On conflict, the incoming entry
 * wins (server is authoritative for current-truth role naming). Entries whose
 * target basename is in neither the vault nor the incoming export are pruned
 * to avoid phantom-note clutter.
 */

import { BEGIN_RE, END_MARKER } from './MarkerSplicer';

const SECTION_BY_ENTITY_TYPE: Record<string, string> = {
  npc: 'Appears in',
  faction: 'Appears in',
  goal: 'Narratives',
};

interface Entry {
  target: string;
  alias: string | null;
  role: string | null;
}

const ENTRY_RE = /^- \[\[([^\]]+)\]\](?:\s+—\s+(.*))?$/;

function targetBasename(target: string): string {
  const slash = target.lastIndexOf('/');
  return slash === -1 ? target : target.slice(slash + 1);
}

function parseEntry(line: string): Entry | null {
  const m = ENTRY_RE.exec(line);
  if (!m) return null;
  const inside = m[1]!;
  const role = m[2] ?? null;
  const pipe = inside.indexOf('|');
  const target = pipe === -1 ? inside : inside.slice(0, pipe);
  const alias = pipe === -1 ? null : inside.slice(pipe + 1);
  return { target, alias, role: role ? role.trim() : null };
}

function formatEntry(e: Entry): string {
  const link = e.alias === null ? `[[${e.target}]]` : `[[${e.target}|${e.alias}]]`;
  return e.role === null ? `- ${link}` : `- ${link} — ${e.role}`;
}

/**
 * Locates the H2 block named `## <heading>` inside `body` (a fence-body string,
 * i.e. content between begin/end markers). Returns the line range of the block
 * and the entries parsed out of it. The block runs from the heading line up to
 * (but not including) the next H2 heading or end-of-body.
 */
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

export function mergeCrossReferenceSection(
  existingFenceBody: string,
  incomingFenceBody: string,
  entityType: string,
  knownTargetBasenames: Set<string>,
): string {
  const heading = SECTION_BY_ENTITY_TYPE[entityType];
  if (!heading) return incomingFenceBody;

  const existingSec = findSection(existingFenceBody, heading);
  if (!existingSec || existingSec.entries.length === 0) return incomingFenceBody;

  // The server emits the H2 block conditionally — only when the current export
  // has at least one entry to list (see ObsidianMarkdownRenderer.cs). So
  // `incomingSec` may be null even though `existingSec` has accumulated entries
  // we need to preserve. Treat null as "no incoming entries" rather than as
  // "skip the merge."
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
  // Nothing left to emit — match server convention (omit the heading entirely
  // when empty rather than emitting an empty section).
  if (kept.length === 0) return incomingFenceBody;

  // Sort by target name, ordinal.
  kept.sort((a, b) => compareTargetOrdinal(a.target, b.target));
  const newEntryLines = kept.map(formatEntry);

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
  // of the body (after Description/Goals/etc.), so this matches convention.
  const lines = incomingFenceBody.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
  lines.push(`## ${heading}`, '', ...newEntryLines, '');
  return lines.join('\n');
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
  if (!SECTION_BY_ENTITY_TYPE[entityType]) return incomingContent;
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
