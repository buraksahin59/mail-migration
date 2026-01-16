import { NextRequest } from 'next/server';
import { eventBus } from '@/server/events';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const jobId = params.jobId;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Subscribe to events
      const callback = (message: string) => {
        send(message);
      };

      eventBus.subscribe(jobId, callback);

      // Send keepalive every 30 seconds
      const keepalive = setInterval(() => {
        send(JSON.stringify({ event: 'ping', data: {}, ts: Date.now() }));
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        eventBus.unsubscribe(jobId, callback);
        clearInterval(keepalive);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
