/**
 * Groups a sorted contact array into alphabetical sections.
 * Returns sections like { letter: "A", contacts: [...] }
 */

interface ContactWithName {
  _id: string;
  name: string;
  [key: string]: any;
}

interface ContactGroup<T> {
  letter: string;
  contacts: T[];
}

export function groupContactsByLetter<T extends ContactWithName>(contacts: T[]): ContactGroup<T>[] {
  const sorted = [...contacts].sort((a, b) =>
    a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' })
  );

  const groups: Map<string, T[]> = new Map();

  for (const contact of sorted) {
    const firstChar = contact.name.charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';

    if (!groups.has(letter)) {
      groups.set(letter, []);
    }
    groups.get(letter)!.push(contact);
  }

  return Array.from(groups.entries()).map(([letter, contacts]) => ({
    letter,
    contacts,
  }));
}
