import { useState } from 'react';
import { PdfUploader } from '../components/PdfUploader';
import { DocumentResults } from '../components/DocumentResults';
import { Layout } from '../components/Layout';

type DocumentResult = {
  text: string;
  questions: string[];
  chunkCount: number;
};

export default function DocumentProcessorPage() {
  const [result, setResult] = useState<DocumentResult | null>(null);

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Document Processor</h1>
            <p className="text-gray-600">
              Upload a PDF document to extract text and generate questions automatically
            </p>
          </div>

          {!result ? (
            <PdfUploader onProcessed={setResult} />
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Processing Results</h2>
                <button
                  onClick={() => setResult(null)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Process another document
                </button>
              </div>
              <DocumentResults result={result} />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
