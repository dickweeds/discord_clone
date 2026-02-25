import { encryptMessage, decryptMessage } from './encryptionService';
import { wsClient } from './wsClient';
import { apiRequest } from './apiClient';
import { WS_TYPES, MAX_MESSAGE_LENGTH } from 'discord-clone-shared';
import type { TextSendPayload, TextReceivePayload } from 'discord-clone-shared';
import useAuthStore from '../stores/useAuthStore';
import useMessageStore from '../stores/useMessageStore';
import type { DecryptedMessage } from '../stores/useMessageStore';

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
      } satisfies TextSendPayload,
      id: tempId,
    });
  } catch {
    useMessageStore.getState().markMessageFailed(tempId);
  }
}

export async function fetchMessages(channelId: string): Promise<void> {
  useMessageStore.getState().setLoading(true);
  useMessageStore.getState().setError(null);

  try {
    const result = await apiRequest<TextReceivePayload[]>(
      `/api/channels/${channelId}/messages`,
    );

    const groupKey = useAuthStore.getState().groupKey;
    if (!groupKey) {
      useMessageStore.getState().setLoading(false);
      useMessageStore.getState().setError('Encryption key not available');
      return;
    }

    const decrypted: DecryptedMessage[] = result.map((msg) => ({
      id: msg.messageId,
      channelId: msg.channelId,
      authorId: msg.authorId,
      content: decryptMessage(msg.content, msg.nonce, groupKey),
      createdAt: msg.createdAt,
      status: 'sent' as const,
    }));

    // API returns newest first — reverse for chronological display
    decrypted.reverse();

    useMessageStore.getState().setMessages(channelId, decrypted);
    useMessageStore.getState().setLoading(false);
  } catch (err) {
    useMessageStore.getState().setLoading(false);
    useMessageStore.getState().setError(
      err instanceof Error ? err.message : 'Failed to load messages',
    );
  }
}
