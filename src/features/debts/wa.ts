/** Normalize an Indonesian phone to wa.me digits: 08xx → 628xx. */
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits
}

/** Deterministic warm avatar color from a name, shared by kasbon and contacts. */
const AVATAR_COLORS = ['#e5484d', '#0072bc', '#7a5af0', '#0e9f5b', '#d97706', '#0a7d6f', '#c026a6']
export function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
