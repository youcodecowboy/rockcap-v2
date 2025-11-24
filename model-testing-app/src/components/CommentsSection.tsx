'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Send, Edit2, Trash2 } from 'lucide-react';

interface CommentsSectionProps {
  jobId?: Id<"fileUploadQueue">;
  documentId?: Id<"documents">;
}

export default function CommentsSection({ jobId, documentId }: CommentsSectionProps) {
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
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Comments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comment Input */}
        <div className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment... Use @username to mention someone"
            className="min-h-[80px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={!newComment.trim()}>
              <Send className="w-4 h-4 mr-2" />
              Post Comment
            </Button>
          </div>
        </div>
        
        {/* Comments List */}
        <div className="space-y-4 border-t border-gray-200 pt-4">
          {comments.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No comments yet. Be the first to comment!
            </p>
          ) : (
            comments.map((comment) => {
              const user = usersMap.get(comment.userId);
              const isEditing = editingCommentId === comment._id;
              
              return (
                <div key={comment._id} className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-600" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {user?.name || user?.email || 'Unknown User'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          className="min-h-[60px]"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveEdit}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
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
                      <div className="text-sm text-gray-900 whitespace-pre-wrap">
                        {comment.content}
                      </div>
                    )}
                    {comment.taggedUserIds && comment.taggedUserIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {comment.taggedUserIds.map(taggedId => {
                          const taggedUser = usersMap.get(taggedId);
                          return (
                            <span
                              key={taggedId}
                              className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded"
                            >
                              @{taggedUser?.name || taggedUser?.email || 'user'}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {!isEditing && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(comment._id, comment.content)}
                          className="h-6 px-2 text-xs"
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(comment._id)}
                          className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
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
      </CardContent>
    </Card>
  );
}

