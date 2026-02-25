import type { DecryptedMessage } from '../stores/useMessageStore';

export interface MessageGroupData {
  authorId: string;
  messages: DecryptedMessage[];
  firstTimestamp: string;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function groupMessages(messages: DecryptedMessage[]): MessageGroupData[] {
  if (messages.length === 0) return [];

  const groups: MessageGroupData[] = [];
  let currentGroup: MessageGroupData = {
    authorId: messages[0].authorId,
    messages: [messages[0]],
    firstTimestamp: messages[0].createdAt,
  };

  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];
    const prevMsg = messages[i - 1];
    const timeDiff = new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime();
    const sameAuthor = msg.authorId === currentGroup.authorId;
    const withinTimeWindow = timeDiff <= FIVE_MINUTES_MS;

    if (sameAuthor && withinTimeWindow) {
      currentGroup.messages.push(msg);
    } else {
      groups.push(currentGroup);
      currentGroup = {
        authorId: msg.authorId,
        messages: [msg],
        firstTimestamp: msg.createdAt,
      };
    }
  }

  groups.push(currentGroup);
  return groups;
}
