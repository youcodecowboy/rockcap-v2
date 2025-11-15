'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useState, useContext } from 'react';
import { Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { NoteContext } from '@/contexts/NoteContext';

interface AIAssistantBlockComponentProps {
  node: {
    attrs: {
      prompt?: string;
      state?: 'pending' | 'loading' | 'error' | 'success';
      errorMessage?: string | null;
      updateMode?: boolean;
      [key: string]: any;
    };
  };
  updateAttributes: (attrs: any) => void;
  deleteNode: () => void;
  getPos: () => number | undefined;
  editor: any;
  onTitleUpdate?: (title: string) => void;
  onTagsUpdate?: (tags: string[]) => void;
  onClientUpdate?: (clientId: string | null) => void;
  onProjectUpdate?: (projectId: string | null) => void;
}

function AIAssistantBlockComponent({
  node,
  updateAttributes,
  deleteNode,
  getPos,
  editor,
  onTitleUpdate,
  onTagsUpdate,
  onClientUpdate,
  onProjectUpdate,
}: AIAssistantBlockComponentProps) {
  // Get note metadata from context instead of props
  const { noteId, clientId, projectId } = useContext(NoteContext);
  
  const [prompt, setPrompt] = useState(node.attrs.prompt || '');
  const [updateMode, setUpdateMode] = useState(node.attrs.updateMode || false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Debug: log when component renders
  console.log('AIAssistantBlockComponent rendered', { 
    nodeAttrs: node.attrs, 
    noteId, 
    clientId, 
    projectId 
  });
  
  // Helper function to extract text from TipTap JSON
  const extractTextFromContent = (content: any): string => {
    if (!content || !content.content) return '';
    
    let text = '';
    const processNode = (node: any) => {
      if (node.type === 'text') {
        text += node.text + ' ';
      } else if (node.type === 'heading') {
        const level = node.attrs?.level || 1;
        const headingText = '#'.repeat(level) + ' ';
        text += headingText;
        if (node.content) {
          node.content.forEach(processNode);
        }
        text += '\n';
      } else if (node.type === 'paragraph') {
        if (node.content) {
          node.content.forEach(processNode);
        }
        text += '\n';
      } else if (node.type === 'bulletList' || node.type === 'orderedList') {
        if (node.content) {
          node.content.forEach((item: any) => {
            text += '- ';
            if (item.content) {
              item.content.forEach((p: any) => {
                if (p.content) p.content.forEach(processNode);
              });
            }
            text += '\n';
          });
        }
      } else if (node.content) {
        node.content.forEach(processNode);
      }
    };
    
    content.content.forEach(processNode);
    return text.trim();
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    updateAttributes({ state: 'loading', prompt, updateMode });

    try {
      // Get current note content if in update mode
      let existingContent = null;
      if (updateMode && editor) {
        const currentContent = editor.getJSON();
        // Remove the AI block from the content before sending
        const contentWithoutAIBlock = {
          ...currentContent,
          content: currentContent.content?.filter((node: any) => node.type !== 'aiAssistantBlock') || [],
        };
        existingContent = extractTextFromContent(contentWithoutAIBlock);
      }

      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          noteId,
          clientId,
          projectId,
          updateMode,
          existingContent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate response');
      }

      const data = await response.json();
      
      console.log('API Response received:', {
        hasContent: !!data.content,
        contentLength: data.content?.length,
        contentPreview: data.content?.substring(0, 200),
        suggestedTags: data.suggestedTags,
        updateMode,
      });
      
      // Validate content exists
      if (!data.content || !data.content.trim()) {
        console.error('No content in API response');
        throw new Error('No content received from AI');
      }
      
      console.log('Content validated, length:', data.content.length);
      
      // Format the response into TipTap JSON FIRST, before updating metadata
      console.log('Importing formatAIResponse...');
      const { formatAIResponse } = await import('@/lib/aiResponseFormatter');
      console.log('formatAIResponse imported successfully');
      
      console.log('About to format content, length:', data.content.length);
      console.log('Mentions:', data.mentions);
      console.log('Clients:', data.clients);
      console.log('Projects:', data.projects);
      console.log('Documents:', data.documents);
      
      let formattedContent;
      try {
        console.log('Calling formatAIResponse...');
        console.log('Raw response preview:', data.content.substring(0, 500));
        
        // Call formatAIResponse directly (it's synchronous)
        formattedContent = formatAIResponse(
          data.content,
          data.mentions || { clients: [], projects: [], files: [] },
          data.clients || [],
          data.projects || [],
          data.documents || []
        );
        
        console.log('Formatted content successfully:', formattedContent);
        console.log('Formatted content length:', Array.isArray(formattedContent) ? formattedContent.length : 1);
        console.log('Formatted content type:', Array.isArray(formattedContent) ? 'array' : typeof formattedContent);
        console.log('First item:', formattedContent && Array.isArray(formattedContent) ? formattedContent[0] : formattedContent);
        
        if (!formattedContent || (Array.isArray(formattedContent) && formattedContent.length === 0)) {
          throw new Error('Formatted content is empty');
        }
      } catch (formatError) {
        console.error('Error formatting content:', formatError);
        console.error('Error details:', {
          message: formatError instanceof Error ? formatError.message : 'Unknown',
          stack: formatError instanceof Error ? formatError.stack : 'No stack',
          error: formatError
        });
        throw new Error(`Failed to format content: ${formatError instanceof Error ? formatError.message : 'Unknown error'}`);
      }
      
      console.log('Update mode:', updateMode);
      console.log('About to insert content, editor exists:', !!editor);
      
      // Insert content FIRST, then update metadata
      if (updateMode) {
        // Replace entire note content
        // setContent expects a full document structure: { type: 'doc', content: [...] }
        const docContent = {
          type: 'doc',
          content: Array.isArray(formattedContent) ? formattedContent : [formattedContent],
        };
        console.log('Setting content with doc structure:', docContent);
        
        try {
          editor
            .chain()
            .focus()
            .setContent(docContent)
            .run();
          console.log('Content set successfully in update mode');
        } catch (error) {
          console.error('Error setting content in update mode:', error);
          throw error;
        }
        // No need to manually delete the AI block - it's already gone after setContent
      } else {
        // Get the position of this node before any operations
        const nodePos = getPos();
        const contentToInsert = Array.isArray(formattedContent) ? formattedContent : [formattedContent];
        
        console.log('Insert mode - nodePos:', nodePos, 'contentToInsert length:', contentToInsert.length);
        console.log('Editor exists:', !!editor, 'Editor state exists:', !!editor?.state);
        
        // Always use deleteNode() first, then insert at current position
        // This avoids stale position issues
        try {
          console.log('Deleting AI block node...');
          deleteNode();
          
          // Wait a tick for the DOM to update
          await new Promise(resolve => setTimeout(resolve, 0));
          
          // Get current selection position after deletion
          const currentPos = editor.state.selection.anchor;
          console.log('Current position after deletion:', currentPos);
          
          // Insert content at current position
          editor
            .chain()
            .focus()
            .insertContent(contentToInsert)
            .run();
          
          console.log('Content inserted successfully at current position');
        } catch (insertError) {
          console.error('Error inserting content:', insertError);
          // Final fallback: just insert at selection
          try {
            editor
              .chain()
              .focus()
              .insertContent(contentToInsert)
              .run();
            console.log('Content inserted at selection (final fallback)');
          } catch (finalError) {
            console.error('Final fallback also failed:', finalError);
            throw insertError;
          }
        }
      }
      
      // Update metadata AFTER content is inserted
      console.log('Starting metadata updates...');
      
      // Update title if suggested
      if (data.suggestedTitle && onTitleUpdate) {
        console.log('Updating title:', data.suggestedTitle);
        try {
          onTitleUpdate(data.suggestedTitle);
        } catch (error) {
          console.error('Error updating title:', error);
        }
      }
      
      // Update tags if suggested
      if (data.suggestedTags && Array.isArray(data.suggestedTags) && data.suggestedTags.length > 0 && onTagsUpdate) {
        console.log('Updating tags:', data.suggestedTags);
        try {
          onTagsUpdate(data.suggestedTags);
        } catch (error) {
          console.error('Error updating tags:', error);
        }
      }
      
      // Update client if suggested and not already set
      if (data.suggestedClientId && onClientUpdate) {
        console.log('Updating client:', data.suggestedClientId);
        try {
          onClientUpdate(data.suggestedClientId);
        } catch (error) {
          console.error('Error updating client:', error);
        }
      }
      
      // Update project if suggested and not already set
      if (data.suggestedProjectId && onProjectUpdate) {
        console.log('Updating project:', data.suggestedProjectId);
        try {
          onProjectUpdate(data.suggestedProjectId);
        } catch (error) {
          console.error('Error updating project:', error);
        }
      }
      
      // Mark as success
      console.log('Marking as success...');
      updateAttributes({ state: 'success', prompt });
      console.log('AI Assistant completed successfully');
    } catch (error) {
      console.error('AI Assistant error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      updateAttributes({
        state: 'error',
        errorMessage: error instanceof Error ? error.message : 'An error occurred',
        prompt,
      });
    } finally {
      setIsGenerating(false);
      console.log('AI Assistant finished, isGenerating set to false');
    }
  };

  const handleRetry = () => {
    updateAttributes({ state: 'pending', errorMessage: null });
    handleGenerate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  if (node.attrs.state === 'loading') {
    return (
      <NodeViewWrapper className="ai-assistant-block my-4">
        <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <div className="flex-1">
              <div className="text-sm font-medium text-blue-900">Generating response...</div>
              <div className="text-xs text-blue-700 mt-1">{prompt}</div>
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  if (node.attrs.state === 'error') {
    return (
      <NodeViewWrapper className="ai-assistant-block my-4">
        <div className="border-2 border-red-200 bg-red-50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-red-900">Error generating response</div>
              <div className="text-xs text-red-700 mt-1">{node.attrs.errorMessage || 'An error occurred'}</div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleRetry}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
                <button
                  onClick={deleteNode}
                  className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="ai-assistant-block my-4">
      <div className="border-2 border-gray-200 bg-gray-50 rounded-lg p-4">
        <div className="flex items-start gap-3 mb-3">
          <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900 mb-1">AI Assistant</div>
            <div className="text-xs text-gray-600 mb-3">
              {updateMode 
                ? 'Update the existing note content based on your prompt. The AI will revise and enhance the current note.'
                : "Describe what you'd like help with. The AI will search your knowledge bank and create a formatted note."}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="update-mode"
                checked={updateMode}
                onChange={(e) => {
                  const newUpdateMode = e.target.checked;
                  setUpdateMode(newUpdateMode);
                  updateAttributes({ updateMode: newUpdateMode });
                }}
                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
              />
              <label htmlFor="update-mode" className="text-xs text-gray-700 cursor-pointer">
                Update existing note content
              </label>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                updateAttributes({ prompt: e.target.value });
              }}
              onKeyDown={handleKeyDown}
              placeholder={updateMode 
                ? "e.g., Add more details about the expenses section, update the timeline, expand on the financial summary..."
                : "e.g., Create a summary of recent deal updates for Acme Corp..."}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              rows={3}
              disabled={isGenerating}
            />
            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-gray-500">
                Press Cmd/Ctrl + Enter to generate
              </div>
              <div className="flex gap-2">
                <button
                  onClick={deleteNode}
                  className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                  className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Sparkles className="w-3 h-3" />
                  Generate
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const AIAssistantBlock = Node.create({
  name: 'aiAssistantBlock',
  
  group: 'block',
  
  content: '',

  addOptions() {
    return {
      HTMLAttributes: {},
      onTitleUpdate: undefined,
      onTagsUpdate: undefined,
      onClientUpdate: undefined,
      onProjectUpdate: undefined,
    };
  },

  addAttributes() {
    return {
      prompt: {
        default: '',
      },
      state: {
        default: 'pending',
      },
      errorMessage: {
        default: null,
      },
      updateMode: {
        default: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="ai-assistant-block"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const el = node as HTMLElement;
          return {
            prompt: el.getAttribute('data-prompt') || '',
            state: (el.getAttribute('data-state') || 'pending') as 'pending' | 'loading' | 'error' | 'success',
            errorMessage: el.getAttribute('data-error-message') || undefined,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes,
      {
        'data-type': 'ai-assistant-block',
        'data-prompt': node.attrs.prompt || '',
        'data-state': node.attrs.state || 'pending',
        'data-error-message': node.attrs.errorMessage || '',
        'data-update-mode': node.attrs.updateMode ? 'true' : 'false',
      }
    ), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => (
      <AIAssistantBlockComponent
        {...props}
        onTitleUpdate={this.options.onTitleUpdate}
        onTagsUpdate={this.options.onTagsUpdate}
        onClientUpdate={this.options.onClientUpdate}
        onProjectUpdate={this.options.onProjectUpdate}
      />
    ));
  },
});

