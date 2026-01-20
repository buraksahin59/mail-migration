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

// Helper function to normalize child folder name to standard case
function normalizeChildName(childName: string): string {
  const lower = childName.toLowerCase();
  // Map common folder names to standard case
  const standardNames: Record<string, string> = {
    'spam': 'Spam',
    'junk': 'Junk',
    'sent': 'Sent',
    'drafts': 'Drafts',
    'trash': 'Trash',
    'archive': 'Archive',
    'inbox': 'INBOX',
  };
  return standardNames[lower] || childName; // Return standard case if found, otherwise original
}

export function mapFolderPath(oldPath: string, newMailboxes: string[]): string {
  // Try exact match first (case-sensitive)
  if (newMailboxes.includes(oldPath)) {
    return oldPath;
  }

  // Try case-insensitive exact match
  const caseInsensitiveMatch = newMailboxes.find((mb) => mb.toLowerCase() === oldPath.toLowerCase());
  if (caseInsensitiveMatch) {
    // Use the matched mailbox from new server (preserves existing case on new server)
    return caseInsensitiveMatch;
  }

  // Try normalized match
  const normalized = normalizeFolderName(oldPath);
  const exactMatch = newMailboxes.find((mb) => normalizeFolderName(mb) === normalized);
  if (exactMatch) {
    // Use the matched mailbox from new server
    return exactMatch;
  }

  // For nested folders, try to match parent and child separately
  // IMAP uses dot (.) as separator, not slash (/)
  const parts = oldPath.split('.');
  if (parts.length > 1) {
    const parent = parts[0];
    const child = parts.slice(1).join('.');
    const mappedParent = mapFolderPath(parent, newMailboxes);
    
    // Normalize child name to standard case (e.g., "spam" -> "Spam")
    const normalizedChild = normalizeChildName(child);
    const fullPath = `${mappedParent}.${normalizedChild}`;
    
    // Try to find exact match with normalized case
    if (newMailboxes.includes(fullPath)) {
      return fullPath;
    }
    // Try case-insensitive match
    const caseInsensitiveFullMatch = newMailboxes.find((mb) => mb.toLowerCase() === fullPath.toLowerCase());
    if (caseInsensitiveFullMatch) {
      // Use the matched mailbox from new server
      return caseInsensitiveFullMatch;
    }
    // If no match found, use normalized path (will be created with standard case)
    return fullPath;
  }

  // Return original path (will be created if not exists)
  return oldPath;
}
