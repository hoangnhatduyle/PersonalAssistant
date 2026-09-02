"use client";

import ReactMarkdown from "react-markdown";

type Props = {
  content: string;
};

export function MarkdownBody({ content }: Props) {
  return (
    <div className="prose prose-sm prose-invert max-w-none text-text-primary prose-headings:font-display prose-headings:text-text-primary prose-p:text-text-primary prose-a:text-accent-indigo prose-strong:text-text-primary prose-code:rounded prose-code:bg-panel/50 prose-code:px-1 prose-code:py-0.5 prose-code:text-accent-teal prose-pre:bg-panel/30 prose-pre:border prose-pre:border-panel-border prose-li:text-text-primary">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
