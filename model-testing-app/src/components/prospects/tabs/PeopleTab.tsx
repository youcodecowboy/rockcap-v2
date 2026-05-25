"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { ExternalLink, UserPlus, Search } from "lucide-react";

interface PeopleTabProps {
  prospect: any;
  intelRun?: any;
  chProfile?: any;
}

// Parse all directors/PSCs from intelMarkdown section 3 (Key People).
// The template (references/intel-report-template.md) puts each person under
// "### {Director Name}" with structured bullets. Same template-locked
// extraction pattern used by the aside, but extracts the FULL detail
// rather than just the first director's name.
interface ParsedPerson {
  name: string;
  roleNote?: string; // text inside (parens) after the name, e.g. "(sole director + 75%+ PSC)"
  bullets: Record<string, string>;
}

function parseKeyPeople(intelMarkdown?: string): ParsedPerson[] {
  if (!intelMarkdown) return [];
  const sec3 = intelMarkdown.match(/##\s*3\.\s*Key People([\s\S]*?)(?=##\s*\d|$)/i);
  if (!sec3) return [];

  const body = sec3[1];
  // Split by ### headings. Each h3 starts a person.
  const blocks = body.split(/^###\s+/m).slice(1); // first split is preamble
  const people: ParsedPerson[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const heading = lines[0].trim();
    // Heading shape: "{Name} (role description in parens)" — capture both
    const headingMatch = heading.match(/^(.+?)\s*\((.+?)\)\s*$/);
    const name = headingMatch?.[1]?.trim() ?? heading;
    const roleNote = headingMatch?.[2]?.trim();

    // Parse bullets: "- **Label:** value"
    const bullets: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const bullet = line.match(/^-\s+\*\*(.+?):\*\*\s+(.+?)\s*$/);
      if (bullet) {
        bullets[bullet[1].trim().toLowerCase()] = bullet[2].trim();
      }
    }

    if (name && name !== "" && !name.toLowerCase().startsWith("cross-reference")) {
      people.push({ name, roleNote, bullets });
    }
  }

  return people;
}

export function PeopleTab({ prospect, intelRun, chProfile }: PeopleTabProps) {
  const colors = useColors();
  const createContact = useMutation(api.contacts.create);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const people = parseKeyPeople(intelRun?.intelMarkdown);
  const chNumber = chProfile?.companyNumber ?? (intelRun as any)?.dedupKey;

  async function handleAddContact(person: ParsedPerson) {
    setAddingId(person.name);
    setError(null);
    try {
      const id = await createContact({
        name: person.name,
        role: person.bullets["ch role + appointment"]?.split(",")[0] ?? person.roleNote ?? "Director",
        company: prospect?.companyName ?? prospect?.name,
        notes: `Imported from prospect-intel skillRun ${intelRun?._id?.slice(-12) ?? ""}. CH role/PSC: ${person.roleNote ?? person.bullets["ch role + appointment"] ?? "—"}. DOB ${person.bullets["dob"] ?? "—"}. Nationality ${person.bullets["nationality"] ?? "—"}.`,
        clientId: prospect?._id,
      });
      setAdded((prev) => ({ ...prev, [person.name]: String(id) }));
    } catch (e: any) {
      setError(`Failed to add ${person.name}: ${e?.message ?? e}`);
    } finally {
      setAddingId(null);
    }
  }

  if (people.length === 0) {
    return (
      <div
        style={{
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          padding: 24,
          color: colors.text.muted,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        No directors or PSCs extracted yet. This tab pulls from the intelMarkdown's
        section 3 (Key People) which follows the v3 template. Either the skill has not
        run yet, or the report predates the template ordering. The aside's Primary
        director row uses the same extractor.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 14, fontSize: 11, color: colors.text.muted }}>
        Extracted from intel report section 3. {chNumber ? `Cross-check direct on Companies House for the canonical list.` : ""}
        {chNumber && (
          <a
            href={`https://find-and-update.company-information.service.gov.uk/company/${chNumber}/officers`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: 8, color: colors.accent.blue, textDecoration: "underline" }}
          >
            CH officers page <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} />
          </a>
        )}
      </div>

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: `1px solid ${colors.accent.red}`,
            color: "#7f1d1d",
            padding: "10px 12px",
            borderRadius: 4,
            fontSize: 11,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {people.map((person) => {
        const isAdding = addingId === person.name;
        const addedContactId = added[person.name];
        return (
          <div
            key={person.name}
            style={{
              border: `1px solid ${colors.border.default}`,
              borderRadius: 4,
              padding: 16,
              marginBottom: 14,
              background: colors.bg.card,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: colors.text.primary }}>
                  {person.name}
                </div>
                {person.roleNote && (
                  <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                    {person.roleNote}
                  </div>
                )}
              </div>
              {addedContactId ? (
                <span
                  style={{
                    padding: "4px 10px",
                    background: `${colors.accent.green}20`,
                    color: colors.accent.green,
                    border: `1px solid ${colors.accent.green}40`,
                    borderRadius: 3,
                    fontSize: 10,
                    fontFamily: "ui-monospace, monospace",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Added · {addedContactId.slice(-8)}
                </span>
              ) : (
                <button
                  onClick={() => handleAddContact(person)}
                  disabled={isAdding}
                  style={{
                    padding: "6px 12px",
                    background: colors.accent.green,
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 3,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: isAdding ? "wait" : "pointer",
                    opacity: isAdding ? 0.6 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <UserPlus size={12} />
                  {isAdding ? "Adding…" : "Add as contact"}
                </button>
              )}
            </div>

            {/* Bullets grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: "6px 14px",
                fontSize: 11,
                marginBottom: 14,
              }}
            >
              {Object.entries(person.bullets).map(([k, v]) => (
                <PersonRow key={k} label={k} value={v} colors={colors} />
              ))}
            </div>

            {/* Contact discovery actions */}
            <div
              style={{
                display: "flex",
                gap: 8,
                paddingTop: 10,
                borderTop: `1px solid ${colors.border.light}`,
                fontSize: 11,
              }}
            >
              <DiscoveryButton
                href={`https://www.google.com/search?q=${encodeURIComponent(`"${person.name}" site:linkedin.com/in`)}`}
                label="LinkedIn search"
                icon={<Search size={11} />}
                colors={colors}
              />
              <DiscoveryButton
                href={`https://www.google.com/search?q=${encodeURIComponent(`"${person.name}" ${prospect?.name ?? prospect?.companyName ?? ""}`)}`}
                label="Web search"
                icon={<Search size={11} />}
                colors={colors}
              />
              {chNumber && (
                <DiscoveryButton
                  href={`https://find-and-update.company-information.service.gov.uk/company/${chNumber}/officers`}
                  label="CH officers"
                  icon={<ExternalLink size={11} />}
                  colors={colors}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PersonRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <>
      <div style={{ color: colors.text.muted, textTransform: "capitalize", fontSize: 10 }}>{label}</div>
      <div style={{ color: colors.text.primary }}>
        {/* Render any HTML anchors inline (CH frequently includes them) */}
        <span dangerouslySetInnerHTML={{ __html: value }} />
      </div>
    </>
  );
}

function DiscoveryButton({
  href,
  label,
  icon,
  colors,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  colors: any;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        background: colors.bg.cardAlt,
        border: `1px solid ${colors.border.default}`,
        borderRadius: 3,
        color: colors.text.secondary,
        fontSize: 10,
        textDecoration: "none",
      }}
    >
      {icon}
      {label}
    </a>
  );
}
