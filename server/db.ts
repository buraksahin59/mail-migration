import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Ensure data directory exists
const dataDir = join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'migration.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    createdAt INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('dryrun', 'migrate')),
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'paused', 'done', 'failed')),
    totalMessages INTEGER DEFAULT 0,
    movedMessages INTEGER DEFAULT 0,
    errorCount INTEGER DEFAULT 0,
    currentRowIndex INTEGER DEFAULT 0,
    concurrency INTEGER DEFAULT 1,
    optionsJson TEXT
  );

  CREATE TABLE IF NOT EXISTS accounts (
    jobId TEXT NOT NULL,
    rowIndex INTEGER NOT NULL,
    old_host TEXT NOT NULL,
    old_email TEXT NOT NULL,
    old_port INTEGER DEFAULT 993,
    old_tls INTEGER DEFAULT 1,
    new_host TEXT NOT NULL,
    new_email TEXT NOT NULL,
    new_port INTEGER DEFAULT 993,
    new_tls INTEGER DEFAULT 1,
    batch_size INTEGER DEFAULT 200,
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'done', 'failed')),
    totalMessages INTEGER DEFAULT 0,
    movedMessages INTEGER DEFAULT 0,
    lastError TEXT,
    PRIMARY KEY (jobId, rowIndex),
    FOREIGN KEY (jobId) REFERENCES jobs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS folders (
    jobId TEXT NOT NULL,
    rowIndex INTEGER NOT NULL,
    folderPath TEXT NOT NULL,
    totalMessages INTEGER DEFAULT 0,
    movedMessages INTEGER DEFAULT 0,
    lastProcessedUid INTEGER DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'done', 'failed')),
    PRIMARY KEY (jobId, rowIndex, folderPath),
    FOREIGN KEY (jobId, rowIndex) REFERENCES accounts(jobId, rowIndex) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_accounts_job ON accounts(jobId);
  CREATE INDEX IF NOT EXISTS idx_folders_job_row ON folders(jobId, rowIndex);
`);

// Prepared statements
export const dbQueries = {
  createJob: db.prepare(`
    INSERT INTO jobs (id, createdAt, mode, status, concurrency, optionsJson)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `),

  updateJobStatus: db.prepare(`
    UPDATE jobs SET status = ? WHERE id = ?
  `),

  updateJobProgress: db.prepare(`
    UPDATE jobs 
    SET totalMessages = ?, movedMessages = ?, errorCount = ?, currentRowIndex = ?
    WHERE id = ?
  `),

  getJob: db.prepare(`
    SELECT * FROM jobs WHERE id = ?
  `),

  createAccount: db.prepare(`
    INSERT INTO accounts (
      jobId, rowIndex, old_host, old_email, old_port, old_tls,
      new_host, new_email, new_port, new_tls, batch_size, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `),

  updateAccountStatus: db.prepare(`
    UPDATE accounts SET status = ? WHERE jobId = ? AND rowIndex = ?
  `),

  updateAccountProgress: db.prepare(`
    UPDATE accounts 
    SET totalMessages = ?, movedMessages = ?, lastError = ?
    WHERE jobId = ? AND rowIndex = ?
  `),

  getAccountsByJob: db.prepare(`
    SELECT * FROM accounts WHERE jobId = ? ORDER BY rowIndex
  `),

  createFolder: db.prepare(`
    INSERT OR REPLACE INTO folders (
      jobId, rowIndex, folderPath, totalMessages, movedMessages, lastProcessedUid, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `),

  updateFolderProgress: db.prepare(`
    UPDATE folders 
    SET movedMessages = ?, lastProcessedUid = ?, status = ?
    WHERE jobId = ? AND rowIndex = ? AND folderPath = ?
  `),

  updateFolderTotal: db.prepare(`
    UPDATE folders 
    SET totalMessages = ?
    WHERE jobId = ? AND rowIndex = ? AND folderPath = ?
  `),

  getFoldersByAccount: db.prepare(`
    SELECT * FROM folders 
    WHERE jobId = ? AND rowIndex = ? 
    ORDER BY folderPath
  `) as any,
};

export default db;
