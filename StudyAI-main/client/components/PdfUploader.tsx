import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { Trash2 } from 'lucide-react';

export function PdfUploader({ onProcessed }: { onProcessed: (result: any) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      // Store the file path for potential deletion
      setFilePath(URL.createObjectURL(e.target.files[0]));
    }
  };

  const handleDeleteFile = async () => {
    if (!filePath) return;
    
    try {
      const response = await fetch('/api/documents/delete-file', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      // Reset file states
      setFile(null);
      setFilePath(null);
      
      // Reset file input
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
      
    } catch (err) {
      console.error('Error deleting file:', err);
      setError('Failed to delete file. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a PDF file');
      return;
    }

    const formData = new FormData();
    formData.append('pdf', file);

    setIsProcessing(true);
    setProgress(10);
    setError(null);

    try {
      const response = await fetch('/api/documents/process-pdf', {
        method: 'POST',
        body: formData,
      });

      setProgress(70);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process PDF');
      }

      const result = await response.json();
      setProgress(100);
      onProcessed(result);
    } catch (err) {
      console.error('Error processing PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to process PDF');
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Upload PDF Document</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="flex items-center space-x-2">
            <Input
              id="file-upload"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="w-full"
            />
            {file && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleDeleteFile}
                disabled={isProcessing}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {file ? file.name : 'Upload a PDF document to extract text and generate questions'}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {isProcessing && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Processing document...</p>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          
          <Button
            type="submit"
            disabled={!file || isProcessing}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isProcessing ? 'Processing...' : 'Process Document'}
          </Button>
        </div>
      </form>
    </div>
  );
}
