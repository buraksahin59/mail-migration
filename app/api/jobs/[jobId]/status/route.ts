import { NextRequest, NextResponse } from 'next/server';
import db, { dbQueries } from '@/server/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;
    const job = dbQueries.getJob.get(jobId) as any;

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const accounts = dbQueries.getAccountsByJob.all(jobId) as any[];
    const accountsWithFolders = accounts.map((acc) => {
      const folders = dbQueries.getFoldersByAccount.all(jobId, acc.rowIndex) as any[];
      return {
        ...acc,
        folders,
      };
    });

    return NextResponse.json({
      job: {
        id: job.id,
        createdAt: job.createdAt,
        mode: job.mode,
        status: job.status,
        totalMessages: job.totalMessages,
        movedMessages: job.movedMessages,
        errorCount: job.errorCount,
        currentRowIndex: job.currentRowIndex,
      },
      accounts: accountsWithFolders,
    });
  } catch (error: any) {
    console.error('Error getting job status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get job status' },
      { status: 500 }
    );
  }
}
