import { EventEmitter } from 'events';

// Event bus for SSE communication
class EventBus extends EventEmitter {
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  subscribe(jobId: string, callback: (data: any) => void) {
    const key = `job:${jobId}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);
  }

  unsubscribe(jobId: string, callback: (data: any) => void) {
    const key = `job:${jobId}`;
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  publish(jobId: string, event: string, data: any) {
    const key = `job:${jobId}`;
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      const message = JSON.stringify({ event, data, ts: Date.now() });
      callbacks.forEach((cb) => {
        try {
          cb(message);
        } catch (err) {
          console.error('Error in event callback:', err);
        }
      });
    }
  }

  // Helper methods for specific event types
  publishJobStatus(jobId: string, data: {
    status: string;
    totalMessages: number;
    movedMessages: number;
    errorCount: number;
  }) {
    this.publish(jobId, 'job_status', data);
  }

  publishAccountStatus(jobId: string, data: {
    rowIndex: number;
    status: string;
    totalMessages: number;
    movedMessages: number;
  }) {
    this.publish(jobId, 'account_status', data);
  }

  publishFolderStatus(jobId: string, data: {
    rowIndex: number;
    folderPath: string;
    totalMessages: number;
    movedMessages: number;
  }) {
    this.publish(jobId, 'folder_status', data);
  }

  publishLog(jobId: string, level: string, message: string, meta?: any) {
    this.publish(jobId, 'log', {
      level,
      message,
      meta,
    });
  }
}

export const eventBus = new EventBus();
