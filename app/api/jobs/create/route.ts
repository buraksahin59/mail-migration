import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import * as XLSX from 'xlsx';
import db, { dbQueries } from '@/server/db';
import { storePasswords, maskPassword } from '@/server/security';

interface ExcelRow {
  old_host?: string;
  old_email?: string;
  old_password?: string;
  new_host?: string;
  new_email?: string;
  new_password?: string;
  old_port?: number;
  new_port?: number;
  old_tls?: boolean | string;
  new_tls?: boolean | string;
  batch_size?: number;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const mode = formData.get('mode') as string || 'migrate';
    const concurrency = parseInt(formData.get('concurrency') as string || '1');
    const defaultBatchSize = parseInt(formData.get('batch_size') as string || '200');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Read Excel file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const rows: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Excel file is empty' }, { status: 400 });
    }

    // Validate and parse rows
    const validationErrors: Array<{ row: number; errors: string[] }> = [];
    const validRows: ExcelRow[] = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2; // +2 because Excel is 1-indexed and first row is header
      const errors: string[] = [];

      // Required fields
      if (!row.old_host) errors.push('old_host is required');
      if (!row.old_email) errors.push('old_email is required');
      if (!row.old_password) errors.push('old_password is required');
      if (!row.new_host) errors.push('new_host is required');
      if (!row.new_email) errors.push('new_email is required');
      if (!row.new_password) errors.push('new_password is required');

      if (errors.length > 0) {
        validationErrors.push({ row: rowNum, errors });
      } else {
        validRows.push(row);
      }
    });

    if (validRows.length === 0) {
      return NextResponse.json({
        error: 'No valid rows found',
        validationErrors,
      }, { status: 400 });
    }

    // Create job
    const jobId = nanoid();
    const jobMode = mode === 'dryrun' ? 'dryrun' : 'migrate'; // Ensure correct mode
    console.log(`[API] Creating job ${jobId} with mode: ${jobMode}`);
    const optionsJson = JSON.stringify({
      defaultBatchSize,
      concurrency,
    });

    dbQueries.createJob.run(
      jobId,
      Date.now(),
      jobMode,
      concurrency,
      optionsJson
    );

    // Create accounts and store passwords
    validRows.forEach((row, index) => {
      const rowIndex = index;
      const oldPort = row.old_port || 993;
      const newPort = row.new_port || 993;
      const oldTls = row.old_tls === false || row.old_tls === 'false' ? 0 : 1;
      const newTls = row.new_tls === false || row.new_tls === 'false' ? 0 : 1;
      const batchSize = row.batch_size || defaultBatchSize;

      dbQueries.createAccount.run(
        jobId,
        rowIndex,
        row.old_host!,
        row.old_email!,
        oldPort,
        oldTls,
        row.new_host!,
        row.new_email!,
        newPort,
        newTls,
        batchSize
      );

      // Store passwords in memory (MVP approach)
      console.log(`[API] Storing passwords for jobId=${jobId}, rowIndex=${rowIndex}`);
      storePasswords(jobId, rowIndex, row.old_password!, row.new_password);
      console.log(`[API] Passwords stored for jobId=${jobId}, rowIndex=${rowIndex}`);
    });

    return NextResponse.json({
      jobId,
      rows: validRows.length,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    });
  } catch (error: any) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create job' },
      { status: 500 }
    );
  }
}
