const AVATAR_COLORS = [
  '#c97b35', '#7b935e', '#5e8493', '#935e7b', '#93855e',
  '#5e7b93', '#8b6e4e', '#6e8b4e', '#4e6e8b', '#8b4e6e',
];

export function getAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
