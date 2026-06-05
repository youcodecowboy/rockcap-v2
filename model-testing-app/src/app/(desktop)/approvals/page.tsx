"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import {
  Panel,
  DataTable,
  StatusPill,
  FlagChip,
  Button,
  Field,
  Input,
  EmptyState,
  SkeletonTable,
  type Column,
} from "@/components/layouts";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Inbox,
  Send,
  ChevronDown,
  ChevronRight,
  Ban,
} from "lucide-react";

// Approval queue page (BL-5.7).
// Surfaces every staged draft from skills, background jobs, cadences,
// and manual operator submissions. The first executor wired is
// gmail_send (BL-4.2); others mark executed with a stub result for now.

type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "executed"
  | "execution_failed"
  | "cancelled";

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  executed: "Executed",
  execution_failed: "Execution failed",
  cancelled: "Cancelled",
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function statusTone(status: ApprovalStatus, colors: ReturnType<typeof useColors>): string {
  switch (status) {
    case "pending":
      return colors.accent.yellow;
    case "approved":
      return colors.accent.blue;
    case "executed":
      return colors.accent.green;
    case "execution_failed":
      return colors.accent.red;
    case "rejected":
      return colors.accent.red;
    case "cancelled":
    case "expired":
    default:
      return colors.text.dim;
  }
}

function statusLabel(status: ApprovalStatus, entityType?: string): string {
  switch (status) {
    case "approved":
      return "Executing";
    case "executed":
      return entityType === "document_publish" ? "Filed" : "Sent";
    case "execution_failed":
      return "Failed";
    default:
      return STATUS_LABELS[status] ?? status;
  }
}

function DocFileLink({ file }: { file: any }) {
  const colors = useColors();
  const url = useQuery(api.documents.getFileUrl as any, { storageId: file.storageId });
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        fontSize: 11,
        borderRadius: 4,
        border: `1px solid ${colors.border.default}`,
        color: url ? colors.accent.blue : colors.text.dim,
        pointerEvents: url ? undefined : "none",
        textDecoration: "none",
      }}
    >
      {file.format === "pdf" ? "View PDF" : "Download DOCX"}
    </a>
  );
}

function DocumentPublishPreview({ payload }: { payload: any }) {
  const colors = useColors();
  const files = payload?.files ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
      <div>
        <span style={{ color: colors.text.muted }}>Title: </span>
        <span style={{ fontWeight: 500, color: colors.text.primary }}>{payload?.title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: colors.text.muted }}>
        <span style={{ fontFamily: MONO }}>{payload?.docType}</span>
        <span>·</span>
        <span>{payload?.category}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
        {files.map((f: any) => (
          <DocFileLink key={f.storageId} file={f} />
        ))}
      </div>
    </div>
  );
}

