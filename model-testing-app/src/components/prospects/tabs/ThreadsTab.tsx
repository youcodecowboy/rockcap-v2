"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useColors } from "@/lib/useColors";

/**
 * Threads tab — collaborative discussion on a prospect, built on the existing
 * conversations / directMessages messaging system. A thread is a `conversations`
 * row filed to this prospect (clientId), and posting a message notifies every
 * other participant via the existing `directMessages.send` notification path
 * (type "message" → web NotificationDropdown + mobile inbox).
 *
 * Tagging someone = adding them as a participant when starting the thread.
 * A "message to nobody" = a solo thread (creator only); nobody is notified.
 *
 * Reuses the backend only; the UI is tab-native (useColors + inline styles) to
 * match the rest of the prospect detail page rather than the MessengerContext
 * drawer components.
 */
export function ThreadsTab({ prospect }: { prospect: any }) {
  const colors = useColors();
  const clientId = prospect?._id as Id<"clients">;

  const [activeId, setActiveId] = useState<Id<"conversations"> | null>(null);
  const [composing, setComposing] = useState(false);

  const threads = useQuery(
    api.conversations.getMyConversations,
    clientId ? { clientId } : "skip",
  );

  if (activeId) {
    return (
      <ThreadView
        conversationId={activeId}
        onBack={() => setActiveId(null)}
        colors={colors}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: colors.text.primary }}>Threads</h2>
          <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
            Discussion on this prospect. Tag a colleague and they get notified.
          </div>
        </div>
        {!composing && (
          <button
            onClick={() => setComposing(true)}
            style={{
              padding: "8px 14px", fontSize: 13, fontWeight: 500, borderRadius: 6,
              border: `1px solid ${colors.entityTypes.prospect}`,
              background: colors.entityTypes.prospect, color: "#fff", cursor: "pointer",
            }}
          >
            + New thread
          </button>
        )}
      </div>

      {composing && (
        <NewThreadForm
          clientId={clientId}
          colors={colors}
          onCancel={() => setComposing(false)}
          onCreated={(id) => { setComposing(false); setActiveId(id); }}
        />
      )}

      {threads === undefined && (
        <div style={{ fontSize: 13, color: colors.text.muted, padding: "24px 0" }}>Loading…</div>
      )}

      {threads && threads.length === 0 && !composing && (
        <div style={{
          border: `1px dashed ${colors.border.default}`, borderRadius: 8,
          padding: "32px 24px", textAlign: "center", color: colors.text.muted, fontSize: 13,
        }}>
          No threads yet. Start one to leave a note on this prospect or tag a colleague.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: colors.border.default, borderRadius: 8, overflow: "hidden" }}>
        {(threads ?? []).map((t: any) => {
          const others = (t.participants ?? []).filter((p: any) => p.id !== t.lastMessageSenderId);
          return (
            <div
              key={t._id}
              onClick={() => setActiveId(t._id)}
              style={{ background: colors.bg.card, padding: "12px 14px", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{t.title}</span>
                  {t.unreadCount > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: "#fff", background: colors.entityTypes.prospect,
                      borderRadius: 10, padding: "1px 7px",
                    }}>{t.unreadCount}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.lastMessagePreview || "No messages yet"}
                </div>
                <div style={{ fontSize: 10, color: colors.text.dim, marginTop: 4 }}>
                  {(t.participants ?? []).map((p: any) => p.name).join(", ")}
                </div>
              </div>
              {t.lastMessageAt && (
                <div style={{ fontSize: 10, color: colors.text.dim, whiteSpace: "nowrap" }}>
                  {relativeTime(t.lastMessageAt)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewThreadForm({
  clientId, colors, onCancel, onCreated,
}: {
  clientId: Id<"clients">;
  colors: any;
  onCancel: () => void;
  onCreated: (id: Id<"conversations">) => void;
}) {
  const [title, setTitle] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const allUsers = useQuery(api.users.getAll);
  const createConversation = useMutation(api.conversations.create);
  const sendMessage = useMutation(api.directMessages.send);

  const filtered = (allUsers || []).filter((u: any) => {
    const q = userSearch.toLowerCase();
    return !q || (u.name || u.email || "").toLowerCase().includes(q);
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canCreate = title.trim().length > 0 && !busy;

  const handleCreate = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const id = await createConversation({
        participantIds: selected as Id<"users">[],
        title: title.trim(),
        clientId,
      });
      if (firstMessage.trim()) {
        await sendMessage({ conversationId: id as Id<"conversations">, content: firstMessage.trim() });
      }
      onCreated(id as Id<"conversations">);
    } finally {
      setBusy(false);
    }
  };

  const fieldStyle = {
    width: "100%", padding: "8px 10px", fontSize: 13, borderRadius: 6,
    border: `1px solid ${colors.border.default}`, background: colors.bg.light,
    color: colors.text.primary, outline: "none",
  } as const;
  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 500, color: colors.text.muted, marginBottom: 4,
  } as const;

  return (
    <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 8, padding: 16, marginBottom: 16, background: colors.bg.card }}>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Thread title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Keith Grove — funding timeline" style={fieldStyle} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Tag people (they get notified) — optional</label>
        <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users…" style={{ ...fieldStyle, marginBottom: 6 }} />
        <div style={{ maxHeight: 150, overflowY: "auto", border: `1px solid ${colors.border.default}`, borderRadius: 6 }}>
          {filtered.map((u: any) => {
            const isSel = selected.includes(u._id);
            return (
              <div
                key={u._id}
                onClick={() => toggle(u._id)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 10px", fontSize: 13, cursor: "pointer",
                  background: isSel ? `${colors.entityTypes.prospect}15` : "transparent",
                  color: colors.text.primary,
                }}
              >
                <span>{u.name || u.email}</span>
                {isSel && <span style={{ color: colors.entityTypes.prospect, fontSize: 12 }}>✓</span>}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: "8px 10px", fontSize: 12, color: colors.text.dim }}>No users found.</div>
          )}
        </div>
        <div style={{ fontSize: 11, color: colors.text.dim, marginTop: 4 }}>
          {selected.length === 0 ? "No one tagged — this will be a note to the prospect." : `${selected.length} tagged`}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>First message — optional</label>
        <textarea value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} rows={3} placeholder="What's this about?" style={{ ...fieldStyle, resize: "vertical" }} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ padding: "8px 14px", fontSize: 13, borderRadius: 6, border: `1px solid ${colors.border.default}`, background: colors.bg.light, color: colors.text.muted, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={handleCreate} disabled={!canCreate} style={{
          padding: "8px 14px", fontSize: 13, fontWeight: 500, borderRadius: 6, border: "none",
          background: canCreate ? colors.entityTypes.prospect : colors.border.default,
          color: canCreate ? "#fff" : colors.text.dim, cursor: canCreate ? "pointer" : "default",
        }}>
          {busy ? "Creating…" : "Create thread"}
        </button>
      </div>
    </div>
  );
}

function ThreadView({
  conversationId, onBack, colors,
}: {
  conversationId: Id<"conversations">;
  onBack: () => void;
  colors: any;
}) {
  const conversation = useQuery(api.conversations.get, { id: conversationId });
  const messages = useQuery(api.directMessages.getByConversation, { conversationId });
  const send = useMutation(api.directMessages.send);
  const markAsRead = useMutation(api.conversations.markAsRead);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages && messages.length > 0) markAsRead({ conversationId });
  }, [messages?.length, conversationId, markAsRead]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages?.length]);

  const currentUserId = (conversation as any)?.currentUserId;

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await send({ conversationId, content });
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 420 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, borderBottom: `1px solid ${colors.border.default}`, marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: colors.text.muted, cursor: "pointer", fontSize: 13 }}>
          ← Threads
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.text.primary }}>{(conversation as any)?.title ?? "…"}</div>
          <div style={{ fontSize: 11, color: colors.text.dim, marginTop: 1 }}>
            {((conversation as any)?.participants ?? []).map((p: any) => p.name).join(", ")}
          </div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4, maxHeight: 480 }}>
        {messages && messages.length === 0 && (
          <div style={{ fontSize: 13, color: colors.text.dim, textAlign: "center", padding: "24px 0" }}>
            No messages yet.
          </div>
        )}
        {(messages ?? []).map((m: any) => {
          const mine = m.senderId === currentUserId;
          return (
            <div key={m._id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
              <div style={{ fontSize: 10, color: colors.text.dim, marginBottom: 2, textAlign: mine ? "right" : "left" }}>
                {mine ? "You" : m.senderName} · {relativeTime(m.createdAt)}{m.isEdited ? " · edited" : ""}
              </div>
              <div style={{
                padding: "8px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.45,
                background: mine ? colors.entityTypes.prospect : colors.bg.light,
                color: mine ? "#fff" : colors.text.primary,
                border: mine ? "none" : `1px solid ${colors.border.default}`,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {m.isDeleted ? <span style={{ fontStyle: "italic", opacity: 0.7 }}>message deleted</span> : m.content}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }}
          rows={2}
          placeholder="Write a message… (⌘/Ctrl+Enter to send)"
          style={{
            flex: 1, padding: "8px 10px", fontSize: 13, borderRadius: 6, resize: "vertical",
            border: `1px solid ${colors.border.default}`, background: colors.bg.light, color: colors.text.primary, outline: "none",
          }}
        />
        <button onClick={handleSend} disabled={!draft.trim() || sending} style={{
          padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 6, border: "none",
          background: draft.trim() && !sending ? colors.entityTypes.prospect : colors.border.default,
          color: draft.trim() && !sending ? "#fff" : colors.text.dim,
          cursor: draft.trim() && !sending ? "pointer" : "default", whiteSpace: "nowrap",
        }}>
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
