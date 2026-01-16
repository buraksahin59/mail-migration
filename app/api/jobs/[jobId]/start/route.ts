import { NextRequest, NextResponse } from 'next/server';
import db, { dbQueries } from '@/server/db';
import { runJob } from '@/server/worker';

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;
    const job = dbQueries.getJob.get(jobId) as any;

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status === 'running') {
      return NextResponse.json({ error: 'Job is already running' }, { status: 400 });
    }

    // Start worker asynchronously (non-blocking)
    // In production, consider using a proper job queue (Bull, BullMQ, etc.)
    runJob(jobId).catch((err) => {
      console.error('Worker error:', err);
    });

    return NextResponse.json({ success: true, jobId });
  } catch (error: any) {
    console.error('Error starting job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start job' },
      { status: 500 }
    );
  }
}
