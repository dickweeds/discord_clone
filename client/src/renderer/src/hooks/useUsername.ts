import { useMemberStore } from '../stores/useMemberStore';
import { getAvatarColor } from '../utils/avatarColor';

export function useUsername(authorId: string): { username: string; avatarColor: string } {
  const members = useMemberStore((s) => s.members);
  const member = members.find((m) => m.id === authorId);

  if (member) {
    return { username: member.username, avatarColor: getAvatarColor(member.username) };
  }

  return { username: authorId.slice(0, 8), avatarColor: getAvatarColor(authorId) };
}
