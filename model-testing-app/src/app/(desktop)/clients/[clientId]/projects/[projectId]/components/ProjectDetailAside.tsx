"use client";

import { useColors } from "@/lib/useColors";
import { Section, Row, StatusPill, projectStatusTone } from "@/components/layouts";

export function ProjectDetailAside({
  project,
  client,
  counts,
}: {
  project: any;
  client: any;
  counts: { documents: number; clients: number };
}) {
  const colors = useColors();
  const fmtGBP = (n?: number) =>
    n ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n) : "—";

  return (
    <div>
      <Section title="Project">
        <Row label="Status" value={project.status ?? "—"} pill={projectStatusTone(project.status, colors)} />
        {project.projectShortcode && <Row label="Shortcode" value={project.projectShortcode} mono />}
        {project.dealPhase && <Row label="Deal phase" value={project.dealPhase} />}
        <Row label="Client" value={client.name} />
      </Section>

      <Section title="Finance">
        <Row label="Loan amount" value={fmtGBP(project.loanAmount)} mono />
        {project.ltv !== undefined && <Row label="LTV" value={`${project.ltv}%`} mono />}
      </Section>

      <Section title="Counts">
        <Row label="Documents" value={counts.documents} mono />
        <Row label="Clients" value={counts.clients} mono />
      </Section>

      <Section title="Dates">
        <Row label="Created" value={new Date(project.createdAt).toLocaleDateString()} mono />
        {project.expectedCompletionDate && (
          <Row label="Due" value={new Date(project.expectedCompletionDate).toLocaleDateString()} mono />
        )}
      </Section>

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
        <div>convex: {project?._id?.slice(-12) ?? "—"}</div>
      </div>
    </div>
  );
}
