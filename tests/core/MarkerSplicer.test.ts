import { describe, it, expect } from 'vitest';
import { spliceMarkers, fingerprintFromMarker } from '../../src/core/MarkerSplicer';

describe('spliceMarkers', () => {
  it('replaces existing fence content; preserves outside', () => {
    const existing = [
      'header',
      '<!-- jaya:begin v=1 fingerprint=sha256:OLD -->',
      'OLD',
      '<!-- jaya:end -->',
      'GM notes',
    ].join('\n') + '\n';
    const incoming = [
      'header',
      '<!-- jaya:begin v=1 fingerprint=sha256:NEW -->',
      'NEW',
      '<!-- jaya:end -->',
      'incoming after fence',
    ].join('\n') + '\n';
    const result = spliceMarkers(existing, incoming);
    expect(result).toContain('NEW');
    expect(result).not.toContain('OLD');
    expect(result).toContain('GM notes');
    expect(result).not.toContain('incoming after fence');
  });

  it('overwrites wholesale when existing has no fence', () => {
    const incoming = '<!-- jaya:begin v=1 fingerprint=sha256:X -->\nbody\n<!-- jaya:end -->\n';
    expect(spliceMarkers('no fence here\n', incoming)).toBe(incoming);
  });
});

describe('fingerprintFromMarker', () => {
  it('extracts fingerprint value', () => {
    const md = '<!-- jaya:begin v=1 fingerprint=sha256:abc -->\nbody\n<!-- jaya:end -->\n';
    expect(fingerprintFromMarker(md)).toBe('sha256:abc');
  });
  it('returns null when no marker', () => {
    expect(fingerprintFromMarker('plain body')).toBeNull();
  });
});
