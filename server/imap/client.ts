import { ImapFlow } from 'imapflow';
import type { MailboxObject, MessageInfo } from 'imapflow';

export interface IMAPConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

export class IMAPClient {
  private client: ImapFlow | null = null;
  private config: IMAPConfig;

  constructor(config: IMAPConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    // Check if host is an IP address (for self-hosted servers with IP-based certs)
    const isIPAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(this.config.host);
    
    // Build ImapFlow config
    const imapConfig: any = {
      host: this.config.host,
      port: this.config.port,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
      logger: false, // We handle logging separately
      // Add timeout and retry options
      timeout: 30000, // 30 seconds timeout
    };

    // Configure TLS/SSL
    if (this.config.tls) {
      // For IP addresses, disable strict certificate validation (self-hosted servers)
      // For hostnames, use default certificate validation
      imapConfig.secure = true;
      if (isIPAddress) {
        imapConfig.tls = {
          rejectUnauthorized: false, // Allow IP addresses without strict cert validation
        };
      }
    } else {
      imapConfig.secure = false;
    }
    
    this.client = new ImapFlow(imapConfig);

    try {
      console.log(`[IMAP] Attempting to connect to ${this.config.host}:${this.config.port} (TLS: ${this.config.tls}, IP: ${isIPAddress})`);
      await this.client.connect();
      // Wait a bit for authentication to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!this.client.authenticated) {
        throw new Error('Authentication failed - client not authenticated after connect');
      }
      console.log(`[IMAP] Connected and authenticated to ${this.config.host}:${this.config.port}`);
    } catch (error: any) {
      // Check if this is a certificate error (self-signed, expired, etc.)
      const isCertificateError = error.message?.includes('certificate') || 
                                  error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
                                  error.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
                                  error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
      
      // If certificate error and not already using rejectUnauthorized: false, retry with it
      if (isCertificateError && this.config.tls && !isIPAddress && (!imapConfig.tls || imapConfig.tls.rejectUnauthorized !== false)) {
        console.log(`[IMAP] Certificate error detected, retrying with rejectUnauthorized: false`);
        // Clean up failed client
        this.client = null;
        
        // Retry with rejectUnauthorized: false
        imapConfig.tls = {
          rejectUnauthorized: false, // Allow self-signed certificates
        };
        this.client = new ImapFlow(imapConfig);
        
        try {
          await this.client.connect();
          await new Promise(resolve => setTimeout(resolve, 100));
          if (!this.client.authenticated) {
            throw new Error('Authentication failed - client not authenticated after connect');
          }
          console.log(`[IMAP] Connected and authenticated to ${this.config.host}:${this.config.port} (with self-signed certificate)`);
          return; // Success, exit early
        } catch (retryError: any) {
          // Retry also failed, fall through to original error handling
          this.client = null;
          // Log full error details for debugging
          console.error(`[IMAP] Retry connection error details:`, {
            message: retryError.message,
            code: retryError.code,
            command: retryError.command,
            response: retryError.response,
            responseCode: retryError.responseCode,
            stack: retryError.stack,
          });
        }
      }
      
      // Log full error details for debugging
      console.error(`[IMAP] Connection error details:`, {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
        stack: error.stack,
      });
      
      // Provide more detailed error message
      const errorDetails = error.response || error.command || error.code || error.message;
      throw new Error(`IMAP connection failed to ${this.config.host}:${this.config.port}: ${error.message}${errorDetails ? ` (Details: ${JSON.stringify(errorDetails)})` : ''}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.client = null;
    }
  }

  async listMailboxes(): Promise<MailboxObject[]> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    if (!this.client.authenticated) {
      throw new Error('Not authenticated');
    }
    
    try {
      // imapflow'un list() metodu Promise<ListResponse[]> döndürür, async iterable değil!
      // TypeScript tanımlarına göre: list(options?: ListOptions): Promise<ListResponse[]>
      const mailboxes = await this.client.list();
      
      if (!Array.isArray(mailboxes)) {
        throw new Error(`list() did not return an array. Got: ${typeof mailboxes}`);
      }
      
      console.log(`[IMAP] Found ${mailboxes.length} mailboxes`);
      return mailboxes;
    } catch (error: any) {
      console.error('[IMAP] Error in listMailboxes:', error);
      throw new Error(`Failed to list mailboxes: ${error.message}`);
    }
  }

  async getMessageCount(mailboxPath: string): Promise<number> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    try {
      // Close any previously opened mailbox to avoid conflicts
      try {
        await this.client.mailboxClose();
      } catch (e) {
        // Ignore if no mailbox is open
      }

      // Normalize mailbox path - remove any extra spaces or special characters
      const normalizedPath = mailboxPath.trim();
      console.log(`[IMAP] Opening mailbox: "${normalizedPath}"`);
      
      // mailboxOpen returns MailboxObject with 'exists' property
      // imapflow expects path as string or string array
      const mailbox = await this.client.mailboxOpen(normalizedPath);
      // 'exists' is the number of messages in the mailbox
      const count = mailbox.exists ?? 0;
      console.log(`[IMAP] Mailbox ${normalizedPath} has ${count} messages`);
      return count;
    } catch (error: any) {
      console.error(`[IMAP] Error getting message count for ${mailboxPath}:`, error);
      console.error(`[IMAP] Error details:`, {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
      });
      // Try to close mailbox if it was opened
      try {
        await this.client.mailboxClose();
      } catch (e) {
        // Ignore
      }
      throw new Error(`Failed to get message count for ${mailboxPath}: ${error.message}`);
    }
  }

  async getMessages(
    mailboxPath: string,
    fromUid: number = 1,
    batchSize: number = 200
  ): Promise<MessageInfo[]> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    try {
      // Close any previously opened mailbox to avoid conflicts
      try {
        await this.client.mailboxClose();
      } catch (e) {
        // Ignore if no mailbox is open
      }

      await this.client.mailboxOpen(mailboxPath);
      const messages: MessageInfo[] = [];

      // Fetch messages starting from fromUid
      // imapflow uses sequence numbers or UID ranges
      const searchCriteria = { uid: `${fromUid}:*` };
      for await (const message of this.client.fetch(searchCriteria, {
        envelope: true,
        uid: true,
        flags: true,
        internalDate: true,
        source: true,
      })) {
        messages.push(message);
        if (messages.length >= batchSize) {
          break;
        }
      }

      return messages;
    } catch (error: any) {
      // Try to close mailbox if it was opened
      try {
        await this.client.mailboxClose();
      } catch (e) {
        // Ignore
      }
      throw error;
    }
  }

  async appendMessage(
    mailboxPath: string,
    messageSource: string | Buffer,
    flags?: string[],
    internalDate?: Date
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    if (!this.client.authenticated) {
      throw new Error('Not authenticated');
    }

    try {
      // Close any previously opened mailbox to avoid conflicts
      // Append doesn't require mailbox to be open, but we should close any open mailbox first
      try {
        await this.client.mailboxClose();
      } catch (e) {
        // Ignore if no mailbox is open
      }

      // imapflow.append() signature: append(path, content, flags, idate)
      // flags and idate are separate parameters, not an options object
      // Only pass flags if provided and not empty (empty array causes "Flags list contains non-atoms" error)
      const hasFlags = flags && Array.isArray(flags) && flags.length > 0;
      
      // Pass flags and internalDate
      // Some IMAP servers allow internalDate without flags, but to be safe we'll pass both together
      // If we have internalDate but no flags, we'll still try to pass internalDate (some servers accept it)
      const flagsToPass = hasFlags ? flags : undefined;
      const idateToPass = internalDate || undefined; // Pass internalDate if available, even without flags
      
      // Log what we're sending
      console.log(`[IMAP] Append parameters:`, {
        mailboxPath,
        hasFlags: hasFlags,
        flagsCount: flags?.length || 0,
        flags: flagsToPass,
        hasInternalDate: !!idateToPass,
        internalDate: idateToPass,
        originalInternalDate: internalDate,
      });
      
      // Pass flags and idate as separate parameters (not as options object)
      // If no flags, pass undefined for both flags and idate
      await this.client.append(mailboxPath, messageSource, flagsToPass, idateToPass);
    } catch (error: any) {
      // Log detailed error for debugging
      console.error(`[IMAP] Append error:`, {
        mailboxPath,
        error: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        stack: error.stack,
      });
      throw error;
    }
  }

  async ensureMailbox(mailboxPath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    // Check if mailbox exists
    const mailboxes = await this.listMailboxes();
    const exists = mailboxes.some((mb) => mb.path === mailboxPath);

    if (!exists) {
      // Create mailbox (supports nested paths)
      // For nested paths like "Parent/Child", create parent first if needed
      const parts = mailboxPath.split('/');
      let currentPath = '';
      
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const pathExists = mailboxes.some((mb) => mb.path === currentPath);
        if (!pathExists) {
          await this.client.mailboxCreate(currentPath);
          // Refresh mailboxes list after creation
          const updatedMailboxes = await this.listMailboxes();
          mailboxes.push(...updatedMailboxes.filter((mb) => mb.path === currentPath));
        }
      }
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.authenticated;
  }
}
