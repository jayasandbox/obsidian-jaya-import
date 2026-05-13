/**
 * Removes the narrative-defaults and goal-defaults sections from a
 * jaya-default-styles.css file, leaving layout + location-defaults intact.
 * Used on user-export imports — once the user installs jaya-user-styles.css
 * with their narrative/goal colors, the default-styles file's same selectors
 * become redundant and are stripped to avoid cascade ambiguity.
 *
 * Idempotent: running on already-pruned content is a no-op.
 */

const SECTION_RE = (name: string) =>
  new RegExp(`/\\* @jaya-section ${name} \\*/[\\s\\S]*?/\\* @jaya-section-end ${name} \\*/\\n?\\n?`, 'g');

export function pruneNarrativeAndGoalSections(css: string): string {
  return css
    .replace(SECTION_RE('narrative-defaults'), '')
    .replace(SECTION_RE('goal-defaults'), '');
}
