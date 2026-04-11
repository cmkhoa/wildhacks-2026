"use client";

import { FormEvent, useState } from "react";

type ChatMessage = {
  id: number;
  sender: "assistant" | "user";
  text: string;
};

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    sender: "assistant",
    text: "Tell me what feels loud today. I can help turn it into a next step.",
  },
  {
    id: 2,
    sender: "user",
    text: "I need help staying on the current block.",
  },
  {
    id: 3,
    sender: "assistant",
    text: "Good. One block at a time. Start with the first 10 minutes.",
  },
];

const quickActions = [
  "I'm stuck",
  "Break this down",
  "5 minute version",
  "Motivate me",
];

const coachReplies: Record<string, string> = {
  "I'm stuck": "That makes sense. Name the next visible action, not the whole task.",
  "Break this down": "Try three tiny steps: open the file, write one rough line, then choose the next line.",
  "5 minute version": "Set a five minute promise. Do only the easiest slice, then reassess.",
  "Motivate me": "You do not need momentum first. Starting creates it. One small win counts.",
};

type ChatPanelProps = {
  isFocusMode?: boolean;
  onCollapse?: () => void;
};

export function ChatPanel({ isFocusMode = false, onCollapse }: ChatPanelProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");

  const addMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        sender: "user",
        text: trimmed,
      },
      {
        id: Date.now() + 1,
        sender: "assistant",
        text:
          coachReplies[trimmed] ??
          "Got it. I would keep the next action small and visible.",
      },
    ]);
    setDraft("");
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addMessage(draft);
  };

  return (
    <aside className="flex min-h-[560px] flex-col rounded-[8px] border border-[#cfe0dc] bg-white/95 p-5 shadow-[0_20px_55px_rgba(35,74,67,0.1)] transition duration-300 hover:shadow-[0_24px_65px_rgba(35,74,67,0.13)] lg:min-h-[640px] xl:h-full">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#6d827d]">
            Coach
          </p>
          <h2 className="mt-1 text-3xl font-semibold text-[#182f2b]">
            Planning chat
          </h2>
          <p className="mt-2 text-base leading-relaxed text-[#5f7772]">
            Brain dump, ask for a smaller step, or reset your focus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-[8px] bg-[#e1f5ef] px-3 py-2 text-sm font-semibold text-[#276f67]">
            Calm mode
          </span>
          {isFocusMode ? (
            <button
              type="button"
              onClick={onCollapse}
              className="button-pop rounded-[8px] border border-[#d8e7e3] bg-white px-3 py-2 text-sm font-semibold text-[#5f7772] transition hover:scale-[1.02] hover:border-[#2f8f83] hover:text-[#276f67] active:scale-[0.96]"
            >
              Collapse
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        {quickActions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => addMessage(action)}
            className="button-pop rounded-[8px] border border-[#d8e7e3] bg-[#f7fbfa] px-3 py-2.5 text-left text-sm font-semibold text-[#34524d] transition hover:scale-[1.018] hover:border-[#2f8f83] hover:bg-[#e9f7f3] hover:shadow-sm active:scale-[0.96]"
          >
            {action}
          </button>
        ))}
      </div>

      <div className="mb-4 rounded-[8px] border border-[#d8e7e3] bg-[#f7fbfa] px-4 py-3">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#6d827d]">
          Current support
        </p>
        <p className="mt-1 text-lg font-semibold text-[#203b37]">
          Keep the next move small enough to start.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-[8px] bg-[#fbfdfc] p-3">
        {messages.map((message) => {
          const isUser = message.sender === "user";

          return (
            <div
              key={message.id}
              className={`message-enter flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <p
                className={`max-w-[88%] rounded-[8px] px-4 py-3 text-base leading-relaxed shadow-sm ${
                  isUser
                    ? "bg-[linear-gradient(135deg,#2f8f83,#42ab99)] text-white"
                    : "border border-[#dce7e4] bg-[#eef9f5] text-[#294642]"
                }`}
              >
                {message.text}
              </p>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={sendMessage}
        className="mt-5 rounded-[8px] border border-[#cfe0dc] bg-[#f7fbfa] p-2 shadow-inner"
      >
        <label className="sr-only" htmlFor="chat-message">
          Message assistant
        </label>
        <div className="flex gap-2">
          <input
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What needs to feel easier?"
            className="min-w-0 flex-1 rounded-[8px] border border-transparent bg-white px-4 py-4 text-base text-[#203b37] outline-none transition placeholder:text-[#8ca19c] focus:border-[#2f8f83] focus:ring-4 focus:ring-[#2f8f83]/15"
          />
          <button
            type="submit"
            className="button-pop rounded-[8px] bg-[linear-gradient(135deg,#2f8f83,#47b49f)] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_25px_rgba(47,143,131,0.24)] transition hover:scale-[1.025] hover:shadow-[0_16px_30px_rgba(47,143,131,0.3)] active:scale-[0.96]"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}
