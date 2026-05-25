"use client";

import { useColors } from "@/lib/useColors";

interface ProspectDetailAsideProps {
  prospect: any;
  intelRun?: any;
  cadences: any[];
}

export function ProspectDetailAside({ prospect, intelRun, cadences }: ProspectDetailAsideProps) {
  const colors = useColors();

  const labelStyle = { fontFamily: "ui-monospace, monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: colors.text.muted, marginBottom: 8 };
  const rowStyle = { display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 11, borderBottom: `1px solid ${colors.border.light}` };
  const monoStyle = { fontFamily: "ui-monospace, monospace", fontSize: 10 };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={labelStyle}>Identity</div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Convex id</span><span style={{ ...monoStyle, color: colors.text.primary, maxWidth: 180, textAlign: "right" as const, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{prospect?._id?.slice(-12) ?? "—"}</span></div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Company name</span><span style={{ color: colors.text.primary }}>{prospect?.companyName ?? prospect?.name ?? "—"}</span></div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>HubSpot id</span><span style={{ ...monoStyle, color: colors.text.muted }}>{prospect?.hubspotCompanyId ?? "—"}</span></div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={labelStyle}>Pipeline</div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>State</span><span style={{ color: colors.text.primary }}>{prospect?.prospectState ?? "—"}</span></div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Changed at</span><span style={{ ...monoStyle, color: colors.text.muted }}>{prospect?.prospectStateChangedAt?.slice(0, 16) ?? "—"}</span></div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Status</span><span style={{ color: colors.text.primary }}>{prospect?.status ?? "—"}</span></div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Type</span><span style={{ color: colors.text.primary }}>{prospect?.type ?? "—"}</span></div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={labelStyle}>Cadence</div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Touches</span><span style={{ ...monoStyle, color: colors.text.primary }}>{cadences?.length ?? 0}</span></div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Package id</span><span style={{ ...monoStyle, color: colors.text.muted, maxWidth: 180, textAlign: "right" as const, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{cadences?.[0]?.packageId?.slice(-16) ?? "—"}</span></div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={labelStyle}>SkillRun</div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Run id</span><span style={{ ...monoStyle, color: colors.text.muted }}>{intelRun?._id?.slice(-12) ?? "—"}</span></div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Status</span><span style={{ color: colors.text.primary }}>{intelRun?.status ?? "—"}</span></div>
        <div style={rowStyle}><span style={{ color: colors.text.muted }}>Gaps</span><span style={{ ...monoStyle, color: colors.text.primary }}>{intelRun?.gaps?.length ?? 0}</span></div>
      </div>
    </div>
  );
}
