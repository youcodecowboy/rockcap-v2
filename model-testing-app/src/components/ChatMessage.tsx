'use client';

import { User, Bot, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system' | 'tool-activity';
  content: string;
  timestamp?: string;
  tokensUsed?: number;
  isThinking?: boolean;
}

export default function ChatMessage({ 
  role, 
  content, 
  timestamp, 
  tokensUsed,
  isThinking = false 
}: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const isToolActivity = role === 'tool-activity';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
          {content}
        </div>
      </div>
    );
  }

  if (isToolActivity) {
    return (
      <div className="flex justify-center my-3">
        <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-4 py-2 rounded-full border border-blue-200">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-blue-600' : 'bg-gray-800'
      }`}>
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 ${isUser ? 'text-right' : 'text-left'}`}>
        <div className={`inline-block max-w-[85%] px-4 py-2 rounded-lg ${
          isUser
            ? 'bg-blue-600 text-white rounded-tr-none'
            : 'bg-gray-100 text-gray-900 rounded-tl-none'
        }`}>
          {isThinking ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          ) : (
            <div className={`text-sm markdown-content ${isUser ? 'text-white' : 'text-gray-900'}`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Headings
                  h1: ({ children }) => <h1 className="text-xl font-bold mb-2 mt-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-bold mb-1 mt-2">{children}</h3>,
                  
                  // Paragraphs
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  
                  // Lists
                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="ml-2">{children}</li>,
                  
                  // Code blocks
                  code: ({ className, children, ...props }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code 
                          className={`px-1.5 py-0.5 rounded font-mono text-xs ${
                            isUser ? 'bg-blue-700' : 'bg-gray-200'
                          }`}
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code 
                        className={`block p-2 rounded font-mono text-xs overflow-x-auto ${
                          isUser ? 'bg-blue-700' : 'bg-gray-200'
                        }`}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => <pre className="mb-2">{children}</pre>,
                  
                  // Tables
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-2">
                      <table className={`min-w-full border ${isUser ? 'border-blue-400' : 'border-gray-300'}`}>
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className={isUser ? 'bg-blue-700' : 'bg-gray-200'}>
                      {children}
                    </thead>
                  ),
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  tr: ({ children }) => <tr className={`border-b ${isUser ? 'border-blue-400' : 'border-gray-300'}`}>{children}</tr>,
                  th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold">{children}</th>,
                  td: ({ children }) => <td className="px-3 py-2 text-xs">{children}</td>,
                  
                  // Strong/Bold
                  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                  
                  // Emphasis/Italic
                  em: ({ children }) => <em className="italic">{children}</em>,
                  
                  // Blockquotes
                  blockquote: ({ children }) => (
                    <blockquote className={`border-l-4 pl-3 my-2 italic ${
                      isUser ? 'border-blue-400' : 'border-gray-400'
                    }`}>
                      {children}
                    </blockquote>
                  ),
                  
                  // Horizontal rules
                  hr: () => <hr className={`my-3 ${isUser ? 'border-blue-400' : 'border-gray-300'}`} />,
                  
                  // Links
                  a: ({ href, children }) => (
                    <a 
                      href={href} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={`underline hover:no-underline ${isUser ? 'text-blue-200' : 'text-blue-600'}`}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        
        {(timestamp || tokensUsed) && (
          <div className={`text-xs text-gray-400 mt-1 flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {timestamp && (
              <span>
                {new Date(timestamp).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            )}
            {tokensUsed && (
              <>
                <span>•</span>
                <span>{tokensUsed.toLocaleString()} tokens</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

