'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [batchSize, setBatchSize] = useState(200);
  const [concurrency, setConcurrency] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Array<{ row: number; errors: string[] }>>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setValidationErrors([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', dryRun ? 'dryrun' : 'migrate');
      formData.append('batch_size', batchSize.toString());
      formData.append('concurrency', concurrency.toString());

      const response = await fetch('/api/jobs/create', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create job');
        if (data.validationErrors) {
          setValidationErrors(data.validationErrors);
        }
        return;
      }

      // Redirect to run page
      router.push(`/run/${data.jobId}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch('/api/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'migration-template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to download template');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Mail Migration Tool</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Excel File (.xlsx)
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Download Template
                </button>
              </div>
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="dryRun"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="dryRun" className="ml-2 block text-sm text-gray-900">
                  Dry-Run (Sadece Analiz)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Batch Size
                </label>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 200)}
                  min="1"
                  max="1000"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Concurrency
                </label>
                <input
                  type="number"
                  value={concurrency}
                  onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
                  min="1"
                  max="5"
                  disabled
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm bg-gray-100 sm:text-sm"
                />
                <p className="mt-1 text-sm text-gray-500">Currently limited to 1</p>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                <h3 className="text-sm font-medium text-yellow-800 mb-2">
                  Validation Errors ({validationErrors.length} rows)
                </h3>
                <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>
                      Row {err.row}: {err.errors.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!file || uploading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {uploading ? 'Creating Job...' : 'Create Job'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
