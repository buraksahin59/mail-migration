// Folder name mapping for common mailbox names
const STANDARD_FOLDER_MAPPINGS: Record<string, string[]> = {
  inbox: ['INBOX', 'Inbox', 'inbox'],
  sent: ['Sent', 'Sent Items', 'Gönderilmiş', 'Sent Messages'],
  trash: ['Trash', 'Deleted Items', 'Çöp', 'Deleted', 'Bin'],
  spam: ['Spam', 'Junk', 'Junk E-Mail', 'Spam Messages'],
  drafts: ['Drafts', 'Taslaklar', 'Draft'],
  archive: ['Archive', 'Arşiv', 'Archived'],
};

export function normalizeFolderName(name: string): string {
  // Normalize to lowercase for comparison
  const lower = name.toLowerCase().trim();
  
  // Check standard mappings
  for (const [standard, variants] of Object.entries(STANDARD_FOLDER_MAPPINGS)) {
    if (variants.some((v) => v.toLowerCase() === lower)) {
      return standard === 'inbox' ? 'INBOX' : standard.charAt(0).toUpperCase() + standard.slice(1);
    }
  }
  
  // Return original if no mapping found
  return name;
}

export function mapFolderPath(oldPath: string, newMailboxes: string[]): string {
  // Try exact match first
  if (newMailboxes.includes(oldPath)) {
    return oldPath;
  }

  // Try normalized match
  const normalized = normalizeFolderName(oldPath);
  const exactMatch = newMailboxes.find((mb) => normalizeFolderName(mb) === normalized);
  if (exactMatch) {
    return exactMatch;
  }

  // For nested folders, try to match parent and child separately
  const parts = oldPath.split('/');
  if (parts.length > 1) {
    const parent = parts[0];
    const child = parts.slice(1).join('/');
    const mappedParent = mapFolderPath(parent, newMailboxes);
    return `${mappedParent}/${child}`;
  }

  // Return original path (will be created if not exists)
  return oldPath;
}
