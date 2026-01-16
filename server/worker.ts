import { nanoid } from 'nanoid';
import db, { dbQueries } from './db';
import { eventBus } from './events';
import { IMAPClient } from './imap/client';
import { mapFolderPath } from './imap/mapping';
import { getPassword, maskPassword, maskEmail } from './security';
import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Setup logger
const logDir = join(process.cwd(), 'data', 'logs');
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      destination: join(logDir, 'worker.log'),
      mkdir: true,
    },
  },
});

interface AccountRow {
  rowIndex: number;
  old_host: string;
  old_email: string;
  old_port: number;
  old_tls: boolean;
  new_host: string;
  new_email: string;
  new_port: number;
  new_tls: boolean;
  batch_size: number;
}

async function processAccount(
  jobId: string,
  account: AccountRow,
  mode: 'dryrun' | 'migrate'
): Promise<void> {
  const { rowIndex, old_host, old_email, old_port, old_tls, new_host, new_email, new_port, new_tls, batch_size } = account;

  eventBus.publishLog(jobId, 'info', `Processing account ${rowIndex}: ${maskEmail(old_email)} -> ${maskEmail(new_email)}`);

  let oldClient: IMAPClient | null = null;
  let newClient: IMAPClient | null = null;

  try {
    // Get password from in-memory store
    const oldPassword = getPassword(jobId, rowIndex);
    if (!oldPassword) {
      throw new Error(`Password not found for row ${rowIndex}`);
    }

    // Connect to old IMAP
    oldClient = new IMAPClient({
      host: old_host,
      port: old_port,
      user: old_email,
      password: oldPassword,
      tls: old_tls === 1,
    });

    await oldClient.connect();
    eventBus.publishLog(jobId, 'info', `Connected to old server: ${old_host}`);

    // List all mailboxes
    const oldMailboxes = await oldClient.listMailboxes();
    eventBus.publishLog(jobId, 'info', `Found ${oldMailboxes.length} mailboxes on old server`);

    let accountTotalMessages = 0;
    const folderStats: Array<{ path: string; count: number }> = [];

    // Process each mailbox
    for (const mailbox of oldMailboxes) {
      const folderPath = mailbox.path;
      
      // Skip special mailboxes that shouldn't be migrated
      if (folderPath.startsWith('[Gmail]') || folderPath.startsWith('[Google]')) {
        continue;
      }

      try {
        const messageCount = await oldClient.getMessageCount(folderPath);
        accountTotalMessages += messageCount;
        folderStats.push({ path: folderPath, count: messageCount });

        // Update folder in DB
        dbQueries.createFolder.run(
          jobId,
          rowIndex,
          folderPath,
          messageCount,
          0,
          0,
          'pending'
        );

        eventBus.publishFolderStatus(jobId, {
          rowIndex,
          folderPath,
          totalMessages: messageCount,
          movedMessages: 0,
        });

        // In dry-run mode, optionally connect to new server to check folder mapping
        if (mode === 'dryrun') {
          // Optional: Connect to new server to verify folder mapping
          // For now, we skip this in dry-run to speed up analysis
          eventBus.publishLog(jobId, 'info', `Dry-run: Skipping new server connection for ${folderPath}`);
        }

        if (mode === 'migrate') {
          // Get password for new account
          const newPassword = getPassword(jobId, rowIndex, 'new');
          
          // Connect to new IMAP
          if (!newClient) {
            newClient = new IMAPClient({
              host: new_host,
              port: new_port,
              user: new_email,
              password: newPassword || oldPassword,
              tls: new_tls === 1,
            });
            await newClient.connect();
            eventBus.publishLog(jobId, 'info', `Connected to new server: ${new_host}`);
          }

          // Map folder path
          const newMailboxes = await newClient.listMailboxes();
          const mappedPath = mapFolderPath(folderPath, newMailboxes.map((mb) => mb.path));

          // Ensure mailbox exists
          await newClient.ensureMailbox(mappedPath);

          // Get last processed UID from DB
          const folders = dbQueries.getFoldersByAccount.all(jobId, rowIndex) as any[];
          const folder = folders.find((f) => f.folderPath === folderPath);
          const lastProcessedUid = folder?.lastProcessedUid || 0;

          // Process messages in batches
          let processed = 0;
          let currentUid = lastProcessedUid + 1;

          while (processed < messageCount) {
            const messages = await oldClient.getMessages(folderPath, currentUid, batch_size);

            if (messages.length === 0) {
              break;
            }

            for (const message of messages) {
              try {
                if (!message.source) {
                  eventBus.publishLog(jobId, 'warn', `Message ${message.uid} has no source, skipping`);
                  continue;
                }

                // Append to new server
                await newClient.appendMessage(
                  mappedPath,
                  message.source,
                  message.flags || [],
                  message.internalDate || undefined
                );

                processed++;
                
                // Reload folder to get current movedMessages
                const folders = dbQueries.getFoldersByAccount.all(jobId, rowIndex) as any[];
                const currentFolder = folders.find((f) => f.folderPath === folderPath);
                const folderMoved = (currentFolder?.movedMessages || 0) + 1;

                // Update folder progress
                dbQueries.updateFolderProgress.run(
                  folderMoved,
                  message.uid,
                  processed >= messageCount ? 'done' : 'running',
                  jobId,
                  rowIndex,
                  folderPath
                );

                eventBus.publishFolderStatus(jobId, {
                  rowIndex,
                  folderPath,
                  totalMessages: messageCount,
                  movedMessages: folderMoved,
                });

                // Update account progress (accumulate moved messages across all folders)
                const accountData = dbQueries.getAccountsByJob.all(jobId) as any[];
                const currentAccount = accountData.find((a) => a.rowIndex === rowIndex);
                if (currentAccount) {
                  // Get total moved from all folders for this account
                  const allFolders = dbQueries.getFoldersByAccount.all(jobId, rowIndex) as any[];
                  const totalMoved = allFolders.reduce((sum, f) => sum + (f.movedMessages || 0), 0);
                  
                  dbQueries.updateAccountProgress.run(
                    accountTotalMessages,
                    totalMoved,
                    null,
                    jobId,
                    rowIndex
                  );

                  eventBus.publishAccountStatus(jobId, {
                    rowIndex,
                    status: 'running',
                    totalMessages: accountTotalMessages,
                    movedMessages: totalMoved,
                  });
                }

                eventBus.publishAccountStatus(jobId, {
                  rowIndex,
                  status: 'running',
                  totalMessages: accountTotalMessages,
                  movedMessages: newMoved,
                });
              } catch (err: any) {
                eventBus.publishLog(jobId, 'error', `Error processing message ${message.uid}: ${err.message}`);
                // Continue with next message
              }
            }

            currentUid = messages[messages.length - 1].uid + 1;
          }

          // Mark folder as done
          dbQueries.updateFolderProgress.run(
            processed,
            currentUid - 1,
            'done',
            jobId,
            rowIndex,
            folderPath
          );
        }
      } catch (err: any) {
        eventBus.publishLog(jobId, 'error', `Error processing folder ${folderPath}: ${err.message}`);
        dbQueries.updateFolderProgress.run(
          0,
          0,
          'failed',
          jobId,
          rowIndex,
          folderPath
        );
      }
    }

    // Update account totals
    dbQueries.updateAccountProgress.run(
      accountTotalMessages,
      mode === 'dryrun' ? 0 : accountTotalMessages, // In dryrun, moved = 0
      null,
      jobId,
      rowIndex
    );

    dbQueries.updateAccountStatus.run('done', jobId, rowIndex);

    eventBus.publishAccountStatus(jobId, {
      rowIndex,
      status: 'done',
      totalMessages: accountTotalMessages,
      movedMessages: mode === 'dryrun' ? 0 : accountTotalMessages,
    });

  } catch (err: any) {
    eventBus.publishLog(jobId, 'error', `Error processing account ${rowIndex}: ${err.message}`);
    dbQueries.updateAccountStatus.run('failed', jobId, rowIndex);
    dbQueries.updateAccountProgress.run(
      0,
      0,
      err.message,
      jobId,
      rowIndex
    );
    throw err;
  } finally {
    if (oldClient) {
      await oldClient.disconnect();
    }
    if (newClient) {
      await newClient.disconnect();
    }
  }
}

