/**
 * Generate a shortcode suggestion from a project name.
 * Replicates the logic from convex/projects.ts:generateShortcodeSuggestion
 */
export function generateShortcodeSuggestion(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '';

  let shortcode = '';
  const numbers = name.replace(/[^0-9]/g, '');

  if (words[0]) {
    shortcode += words[0].slice(0, words.length > 2 ? 3 : 4);
  }

  for (let i = 1; i < words.length && shortcode.length < 7; i++) {
    shortcode += words[i].charAt(0);
  }

  if (numbers && shortcode.length + numbers.length <= 10) {
    shortcode += numbers;
  } else if (numbers) {
    shortcode = shortcode.slice(0, 10 - Math.min(numbers.length, 4)) + numbers.slice(0, 4);
  }

  return shortcode.slice(0, 10).toUpperCase();
}
