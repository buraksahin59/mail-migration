import db, { dbQueries } from './db';
import { eventBus } from './events';
import { IMAPClient } from './imap/client';
import { mapFolderPath } from './imap/mapping';
import { getPassword, maskEmail } from './security';

interface AccountRow {
  rowIndex: number;
  old_host: string;
  old_email: string;
  old_port: number;
  old_tls: number; // SQLite stores as integer (0 or 1)
  new_host: string;
  new_email: string;
  new_port: number;
  new_tls: number; // SQLite stores as integer (0 or 1)
  batch_size: number;
}

async function processAccount(
  jobId: string,
  account: AccountRow,
  mode: 'dryrun' | 'migrate'
): Promise<void> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:24',message:'processAccount entry',data:{jobId,mode,rowIndex:account.rowIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  const { rowIndex, old_host, old_email, old_port, old_tls, new_host, new_email, new_port, new_tls, batch_size } = account;

  console.log(`[Worker] Starting account ${rowIndex}: ${maskEmail(old_email)} -> ${maskEmail(new_email)}`);
  eventBus.publishLog(jobId, 'info', `Processing account ${rowIndex}: ${maskEmail(old_email)} -> ${maskEmail(new_email)}`);

  let oldClient: IMAPClient | null = null;
  let newClient: IMAPClient | null = null;

  try {
    // Get password from in-memory store
    const oldPassword = getPassword(jobId, rowIndex);
    if (!oldPassword) {
      const errorMsg = `Password not found for row ${rowIndex}`;
      console.error(`[Worker] ${errorMsg}`);
      eventBus.publishLog(jobId, 'error', errorMsg);
      throw new Error(errorMsg);
    }

    console.log(`[Worker] Connecting to old IMAP server: ${old_host}:${old_port} (TLS: ${old_tls === 1})`);
    eventBus.publishLog(jobId, 'info', `Connecting to old server: ${old_host}:${old_port}`);

    // Connect to old IMAP
    oldClient = new IMAPClient({
      host: old_host,
      port: old_port,
      user: old_email,
      password: oldPassword,
      tls: old_tls === 1,
    });

    try {
      await oldClient.connect();
      console.log(`[Worker] Successfully connected to old server: ${old_host}`);
      eventBus.publishLog(jobId, 'info', `Connected to old server: ${old_host}`);
    } catch (connectError: any) {
      const errorDetails = connectError.response || connectError.command || connectError.code || '';
      const errorMsg = `Failed to connect to old server ${old_host}: ${connectError.message}${errorDetails ? ` (${JSON.stringify(errorDetails)})` : ''}`;
      console.error(`[Worker] ${errorMsg}`, connectError);
      eventBus.publishLog(jobId, 'error', errorMsg);
      throw connectError;
    }

    // List all mailboxes
    console.log(`[Worker] Listing mailboxes from old server...`);
    eventBus.publishLog(jobId, 'info', 'Listing mailboxes from old server...');
    
    let oldMailboxes;
    try {
      oldMailboxes = await oldClient.listMailboxes();
      console.log(`[Worker] Found ${oldMailboxes.length} mailboxes on old server`);
      eventBus.publishLog(jobId, 'info', `Found ${oldMailboxes.length} mailboxes on old server`);
    } catch (listError: any) {
      const errorMsg = `Failed to list mailboxes: ${listError.message}`;
      console.error(`[Worker] ${errorMsg}`, listError);
      eventBus.publishLog(jobId, 'error', errorMsg);
      throw listError;
    }

    // Update account status to running
    dbQueries.updateAccountStatus.run('running', jobId, rowIndex);
    eventBus.publishAccountStatus(jobId, {
      rowIndex,
      status: 'running',
      totalMessages: 0,
      movedMessages: 0,
    });

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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:104',message:'try block entry',data:{folderPath,mode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        console.log(`[Worker] Getting message count for folder: ${folderPath}`);
        const messageCount = await oldClient.getMessageCount(folderPath);
        console.log(`[Worker] Folder ${folderPath} has ${messageCount} messages`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:108',message:'after getMessageCount',data:{folderPath,messageCount,mode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        accountTotalMessages += messageCount;
        folderStats.push({ path: folderPath, count: messageCount });

        // Update folder in DB
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:121',message:'before createFolder.run',data:{jobId,rowIndex,folderPath,messageCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        // createFolder SQL: VALUES (?, ?, ?, ?, ?, ?, 'pending')
        // Expects 6 parameters: jobId, rowIndex, folderPath, totalMessages, movedMessages, lastProcessedUid
        // Status is hardcoded as 'pending' in SQL
        dbQueries.createFolder.run(
          jobId,
          rowIndex,
          folderPath,
          messageCount,
          0,
          0
        );
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:131',message:'after createFolder.run success',data:{folderPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion

        eventBus.publishFolderStatus(jobId, {
          rowIndex,
          folderPath,
          totalMessages: messageCount,
          movedMessages: 0,
        });

        // Update account total as we discover folders
        dbQueries.updateAccountProgress.run(
          accountTotalMessages,
          0,
          null,
          jobId,
          rowIndex
        );
        eventBus.publishAccountStatus(jobId, {
          rowIndex,
          status: 'running',
          totalMessages: accountTotalMessages,
          movedMessages: 0,
        });

        console.log(`[Worker] DEBUG: After publishAccountStatus, folderPath=${folderPath}, mode=${mode}`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:149',message:'after publishAccountStatus',data:{folderPath,mode,messageCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion

        // Debug: Log mode and messageCount
        console.log(`[Worker] Processing folder ${folderPath}, mode: ${mode}, messageCount: ${messageCount}, mode type: ${typeof mode}`);
        console.log(`[Worker] DEBUG: About to check mode, mode=${mode}, typeof=${typeof mode}, mode==='migrate'=${mode === 'migrate'}`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:145',message:'before mode check',data:{folderPath,messageCount,mode,modeType:typeof mode,modeEqualsMigrate:mode==='migrate'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        // In dry-run mode, skip migration
        if (mode === 'dryrun') {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:148',message:'dryrun branch taken',data:{folderPath,mode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          console.log(`[Worker] Dry-run mode detected, skipping migration for ${folderPath}`);
          eventBus.publishLog(jobId, 'info', `Dry-run: Skipping mail migration for ${folderPath}`);
          continue; // Skip to next folder in dry-run mode
        }

        // Migrate mode: actually copy messages
        console.log(`[Worker] Mode check: mode=${mode}, mode==='migrate'=${mode === 'migrate'}, typeof mode=${typeof mode}`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:155',message:'before migrate if',data:{folderPath,mode,modeEqualsMigrate:mode==='migrate'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        if (mode === 'migrate') {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:157',message:'migrate block entered',data:{folderPath,messageCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          console.log(`[Worker] ✓ Migrate mode confirmed! Starting migration for folder: ${folderPath} (${messageCount} messages)`);
          eventBus.publishLog(jobId, 'info', `Starting migration for folder: ${folderPath} (${messageCount} messages)`);
          
          // Get password for new account
          const newPassword = getPassword(jobId, rowIndex, 'new');
          
          // Connect to new IMAP
          if (!newClient) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:199',message:'creating newClient',data:{new_host,new_port,new_email,hasPassword:!!newPassword},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
            newClient = new IMAPClient({
              host: new_host,
              port: new_port,
              user: new_email,
              password: newPassword || oldPassword,
              tls: new_tls === 1,
            });
            try {
              await newClient.connect();
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:208',message:'newClient.connect() succeeded',data:{new_host},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'H3'})}).catch(()=>{});
              // #endregion
              eventBus.publishLog(jobId, 'info', `Connected to new server: ${new_host}`);
            } catch (connectErr: any) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:212',message:'newClient.connect() failed, resetting newClient',data:{new_host,error:connectErr.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'H3'})}).catch(()=>{});
              // #endregion
              // Reset newClient to null so next folder will retry connection
              newClient = null;
              throw connectErr; // Re-throw to be caught by outer catch
            }
          } else {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:219',message:'newClient exists, checking before use',data:{new_host,newClientExists:!!newClient},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
          }

          // Map folder path
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:225',message:'before newClient.listMailboxes()',data:{folderPath,newClientExists:!!newClient},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H8'})}).catch(()=>{});
          // #endregion
          const newMailboxes = await newClient.listMailboxes();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:235',message:'after newClient.listMailboxes()',data:{folderPath,mailboxCount:newMailboxes.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H8'})}).catch(()=>{});
          // #endregion
          const mappedPath = mapFolderPath(folderPath, newMailboxes.map((mb) => mb.path));
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:238',message:'after mapFolderPath',data:{folderPath,mappedPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H8'})}).catch(()=>{});
          // #endregion
          eventBus.publishLog(jobId, 'info', `Mapped folder: ${folderPath} -> ${mappedPath}`);

          // Ensure mailbox exists
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:241',message:'before ensureMailbox',data:{folderPath,mappedPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H8'})}).catch(()=>{});
          // #endregion
          await newClient.ensureMailbox(mappedPath);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:244',message:'after ensureMailbox',data:{folderPath,mappedPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H8'})}).catch(()=>{});
          // #endregion
          eventBus.publishLog(jobId, 'info', `Mailbox ${mappedPath} is ready`);

          // Get last processed UID from DB
          const folders = dbQueries.getFoldersByAccount.all(jobId, rowIndex) as any[];
          const folder = folders.find((f) => f.folderPath === folderPath);
          const lastProcessedUid = folder?.lastProcessedUid || 0;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:250',message:'before message processing loop',data:{folderPath,messageCount,lastProcessedUid,currentUid:lastProcessedUid+1},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H8'})}).catch(()=>{});
          // #endregion

          // Process messages in batches
          let processed = 0;
          let currentUid = lastProcessedUid + 1;

          while (processed < messageCount) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:258',message:'before oldClient.getMessages',data:{folderPath,currentUid,batch_size,processed,messageCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H8'})}).catch(()=>{});
            // #endregion
            const messages = await oldClient.getMessages(folderPath, currentUid, batch_size);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:261',message:'after oldClient.getMessages',data:{folderPath,messagesCount:messages.length,currentUid},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H8'})}).catch(()=>{});
            // #endregion

            if (messages.length === 0) {
              break;
            }

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:275',message:'before for loop',data:{folderPath,messagesCount:messages.length,processed,messageCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H9'})}).catch(()=>{});
            // #endregion

            for (const message of messages) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:278',message:'for loop iteration',data:{folderPath,messageUid:message.uid,hasSource:!!message.source,processed},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H9'})}).catch(()=>{});
              // #endregion
              try {
                if (!message.source) {
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:282',message:'message has no source, skipping',data:{folderPath,messageUid:message.uid},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H9'})}).catch(()=>{});
                  // #endregion
                  eventBus.publishLog(jobId, 'warn', `Message ${message.uid} has no source, skipping`);
                  continue;
                }

                // Append to new server
                // Process flags to preserve IMAP system flags like \Seen, \Answered, etc.
                // IMAP flags can be:
                // - System flags: \Seen, \Answered, \Flagged, \Deleted, \Draft, \Recent
                // - Custom flags: alphanumeric, dash, underscore only
                const rawFlags = message.flags;
                let validFlags: string[] | undefined;
                
                if (rawFlags) {
                  // Convert to array if it's an object (Set, Map, or plain object)
                  let flagArray: any[] = [];
                  if (Array.isArray(rawFlags)) {
                    flagArray = rawFlags;
                  } else if (typeof rawFlags === 'object') {
                    // If it's an object, try to extract values
                    // Could be a Set, Map, or plain object
                    if (rawFlags instanceof Set) {
                      flagArray = Array.from(rawFlags);
                    } else if (rawFlags instanceof Map) {
                      flagArray = Array.from(rawFlags.keys());
                    } else {
                      // Plain object - try Object.keys or Object.values
                      flagArray = Object.keys(rawFlags).length > 0 ? Object.keys(rawFlags) : [];
                    }
                  } else {
                    // Single value
                    flagArray = [rawFlags];
                  }
                  
                  // Filter to valid IMAP flags
                  // System flags: \Seen, \Answered, \Flagged, \Deleted, \Draft, \Recent
                  // Custom flags: alphanumeric, dash, underscore only
                  validFlags = flagArray
                    .filter((flag: any) => {
                      // Convert to string if needed
                      const flagStr = typeof flag === 'string' ? flag : String(flag);
                      // Allow system flags (starting with backslash) or custom flags (alphanumeric, dash, underscore)
                      return /^\\[A-Za-z]+$/.test(flagStr) || /^[a-zA-Z0-9_-]+$/.test(flagStr);
                    })
                    .map((flag: any) => (typeof flag === 'string' ? flag : String(flag)));
                  
                  // If empty after filtering, set to undefined to avoid "non-atoms" error
                  if (validFlags.length === 0) {
                    validFlags = undefined;
                  }
                } else {
                  validFlags = undefined;
                }
                
                // Get internalDate to preserve original message date
                const internalDate = message.internalDate ? new Date(message.internalDate) : undefined;
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:339',message:'before appendMessage',data:{folderPath,mappedPath,messageUid:message.uid,processed,rawFlags,rawFlagsType:typeof rawFlags,isArray:Array.isArray(rawFlags),validFlags:validFlags===undefined?'undefined':validFlags,validFlagsType:typeof validFlags,validFlagsLength:validFlags?.length,validFlagsIsArray:Array.isArray(validFlags),hasInternalDate:!!internalDate,internalDate},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H10'})}).catch(()=>{});
                // #endregion
                
                // Append message with flags and internalDate to preserve read/unread status and original date
                await newClient.appendMessage(
                  mappedPath,
                  message.source,
                  validFlags,
                  internalDate
                );
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:297',message:'after appendMessage',data:{folderPath,messageUid:message.uid,processed},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H9'})}).catch(()=>{});
                // #endregion

                processed++;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:301',message:'processed incremented',data:{folderPath,messageUid:message.uid,processed},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H9'})}).catch(()=>{});
                // #endregion
                
                // Log progress every 10 messages or on first/last message
                if (processed === 1 || processed % 10 === 0 || processed === messageCount) {
                  eventBus.publishLog(jobId, 'info', `Migrated ${processed}/${messageCount} messages from ${folderPath} to ${mappedPath}`);
                }
                
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
              } catch (err: any) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:360',message:'error in message processing',data:{folderPath,messageUid:message.uid,error:err.message,stack:err.stack,processed},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'H9'})}).catch(()=>{});
                // #endregion
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
          
          eventBus.publishLog(jobId, 'info', `Completed migration for ${folderPath}: ${processed}/${messageCount} messages migrated to ${mappedPath}`);
        }
      } catch (err: any) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17137b8e-4be1-4099-930e-89ca92815cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:280',message:'catch block executed',data:{folderPath,error:err.message,stack:err.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
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
    const errorMsg = `Error processing account ${rowIndex}: ${err.message}`;
    console.error(`[Worker] ${errorMsg}`, err);
    eventBus.publishLog(jobId, 'error', errorMsg);
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
      try {
        await oldClient.disconnect();
        console.log(`[Worker] Disconnected from old server`);
      } catch (err) {
        console.error(`[Worker] Error disconnecting from old server:`, err);
      }
    }
    if (newClient) {
      try {
        await newClient.disconnect();
        console.log(`[Worker] Disconnected from new server`);
      } catch (err) {
        console.error(`[Worker] Error disconnecting from new server:`, err);
      }
    }
  }
}

