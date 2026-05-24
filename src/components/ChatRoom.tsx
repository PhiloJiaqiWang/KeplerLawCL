"use client";

import { useState } from "react";
import type { ChatMessage, ParticipantRole } from "@/lib/types";

type ChatRoomProps = {
  role: ParticipantRole;
  messages: ChatMessage[];
  displayNameByRole: Record<ParticipantRole, string>;
  onSend: (content: string) => Promise<void>;
};

export function ChatRoom({ role, messages, displayNameByRole, onSend }: ChatRoomProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = value.trim();
    if (!content) return;

    setIsSending(true);
    try {
      await onSend(content);
      setValue("");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="flex h-full flex-col rounded-lg border border-slate-300 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Shared Chatroom</h2>
      <div className="mt-3 flex-1 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {messages.map((message) => (
              <li key={message.id} className="rounded bg-white p-2 text-slate-800">
                <p className="font-medium">{displayNameByRole[message.senderRole]}</p>
                <p>{message.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Message as ${displayNameByRole[role]}`}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
        />
        <button
          disabled={isSending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-400"
        >
          Send
        </button>
      </form>
    </section>
  );
}
