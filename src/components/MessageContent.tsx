import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

interface MessageContentProps {
  content: string;
  isUser: boolean;
}

const MessageContent: React.FC<MessageContentProps> = ({ content, isUser }) => {
  // Normalize LaTeX delimiters for remark-math
  let processedText = content
    // Convert \[ ... \] to $$ ... $$ for blocks
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, equation) => {
      return equation.trim().length > 10 ? `\n$$\n${equation.trim()}\n$$\n` : `$${equation.trim()}$`;
    })
    // Convert \( ... \) to $ ... $ for inline
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, equation) => `$${equation.trim()}$`);

  return (
    <div className={`prose ${isUser ? 'prose-invert' : 'prose-indigo dark:prose-invert'} max-w-none break-words text-sm leading-relaxed`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          // Custom styling for markdown elements
          p: ({ node, ...props }) => <div className="mb-4 last:mb-0" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-4 space-y-1" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
          li: ({ node, ...props }) => <li className="" {...props} />,
          h1: ({ node, ...props }) => <h1 className="text-lg font-bold mb-2 mt-3" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-base font-bold mb-2 mt-3" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-sm font-bold mb-1 mt-2" {...props} />,
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="bg-[#0d1117] text-slate-50 rounded-lg my-2 overflow-x-auto border border-slate-700">
                {/* Header with language label could go here */}
                <div className="p-3">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </div>
              </div>
            ) : !inline ? (
              <div className="bg-slate-900 text-slate-50 p-3 rounded-lg my-2 overflow-x-auto border border-slate-700">
                <code className={className} {...props}>
                  {children}
                </code>
              </div>
            ) : (
              <code className={`${isUser ? 'bg-white/20' : 'bg-slate-100 text-pink-600'} px-1.5 py-0.5 rounded font-mono text-xs`} {...props}>
                {children}
              </code>
            );
          },
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-indigo-300 pl-3 italic my-2 text-slate-500" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a
              className={`underline underline-offset-2 ${isUser ? 'text-white' : 'text-indigo-600 hover:text-indigo-800'}`}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          strong: ({ node, ...props }) => (
            <strong className={`font-bold ${isUser ? 'text-white' : 'text-indigo-600'}`} {...props} />
          ),
        }}
      >
        {processedText}
      </ReactMarkdown>
    </div>
  );
};

export default MessageContent;
