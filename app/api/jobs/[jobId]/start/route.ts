import { NextRequest, NextResponse } from 'next/server';
import db, { dbQueries } from '@/server/db';
import { runJob } from '@/server/worker';
import { eventBus } from '@/server/events';

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

    // Passwords should already be stored in global passwordStore from create route
    // Using global singleton ensures they're accessible across Next.js module instances

    // Start worker asynchronously (non-blocking)
    // In production, consider using a proper job queue (Bull, BullMQ, etc.)
    console.log(`[API] Starting worker for job ${jobId}`);
    runJob(jobId)
      .then(() => {
        console.log(`[API] Worker completed for job ${jobId}`);
      })
      .catch((err) => {
        console.error(`[API] Worker error for job ${jobId}:`, err);
        eventBus.publishLog(jobId, 'error', `Worker crashed: ${err.message}`);
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
