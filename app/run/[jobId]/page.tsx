'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface JobStatus {
  id: string;
  createdAt: number;
  mode: string;
  status: string;
  totalMessages: number;
  movedMessages: number;
  errorCount: number;
  currentRowIndex: number;
}

interface Account {
  rowIndex: number;
  old_email: string;
  new_email: string;
  status: string;
  totalMessages: number;
  movedMessages: number;
  folders?: Folder[];
}

interface Folder {
  folderPath: string;
  totalMessages: number;
  movedMessages: number;
  status: string;
}

export default function RunPage() {
  const params = useParams();
  const jobId = params.jobId as string;

  const [job, setJob] = useState<JobStatus | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [logs, setLogs] = useState<Array<{ level: string; message: string; ts: number }>>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 2000);
    return () => clearInterval(interval);
  }, [jobId]);

  useEffect(() => {
    if (jobId) {
      setupSSE();
    }
    return () => {
      // Cleanup will be handled by abort signal
    };
  }, [jobId]);

  const loadStatus = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/status`);
      const data = await response.json();
      setJob(data.job);
      setAccounts(data.accounts || []);
      setIsRunning(data.job.status === 'running');
    } catch (err) {
      console.error('Error loading status:', err);
    }
  };

  const setupSSE = () => {
    const eventSource = new EventSource(`/api/jobs/${jobId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.event === 'log') {
          setLogs((prev) => [
            ...prev.slice(-99), // Keep last 100 logs
            { level: data.data.level, message: data.data.message, ts: data.ts },
          ]);
        } else if (data.event === 'job_status') {
          setJob((prev) => prev ? { ...prev, ...data.data } : null);
        } else if (data.event === 'account_status') {
          setAccounts((prev) =>
            prev.map((acc) =>
              acc.rowIndex === data.data.rowIndex
                ? { ...acc, ...data.data }
                : acc
            )
          );
        } else if (data.event === 'folder_status') {
          setAccounts((prev) =>
            prev.map((acc) => {
              if (acc.rowIndex === data.data.rowIndex) {
                const folders = acc.folders || [];
                const folderIndex = folders.findIndex(
                  (f) => f.folderPath === data.data.folderPath
                );
                if (folderIndex >= 0) {
                  folders[folderIndex] = { ...folders[folderIndex], ...data.data };
                } else {
                  folders.push(data.data);
                }
                return { ...acc, folders };
              }
              return acc;
            })
          );
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  };

  const handleStart = async () => {
    try {
      await fetch(`/api/jobs/${jobId}/start`, { method: 'POST' });
      setIsRunning(true);
    } catch (err) {
      console.error('Error starting job:', err);
    }
  };

  const progress = job && job.totalMessages > 0
    ? (job.movedMessages / job.totalMessages) * 100
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Job: {jobId}
            </h1>
            <div className="flex items-center space-x-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                job?.status === 'running' ? 'bg-green-100 text-green-800' :
                job?.status === 'done' ? 'bg-blue-100 text-blue-800' :
                job?.status === 'failed' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {job?.status || 'loading'}
              </span>
              {!isRunning && job?.status === 'pending' && (
                <button
                  onClick={handleStart}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Start
                </button>
              )}
            </div>
          </div>

          {/* Overall Progress */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Overall Progress</span>
              <span>
                {job?.movedMessages || 0} / {job?.totalMessages || 0} messages
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Job Stats */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Mode:</span>
              <span className="ml-2 font-medium">{job?.mode || '-'}</span>
            </div>
            <div>
              <span className="text-gray-600">Errors:</span>
              <span className="ml-2 font-medium text-red-600">{job?.errorCount || 0}</span>
            </div>
            <div>
              <span className="text-gray-600">Current Row:</span>
              <span className="ml-2 font-medium">{job?.currentRowIndex || 0}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Accounts List */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Accounts</h2>
            <div className="space-y-2">
              {accounts.map((account) => {
                const accProgress = account.totalMessages > 0
                  ? (account.movedMessages / account.totalMessages) * 100
                  : 0;
                return (
                  <div
                    key={account.rowIndex}
                    className={`border rounded p-3 cursor-pointer ${
                      selectedAccount === account.rowIndex
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200'
                    }`}
                    onClick={() => setSelectedAccount(account.rowIndex)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium text-sm">
                          Row {account.rowIndex + 1}
                        </div>
                        <div className="text-xs text-gray-500">
                          {account.old_email} → {account.new_email}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${
                        account.status === 'done' ? 'bg-green-100 text-green-800' :
                        account.status === 'running' ? 'bg-blue-100 text-blue-800' :
                        account.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {account.status}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${accProgress}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600">
                      {account.movedMessages} / {account.totalMessages}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Folder Details */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Folders {selectedAccount !== null && `(Row ${selectedAccount + 1})`}
            </h2>
            {selectedAccount !== null ? (
              <div className="space-y-2">
                {accounts[selectedAccount]?.folders?.map((folder) => {
                  const folderProgress = folder.totalMessages > 0
                    ? (folder.movedMessages / folder.totalMessages) * 100
                    : 0;
                  return (
                    <div key={folder.folderPath} className="border border-gray-200 rounded p-3">
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-medium text-sm truncate">{folder.folderPath}</div>
                        <span className={`px-2 py-1 rounded text-xs ${
                          folder.status === 'done' ? 'bg-green-100 text-green-800' :
                          folder.status === 'running' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {folder.status}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${folderProgress}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-600">
                        {folder.movedMessages} / {folder.totalMessages}
                      </div>
                    </div>
                  );
                }) || <p className="text-gray-500 text-sm">No folders yet</p>}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Select an account to view folders</p>
            )}
          </div>
        </div>

        {/* Logs */}
        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Logs</h2>
          <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500">No logs yet...</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="mb-1">
                  <span className="text-gray-500">
                    [{new Date(log.ts).toLocaleTimeString()}]
                  </span>
                  <span className={`ml-2 ${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warn' ? 'text-yellow-400' :
                    'text-green-400'
                  }`}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="ml-2">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
