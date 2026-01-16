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

    this.client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tls,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
      logger: false, // We handle logging separately
    });

    await this.client.connect();
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

    const mailboxes: MailboxObject[] = [];
    for await (const mailbox of this.client.list()) {
      mailboxes.push(mailbox);
    }
    return mailboxes;
  }

  async getMessageCount(mailboxPath: string): Promise<number> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    const mailbox = await this.client.mailboxOpen(mailboxPath);
    return mailbox.exists;
  }

  async getMessages(
    mailboxPath: string,
    fromUid: number = 1,
    batchSize: number = 200
  ): Promise<MessageInfo[]> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    await this.client.mailboxOpen(mailboxPath);
    const messages: MessageInfo[] = [];

    // Fetch messages starting from fromUid
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

    await this.client.append(mailboxPath, messageSource, {
      flags: flags || [],
      internalDate: internalDate,
    });
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
