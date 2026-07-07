// Chat with linked professionals — server-backed, polled while the screen is open.

import { apiFetch } from './api';

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  sentAt: number;
  readAt: number | null;
}

export async function fetchMessages(withId: string, since = 0): Promise<ChatMessage[]> {
  const res = await apiFetch<{ messages: ChatMessage[] }>(
    `/api/messages?with=${encodeURIComponent(withId)}&since=${since}`,
  );
  return res.messages;
}

export async function sendChatMessage(to: string, content: string): Promise<ChatMessage> {
  const res = await apiFetch<{ message: ChatMessage }>('/api/messages', {
    method: 'POST',
    body: { to, content },
  });
  return res.message;
}

export async function markConversationRead(withId: string): Promise<void> {
  await apiFetch('/api/messages/read', { method: 'POST', body: { with: withId } });
}

export async function fetchUnread(): Promise<{ total: number; bySender: Record<string, number> }> {
  return apiFetch('/api/messages/unread');
}
