import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Upload, 
  ArrowLeft, 
  FileText,
  AlertCircle,
  CheckCircle,
  Brain,
  Download,
  Cloud,
  Sparkles,
  Target,
  BarChart3,
  Info,
  Trash2,
  RefreshCw
} from "lucide-react";
import { Link } from "react-router-dom";
import { UploadedPaper } from "@shared/api";

interface UploadedFile {
  id: string;
  filename: string;
  source: 'local' | 'google-drive';
  topics?: string[];
  questionCount?: number;
  content?: string;
}

interface GeneratedQuestion {
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}



export default function ExamPrep() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedPaper[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingPapers, setIsLoadingPapers] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);

  // Load uploaded papers on component mount
  useEffect(() => {
    loadUploadedPapers();
    // Clear all papers on page load/refresh to start fresh
    // This prevents old papers from persisting after refresh
    return () => {
      // Cleanup: clear papers when component unmounts (optional)
    };
  }, []);

  const loadUploadedPapers = async () => {
    setIsLoadingPapers(true);
    try {
      const response = await fetch('/api/uploaded-papers');
      const data = await response.json();
      
      if (data.success) {
        setUploadedFiles(data.papers);
      } else {
        setError(data.message || 'Failed to load uploaded papers');
      }
    } catch (error) {
      setError('Network error while loading papers');
    } finally {
      setIsLoadingPapers(false);
    }
  };

  const handleRemovePaper = async (paperId: string) => {
    try {
      // Use POST method with body (more reliable than DELETE with body)
      const response = await fetch('/api/remove-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId })
      });

      const data = await response.json();

      if (data.success) {
        setUploadedFiles(prev => prev.filter(paper => paper.id !== paperId));
        setSuccessMessage(data.message);
        // Clear questions when papers are removed
        setGeneratedQuestions([]);
      } else {
        setError(data.message || 'Failed to remove paper');
      }
    } catch (error) {
      setError('Network error while removing paper');
      console.error('Remove paper error:', error);
    }
  };

  const handleClearAllPapers = async () => {
    if (!confirm('Are you sure you want to clear all uploaded papers? This cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch('/api/clear-all-papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        setUploadedFiles([]);
        setGeneratedQuestions([]);
        setSuccessMessage(data.message || 'All papers cleared successfully');
        setError('');
      } else {
        setError(data.message || 'Failed to clear papers');
      }
    } catch (error) {
      setError('Network error while clearing papers');
      console.error('Clear all papers error:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Check file sizes before uploading
    const maxFileSize = 10 * 1024 * 1024; // 10MB limit
    const oversizedFiles = Array.from(files).filter(file => file.size > maxFileSize);
    
    if (oversizedFiles.length > 0) {
      setError(`Files too large: ${oversizedFiles.map(f => f.name).join(', ')}. Maximum file size is 10MB.`);
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccessMessage('');

    try {
      const fileData = await Promise.all(
        Array.from(files).map(async (file) => {
          // Actually read the file content
          const content = await readFileContent(file);
          return {
            filename: file.name,
            size: file.size,
            type: file.type,
            content: content // Send actual file content
          };
        })
      );

      const response = await fetch('/api/upload-papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileData })
      });

      const data = await response.json();

      if (data.success) {
        // Reload all papers to get the updated list
        await loadUploadedPapers();
        setSuccessMessage(`Successfully uploaded ${data.uploadedFiles.length} question papers`);
      } else {
        setError(data.message || 'Upload failed');
      }
    } catch (error) {
      setError('Network error during upload');
    } finally {
      setIsUploading(false);
    }
  };

  // Read file content as base64 for binary files (PDF, DOCX, etc.)
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          // Read as base64 for binary files
          const result = e.target?.result as string;
          // Remove data URL prefix if present (data:application/pdf;base64,)
          const base64Content = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64Content);
        } catch (error) {
          reject(new Error('Failed to read file content'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      
      // Read as base64 for binary files (PDF, DOCX, images, etc.)
      reader.readAsDataURL(file);
    });
  };

  const handleGoogleDriveUpload = async () => {
    // Show demo message instead of fake upload
    setError('');
    setSuccessMessage('Google Drive integration is a demo feature. In production, this would open the Google Drive Picker to select files.');
  };

  const handleAnalyzePapers = async () => {
    if (uploadedFiles.length === 0) {
      setError('Please upload question papers first');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperIds: uploadedFiles.map(f => f.id)
        })
      });

      const data = await response.json();

      if (data.success && data.questions) {
        setGeneratedQuestions(data.questions);
        setSuccessMessage('Important questions generated successfully using AI - based on your uploaded papers only');
      } else {
        setError(data.message || 'Question generation failed');
      }
    } catch (error) {
      setError('Network error during question generation');
    } finally {
      setIsAnalyzing(false);
    }
  };



  const handleDownloadQuestions = async () => {
    if (generatedQuestions.length === 0) {
      setError('Please generate questions first');
      return;
    }

    try {
      // Generate text content directly from the questions in state
      let content = 'IMPORTANT QUESTIONS\n';
      content += '='.repeat(50) + '\n\n';
      content += `Generated on: ${new Date().toLocaleString()}\n`;
      content += `Total Questions: ${generatedQuestions.length}\n\n`;
      content += '='.repeat(50) + '\n\n';

      generatedQuestions.forEach((q, index) => {
        content += `Question ${index + 1}:\n`;
        content += `${q.question}\n\n`;
        
        if (q.topic) {
          content += `Topic: ${q.topic}\n`;
        }
        
        content += `Difficulty: ${q.difficulty?.toUpperCase() || 'N/A'}\n`;
        content += `Importance: ${q.importance.toUpperCase()}\n`;
        content += `Confidence: ${(q.confidence * 100).toFixed(0)}%\n\n`;
        
        // Always include answer in download
        if (q.answer && q.answer.trim()) {
          content += `Answer: ${q.answer}\n`;
        } else {
          content += `Answer: [Answer not available]\n`;
        }
        
        content += '\n' + '-'.repeat(50) + '\n\n';
      });

      // Create blob and download
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `important_questions_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccessMessage('Questions downloaded successfully');
    } catch (error) {
      setError('Failed to download questions');
      console.error('Download error:', error);
    }
  };

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'hard': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'easy': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-4">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Homepage
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">AI-Powered Exam Preparation</h1>
          <p className="text-muted-foreground">Upload question papers and get AI-generated predictions for upcoming exams based on your uploaded content</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Upload and Analysis */}
          <div className="lg:col-span-2 space-y-6">
            {/* File Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Upload className="h-5 w-5" />
                  <span>Upload Question Papers</span>
                </CardTitle>
                <CardDescription>Upload previous year question papers for AI analysis. Questions will be generated only from your uploaded content.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="papers-upload" className="sr-only">Upload Files</Label>
                      <Input
                        id="papers-upload"
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        className="cursor-pointer"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Local files (PDF, DOC, DOCX, TXT) - Max 10MB per file
                      </p>
                    </div>
                    <Button
                      onClick={handleGoogleDriveUpload}
                      disabled={isUploading}
                      variant="outline"
                      className="w-full"
                    >
                      <Cloud className="h-4 w-4 mr-2" />
                      Upload from Google Drive
                    </Button>
                  </div>
                  {isUploading && (
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      <span>Uploading files...</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Generate Questions Configuration */}
            {uploadedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Target className="h-5 w-5" />
                    <span>Generate Important Questions</span>
                  </CardTitle>
                  <CardDescription>AI will analyze your uploaded papers and generate important questions based on the content you provided</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <Info className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">Content-Based Analysis</span>
                      </div>
                      <p className="text-sm text-blue-700">
                        The AI analyzes only your uploaded question papers to detect topics, exam patterns, and generate relevant questions. No external sources are used.
                      </p>
                    </div>
                    <Button
                      onClick={handleAnalyzePapers}
                      disabled={isAnalyzing}
                      className="w-full"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {isAnalyzing ? 'Generating Questions...' : 'Generate Important Questions'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Uploaded Files Display */}
            {uploadedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Uploaded Question Papers</CardTitle>
                      <CardDescription>{uploadedFiles.length} files uploaded successfully</CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      {uploadedFiles.length > 0 && (
                        <Button
                          onClick={handleClearAllPapers}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Clear All
                        </Button>
                      )}
                      <Button
                        onClick={loadUploadedPapers}
                        disabled={isLoadingPapers}
                        variant="outline"
                        size="sm"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingPapers ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-3">
                      {uploadedFiles.map((file, index) => (
                        <div key={file.id} className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
                          <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{file.filename}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {file.source === 'google-drive' ? 'Google Drive' : 'Local'}
                              </Badge>
                              {file.topics && file.topics.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {file.topics[0]}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(file.uploadedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleRemovePaper(file.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Results and Download */}
          <div className="space-y-6">
            {/* Generated Questions */}
            {generatedQuestions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Sparkles className="h-5 w-5" />
                    <span>Generated Questions</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-3">
                      {generatedQuestions.slice(0, 5).map((question, index) => (
                        <div key={index} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <Badge className={getImportanceColor(question.importance)}>
                              {question.importance.toUpperCase()}
                            </Badge>
                            <Badge className={getDifficultyColor(question.difficulty)}>
                              {question.difficulty.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium mb-2">{question.question}</p>
                          {question.answer && question.answer.trim() && !question.answer.toLowerCase().includes('answer not provided') && (
                            <div className="mt-2 p-2 bg-muted rounded-md">
                              <p className="text-xs font-semibold text-foreground mb-1">Answer:</p>
                              <p className="text-xs text-foreground whitespace-pre-wrap">{question.answer}</p>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-2">
                            <span>{(question.confidence * 100).toFixed(0)}% confidence</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Download Section */}
            {generatedQuestions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Download className="h-5 w-5" />
                    <span>Download Questions</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleDownloadQuestions} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Questions (TXT)
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {uploadedFiles.length === 0 && !isUploading && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Question Papers Uploaded</h3>
                    <p className="text-muted-foreground mb-6">
                      Upload your previous year question papers to start AI-powered analysis and get predicted questions for upcoming exams.
                    </p>
                    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                      <span>📄 Supports PDF, DOC, DOCX, TXT</span>
                      <span>☁️ Google Drive integration (demo)</span>
                      <span>🤖 AI-powered analysis from your content only</span>
                      <span>📊 Topic detection & prediction</span>
                      <span>🗑️ Remove papers anytime</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
