'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Panel, Button, Textarea } from '@/components/layouts';
import { User, Send, Edit2, Trash2 } from 'lucide-react';
import { useColors } from '@/lib/useColors';

interface CommentsSectionProps {
  jobId?: Id<"fileUploadQueue">;
  documentId?: Id<"documents">;
}

export default function CommentsSection({ jobId, documentId }: CommentsSectionProps) {
  const colors = useColors();
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<Id<"comments"> | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const comments = useQuery(
    jobId ? api.comments.getByJob : api.comments.getByDocument,
    jobId ? { jobId } : documentId ? { documentId } : "skip"
  ) || [];

  const createComment = useMutation(api.comments.create);
  const updateComment = useMutation(api.comments.update);
  const deleteComment = useMutation(api.comments.remove);

  // Get all user IDs from comments
  const userIds = useMemo(() => {
    const ids = new Set<Id<"users">>();
    comments.forEach(comment => {
      ids.add(comment.userId);
      comment.taggedUserIds?.forEach(id => ids.add(id));
    });
    return Array.from(ids);
  }, [comments]);

  const users = useQuery(api.users.getByIds, userIds.length > 0 ? { userIds } : "skip");
  const usersMap = useMemo(() => {
    const map = new Map<Id<"users">, { name?: string; email: string }>();
    users?.forEach(user => {
      if (user) {
        map.set(user._id, { name: user.name, email: user.email });
      }
    });
    return map;
  }, [users]);

  // Parse @mentions from comment text
  const parseMentions = (text: string): Id<"users">[] => {
    const mentionRegex = /@(\w+)/g;
    const mentions: Id<"users">[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      // Try to find user by name or email
      const searchTerm = match[1].toLowerCase();
      users?.forEach(user => {
        const nameMatch = user.name?.toLowerCase().includes(searchTerm);
        const emailMatch = user.email.toLowerCase().includes(searchTerm);
        if ((nameMatch || emailMatch) && !mentions.includes(user._id)) {
          mentions.push(user._id);
        }
      });
    }

    return mentions;
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    const taggedUserIds = parseMentions(newComment);

    try {
      await createComment({
        jobId,
        documentId,
        content: newComment.trim(),
        taggedUserIds: taggedUserIds.length > 0 ? taggedUserIds : undefined,
      });
      setNewComment('');
    } catch (error) {
      console.error('Failed to create comment:', error);
      alert('Failed to add comment. Please try again.');
    }
  };

  const handleStartEdit = (commentId: Id<"comments">, content: string) => {
    setEditingCommentId(commentId);
    setEditingContent(content);
  };

  const handleSaveEdit = async () => {
    if (!editingCommentId || !editingContent.trim()) return;

    const taggedUserIds = parseMentions(editingContent);

    try {
      await updateComment({
        id: editingCommentId,
        content: editingContent.trim(),
        taggedUserIds: taggedUserIds.length > 0 ? taggedUserIds : undefined,
      });
      setEditingCommentId(null);
      setEditingContent('');
    } catch (error) {
      console.error('Failed to update comment:', error);
      alert('Failed to update comment. Please try again.');
    }
  };

  const handleDelete = async (commentId: Id<"comments">) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      await deleteComment({ id: commentId });
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert('Failed to delete comment. Please try again.');
    }
  };

  return (
    <div className="mt-6">
      <Panel title="Comments">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Comment Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment... Use @username to mention someone"
              style={{ minHeight: 80 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={handleSubmit} disabled={!newComment.trim()}>
                <Send size={14} />
                Post Comment
              </Button>
            </div>
          </div>

          {/* Comments List */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              borderTop: `1px solid ${colors.border.default}`,
              paddingTop: 16,
            }}
          >
            {comments.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: colors.text.muted,
                  textAlign: 'center',
                  padding: '16px 0',
                }}
              >
                No comments yet. Be the first to comment.
              </p>
            ) : (
              comments.map((comment) => {
                const user = usersMap.get(comment.userId);
                const isEditing = editingCommentId === comment._id;

                return (
                  <div key={comment._id} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flexShrink: 0 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9999,
                          background: colors.bg.cardAlt,
                          border: `1px solid ${colors.border.default}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <User size={14} style={{ color: colors.text.muted }} />
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                          {user?.name || user?.email || 'Unknown User'}
                        </span>
                        <span style={{ fontSize: 10, color: colors.text.muted }}>
                          {new Date(comment.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <Textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            style={{ minHeight: 60 }}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button variant="primary" size="sm" onClick={handleSaveEdit}>
                              Save
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditingContent('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="whitespace-pre-wrap"
                          style={{ fontSize: 13, color: colors.text.primary }}
                        >
                          {comment.content}
                        </div>
                      )}
                      {comment.taggedUserIds && comment.taggedUserIds.length > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {comment.taggedUserIds.map(taggedId => {
                            const taggedUser = usersMap.get(taggedId);
                            return (
                              <span
                                key={taggedId}
                                style={{
                                  fontSize: 10,
                                  background: `${colors.accent.blue}20`,
                                  color: colors.accent.blue,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                }}
                              >
                                @{taggedUser?.name || taggedUser?.email || 'user'}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {!isEditing && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEdit(comment._id, comment.content)}
                          >
                            <Edit2 size={12} />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(comment._id)}
                            style={{ color: colors.accent.red }}
                          >
                            <Trash2 size={12} />
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