export async function runJob(jobId: string): Promise<void> {
  console.log(`[Worker] Starting job ${jobId}`);
  
  const job = dbQueries.getJob.get(jobId) as any;
  if (!job) {
    const errorMsg = `Job ${jobId} not found`;
    console.error(`[Worker] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  console.log(`[Worker] Job found: mode=${job.mode}, status=${job.status}`);
  console.log(`[Worker] Job mode type: ${typeof job.mode}, value: "${job.mode}"`);
  dbQueries.updateJobStatus.run('running', jobId);
  eventBus.publishLog(jobId, 'info', `Starting job ${jobId} in ${job.mode} mode`);
  console.log(`[Worker] Job status updated to 'running'`);

  const accounts = dbQueries.getAccountsByJob.all(jobId) as AccountRow[];
  console.log(`[Worker] Found ${accounts.length} accounts to process`);

  let totalMessages = 0;
  let movedMessages = 0;
  let errorCount = 0;

  try {
    for (let i = 0; i < accounts.length; i++) {
      console.log(`[Worker] Processing account ${i + 1}/${accounts.length}`);
        const account = accounts[i];
        
        dbQueries.updateJobProgress.run(
          totalMessages,
          movedMessages,
          errorCount,
          i,
          jobId
        );

        try {
          const accountMode = job.mode as 'dryrun' | 'migrate';
          console.log(`[Worker] Processing account ${i + 1} with mode: ${accountMode}`);
          await processAccount(jobId, account, accountMode);
          
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

    console.log(`[Worker] Job ${jobId} completed: ${movedMessages}/${totalMessages} messages, ${errorCount} errors`);
    eventBus.publishLog(jobId, 'info', `Job ${jobId} completed successfully: ${movedMessages}/${totalMessages} messages`);
  } catch (err: any) {
    console.error(`[Worker] Job ${jobId} failed:`, err);
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
