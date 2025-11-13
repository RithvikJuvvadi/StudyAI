import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

type DocumentResult = {
  text: string;
  questions: string[];
  chunkCount: number;
};

export function DocumentResults({ result }: { result: DocumentResult }) {
  if (!result) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Extracted Text</CardTitle>
          <p className="text-sm text-gray-500">
            {result.chunkCount} text chunks processed
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64 p-4 border rounded-md">
            <p className="whitespace-pre-line text-sm">
              {result.text.length > 1000 
                ? `${result.text.substring(0, 1000)}...` 
                : result.text}
            </p>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated Questions</CardTitle>
          <p className="text-sm text-gray-500">
            {result.questions.length} questions generated
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {result.questions.map((question, index) => (
              <div 
                key={index} 
                className="p-3 bg-gray-50 rounded-md border border-gray-200"
              >
                <div className="flex items-start">
                  <span className="font-medium mr-2">{index + 1}.</span>
                  <span>{question}</span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex justify-end space-x-2">
            <Button variant="outline" className="border-blue-500 text-blue-600 hover:bg-blue-50">
              Save Questions
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700">
              Generate More Questions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
