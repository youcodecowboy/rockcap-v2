"use client";

import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { ExternalLink, UserPlus, Search, Mail, Loader2 } from "lucide-react";
import { matchPersonToContact } from "@/lib/prospects/matchPersonToContact";

interface PeopleTabProps {
  prospect: any;
  intelRun?: any;
  chProfile?: any;
  contacts?: any[];
}

interface ApolloLookup {
  loading: boolean;
  result?: {
    found: boolean;
    email?: string;
    emailStatus?: string;
    title?: string;
    linkedinUrl?: string;
    photoUrl?: string;
    organization?: { name?: string; domain?: string };
  };
  error?: string;
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

export function PeopleTab({ prospect, intelRun, chProfile, contacts }: PeopleTabProps) {
  const colors = useColors();
  const createContact = useMutation(api.contacts.create);
  const updateContact = useMutation(api.contacts.update);
  const findEmailApollo = useAction(api.apollo.findPerson);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [apolloByPerson, setApolloByPerson] = useState<Record<string, ApolloLookup>>({});

  const people = parseKeyPeople(intelRun?.intelMarkdown);
  const chNumber = chProfile?.companyNumber ?? (intelRun as any)?.dedupKey;
  const companyName = prospect?.companyName ?? prospect?.name;

  function splitName(fullName: string): { firstName: string; lastName: string } {
    // Handle "Surname, Forenames" (CH common) and "Forenames Surname" (web common).
    if (fullName.includes(",")) {
      const [surname, rest] = fullName.split(",").map((s) => s.trim());
      const restParts = rest.split(/\s+/);
      return { firstName: restParts[0] ?? "", lastName: surname };
    }
    const parts = fullName.trim().split(/\s+/);
    return {
      firstName: parts[0] ?? "",
      lastName: parts.length > 1 ? parts[parts.length - 1] : "",
    };
  }

  async function handleFindEmail(person: ParsedPerson) {
    const { firstName, lastName } = splitName(person.name);
    if (!firstName || !lastName) {
      setApolloByPerson((p) => ({
        ...p,
        [person.name]: { loading: false, error: `Could not parse name: ${person.name}` },
      }));
      return;
    }
    setApolloByPerson((p) => ({ ...p, [person.name]: { loading: true } }));
    try {
      const res = await findEmailApollo({ firstName, lastName, companyName });
      if (res.ok) {
        setApolloByPerson((p) => ({
          ...p,
          [person.name]: { loading: false, result: res },
        }));
      } else {
        setApolloByPerson((p) => ({
          ...p,
          [person.name]: { loading: false, error: `${res.error}${res.detail ? `: ${res.detail}` : ""}` },
        }));
      }
    } catch (e: any) {
      setApolloByPerson((p) => ({
        ...p,
        [person.name]: { loading: false, error: e?.message ?? String(e) },
      }));
    }
  }

  async function handleAddContact(person: ParsedPerson) {
    setAddingId(person.name);
    setError(null);
    const apolloFor = apolloByPerson[person.name]?.result;
    const matched = matchPersonToContact(person.name, contacts ?? []);
    try {
      let id: string;
      if (matched?._id) {
        // Existing contact — update rather than create to avoid duplicates.
        // Only patch fields that are improving the record (email from Apollo,
        // role, and ensure the client link is set).
        await updateContact({
          id: matched._id as any,
          role: apolloFor?.title ?? person.bullets["ch role + appointment"]?.split(",")[0] ?? person.roleNote ?? matched.role ?? "Director",
          ...(apolloFor?.email ? {
            email: apolloFor.email,
          } : {}),
          notes: `Linked from prospect-intel skillRun ${intelRun?._id?.slice(-12) ?? ""}. CH role/PSC: ${person.roleNote ?? person.bullets["ch role + appointment"] ?? "—"}. DOB ${person.bullets["dob"] ?? "—"}. Nationality ${person.bullets["nationality"] ?? "—"}.${apolloFor?.email ? ` Email via Apollo (${apolloFor.emailStatus ?? "unknown status"}).` : ""}${apolloFor?.linkedinUrl ? ` LinkedIn: ${apolloFor.linkedinUrl}.` : ""}`,
          clientId: prospect?._id,
        });
        id = String(matched._id);
      } else {
        // No existing contact — create fresh.
        const newId = await createContact({
          name: person.name,
          role: apolloFor?.title ?? person.bullets["ch role + appointment"]?.split(",")[0] ?? person.roleNote ?? "Director",
          email: apolloFor?.email,
          emailStatus: apolloFor?.emailStatus,
          emailSource: apolloFor?.email ? "apollo" : undefined,
          company: companyName,
          notes: `Imported from prospect-intel skillRun ${intelRun?._id?.slice(-12) ?? ""}. CH role/PSC: ${person.roleNote ?? person.bullets["ch role + appointment"] ?? "—"}. DOB ${person.bullets["dob"] ?? "—"}. Nationality ${person.bullets["nationality"] ?? "—"}.${apolloFor?.email ? ` Email via Apollo (${apolloFor.emailStatus ?? "unknown status"}).` : ""}${apolloFor?.linkedinUrl ? ` LinkedIn: ${apolloFor.linkedinUrl}.` : ""}`,
          clientId: prospect?._id,
        });
        id = String(newId);
      }
      setAdded((prev) => ({ ...prev, [person.name]: id }));
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
        const matched = matchPersonToContact(person.name, contacts ?? []);
        const onFileEmail = matched?.email;
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
                  {matched?._id ? "Linked" : "Added"} · {addedContactId.slice(-8)}
                </span>
              ) : (
                <button
                  onClick={() => handleAddContact(person)}
                  disabled={isAdding}
                  style={{
                    padding: "6px 12px",
                    background: matched?._id ? colors.accent.blue : colors.accent.green,
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
                  {isAdding ? (matched?._id ? "Linking…" : "Adding…") : (matched?._id ? "On file — update" : "Add as contact")}
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

            {/* Email block: (1) on-file email; (2) a matched contact already
                searched via Apollo (found, but no published email) — reflect that
                persisted result instead of the un-searched prompt; (3) otherwise
                offer a live Apollo discovery. A live re-search supersedes (2). */}
            {onFileEmail ? (
              <OnFileEmailBlock
                email={onFileEmail}
                emailStatus={matched?.emailStatus}
                colors={colors}
              />
            ) : matched?.emailSource === "apollo" && !apolloByPerson[person.name] ? (
              <SearchedApolloBlock
                matched={matched}
                onFind={() => handleFindEmail(person)}
                colors={colors}
              />
            ) : (
              <ApolloEmailBlock
                lookup={apolloByPerson[person.name]}
                onFind={() => handleFindEmail(person)}
                colors={colors}
              />
            )}

            {/* Contact discovery actions */}
            <div
              style={{
                display: "flex",
                gap: 8,
                paddingTop: 10,
                borderTop: `1px solid ${colors.border.light}`,
                fontSize: 11,
                flexWrap: "wrap",
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

function OnFileEmailBlock({
  email,
  emailStatus,
  colors,
}: {
  email: string;
  emailStatus?: string;
  colors: any;
}) {
  const pill = emailStatusColor(emailStatus, colors);
  return (
    <div
      style={{
        padding: "10px 12px",
        background: `${colors.accent.green}08`,
        border: `1px solid ${colors.accent.green}40`,
        borderRadius: 4,
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <Mail size={12} color={colors.accent.green} />
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: colors.text.primary }}>
        {email}
      </span>
      <span
        style={{
          padding: "1px 6px",
          background: `${colors.accent.green}20`,
          color: colors.accent.green,
          border: `1px solid ${colors.accent.green}40`,
          borderRadius: 2,
          fontSize: 9,
          fontFamily: "ui-monospace, monospace",
          letterSpacing: "0.05em",
          textTransform: "uppercase" as const,
          fontWeight: 500,
        }}
      >
        on file
      </span>
      {emailStatus && (
        <span
          style={{
            padding: "1px 6px",
            background: pill.bg,
            color: pill.fg,
            border: `1px solid ${pill.border}`,
            borderRadius: 2,
            fontSize: 9,
            fontFamily: "ui-monospace, monospace",
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            fontWeight: 500,
          }}
        >
          {emailStatus}
        </span>
      )}
    </div>
  );
}

function emailStatusColor(status: string | undefined, colors: any): { bg: string; fg: string; border: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "verified") return { bg: "#dcfce7", fg: "#166534", border: "#86efac" };
  if (s === "unverified" || s === "guessed") return { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" };
  if (s === "questionable" || s === "spam_trap") return { bg: "#fee2e2", fg: "#7f1d1d", border: "#fca5a5" };
  return { bg: colors.bg.cardAlt, fg: colors.text.muted, border: colors.border.default };
}

// Reflects a PERSISTED Apollo search stored on a matched contact
// (emailSource === "apollo"). Unlike ApolloEmailBlock (a live, on-click
// lookup), this renders from the contact record so the tab shows that the
// person was already searched and found — even when no email was published
// (emailStatus "unavailable"). A "Re-search" runs a fresh live lookup.
function SearchedApolloBlock({
  matched,
  onFind,
  colors,
}: {
  matched: any;
  onFind: () => void;
  colors: any;
}) {
  const pill = emailStatusColor(matched?.emailStatus, colors);
  const noEmail = !matched?.email;
  return (
    <div
      style={{
        padding: "12px 14px",
        background: `${colors.accent.purple}08`,
        border: `1px solid ${colors.accent.purple}40`,
        borderRadius: 4,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: colors.accent.purple, fontFamily: "ui-monospace, monospace", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
          <Mail size={11} />
          Searched via Apollo
        </div>
        <button
          onClick={onFind}
          style={{
            padding: "3px 9px",
            background: colors.bg.card,
            color: colors.text.secondary,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 3,
            fontSize: 10,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Search size={10} />
          Re-search
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "5px 12px", fontSize: 11 }}>
        <div style={{ color: colors.text.muted }}>Result</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: colors.text.primary }}>
            Person found{noEmail ? " · no published email" : ""}
          </span>
          {matched?.emailStatus && (
            <span
              style={{
                padding: "1px 6px",
                background: pill.bg,
                color: pill.fg,
                border: `1px solid ${pill.border}`,
                borderRadius: 2,
                fontFamily: "ui-monospace, monospace",
                fontSize: 9,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              {matched.emailStatus}
            </span>
          )}
        </div>
        {matched?.email && (
          <>
            <div style={{ color: colors.text.muted }}>Email</div>
            <div style={{ color: colors.text.primary, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{matched.email}</div>
          </>
        )}
        {matched?.linkedinUrl && (
          <>
            <div style={{ color: colors.text.muted }}>LinkedIn</div>
            <div>
              <a
                href={matched.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: colors.accent.blue, textDecoration: "underline", fontSize: 10, wordBreak: "break-all" }}
              >
                {matched.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ApolloEmailBlock({
  lookup,
  onFind,
  colors,
}: {
  lookup?: ApolloLookup;
  onFind: () => void;
  colors: any;
}) {
  // Initial state — no lookup yet
  if (!lookup) {
    return (
      <div
        style={{
          padding: "10px 12px",
          background: colors.bg.cardAlt,
          border: `1px dashed ${colors.border.default}`,
          borderRadius: 4,
          marginBottom: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: colors.text.muted }}>
          <Mail size={12} />
          No email on file. Apollo can search for one.
        </div>
        <button
          onClick={onFind}
          style={{
            padding: "5px 10px",
            background: colors.accent.purple,
            color: "#ffffff",
            border: "none",
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Search size={10} />
          Find email via Apollo
        </button>
      </div>
    );
  }

  if (lookup.loading) {
    return (
      <div
        style={{
          padding: "10px 12px",
          background: colors.bg.cardAlt,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          color: colors.text.muted,
        }}
      >
        <Loader2 size={12} className="animate-spin" />
        Searching Apollo…
      </div>
    );
  }

  if (lookup.error) {
    return (
      <div
        style={{
          padding: "10px 12px",
          background: "#fef2f2",
          border: `1px solid ${colors.accent.red}`,
          borderRadius: 4,
          marginBottom: 14,
          fontSize: 11,
          color: "#7f1d1d",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span><strong>Apollo error:</strong> {lookup.error}</span>
        <button
          onClick={onFind}
          style={{
            padding: "4px 10px",
            background: colors.accent.red,
            color: "#ffffff",
            border: "none",
            borderRadius: 3,
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const r = lookup.result;
  if (!r) return null;

  if (!r.found) {
    return (
      <div
        style={{
          padding: "10px 12px",
          background: colors.bg.cardAlt,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          marginBottom: 14,
          fontSize: 11,
          color: colors.text.muted,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          <Mail size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
          Apollo: no match for this person + company combination.
        </span>
        <button
          onClick={onFind}
          style={{
            padding: "4px 10px",
            background: colors.bg.card,
            color: colors.text.secondary,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 3,
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Found! Show structured result
  const pill = emailStatusColor(r.emailStatus, colors);
  return (
    <div
      style={{
        padding: "12px 14px",
        background: `${colors.accent.purple}08`,
        border: `1px solid ${colors.accent.purple}40`,
        borderRadius: 4,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 10, color: colors.accent.purple, fontFamily: "ui-monospace, monospace", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
        <Mail size={11} />
        Found via Apollo
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "5px 12px", fontSize: 11 }}>
        {r.email && (
          <>
            <div style={{ color: colors.text.muted }}>Email</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: colors.text.primary, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{r.email}</span>
              {r.emailStatus && (
                <span
                  style={{
                    padding: "1px 6px",
                    background: pill.bg,
                    color: pill.fg,
                    border: `1px solid ${pill.border}`,
                    borderRadius: 2,
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 9,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  {r.emailStatus}
                </span>
              )}
            </div>
          </>
        )}
        {r.title && (
          <>
            <div style={{ color: colors.text.muted }}>Title</div>
            <div style={{ color: colors.text.primary }}>{r.title}</div>
          </>
        )}
        {r.linkedinUrl && (
          <>
            <div style={{ color: colors.text.muted }}>LinkedIn</div>
            <div>
              <a
                href={r.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: colors.accent.blue, textDecoration: "underline", fontSize: 10, wordBreak: "break-all" }}
              >
                {r.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            </div>
          </>
        )}
        {r.organization?.domain && (
          <>
            <div style={{ color: colors.text.muted }}>Org domain</div>
            <div style={{ color: colors.text.primary, fontFamily: "ui-monospace, monospace", fontSize: 10 }}>
              {r.organization.domain}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