function ApprovalRow({ approval }: { approval: any }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const approve = useMutation(api.approvals.approve as any);
  const reject = useMutation(api.approvals.reject as any);
  const cancel = useMutation(api.approvals.cancel as any);

  const handleApprove = async () => {
    setActing(true);
    try {
      await approve({ approvalId: approval._id });
    } catch (e: any) {
      alert(e?.message || "Failed to approve");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await reject({ approvalId: approval._id, reason: rejectReason || undefined });
      setShowRejectForm(false);
      setRejectReason("");
    } catch (e: any) {
      alert(e?.message || "Failed to reject");
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async () => {
    setActing(true);
    try {
      await cancel({ approvalId: approval._id });
    } catch (e: any) {
      alert(e?.message || "Failed to cancel");
    } finally {
      setActing(false);
    }
  };

  const isPending = approval.status === "pending";

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        background: colors.bg.card,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "12px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              textAlign: "left",
              width: "100%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: colors.text.primary,
            }}
          >
            {expanded ? (
              <ChevronDown size={16} style={{ color: colors.text.dim, flexShrink: 0 }} />
            ) : (
              <ChevronRight size={16} style={{ color: colors.text.dim, flexShrink: 0 }} />
            )}
            <span style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {approval.summary}
            </span>
          </button>
          <div style={{ marginTop: 4, marginLeft: 22, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: colors.text.muted }}>
            <span style={{ fontFamily: MONO }}>{approval.entityType}</span>
            {approval.requestSourceName && (
              <>
                <span>·</span>
                <span>
                  via <span style={{ fontWeight: 500 }}>{approval.requestSourceName}</span>
                </span>
              </>
            )}
            <span>·</span>
            <span>{new Date(approval.requestedAt).toLocaleString()}</span>
          </div>
        </div>
        <StatusPill label={statusLabel(approval.status, approval.entityType)} tone={statusTone(approval.status, colors)} />
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px 14px" }}>
          <div style={{ borderTop: `1px solid ${colors.border.light}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Render Gmail-specific preview if entityType matches */}
            {approval.entityType === "gmail_send" && approval.draftPayload && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                <div>
                  <span style={{ color: colors.text.muted }}>To: </span>
                  <span style={{ fontWeight: 500, color: colors.text.primary }}>
                    {/* draftPayload is untyped server-side; legacy producers
                        staged recipients as a bare string — render either. */}
                    {[approval.draftPayload.to ?? []].flat().join(", ")}
                  </span>
                </div>
                {(approval.draftPayload.cc?.length ?? 0) > 0 && (
                  <div>
                    <span style={{ color: colors.text.muted }}>Cc: </span>
                    <span style={{ color: colors.text.primary }}>{[approval.draftPayload.cc].flat().join(", ")}</span>
                  </div>
                )}
                <div>
                  <span style={{ color: colors.text.muted }}>Subject: </span>
                  <span style={{ fontWeight: 500, color: colors.text.primary }}>{approval.draftPayload.subject}</span>
                </div>
                <div style={{ paddingTop: 8, borderTop: `1px solid ${colors.border.light}` }}>
                  {approval.draftPayload.bodyHtml ? (
                    <div
                      style={{ fontSize: 12, color: colors.text.secondary }}
                      dangerouslySetInnerHTML={{ __html: approval.draftPayload.bodyHtml }}
                    />
                  ) : (
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: colors.text.secondary, fontFamily: "inherit", margin: 0 }}>
                      {approval.draftPayload.bodyText}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* Document-publish preview */}
            {approval.entityType === "document_publish" && approval.draftPayload && (
              <DocumentPublishPreview payload={approval.draftPayload} />
            )}

            {/* Generic payload dump for remaining types */}
            {approval.entityType !== "gmail_send" && approval.entityType !== "document_publish" && (
              <pre
                style={{
                  fontSize: 11,
                  fontFamily: MONO,
                  background: colors.bg.light,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  padding: 12,
                  overflow: "auto",
                  maxHeight: 384,
                  color: colors.text.secondary,
                  margin: 0,
                }}
              >
                {JSON.stringify(approval.draftPayload, null, 2)}
              </pre>
            )}

            {/* Execution outcome */}
            {approval.status === "executed" && approval.executionResult && (
              <div
                style={{
                  fontSize: 11,
                  background: `${colors.accent.green}15`,
                  border: `1px solid ${colors.accent.green}40`,
                  borderRadius: 4,
                  padding: 12,
                  color: colors.accent.green,
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Executed</div>
                <pre style={{ fontFamily: MONO, margin: 0 }}>
                  {JSON.stringify(approval.executionResult, null, 2)}
                </pre>
              </div>
            )}
            {approval.status === "execution_failed" && approval.executionError && (
              <div
                style={{
                  fontSize: 11,
                  background: `${colors.accent.red}15`,
                  border: `1px solid ${colors.accent.red}40`,
                  borderRadius: 4,
                  padding: 12,
                  color: colors.accent.red,
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Execution error</div>
                {approval.executionError}
              </div>
            )}
            {approval.status === "rejected" && approval.rejectedReason && (
              <div
                style={{
                  fontSize: 11,
                  background: colors.bg.light,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  padding: 12,
                  color: colors.text.secondary,
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Rejection reason</div>
                {approval.rejectedReason}
              </div>
            )}

            {/* Actions */}
            {isPending && (
              <div style={{ paddingTop: 12, borderTop: `1px solid ${colors.border.light}`, display: "flex", alignItems: "center", gap: 8 }}>
                <Button variant="primary" accent={colors.accent.green} onClick={handleApprove} disabled={acting} size="sm">
                  {acting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      Approve
                    </>
                  )}
                </Button>
                {!showRejectForm ? (
                  <Button onClick={() => setShowRejectForm(true)} disabled={acting} variant="danger" size="sm">
                    <XCircle size={14} />
                    Reject
                  </Button>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    <div style={{ flex: 1 }}>
                      <Input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason (optional)"
                      />
                    </div>
                    <Button onClick={handleReject} disabled={acting} variant="danger" size="sm">
                      Confirm reject
                    </Button>
                    <Button
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectReason("");
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                <Button onClick={handleCancel} disabled={acting} variant="ghost" size="sm">
                  Cancel request
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const colors = useColors();
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  const counts = useQuery(api.approvals.getCounts as any);
  const approvals = useQuery(api.approvals.listAll as any, { status: filter, limit: 100 });

  const loading = approvals === undefined;

  return (
    <div style={{ background: colors.bg.light, minHeight: "100vh" }}>
      <div style={{ maxWidth: 896, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: colors.text.primary, display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <Inbox size={24} />
              Approvals
            </h1>
            <p style={{ marginTop: 4, color: colors.text.muted, fontSize: 13 }}>
              Drafts staged by skills, background jobs, and cadences. Review,
              approve, or reject. Approved actions execute automatically.
            </p>
          </div>
          {counts && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {counts.pending > 0 && <FlagChip label={`${counts.pending} pending`} severity="warn" />}
              {counts.executionFailed > 0 && (
                <StatusPill label={`${counts.executionFailed} failed`} tone={colors.accent.red} />
              )}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${colors.border.default}` }}>
          {(["pending", "executed", "execution_failed", "rejected", "cancelled", "all"] as const).map((s) => {
            const active = filter === s;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? colors.accent.blue : "transparent"}`,
                  color: active ? colors.accent.blue : colors.text.muted,
                  fontWeight: active ? 500 : 400,
                  cursor: "pointer",
                  transition: "color 100ms linear, border-color 100ms linear",
                }}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={1} />
        ) : approvals.length === 0 ? (
          <EmptyState
            icon={<Send size={40} />}
            title="No approvals"
            body={
              filter === "pending"
                ? "Skills will stage drafts here when they need human review."
                : `No ${STATUS_LABELS[filter as ApprovalStatus]?.toLowerCase() ?? filter} approvals.`
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {approvals.map((approval: any) => (
              <ApprovalRow key={approval._id} approval={approval} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
