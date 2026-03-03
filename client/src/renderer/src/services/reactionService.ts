import { wsClient } from './wsClient';
import { WS_TYPES } from 'discord-clone-shared';
import type { ReactionAddPayload, ReactionRemovePayload } from 'discord-clone-shared';
import useAuthStore from '../stores/useAuthStore';
import useMessageStore from '../stores/useMessageStore';

export function toggleReaction(messageId: string, channelId: string, emoji: string): void {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  const reactions = useMessageStore.getState().reactions.get(messageId);
  const existingEmoji = reactions?.find((r) => r.emoji === emoji);
  const alreadyReacted = existingEmoji?.userIds.includes(userId) ?? false;

  if (alreadyReacted) {
    useMessageStore.getState().removeReaction(messageId, userId, emoji);
    try {
      wsClient.send({
        type: WS_TYPES.REACTION_REMOVE,
        payload: { messageId, channelId, emoji } satisfies ReactionRemovePayload,
      });
    } catch {
      // Revert optimistic update on send failure
      useMessageStore.getState().addReaction(messageId, userId, emoji);
    }
  } else {
    useMessageStore.getState().addReaction(messageId, userId, emoji);
    try {
      wsClient.send({
        type: WS_TYPES.REACTION_ADD,
        payload: { messageId, channelId, emoji } satisfies ReactionAddPayload,
      });
    } catch {
      // Revert optimistic update on send failure
      useMessageStore.getState().removeReaction(messageId, userId, emoji);
    }
  }
}
