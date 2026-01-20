// In-memory password storage (MVP approach)
// In production, consider encrypting and storing in DB
// Using global to ensure singleton across Next.js module instances
declare global {
  // eslint-disable-next-line no-var
  var __passwordStore: Map<string, Map<number, { old: string; new?: string }>> | undefined;
}

const passwordStore = global.__passwordStore || new Map<string, Map<number, { old: string; new?: string }>>();
if (!global.__passwordStore) {
  global.__passwordStore = passwordStore;
}

export function storePasswords(jobId: string, rowIndex: number, oldPassword: string, newPassword?: string) {
  console.log(`[Security] Storing passwords for jobId=${jobId}, rowIndex=${rowIndex}`);
  if (!passwordStore.has(jobId)) {
    passwordStore.set(jobId, new Map());
  }
  passwordStore.get(jobId)!.set(rowIndex, { old: oldPassword, new: newPassword });
  console.log(`[Security] Password stored. Store size: ${passwordStore.size}, Job entries: ${passwordStore.get(jobId)?.size || 0}`);
}

export function getPassword(jobId: string, rowIndex: number, type: 'old' | 'new' = 'old'): string | undefined {
  console.log(`[Security] Getting password for jobId=${jobId}, rowIndex=${rowIndex}, type=${type}`);
  console.log(`[Security] Store size: ${passwordStore.size}, Has jobId: ${passwordStore.has(jobId)}`);
  if (passwordStore.has(jobId)) {
    console.log(`[Security] Job entries: ${passwordStore.get(jobId)?.size || 0}, Has rowIndex: ${passwordStore.get(jobId)?.has(rowIndex)}`);
  }
  const passwords = passwordStore.get(jobId)?.get(rowIndex);
  if (!passwords) {
    console.error(`[Security] Password not found for jobId=${jobId}, rowIndex=${rowIndex}`);
    return undefined;
  }
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
