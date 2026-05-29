"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function DocFileLink({ file }: { file: any }) {
  const url = useQuery(api.documents.getFileUrl as any, { storageId: file.storageId });
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 border rounded px-2 py-1 text-xs ${
        url ? "text-blue-700 hover:bg-blue-50" : "text-gray-400 pointer-events-none"
      }`}
    >
      {file.format === "pdf" ? "View PDF" : "Download DOCX"}
    </a>
  );
}

function DocumentPublishPreview({ payload }: { payload: any }) {
  const files = payload?.files ?? [];
  return (
    <div className="space-y-2 text-sm">
      <div>
        <span className="text-gray-500">Title: </span>
        <span className="font-medium">{payload?.title}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-mono">{payload?.docType}</span>
        <span>·</span>
        <span>{payload?.category}</span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {files.map((f: any) => (
          <DocFileLink key={f.storageId} file={f} />
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status, entityType }: { status: ApprovalStatus; entityType?: string }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="border-amber-300 text-amber-800">
          <Clock className="w-3.5 h-3.5 mr-1" />
          Pending
        </Badge>
      );
    case "approved":
      return (
        <Badge variant="outline" className="border-blue-300 text-blue-800">
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          Executing
        </Badge>
      );
    case "executed":
      return (
        <Badge variant="default" className="bg-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
          {entityType === "document_publish" ? "Filed" : "Sent"}
        </Badge>
      );
    case "execution_failed":
      return (
        <Badge variant="destructive">
          <AlertTriangle className="w-3.5 h-3.5 mr-1" />
          Failed
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="outline" className="border-red-300 text-red-800">
          <XCircle className="w-3.5 h-3.5 mr-1" />
          Rejected
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline" className="border-gray-300 text-gray-700">
          <Ban className="w-3.5 h-3.5 mr-1" />
          Cancelled
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="outline" className="border-gray-300 text-gray-700">
          Expired
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function ApprovalCard({ approval }: { approval: any }) {
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
    <Card className="mb-3">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center text-left w-full hover:bg-gray-50 -ml-2 px-2 py-1 rounded"
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4 mr-1 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-1 text-gray-400 flex-shrink-0" />
              )}
              <span className="font-medium text-sm truncate">{approval.summary}</span>
            </button>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 ml-5">
              <span className="font-mono">{approval.entityType}</span>
              {approval.requestSourceName && (
                <>
                  <span>·</span>
                  <span>
                    via <span className="font-medium">{approval.requestSourceName}</span>
                  </span>
                </>
              )}
              <span>·</span>
              <span>{new Date(approval.requestedAt).toLocaleString()}</span>
            </div>
          </div>
          <StatusBadge status={approval.status} entityType={approval.entityType} />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="border-t pt-3 space-y-3">
            {/* Render Gmail-specific preview if entityType matches */}
            {approval.entityType === "gmail_send" && approval.draftPayload && (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">To: </span>
                  <span className="font-medium">
                    {(approval.draftPayload.to ?? []).join(", ")}
                  </span>
                </div>
                {approval.draftPayload.cc?.length > 0 && (
                  <div>
                    <span className="text-gray-500">Cc: </span>
                    <span>{approval.draftPayload.cc.join(", ")}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Subject: </span>
                  <span className="font-medium">{approval.draftPayload.subject}</span>
                </div>
                <div className="pt-2 border-t">
                  {approval.draftPayload.bodyHtml ? (
                    <div
                      className="prose prose-sm max-w-none text-gray-800"
                      dangerouslySetInnerHTML={{ __html: approval.draftPayload.bodyHtml }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
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
              <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-96">
                {JSON.stringify(approval.draftPayload, null, 2)}
              </pre>
            )}

            {/* Execution outcome */}
            {approval.status === "executed" && approval.executionResult && (
              <div className="text-xs bg-emerald-50 border border-emerald-200 rounded p-3 text-emerald-800">
                <div className="font-medium mb-1">Executed</div>
                <pre className="font-mono">
                  {JSON.stringify(approval.executionResult, null, 2)}
                </pre>
              </div>
            )}
            {approval.status === "execution_failed" && approval.executionError && (
              <div className="text-xs bg-red-50 border border-red-200 rounded p-3 text-red-800">
                <div className="font-medium mb-1">Execution error</div>
                {approval.executionError}
              </div>
            )}
            {approval.status === "rejected" && approval.rejectedReason && (
              <div className="text-xs bg-gray-50 border rounded p-3 text-gray-700">
                <div className="font-medium mb-1">Rejection reason</div>
                {approval.rejectedReason}
              </div>
            )}

            {/* Actions */}
            {isPending && (
              <div className="pt-2 border-t flex items-center gap-2">
                <Button onClick={handleApprove} disabled={acting} size="sm">
                  {acting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Approve
                    </>
                  )}
                </Button>
                {!showRejectForm ? (
                  <Button
                    onClick={() => setShowRejectForm(true)}
                    disabled={acting}
                    variant="outline"
                    size="sm"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="flex-1 border rounded px-2 py-1 text-sm"
                    />
                    <Button onClick={handleReject} disabled={acting} variant="destructive" size="sm">
                      Confirm reject
                    </Button>
                    <Button
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectReason("");
                      }}
                      variant="outline"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                <Button onClick={handleCancel} disabled={acting} variant="outline" size="sm">
                  Cancel request
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function ApprovalsPage() {
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  const counts = useQuery(api.approvals.getCounts as any);
  const approvals = useQuery(api.approvals.listAll as any, { status: filter, limit: 100 });

  const loading = approvals === undefined;

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
              <Inbox className="w-6 h-6" />
              Approvals
            </h1>
            <p className="mt-1 text-gray-600">
              Drafts staged by skills, background jobs, and cadences. Review,
              approve, or reject. Approved actions execute automatically.
            </p>
          </div>
          {counts && (
            <div className="flex items-center gap-2 text-sm">
              {counts.pending > 0 && (
                <Badge variant="outline" className="border-amber-300 text-amber-800">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  {counts.pending} pending
                </Badge>
              )}
              {counts.executionFailed > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  {counts.executionFailed} failed
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center gap-1 border-b">
          {(
            ["pending", "executed", "execution_failed", "rejected", "cancelled", "all"] as const
          ).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                filter === s
                  ? "border-blue-600 text-blue-600 font-medium"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-gray-500 flex items-center justify-center py-12">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading approvals...
          </div>
        ) : approvals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <Send className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">
                {filter === "pending"
                  ? "No pending approvals. Skills will stage drafts here when they need human review."
                  : `No ${STATUS_LABELS[filter as ApprovalStatus]?.toLowerCase() ?? filter} approvals.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div>
            {approvals.map((approval: any) => (
              <ApprovalCard key={approval._id} approval={approval} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
