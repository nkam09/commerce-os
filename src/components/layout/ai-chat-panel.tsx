"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/lib/stores/ui-store";
import { useChatStore, type ChatMessage } from "@/lib/stores/chat-store";
import { AIBadge } from "@/components/ui/ai-badge";

const SUGGESTED_PROMPTS = [
  "What\u2019s my most profitable product this month?",
  "Which PPC campaigns should I pause?",
  "How\u2019s my inventory looking \u2014 any restock urgency?",
  "Summarize my business health this week",
  "Compare my 50-pack vs 100-pack performance",
];

/**
 * Simple markdown renderer — handles bold, bullets, inline code, and code blocks.
 * No external library needed.
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (```)
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push(
        <pre
          key={`code-${i}`}
          className="my-2 overflow-x-auto rounded-md bg-elevated px-3 py-2 text-2xs"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      nodes.push(<div key={`br-${i}`} className="h-2" />);
      i++;
      continue;
    }

    // Bullet list item
    if (/^[\s]*[-*]\s/.test(line)) {
      nodes.push(
        <div key={`li-${i}`} className="flex gap-1.5 pl-1">
          <span className="mt-0.5 shrink-0 text-tertiary">&bull;</span>
          <span>{renderInline(line.replace(/^[\s]*[-*]\s/, ""))}</span>
        </div>
      );
      i++;
      continue;
    }

    // Numbered list item
    if (/^[\s]*\d+\.\s/.test(line)) {
      const match = line.match(/^[\s]*(\d+)\.\s(.*)/);
      if (match) {
        nodes.push(
          <div key={`ol-${i}`} className="flex gap-1.5 pl-1">
            <span className="mt-0.5 shrink-0 text-tertiary">
              {match[1]}.
            </span>
            <span>{renderInline(match[2])}</span>
          </div>
        );
      }
      i++;
      continue;
    }

    // Regular paragraph
    nodes.push(
      <p key={`p-${i}`}>{renderInline(line)}</p>
    );
    i++;
  }

  return nodes;
}

/** Render inline markdown: **bold**, `code` */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Split on **bold** and `code` patterns
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold
      parts.push(
        <strong key={`b-${match.index}`} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Inline code
      parts.push(
        <code
          key={`c-${match.index}`}
          className="rounded bg-elevated px-1 py-0.5 text-2xs font-mono"
        >
          {match[3]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ai/60 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ai/60 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ai/60 [animation-delay:300ms]" />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed",
          isUser
            ? "bg-elevated text-foreground"
            : "bg-purple-500/10 text-foreground"
        )}
      >
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-1">
            <span className="text-ai text-2xs font-semibold">{"\u2726"} AI</span>
          </div>
        )}
        <div className="space-y-0.5">
          {isUser ? message.content : renderMarkdown(message.content)}
        </div>
      </div>
    </div>
  );
}

export function AIChatPanel() {
  const { aiPanelOpen, setAiPanelOpen } = useUIStore();
  const { messages, isLoading, sendMessage, clearHistory } = useChatStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (aiPanelOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [aiPanelOpen]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    sendMessage(trimmed);
  };

  const handlePromptClick = (prompt: string) => {
    setInput("");
    sendMessage(prompt);
  };

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 lg:hidden",
          aiPanelOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setAiPanelOpen(false)}
      />

      {/* Panel — always rendered, slide in/out with translate-x */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[400px] max-w-[90vw] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-in-out",
          aiPanelOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <AIBadge variant="full" size="md" />
            <span className="text-sm font-semibold text-foreground">
              AI Assistant
            </span>
          </div>
          <div className="flex items-center gap-1">
            {hasMessages && (
              <button
                type="button"
                onClick={clearHistory}
                className="flex h-7 items-center rounded-md px-2 text-2xs text-muted-foreground transition hover:bg-elevated hover:text-foreground"
                title="Clear chat history"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setAiPanelOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-elevated hover:text-foreground"
              title="Close AI panel"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Chat messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {!hasMessages ? (
            /* Welcome screen with suggested prompts */
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ai-muted">
                <svg
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-7 w-7 text-ai"
                >
                  <path d="M8 0a.5.5 0 0 1 .5.5v2.036a5.5 5.5 0 0 1 4.964 4.964H15.5a.5.5 0 0 1 0 1h-2.036a5.5 5.5 0 0 1-4.964 4.964V15.5a.5.5 0 0 1-1 0v-2.036A5.5 5.5 0 0 1 2.536 8.5H.5a.5.5 0 0 1 0-1h2.036A5.5 5.5 0 0 1 7.5 2.536V.5A.5.5 0 0 1 8 0Zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
                </svg>
              </div>
              <div className="max-w-[280px]">
                <p className="text-sm font-semibold text-foreground">
                  Ask me anything
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  I can analyze your sales, PPC campaigns, inventory levels,
                  and more. Try asking about your most profitable product or
                  ACOS trends.
                </p>
              </div>
              <div className="mt-4 flex w-full flex-col gap-2">
                {SUGGESTED_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handlePromptClick(q)}
                    className="rounded-lg border border-border bg-elevated/50 px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-ai/30 hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message list */
            <div className="flex flex-col gap-3">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isLoading &&
                messages[messages.length - 1]?.content === "" && (
                  <div className="flex justify-start">
                    <div className="rounded-xl bg-purple-500/10 px-3.5 py-2.5">
                      <TypingIndicator />
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border p-4">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your business\u2026"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none transition placeholder:text-tertiary focus:border-ai/40 focus:ring-1 focus:ring-ai/20"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              type="button"
              disabled={!input.trim() || isLoading}
              onClick={handleSend}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ai text-white transition hover:bg-ai/90 disabled:opacity-40"
              title="Send message"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M15.854 8.354a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708.708L14.293 7.5H1.5a.5.5 0 0 0 0 1h12.793l-2.647 2.646a.5.5 0 0 0 .708.708l3.5-3.5Z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-2xs text-tertiary">
            AI analysis of your business data. Results may be approximate.
          </p>
        </div>
      </aside>
    </>
  );
}
