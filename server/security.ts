// In-memory password storage (MVP approach)
// In production, consider encrypting and storing in DB
const passwordStore = new Map<string, Map<number, { old: string; new?: string }>>();

export function storePasswords(jobId: string, rowIndex: number, oldPassword: string, newPassword?: string) {
  if (!passwordStore.has(jobId)) {
    passwordStore.set(jobId, new Map());
  }
  passwordStore.get(jobId)!.set(rowIndex, { old: oldPassword, new: newPassword });
}

export function getPassword(jobId: string, rowIndex: number, type: 'old' | 'new' = 'old'): string | undefined {
  const passwords = passwordStore.get(jobId)?.get(rowIndex);
  if (!passwords) return undefined;
  return type === 'old' ? passwords.old : (passwords.new || passwords.old);
}

export function clearPasswords(jobId: string) {
  passwordStore.delete(jobId);
}

export function maskPassword(password: string): string {
  if (!password || password.length === 0) return '****';
  if (password.length <= 2) return '**';
  return password[0] + '*'.repeat(Math.min(password.length - 2, 10)) + password[password.length - 1];
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

export function sanitizeForLog(text: string): string {
  // Remove potential password patterns from logs
  return text.replace(/password[=:]\s*\S+/gi, 'password=***');
}
