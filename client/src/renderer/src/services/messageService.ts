import { encryptMessage, decryptMessage } from './encryptionService';
import { wsClient } from './wsClient';
import { apiGet } from './apiClient';
import { WS_TYPES, MAX_MESSAGE_LENGTH } from 'discord-clone-shared';
import type { TextSendPayload, ApiPaginatedList } from 'discord-clone-shared';
import useAuthStore from '../stores/useAuthStore';
import useMessageStore from '../stores/useMessageStore';
import type { DecryptedMessage, ReactionSummary } from '../stores/useMessageStore';

export function sendMessage(channelId: string, plaintext: string): void {
  const groupKey = useAuthStore.getState().groupKey;
  if (!groupKey) {
    useMessageStore.getState().setSendError('Encryption key not available');
    return;
  }

  if (plaintext.length > MAX_MESSAGE_LENGTH) {
    useMessageStore.getState().setSendError(
      `Message exceeds ${MAX_MESSAGE_LENGTH} character limit`,
    );
    return;
  }

  const { ciphertext, nonce } = encryptMessage(plaintext, groupKey);
  const tempId = crypto.randomUUID();
  const userId = useAuthStore.getState().user?.id ?? '';

  // Add optimistic message to store
  const optimistic: DecryptedMessage = {
    id: tempId,
    channelId,
    authorId: userId,
    content: plaintext,
    createdAt: new Date().toISOString(),
    status: 'sending',
    tempId,
  };

  useMessageStore.getState().addOptimisticMessage(channelId, optimistic);

  // Send via WebSocket
  try {
    wsClient.send({
      type: WS_TYPES.TEXT_SEND,
      payload: {
        channelId,
        content: ciphertext,
        nonce,
        tempId,
      } satisfies TextSendPayload,
      id: tempId,
    });
  } catch {
    useMessageStore.getState().markMessageFailed(tempId);
  }
}

const PAGE_LIMIT = 50;

interface MessageWithReactions {
  messageId: string;
  channelId: string;
  authorId: string;
  content: string;
  nonce: string;
  createdAt: string;
  reactions: ReactionSummary[];
}

async function fetchAndDecryptMessages(
  channelId: string,
  options?: { cursor?: string },
): Promise<{ messages: DecryptedMessage[]; hasMore: boolean; cursor: string | null; reactionsMap: Map<string, ReactionSummary[]> } | null> {
  let url = `/api/channels/${encodeURIComponent(channelId)}/messages?limit=${PAGE_LIMIT}`;
  if (options?.cursor) {
    url += `&cursor=${encodeURIComponent(options.cursor)}`;
  }

  const result = await apiGet<ApiPaginatedList<MessageWithReactions>>(url, true);

  const groupKey = useAuthStore.getState().groupKey;
  if (!groupKey) return null;

  const reactionsMap = new Map<string, ReactionSummary[]>();

  const decrypted: DecryptedMessage[] = result.data.map((msg) => {
    let content: string;
    try {
      content = decryptMessage(msg.content, msg.nonce, groupKey);
    } catch {
      content = '[Decryption failed]';
    }

    if (msg.reactions && msg.reactions.length > 0) {
      reactionsMap.set(msg.messageId, msg.reactions);
    }

    return {
      id: msg.messageId,
      channelId: msg.channelId,
      authorId: msg.authorId,
      content,
      createdAt: msg.createdAt,
      status: 'sent' as const,
    };
  });

  // API returns newest first — reverse for chronological display
  decrypted.reverse();

  return { messages: decrypted, hasMore: result.cursor !== null, cursor: result.cursor, reactionsMap };
}

export async function fetchMessages(channelId: string): Promise<void> {
  useMessageStore.getState().setLoading(true);
  useMessageStore.getState().setError(null);

  try {
    const data = await fetchAndDecryptMessages(channelId);
    if (!data) {
      useMessageStore.getState().setLoading(false);
      useMessageStore.getState().setError('Encryption key not available');
      return;
    }

    useMessageStore.getState().setMessages(channelId, data.messages, data.hasMore, data.cursor);
    if (data.reactionsMap.size > 0) {
      useMessageStore.getState().setReactionsForMessages(data.reactionsMap);
    }
    useMessageStore.getState().setLoading(false);
  } catch (err) {
    useMessageStore.getState().setLoading(false);
    useMessageStore.getState().setError(
      err instanceof Error ? err.message : 'Failed to load messages',
    );
  }
}

export async function fetchOlderMessages(channelId: string): Promise<void> {
  const store = useMessageStore.getState();
  const cursor = store.getCursor(channelId);
  if (!cursor) return; // no more pages

  store.setLoadingMore(true);

  try {
    const data = await fetchAndDecryptMessages(channelId, { cursor });
    if (!data) {
      useMessageStore.getState().setLoadingMore(false);
      return;
    }

    useMessageStore.getState().prependMessages(channelId, data.messages, data.hasMore, data.cursor);
    if (data.reactionsMap.size > 0) {
      useMessageStore.getState().setReactionsForMessages(data.reactionsMap);
    }
    useMessageStore.getState().setLoadingMore(false);
  } catch (err) {
    useMessageStore.getState().setLoadingMore(false);
    useMessageStore.getState().setError(
      err instanceof Error ? err.message : 'Failed to load older messages',
    );
  }
}
