"use client";

import { useColors } from "@/lib/useColors";
import { Section, Row, StatusPill, clientStatusTone } from "@/components/layouts";

export function ClientDetailAside({
  client,
  primaryCompany,
  counts,
}: {
  client: any;
  primaryCompany: any | undefined;
  counts: { projects: number; documents: number; contacts: number; meetings: number };
}) {
  const colors = useColors();
  const addressParts = [client.address, client.city, client.state, client.zip].filter(Boolean);
  const address = addressParts.length ? addressParts.join(", ") : "—";

  return (
    <div>
      <Section title="Client">
        <Row label="Status" value={client.status ?? "—"} pill={clientStatusTone(client.status, colors)} />
        <Row label="Type" value={client.type ?? "—"} />
        {client.email && <Row label="Email" value={client.email} />}
        {client.phone && <Row label="Phone" value={client.phone} mono />}
      </Section>

      <Section title="Location">
        <Row label="Registered" value={address} />
      </Section>

      <Section title="Counts">
        <Row label="Projects" value={counts.projects} mono />
        <Row label="Documents" value={counts.documents} mono />
        <Row label="Contacts" value={counts.contacts} mono />
        <Row label="Meetings" value={counts.meetings} mono />
      </Section>

      {primaryCompany && (
        <Section title="HubSpot">
          {(primaryCompany.hubspotLifecycleStageName || primaryCompany.hubspotLifecycleStage) && (
            <Row label="Lifecycle" value={primaryCompany.hubspotLifecycleStageName ?? primaryCompany.hubspotLifecycleStage} />
          )}
          {primaryCompany.type && <Row label="HubSpot type" value={primaryCompany.type} />}
          {primaryCompany.industry && <Row label="Industry" value={primaryCompany.industry} />}
          {primaryCompany.ownerName && <Row label="Owner" value={primaryCompany.ownerName} />}
        </Section>
      )}

      <div
        style={{
          marginTop: 28,
          paddingTop: 12,
          borderTop: `1px dashed ${colors.border.default}`,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9,
          color: colors.text.dim,
          lineHeight: 1.6,
        }}
      >
        <div style={{ marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Metadata</div>
        <div>convex: {client?._id?.slice(-12) ?? "—"}</div>
        {client?.hubspotCompanyId && <div>hubspot: {client.hubspotCompanyId}</div>}
      </div>
    </div>
  );
}
