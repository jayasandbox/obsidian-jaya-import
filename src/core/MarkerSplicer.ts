const BEGIN_RE = /<!--\s*jaya:begin\s+v=(\d+)(?:\s+fingerprint=([^\s]+))?\s*-->/;
const END_MARKER = '<!-- jaya:end -->';

export function spliceMarkers(existing: string, incoming: string): string {
  const existingMatch = BEGIN_RE.exec(existing);
  if (!existingMatch) return incoming;
  const existingEnd = existing.indexOf(END_MARKER, existingMatch.index + existingMatch[0].length);
  if (existingEnd === -1) return incoming;

  const incomingMatch = BEGIN_RE.exec(incoming);
  if (!incomingMatch) return existing;
  const incomingEnd = incoming.indexOf(END_MARKER, incomingMatch.index + incomingMatch[0].length);
  if (incomingEnd === -1) return existing;

  const incomingRegion = incoming.slice(incomingMatch.index, incomingEnd + END_MARKER.length);
  return (
    existing.slice(0, existingMatch.index) +
    incomingRegion +
    existing.slice(existingEnd + END_MARKER.length)
  );
}

export function fingerprintFromMarker(content: string): string | null {
  const m = BEGIN_RE.exec(content);
  return m?.[2] ?? null;
}
