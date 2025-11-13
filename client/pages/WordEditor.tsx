import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  FileText, 
  Upload, 
  ArrowLeft, 
  Bold, 
  Italic, 
  Underline, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  Download,
  Settings,
  AlertCircle
} from "lucide-react";
import { Link } from "react-router-dom";

interface DocumentState {
  id: string | null;
  filename: string;
  content: string;
  formatting: {
    fontFamily: string;
    fontSize: number;
    fontColor: string;
    margins: {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
    alignment: 'left' | 'center' | 'right' | 'justify';
    lineSpacing: number;
    pageNumbers: boolean;
  };
}

export default function WordEditor() {
  const [documentState, setDocumentState] = useState<DocumentState>({
    id: null,
    filename: '',
    content: '',
    formatting: {
      fontFamily: 'Arial',
      fontSize: 12,
      fontColor: '#000000',
      margins: { top: 1, bottom: 1, left: 1, right: 1 },
      alignment: 'left',
      lineSpacing: 1.5,
      pageNumbers: false
    }
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [showQuickEditPopup, setShowQuickEditPopup] = useState(false);
  const [textFormatting, setTextFormatting] = useState({
    bold: false,
    italic: false,
    underline: false
  });
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState<Range | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      setError('Please upload a .docx file');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      // For demo purposes, send filename as JSON
      // In production, you'd use FormData with multer middleware
      const response = await fetch('/api/upload-doc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          type: file.type
        })
      });

      const data = await response.json();