export async function runJob(jobId: string): Promise<void> {
  const job = dbQueries.getJob.get(jobId) as any;
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  dbQueries.updateJobStatus.run('running', jobId);
  eventBus.publishLog(jobId, 'info', `Starting job ${jobId} in ${job.mode} mode`);

  const accounts = dbQueries.getAccountsByJob.all(jobId) as AccountRow[];

  let totalMessages = 0;
  let movedMessages = 0;
  let errorCount = 0;

    try {
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        
        dbQueries.updateJobProgress.run(
          totalMessages,
          movedMessages,
          errorCount,
          i,
          jobId
        );

        try {
          await processAccount(jobId, account, job.mode as 'dryrun' | 'migrate');
          
          // Reload account data after processing
          const accountData = dbQueries.getAccountsByJob.all(jobId) as any[];
          const processedAccount = accountData.find((a) => a.rowIndex === account.rowIndex);
          if (processedAccount) {
            totalMessages += processedAccount.totalMessages || 0;
            movedMessages += processedAccount.movedMessages || 0;
          }
        } catch (err: any) {
          errorCount++;
          eventBus.publishLog(jobId, 'error', `Account ${account.rowIndex} failed: ${err.message}`);
        }
      }

    dbQueries.updateJobStatus.run('done', jobId);
    dbQueries.updateJobProgress.run(
      totalMessages,
      movedMessages,
      errorCount,
      accounts.length,
      jobId
    );

    eventBus.publishJobStatus(jobId, {
      status: 'done',
      totalMessages,
      movedMessages,
      errorCount,
    });

    eventBus.publishLog(jobId, 'info', `Job ${jobId} completed successfully`);
  } catch (err: any) {
    dbQueries.updateJobStatus.run('failed', jobId);
    eventBus.publishLog(jobId, 'error', `Job ${jobId} failed: ${err.message}`);
    throw err;
  }
}

// Entry point when run as standalone process
if (require.main === module) {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error('Usage: node worker.js <jobId>');
    process.exit(1);
  }

  runJob(jobId)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Worker error:', err);
      process.exit(1);
    });
}
