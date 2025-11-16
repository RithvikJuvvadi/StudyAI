import * as fs from 'fs';
import pdf from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { createCanvas } from 'canvas';
import PDFParser from 'pdf2json';

export interface Question {
  question: string;
  answer: string;
  topic: string;
  importance: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface ProcessResult {
  success: boolean;
  text?: string;
  questions?: Question[];
  error?: string;
  message: string;
  extractionMethod?: 'direct' | 'ocr' | 'hybrid';
}

/**
 * Clean and normalize extracted text
 */
function cleanText(text: string): string {
  return text
    // Remove null bytes and other control characters
    .replace(/\x00/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove excessive blank lines
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Remove leading/trailing whitespace
    .trim();
}

/**
 * Check if text is garbled or mostly unreadable
 */
function isTextGarbled(text: string): boolean {
  if (!text || text.length < 10) return true;
  
  // Check ratio of readable characters to total characters
  const readableChars = text.match(/[a-zA-Z0-9\s.,!?;:'"()-]/g) || [];
  const readableRatio = readableChars.length / text.length;
  
  // If less than 50% of characters are readable, consider it garbled
  if (readableRatio < 0.5) return true;
  
  // Check for excessive special characters or unicode replacement characters
  const specialChars = text.match(/[\uFFFD\u0000-\u001F]/g) || [];
  if (specialChars.length > text.length * 0.1) return true;
  
  return false;
}

/**
 * Extract text using OCR for scanned PDFs
 */
async function extractTextWithOCR(buffer: Buffer): Promise<string> {
  let worker;
  try {
    console.log('Using OCR to extract text from PDF...');
    
    // Initialize Tesseract worker
    worker = await createWorker('eng');
    
    // Polyfill DOMMatrix for Node.js environment (required by pdfjs-dist)
    if (typeof globalThis.DOMMatrix === 'undefined') {
      globalThis.DOMMatrix = class DOMMatrix {
        constructor(init?: any) {
          this.a = init?.a ?? 1;
          this.b = init?.b ?? 0;
          this.c = init?.c ?? 0;
          this.d = init?.d ?? 1;
          this.e = init?.e ?? 0;
          this.f = init?.f ?? 0;
        }
        a: number = 1;
        b: number = 0;
        c: number = 0;
        d: number = 1;
        e: number = 0;
        f: number = 0;
        multiply(other: any) { return this; }
        translate(x: number, y: number) { return this; }
        scale(x: number, y?: number) { return this; }
        rotate(angle: number) { return this; }
      } as any;
    }
    
    // Dynamically import pdfjs-dist legacy build for Node.js compatibility
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    // Convert Buffer to Uint8Array (required by pdfjs-dist)
    const uint8Array = new Uint8Array(buffer);
    
    // Load PDF with pdf.js - add error handling for corrupted PDFs
    let pdfDoc;
    try {
      const loadingTask = pdfjsLib.getDocument({ 
        data: uint8Array,
        verbosity: 0, // Suppress warnings
        stopAtErrors: false, // Continue even with errors
        maxImageSize: 1024 * 1024 * 10, // 10MB max image size
      });
      pdfDoc = await loadingTask.promise;
    } catch (pdfError: any) {
      // If PDF is too corrupted, skip OCR
      if (pdfError.name === 'InvalidPDFException' || pdfError.message?.includes('Invalid PDF')) {
        throw new Error('PDF structure too corrupted for OCR processing');
      }
      throw pdfError;
    }
    
    let fullText = '';
    const numPages = Math.min(pdfDoc.numPages, 10); // Limit to first 10 pages for performance
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        console.log(`Processing page ${pageNum} of ${numPages} with OCR...`);
        const page = await pdfDoc.getPage(pageNum);
        
        // Render page to canvas
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        
        const renderContext: any = {
          canvasContext: context,
          viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // Convert canvas to image buffer
        const imageBuffer = canvas.toBuffer('image/png');
        
        // Perform OCR on the image
        const { data: { text } } = await worker.recognize(imageBuffer);
        if (text && text.trim().length > 0) {
          fullText += text + '\n\n';
        }
      } catch (pageError: any) {
        console.warn(`Failed to process page ${pageNum} with OCR:`, pageError?.message || pageError);
        // Continue with next page instead of failing completely
        continue;
      }
    }
    
    await worker.terminate();
    
    if (fullText.trim().length === 0) {
      throw new Error('OCR did not extract any text from PDF pages');
    }
    
    return cleanText(fullText);
  } catch (error: any) {
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        // Ignore termination errors
      }
    }
    console.error('Error extracting text with OCR:', error?.message || error);
    throw new Error(`Failed to extract text using OCR: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Extract text using pdf2json as an alternative method
 */
async function extractTextWithPDF2JSON(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const pdfParser = new PDFParser(null, 1);
      let extractedText = '';

      pdfParser.on('pdfParser_dataError', (errData: any) => {
        console.warn('PDF2JSON parsing error:', errData.parserError);
        reject(new Error('PDF2JSON parsing failed'));
      });

      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          // Extract text from all pages
          if (pdfData.Pages) {
            for (const page of pdfData.Pages) {
              if (page.Texts) {
                for (const textObj of page.Texts) {
                  if (textObj.R) {
                    for (const run of textObj.R) {
                      if (run.T) {
                        // Decode URI-encoded text
                        try {
                          extractedText += decodeURIComponent(run.T) + ' ';
                        } catch {
                          extractedText += run.T + ' ';
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          resolve(cleanText(extractedText));
        } catch (error) {
          reject(error);
        }
      });

      pdfParser.parseBuffer(buffer);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Extract readable text directly from buffer (fallback method)
 * This method tries to find readable ASCII text in the PDF buffer
 */
function extractTextFromBuffer(buffer: Buffer): string {
  try {
    // Try to find text streams in the PDF
    // PDF text is often in streams or between parentheses
    const bufferString = buffer.toString('latin1', 0, Math.min(buffer.length, 500000)); // Use latin1 to preserve bytes
    
    let extracted = '';
    
    // Method 1: Extract text from PDF text objects (text between parentheses)
    // PDF text objects look like: (Hello World) Tj or (Text) Tj
    const textObjectMatches = bufferString.match(/\(([^)]{3,200})\)/g) || [];
    const textObjects: string[] = [];
    
    for (const match of textObjectMatches) {
      const text = match.slice(1, -1); // Remove parentheses
      // Check if it's mostly readable ASCII
      const asciiCount = (text.match(/[\x20-\x7E]/g) || []).length;
      if (asciiCount / text.length > 0.7 && text.length > 3) {
        // Decode PDF escape sequences
        const decoded = text
          .replace(/\\([0-7]{1,3})/g, (m, octal) => String.fromCharCode(parseInt(octal, 8)))
          .replace(/\\n/g, ' ')
          .replace(/\\r/g, ' ')
          .replace(/\\t/g, ' ')
          .replace(/\\\\/g, '\\')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')');
        
        if (decoded.trim().length > 0) {
          textObjects.push(decoded.trim());
        }
      }
    }
    
    if (textObjects.length > 0) {
      extracted = textObjects.join(' ');
      console.log(`Extracted ${textObjects.length} text objects from PDF buffer`);
    }
    
    // Method 2: Find readable ASCII sequences (fallback)
    if (extracted.length < 50) {
      // Look for sequences of printable ASCII characters
      const asciiSequences = bufferString.match(/[\x20-\x7E]{10,}/g) || [];
      const readableSequences = asciiSequences.filter(seq => {
        // Must be mostly letters/numbers, not just symbols
        const letterCount = (seq.match(/[a-zA-Z0-9]/g) || []).length;
        return letterCount / seq.length > 0.5 && seq.length > 10;
      });
      
      if (readableSequences.length > 0) {
        // Filter out PDF commands and artifacts
        const filtered = readableSequences.filter(seq => {
          return !seq.match(/^(obj|endobj|stream|endstream|xref|trailer|startxref|PDF|Type|Pages|Kids|Count|MediaBox|Font|Subtype|BaseFont|Encoding|Width|Height|Length|Filter|FlateDecode|BT|ET|Td|Tj|TJ|Tm|Tf|rg|RG|cm|q|Q|re|m|l|c|v|y|h|S|s|f|F|n|W|w|J|j|M|d|ri|i|gs|Do|BI|ID|EI|DP|MP|BMC|EMC|BX|EX|CS|cs|G|g|K|k)$/i) &&
                 !seq.match(/^\d+\.\d+/) && // Not just numbers
                 !seq.match(/^\/[A-Za-z]+/) && // Not PDF commands
                 seq.length > 15; // Minimum length
        });
        
        if (filtered.length > 0) {
          extracted = filtered.slice(0, 100).join(' '); // Limit to 100 sequences
          console.log(`Extracted ${filtered.length} readable ASCII sequences from PDF buffer`);
        }
      }
    }
    
    // Clean up the extracted text
    const cleaned = cleanText(extracted);
    
    // Final validation - must have substantial readable content
    if (cleaned.length > 0) {
      const readableRatio = (cleaned.match(/[a-zA-Z0-9\s.,!?;:'"()-]/g) || []).length / cleaned.length;
      if (readableRatio < 0.6) {
        console.warn('Buffer extraction produced mostly unreadable text, discarding');
        return '';
      }
    }
    
    return cleaned;
  } catch (error) {
    console.warn('Buffer text extraction failed:', error);
    return '';
  }
}

/**
 * Extracts text from a PDF buffer with multiple fallback methods
 */
async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; method: string }> {
  const results: Array<{ text: string; method: string; length: number }> = [];
  
  // Method 1: Try pdf-parse (direct extraction)
  try {
    console.log('Method 1: Attempting direct text extraction with pdf-parse...');
    const data = await pdf(buffer, {
      max: 0,
      version: 'v2.0.550'
    });
    const directText = cleanText(data.text);
    
    if (directText.length > 100 && !isTextGarbled(directText)) {
      console.log(`✓ Successfully extracted ${directText.length} characters using pdf-parse`);
      return { text: directText, method: 'pdf-parse' };
    }
    if (directText.length > 50) {
      results.push({ text: directText, method: 'pdf-parse', length: directText.length });
    }
  } catch (error: any) {
    console.warn('Method 1 (pdf-parse) failed:', error?.message || error);
  }

  // Method 2: Try pdf2json (alternative parser)
  try {
    console.log('Method 2: Attempting extraction with pdf2json...');
    const pdf2jsonText = await extractTextWithPDF2JSON(buffer);
    
    if (pdf2jsonText.length > 100 && !isTextGarbled(pdf2jsonText)) {
      console.log(`✓ Successfully extracted ${pdf2jsonText.length} characters using pdf2json`);
      return { text: pdf2jsonText, method: 'pdf2json' };
    }
    if (pdf2jsonText.length > 50) {
      results.push({ text: pdf2jsonText, method: 'pdf2json', length: pdf2jsonText.length });
    }
  } catch (error: any) {
    console.warn('Method 2 (pdf2json) failed:', error?.message || error);
  }

  // Method 3: Try OCR (for scanned PDFs)
  try {
    console.log('Method 3: Attempting OCR extraction...');
    const ocrText = await extractTextWithOCR(buffer);
    
    if (ocrText.length > 100 && !isTextGarbled(ocrText)) {
      console.log(`✓ Successfully extracted ${ocrText.length} characters using OCR`);
      return { text: ocrText, method: 'ocr' };
    }
    if (ocrText.length > 50) {
      results.push({ text: ocrText, method: 'ocr', length: ocrText.length });
    }
  } catch (error: any) {
    console.warn('Method 3 (OCR) failed:', error?.message || error);
  }

  // Method 4: Extract readable text from buffer directly (last resort)
  try {
    console.log('Method 4: Attempting buffer text extraction...');
    const bufferText = extractTextFromBuffer(buffer);
    
    if (bufferText.length > 50) {
      results.push({ text: bufferText, method: 'buffer-extraction', length: bufferText.length });
    }
  } catch (error: any) {
    console.warn('Method 4 (buffer extraction) failed:', error?.message || error);
  }

  // Return the best result if any method produced text
  if (results.length > 0) {
    results.sort((a, b) => b.length - a.length); // Sort by length, longest first
    
    // Validate that the best result is actually readable
    for (const result of results) {
      const readableRatio = (result.text.match(/[a-zA-Z0-9\s.,!?;:'"()-]/g) || []).length / result.text.length;
      if (readableRatio >= 0.6 && result.text.length >= 50) {
        console.log(`Using best result: ${result.method} with ${result.length} characters (readable ratio: ${(readableRatio * 100).toFixed(1)}%)`);
        return { text: result.text, method: result.method };
      }
    }
    
    // If no result is readable enough, log warning but return the best one anyway
    const best = results[0];
    const readableRatio = (best.text.match(/[a-zA-Z0-9\s.,!?;:'"()-]/g) || []).length / best.text.length;
    console.warn(`Best result has low readability (${(readableRatio * 100).toFixed(1)}%), but returning it anyway: ${best.method} with ${best.length} characters`);
    
    // Only return if it has some readable content
    if (readableRatio >= 0.3 && best.text.length >= 30) {
      return { text: best.text, method: best.method };
    }
  }

  // If all methods failed or produced unreadable text, throw error
  throw new Error('Failed to extract readable text from PDF using all available methods (pdf-parse, pdf2json, OCR, buffer extraction). The PDF may be corrupted, encrypted, or contain only images/scanned content that requires advanced OCR processing.');
}

/**
 * Generates questions from text using the GROQ API
 */
async function generateQuestionsWithLLM(text: string): Promise<Question[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set in environment variables');
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // Updated to current model
        messages: [{
          role: 'system',
          content: `You are an expert at generating educational questions. 
                  Generate 5-10 important questions based on the provided text. 
                  Format the response as a JSON array of objects with these fields:
                  - question: string
                  - answer: string
                  - topic: string
                  - importance: 'high' | 'medium' | 'low'
                  - difficulty: 'easy' | 'medium' | 'hard'`
        }, {
          role: 'user',
          content: `Generate questions from this text (focus on extracting actual questions from the content rather than generating new ones):\n\n${text.substring(0, 8000)}`
        }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in LLM response');
    }

    // Parse the JSON response
    return JSON.parse(content);
  } catch (error) {
    console.error('Error generating questions with LLM:', error);
    throw new Error('Failed to generate questions with LLM');
  }
}

/**
 * Main function to process a PDF and generate questions
 */
export async function processPDF(filePath: string): Promise<ProcessResult> {
  try {
    // 1. Read the PDF file
    console.log(`Reading PDF file: ${filePath}`);
    const pdfBuffer = fs.readFileSync(filePath);
    
    // 2. Extract text with improved method
    console.log('Extracting text from PDF...');
    const { text, method } = await extractTextFromPDF(pdfBuffer);
    
    if (!text.trim()) {
      throw new Error('No text could be extracted from the PDF. The file may be empty or corrupted.');
    }
    
    if (text.length < 50) {
      throw new Error('Insufficient text extracted from PDF. The file may contain mostly images or be unreadable.');
    }
    
    console.log(`Extracted ${text.length} characters of text using ${method} method`);
    
    // 3. Generate questions
    console.log('Generating questions with LLM...');
    const questions = await generateQuestionsWithLLM(text);
    
    return {
      success: true,
      text: text.substring(0, 1000) + (text.length > 1000 ? '...' : ''), // Return first 1000 chars as preview
      questions,
      extractionMethod: method as 'direct' | 'ocr' | 'hybrid',
      message: `Successfully processed PDF using ${method} extraction and generated ${questions.length} questions`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing PDF:', errorMessage);
    return {
      success: false,
      error: errorMessage,
      message: 'Failed to process PDF. ' + errorMessage
    };
  }
}

