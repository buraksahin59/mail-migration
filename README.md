# Mail Migration Tool

Self-hosted IMAP mailbox migration tool built with Next.js, TypeScript, and SQLite.

## Features

- **Excel-based Configuration**: Upload Excel file with migration details
- **Dry-Run Mode**: Analyze mailboxes without actually migrating
- **Real-time Progress**: Server-Sent Events (SSE) for live progress updates
- **Resume Support**: Jobs can be paused and resumed
- **Folder Mapping**: Automatic mapping of standard folders (INBOX, Sent, Trash, etc.)
- **Batch Processing**: Configurable batch size for message processing
- **Error Handling**: Retry logic and error reporting

## Prerequisites

- Node.js 18+ 
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mail-migration
```

2. Install dependencies:
```bash
npm install
```

3. Create data directories:
```bash
mkdir -p data/logs
```

## Usage

1. Start the development server:
```bash
npm run dev
```

2. Open your browser and navigate to `http://localhost:3000`

3. Download the Excel template from the upload page

4. Fill in the Excel template with your migration details:
   - **Required columns**: `old_host`, `old_email`, `old_password`, `new_host`, `new_email`, `new_password`
   - **Optional columns**: `old_port`, `new_port` (default: 993), `old_tls`, `new_tls` (default: true), `batch_size` (default: 200)

5. Upload the Excel file and configure:
   - Enable/disable Dry-Run mode
   - Set batch size
   - Set concurrency (currently limited to 1)

6. Click "Create Job" and you'll be redirected to the progress page

7. Click "Start" to begin the migration

## Excel Template Format

The Excel file should have the following columns:

| Column | Required | Default | Description |
|--------|----------|---------|-------------|
| old_host | Yes | - | Old IMAP server hostname |
| old_email | Yes | - | Old email address |
| old_password | Yes | - | Old email password |
| new_host | Yes | - | New IMAP server hostname |
| new_email | Yes | - | New email address |
| new_password | Yes | - | New email password |
| old_port | No | 993 | Old IMAP port |
| new_port | No | 993 | New IMAP port |
| old_tls | No | true | Use TLS for old server |
| new_tls | No | true | Use TLS for new server |
| batch_size | No | 200 | Number of messages to process per batch |

## Project Structure

```
mail-migration/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── jobs/         # Job management endpoints
│   ├── run/               # Progress monitoring page
│   ├── page.tsx          # Upload page
│   └── layout.tsx        # Root layout
├── server/                # Server-side code
│   ├── db.ts             # SQLite database setup
│   ├── events.ts         # Event bus for SSE
│   ├── security.ts       # Password masking and storage
│   ├── worker.ts         # Job execution worker
│   └── imap/             # IMAP client wrapper
│       ├── client.ts     # IMAP client
│       └── mapping.ts    # Folder mapping logic
├── data/                  # Data directory
│   ├── migration.db      # SQLite database
│   └── logs/             # Log files
└── package.json
```

## API Endpoints

- `POST /api/jobs/create` - Create a new migration job
- `POST /api/jobs/[jobId]/start` - Start a job
- `GET /api/jobs/[jobId]/status` - Get job status
- `GET /api/jobs/[jobId]/stream` - SSE stream for real-time updates
- `GET /api/template` - Download Excel template

## Database Schema

### jobs
- `id`: Unique job identifier
- `createdAt`: Timestamp
- `mode`: 'dryrun' or 'migrate'
- `status`: 'pending', 'running', 'paused', 'done', 'failed'
- `totalMessages`: Total messages to migrate
- `movedMessages`: Messages migrated so far
- `errorCount`: Number of errors
- `currentRowIndex`: Current account being processed

### accounts
- `jobId`: Foreign key to jobs
- `rowIndex`: Row index in Excel file
- `old_host`, `old_email`, `old_port`, `old_tls`: Old server details
- `new_host`, `new_email`, `new_port`, `new_tls`: New server details
- `batch_size`: Batch size for this account
- `status`: Account processing status
- `totalMessages`, `movedMessages`: Progress counters

### folders
- `jobId`, `rowIndex`: Foreign keys
- `folderPath`: Folder path
- `totalMessages`, `movedMessages`: Progress counters
- `lastProcessedUid`: Last processed UID (for resume)
- `status`: Folder processing status

## Security Notes

- **Passwords**: In MVP, passwords are stored in-memory only. They are not persisted to the database.
- **Logging**: All passwords are masked in logs (e.g., `p*****d`)
- **Restart**: If the server restarts, passwords are lost. Jobs need to be recreated.

## Development

```bash
# Run development server
npm run dev

# Type check
npm run type-check

# Build for production
npm run build

# Start production server
npm start
```

## Troubleshooting

### Worker not starting
- Ensure `tsx` is installed: `npm install -D tsx`
- Check that the worker file exists at `server/worker.ts`

### Database errors
- Ensure the `data` directory exists and is writable
- Check SQLite file permissions

### IMAP connection errors
- Verify hostname, port, and credentials
- Check firewall settings
- Ensure TLS/SSL settings are correct

## License

MIT
