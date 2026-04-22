import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isFirefliesTranscript,
  parseFirefliesTranscript,
} from '../fireflies';

const firefliesFixture = readFileSync(
  join(__dirname, 'fixtures/fireflies-comberton.html'),
  'utf-8',
);

const humanNoteWithFirefliesLink = `
  <p>Trigger Type: Level 3 Check-in</p>
  <p>Meeting took place on <a href="https://app.fireflies.ai/view/01KMZ4QCSE9XMSDNB60RXE48X8">Fireflies recording</a></p>
  <p>Suggested Hook: Follow up on indicative term sheets</p>
`;

const plainNote = '<p>Just a regular human note, no integration involved</p>';

describe('isFirefliesTranscript', () => {
  it('detects a real Fireflies transcript', () => {
    expect(isFirefliesTranscript(firefliesFixture)).toBe(true);
  });

  it('rejects a human note that merely references a Fireflies URL', () => {
    expect(isFirefliesTranscript(humanNoteWithFirefliesLink)).toBe(false);
  });

  it('rejects a plain human note', () => {
    expect(isFirefliesTranscript(plainNote)).toBe(false);
  });

  it('rejects empty / null / undefined input', () => {
    expect(isFirefliesTranscript('')).toBe(false);
    expect(isFirefliesTranscript(null as any)).toBe(false);
    expect(isFirefliesTranscript(undefined as any)).toBe(false);
  });
});

describe('parseFirefliesTranscript', () => {
  const parsed = parseFirefliesTranscript(firefliesFixture);

  it('extracts the meeting title from the first <h3>', () => {
    expect(parsed.title).toBe('Comberton');
  });

  it('extracts the transcript URL', () => {
    expect(parsed.transcriptUrl).toBe(
      'https://app.fireflies.ai/view/01KFRND0FCR2XQWMNFGMP2K976',
    );
  });

  it('extracts duration in milliseconds (14 mins → 14*60*1000)', () => {
    expect(parsed.duration).toBe(14 * 60 * 1000);
  });

  it('extracts participant emails, deduplicated', () => {
    expect(parsed.participantEmails).toEqual(
      expect.arrayContaining([
        'jbird@bayfieldhomes.co.uk',
        'alex@rockcap.uk',
        'mthompson@falcogroup.co.uk',
      ]),
    );
    // No duplicates
    expect(new Set(parsed.participantEmails).size).toBe(
      parsed.participantEmails.length,
    );
  });

  it('returns graceful undefined/empty for fields it cannot extract', () => {
    const result = parseFirefliesTranscript('<p>not a transcript</p>');
    expect(result.title).toBeUndefined();
    expect(result.transcriptUrl).toBeUndefined();
    expect(result.duration).toBeUndefined();
    expect(result.participantEmails).toEqual([]);
  });
});
