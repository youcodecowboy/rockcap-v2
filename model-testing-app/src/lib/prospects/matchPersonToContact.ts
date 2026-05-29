// Fuzzy match a report "key person" name to an existing HubSpot contact.
// Bridges clean report names ("Pete Mackenzie") to messy contact names
// ("Peter Mackenzie (175)", "Adam Renn Renn", "Nicola Elia Renée Kinnie").
// Heuristic: compare first-token + last-token after stripping parentheticals,
// diacritics and punctuation, with prefix tolerance ("pete" ⊂ "peter").
// Returns the first contact whose first AND last token match, else null.

export type ContactLike = {
  _id?: string;
  name?: string;
  email?: string;
  emailStatus?: string;
  emailSource?: string;
  role?: string;
};

function normalise(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/\(.*?\)/g, " ")   // drop "(175)" parentheticals
    .replace(/[^a-z,\s]/g, " ") // drop digits/punct (keeps comma for CH "Surname, Forenames")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstLast(name: string): { first: string; last: string } {
  const t = normalise(name).split(" ").filter(Boolean);
  return { first: t[0] ?? "", last: t.length > 1 ? t[t.length - 1] : "" };
}

function tokenMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [lo, hi] = a.length <= b.length ? [a, b] : [b, a];
  return lo.length >= 3 && hi.startsWith(lo); // "pete" prefix of "peter"
}

export function matchPersonToContact<T extends ContactLike>(
  personName: string,
  contacts: T[],
): T | null {
  const p = firstLast(personName);
  if (!p.first || !p.last) return null;
  for (const c of contacts) {
    const cn = firstLast(c.name ?? "");
    if (tokenMatch(p.first, cn.first) && tokenMatch(p.last, cn.last)) return c;
  }
  return null;
}