      if (data.success) {
        setDocumentState(prev => ({
          ...prev,
          id: data.documentId,
          filename: file.name,
          content: data.content || `Document "${file.name}" uploaded successfully. You can now apply formatting and edit the content.`
        }));

        // Auto-show format dialog after successful upload
        setTimeout(() => {
          setShowFormatDialog(true);
        }, 300);
      } else {
        setError(data.message || 'Upload failed');
      }
    } catch (error) {
      setError('Network error during upload');
    } finally {
      setIsUploading(false);
    }
  };

  const applyFormatting = async () => {
    if (!documentState.id) return;

    setIsEditing(true);
    try {
      const response = await fetch('/api/edit-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: documentState.id,
          formatting: documentState.formatting
        })
      });

      const data = await response.json();
      if (data.success) {
        setShowFormatDialog(false);
      } else {
        setError(data.message || 'Formatting failed');
      }
    } catch (error) {
      setError('Network error during formatting');
    } finally {
      setIsEditing(false);
    }
  };

  const downloadDocument = async (format: 'docx' | 'pdf') => {
    if (!documentState.id) {
      setError('No document to download');
      return;
    }

    try {
      setError(''); // Clear any previous errors
      
      const response = await fetch(`/api/download-doc/${documentState.id}?format=${format}`, {
        method: 'GET',
        headers: {
          'Accept': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        
        // Verify the blob is not empty and has correct type
        if (blob.size === 0) {
          setError('Downloaded file is empty. Please try again.');
          return;
        }

        // Check if the blob has the correct MIME type
        const expectedType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (blob.type && blob.type !== expectedType && !blob.type.includes('application/octet-stream')) {
          console.warn(`Expected ${expectedType}, got ${blob.type}`);
        }
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${documentState.filename.replace('.docx', '').replace('.pdf', '')}.${format}`;
        a.style.display = 'none';
        
        // Trigger download
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // Show success message
        console.log(`Document downloaded successfully as ${format.toUpperCase()}`);
        
        // Clear any previous errors
        setError('');
      } else {
        // Try to get error message from response
        try {
          const errorData = await response.json();
          setError(errorData.message || `Download failed with status ${response.status}`);
        } catch {
          setError(`Download failed with status ${response.status}`);
        }
      }
    } catch (error) {
      console.error('Download error:', error);
      setError('Network error during download. Please check your connection and try again.');
    }
  };

  const toggleTextFormat = (format: 'bold' | 'italic' | 'underline') => {
    setTextFormatting(prev => ({
      ...prev,
      [format]: !prev[format]
    }));

    // Apply formatting to selected text if any
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = range.toString();

      if (selectedText) {
        try {
          // Create a span with formatting
          const span = document.createElement('span');
          span.style.fontWeight = format === 'bold' && !textFormatting.bold ? 'bold' : '';
          span.style.fontStyle = format === 'italic' && !textFormatting.italic ? 'italic' : '';
          span.style.textDecoration = format === 'underline' && !textFormatting.underline ? 'underline' : '';

          // Apply existing formatting
          if (textFormatting.bold && format !== 'bold') span.style.fontWeight = 'bold';
          if (textFormatting.italic && format !== 'italic') span.style.fontStyle = 'italic';
          if (textFormatting.underline && format !== 'underline') span.style.textDecoration = 'underline';

          span.textContent = selectedText;
          range.deleteContents();
          range.insertNode(span);

          // Clear selection
          selection.removeAllRanges();
        } catch (error) {
          console.log('Text formatting applied to selection');
        }
      }
    }
  };

  const setAlignment = (alignment: 'left' | 'center' | 'right' | 'justify') => {
    setDocumentState(prev => ({
      ...prev,
      formatting: { ...prev.formatting, alignment }
    }));
  };

  // Handle text selection in the preview
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = range.toString().trim();
      
      if (selectedText.length > 0) {
        setSelectedText(selectedText);
        setSelectionRange(range);
        setShowQuickEditPopup(true);
      }
    }
  };

  // Apply formatting to selected text
  const applyTextFormatting = (format: 'bold' | 'italic' | 'underline' | 'color' | 'size', value?: string) => {
    if (!selectionRange || !selectedText) return;

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      // Create a span element with the formatting
      const span = document.createElement('span');
      
      // Apply the specific formatting
      switch (format) {
        case 'bold':
          span.style.fontWeight = 'bold';
          break;
        case 'italic':
          span.style.fontStyle = 'italic';
          break;
        case 'underline':
          span.style.textDecoration = 'underline';
          break;
        case 'color':
          if (value) span.style.color = value;
          break;
        case 'size':
          if (value) span.style.fontSize = value;
          break;
      }
      
      span.textContent = selectedText;
      
      // Replace the selected text with formatted text
      range.deleteContents();
      range.insertNode(span);
      
      // Clear selection
      selection.removeAllRanges();
      setShowQuickEditPopup(false);
      setSelectedText('');
      setSelectionRange(null);
    }
  };

  // Update document formatting instantly
  const updateDocumentFormatting = (field: string, value: any) => {
    setDocumentState(prev => ({
      ...prev,
      formatting: {
        ...prev.formatting,
        [field]: value
      }
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-4">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Homepage
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">Word Editor</h1>
          <p className="text-muted-foreground">Professional document editing with advanced formatting capabilities</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Upload and Controls Panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* File Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="h-5 w-5" />
                  <span>Document Upload</span>
                </CardTitle>
                <CardDescription>Upload a .docx file to start editing</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="file-upload" className="sr-only">Upload Document</Label>
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".docx"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      className="cursor-pointer"
                    />
                  </div>
                  {documentState.filename && (
                    <div className="text-sm text-muted-foreground">
                      Current: {documentState.filename}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Format Tools */}
            {documentState.id && (
              <Card>
                <CardHeader>
                  <CardTitle>Quick Format</CardTitle>
                  <CardDescription>Apply formatting to selected text</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={textFormatting.bold ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleTextFormat('bold')}
                    >
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={textFormatting.italic ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleTextFormat('italic')}
                    >
                      <Italic className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={textFormatting.underline ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleTextFormat('underline')}
                    >
                      <Underline className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={documentState.formatting.alignment === 'left' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAlignment('left')}
                    >
                      <AlignLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={documentState.formatting.alignment === 'center' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAlignment('center')}
                    >
                      <AlignCenter className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={documentState.formatting.alignment === 'right' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAlignment('right')}
                    >
                      <AlignRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={documentState.formatting.alignment === 'justify' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAlignment('justify')}
                    >
                      <AlignJustify className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Advanced Formatting */}
            {documentState.id && (
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Formatting</CardTitle>
                </CardHeader>
                <CardContent>
                  <Dialog open={showFormatDialog} onOpenChange={setShowFormatDialog}>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Settings className="h-4 w-4 mr-2" />
                        Advanced Options
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Document Formatting</DialogTitle>
                        <DialogDescription>
                          Configure advanced formatting options
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-6 py-4">
                        {/* Font Settings */}
                        <div className="space-y-3">
                          <Label>Font Family</Label>
                          <Select
                            value={documentState.formatting.fontFamily}
                            onValueChange={(value) => updateDocumentFormatting('fontFamily', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Arial">Arial</SelectItem>
                              <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                              <SelectItem value="Calibri">Calibri</SelectItem>
                              <SelectItem value="Georgia">Georgia</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-3">
                          <Label>Font Size: {isNaN(documentState.formatting.fontSize) ? 12 : documentState.formatting.fontSize}pt</Label>
                          <Slider
                            value={[isNaN(documentState.formatting.fontSize) ? 12 : documentState.formatting.fontSize]}
                            onValueChange={(value) => updateDocumentFormatting('fontSize', value[0] || 12)}
                            min={8}
                            max={72}
                            step={1}
                          />
                        </div>

                        <div className="space-y-3">
                          <Label>Font Color</Label>
                          <Input
                            type="color"
                            value={documentState.formatting.fontColor}
                            onChange={(e) => updateDocumentFormatting('fontColor', e.target.value)}
                          />
                        </div>

                        {/* Margins */}
                        <div className="space-y-3">
                          <Label>Margins (inches)</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Top</Label>
                              <Input
                                type="number"
                                step="0.1"
                                value={isNaN(documentState.formatting.margins.top) ? "1" : documentState.formatting.margins.top.toString()}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  updateDocumentFormatting('margins', {
                                    ...documentState.formatting.margins,
                                    top: isNaN(value) ? 1 : value
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Bottom</Label>
                              <Input
                                type="number"
                                step="0.1"
                                value={isNaN(documentState.formatting.margins.bottom) ? "1" : documentState.formatting.margins.bottom.toString()}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  updateDocumentFormatting('margins', {
                                    ...documentState.formatting.margins,
                                    bottom: isNaN(value) ? 1 : value
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Left</Label>
                              <Input
                                type="number"
                                step="0.1"
                                value={isNaN(documentState.formatting.margins.left) ? "1" : documentState.formatting.margins.left.toString()}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  updateDocumentFormatting('margins', {
                                    ...documentState.formatting.margins,
                                    left: isNaN(value) ? 1 : value
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Right</Label>
                              <Input
                                type="number"
                                step="0.1"
                                value={isNaN(documentState.formatting.margins.right) ? "1" : documentState.formatting.margins.right.toString()}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  updateDocumentFormatting('margins', {
                                    ...documentState.formatting.margins,
                                    right: isNaN(value) ? 1 : value
                                  });
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Line Spacing */}
                        <div className="space-y-3">
                          <Label>Line Spacing: {isNaN(documentState.formatting.lineSpacing) ? 1.5 : documentState.formatting.lineSpacing}</Label>
                          <Slider
                            value={[isNaN(documentState.formatting.lineSpacing) ? 1.5 : documentState.formatting.lineSpacing]}
                            onValueChange={(value) => updateDocumentFormatting('lineSpacing', value[0] || 1.5)}
                            min={1}
                            max={3}
                            step={0.1}
                          />
                        </div>

                        {/* Page Numbers */}
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={documentState.formatting.pageNumbers}
                            onCheckedChange={(checked) => updateDocumentFormatting('pageNumbers', checked)}
                          />
                          <Label>Include Page Numbers</Label>
                        </div>

                        <Button onClick={applyFormatting} disabled={isEditing} className="w-full">
                          {isEditing ? 'Applying...' : 'Apply Formatting'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            )}

            {/* Download Options */}
            {documentState.id && (
              <Card>
                <CardHeader>
                  <CardTitle>Download</CardTitle>
                  <CardDescription>Export your formatted document</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    onClick={() => downloadDocument('docx')}
                    className="w-full"
                    variant="outline"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download as .docx
                  </Button>
                  <Button 
                    onClick={() => downloadDocument('pdf')}
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download as PDF
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Document Preview */}
          <div className="lg:col-span-2">
            <Card className="h-[600px]">
              <CardHeader>
                <CardTitle>Document Preview</CardTitle>
                <CardDescription>
                  {documentState.filename ? `Editing: ${documentState.filename}` : 'Upload a document to see preview'}
                </CardDescription>
              </CardHeader>
              <CardContent className="h-full">
                {documentState.id ? (
                  <div className="h-full overflow-auto bg-gray-100 p-4">
                                          <div
                        className="max-w-4xl mx-auto bg-white shadow-lg border rounded-lg min-h-[600px] relative"
                        style={{
                          fontFamily: documentState.formatting.fontFamily || 'Arial',
                          fontSize: `${isNaN(documentState.formatting.fontSize) ? 12 : documentState.formatting.fontSize}pt`,
                          color: documentState.formatting.fontColor || '#000000',
                          textAlign: documentState.formatting.alignment || 'left',
                          lineHeight: isNaN(documentState.formatting.lineSpacing) ? 1.5 : documentState.formatting.lineSpacing,
                          padding: `${isNaN(documentState.formatting.margins.top) ? 96 : documentState.formatting.margins.top * 96}px ${isNaN(documentState.formatting.margins.right) ? 96 : documentState.formatting.margins.right * 96}px ${isNaN(documentState.formatting.margins.bottom) ? 96 : documentState.formatting.margins.bottom * 96}px ${isNaN(documentState.formatting.margins.left) ? 96 : documentState.formatting.margins.left * 96}px`
                        }}
                      >
                      {/* Text Selection Toolbar */}
                      <div className="mb-4 p-2 bg-gray-50 rounded border-b flex items-center space-x-2">
                        <span className="text-xs text-muted-foreground">Select text and use formatting:</span>
                        <Button
                          variant={textFormatting.bold ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleTextFormat('bold')}
                        >
                          <Bold className="h-3 w-3" />
                        </Button>
                        <Button
                          variant={textFormatting.italic ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleTextFormat('italic')}
                        >
                          <Italic className="h-3 w-3" />
                        </Button>
                        <Button
                          variant={textFormatting.underline ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleTextFormat('underline')}
                        >
                          <Underline className="h-3 w-3" />
                        </Button>
                      </div>

                      <div
                        className="prose max-w-none"
                        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                        contentEditable={false}
                        onMouseUp={handleTextSelection}
                        onKeyUp={handleTextSelection}
                      >
                        {documentState.content.split('\n').map((paragraph, index) => {
                          const trimmedParagraph = paragraph.trim();
                          if (!trimmedParagraph) {
                            return <div key={index} className="h-4" />; // Empty line spacing
                          }

                          // Style headers differently
                          if (trimmedParagraph.match(/^[A-Z\s]+$/) && trimmedParagraph.length < 50) {
                            return (
                              <h2 key={index} className="text-lg font-bold mb-3 mt-6 first:mt-0 select-text">
                                {trimmedParagraph}
                              </h2>
                            );
                          }

                          // Style list items
                          if (trimmedParagraph.startsWith('•') || trimmedParagraph.startsWith('-')) {
                            return (
                              <div key={index} className="mb-1 pl-4 select-text">
                                {trimmedParagraph}
                              </div>
                            );
                          }

                          return (
                            <p key={index} className="mb-4 text-justify select-text">
                              {trimmedParagraph}
                            </p>
                          );
                        })}
                      </div>
                      {documentState.formatting.pageNumbers && (
                        <div className="absolute bottom-4 right-4 text-sm text-gray-500">
                          Page 1
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p>Upload a .docx file to start editing</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Edit Popup */}
        {showQuickEditPopup && selectedText && (
          <Dialog open={showQuickEditPopup} onOpenChange={setShowQuickEditPopup}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Format Selected Text</DialogTitle>
                <DialogDescription>
                  Selected: "{selectedText}"
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Text Formatting */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyTextFormatting('bold')}
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyTextFormatting('italic')}
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyTextFormatting('underline')}
                  >
                    <Underline className="h-4 w-4" />
                  </Button>
                </div>

                {/* Font Color */}
                <div className="space-y-2">
                  <Label>Text Color</Label>
                  <Input
                    type="color"
                    onChange={(e) => applyTextFormatting('color', e.target.value)}
                  />
                </div>

                {/* Font Size */}
                <div className="space-y-2">
                  <Label>Font Size</Label>
                  <Select onValueChange={(value) => applyTextFormatting('size', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12px">12px</SelectItem>
                      <SelectItem value="14px">14px</SelectItem>
                      <SelectItem value="16px">16px</SelectItem>
                      <SelectItem value="18px">18px</SelectItem>
                      <SelectItem value="20px">20px</SelectItem>
                      <SelectItem value="24px">24px</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowQuickEditPopup(false);
                      setSelectedText('');
                      setSelectionRange(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
