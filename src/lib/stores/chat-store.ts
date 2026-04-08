"use client";

import { create } from "zustand";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  currentPage: string;
  addMessage: (role: "user" | "assistant", content: string) => ChatMessage;
  updateMessage: (id: string, content: string) => void;
  setLoading: (loading: boolean) => void;
  setCurrentPage: (page: string) => void;
  sendMessage: (message: string) => Promise<void>;
  clearHistory: () => void;
}

function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  isLoading: false,
  currentPage: "overview",

  addMessage: (role, content) => {
    const msg: ChatMessage = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },

  updateMessage: (id, content) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content } : m
      ),
    }));
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setCurrentPage: (page) => set({ currentPage: page }),

  sendMessage: async (message: string) => {
    const { addMessage, updateMessage, setLoading, currentPage } = get();

    // 1. Add user message
    addMessage("user", message);

    // 2. Set loading
    setLoading(true);

    // 3. Create placeholder assistant message
    const assistantMsg = addMessage("assistant", "");

    try {
      // 4. POST to AI chat endpoint
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context: currentPage }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        updateMessage(
          assistantMsg.id,
          "Sorry, I encountered an error. Please try again."
        );
        console.error("[Chat] API error:", errorText);
        return;
      }

      // 5. Stream the response
      const reader = res.body?.getReader();
      if (!reader) {
        updateMessage(assistantMsg.id, "No response received.");
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        updateMessage(assistantMsg.id, accumulated);
      }
    } catch (err) {
      console.error("[Chat] Stream error:", err);
      updateMessage(
        assistantMsg.id,
        "Sorry, something went wrong. Please try again."
      );
    } finally {
      // 6. Done loading
      setLoading(false);
    }
  },

  clearHistory: () => set({ messages: [], isLoading: false }),
}));
