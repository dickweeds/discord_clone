import { useMemberStore } from '../stores/useMemberStore';
import { getAvatarColor } from '../utils/avatarColor';

export function useUsername(authorId: string): { username: string; avatarColor: string; avatarUrl?: string } {
  const member = useMemberStore((s) => s.members.find((m) => m.id === authorId));

  if (member) {
    return {
      username: member.username,
      avatarColor: getAvatarColor(member.username),
      ...(member.avatarUrl ? { avatarUrl: member.avatarUrl } : {}),
    };
  }

  return { username: authorId.slice(0, 8), avatarColor: getAvatarColor(authorId) };
}
