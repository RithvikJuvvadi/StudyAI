import "dotenv/config";
import { RequestHandler } from "express";
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import PDFDocument from "pdfkit";
import { 
  GenerateQuestionsResponse, 
  UploadFromGoogleDriveRequest,
  UploadFromGoogleDriveResponse,
  AnalyzePapersRequest,
  AnalyzePapersResponse,
  GetUploadedPapersResponse,
  RemovePaperRequest,
  RemovePaperResponse
} from "@shared/api";

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Save file to disk and return the file ID
// Content can be base64 string (for binary files) or plain text
const saveFile = (content: string, isBase64: boolean = true): string => {
  const fileId = uuidv4();
  const filePath = path.join(UPLOAD_DIR, fileId);
  
  if (isBase64) {
    // Decode base64 and save as binary
    const buffer = Buffer.from(content, 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log(`Saved binary file: ${filePath} (${buffer.length} bytes)`);
  } else {
    // Save as text
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Saved text file: ${filePath}`);
  }
  
  return fileId;
};

// AI Integration - Hugging Face Transformers (FREE!)
interface HuggingFaceResponse {
  generated_text?: string;
  error?: string;
}

// Enhanced in-memory storage for demo
interface UploadedPaper {
  id: string;
  filename: string;
  content: string;
  uploadedAt: Date;
  source: 'local' | 'google-drive';
  topics?: string[];
  questionCount?: number;
  filePath?: string; // Path to the actual file on disk
}

interface GeneratedQuestions {
  id: string;
  questions: Array<{
    question: string;
    answer: string;
    importance: 'high' | 'medium' | 'low';
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    confidence: number;
  }>;
  generatedAt: Date;
  analysis?: {
    totalQuestions: number;
    topics: Array<{
      name: string;
      frequency: number;
      importance: 'high' | 'medium' | 'low';
    }>;
  };
}

const uploadedPapers: UploadedPaper[] = [];
const generatedQuestions: GeneratedQuestions[] = [];
let paperIdCounter = 1;
let questionsIdCounter = 1;

// Groq API Configuration
interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: string;
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Updated to current model

// Function to call Groq API for question extraction
const extractQuestionsWithGroq = async (content: string, filename: string): Promise<Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}>> => {
  try {
    const prompt = `Extract important questions and answers from this document content.

CRITICAL INSTRUCTIONS FOR ANSWER GENERATION:
1. Generate comprehensive, detailed answers based on the document content
2. ANSWER LENGTH IS MANDATORY - Answer length MUST be proportional to question importance:
   - HIGH importance questions: Generate 2-3 detailed paragraphs (comprehensive, thorough explanation covering all aspects)
   - MEDIUM importance questions: Generate 1-2 paragraphs (moderate detail, well-explained)
   - LOW importance questions: Generate 1 paragraph (concise but complete answer)
3. For multiple choice questions: Provide the correct option AND a detailed explanation spanning 1-3 paragraphs based on importance
4. For open-ended questions: Provide thorough explanations spanning the appropriate number of paragraphs (1-3 based on importance)
5. Answers should be well-structured, informative, and based on the document content
6. NEVER use "Answer not provided" - always generate a comprehensive answer based on the document
7. IMPORTANT: Each paragraph should be substantial (3-5 sentences minimum). Do NOT create single-sentence paragraphs.

Return a JSON array of objects with these fields:
- question: string (complete question with all options if present)
- answer: string (GENERATED comprehensive answer - 1 to 3 paragraphs based on importance, NEVER "Answer not provided")
- importance: "high" | "medium" | "low" (determines answer length)
- topic: string
- difficulty: "easy" | "medium" | "hard"
- confidence: number (0-1)

Return ONLY valid JSON array, no markdown, no explanations.

Document content:
${content}`;

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at extracting and generating educational questions from documents. ' +
                     'Focus on extracting actual questions from the content rather than generating new ones. ' +
                     'For each question, generate comprehensive answers that are 1-3 paragraphs long based on the question importance: ' +
                     'HIGH importance = 2-3 paragraphs, MEDIUM = 1-2 paragraphs, LOW = 1 paragraph. ' +
                     'Answers must be detailed, well-structured, and based on the document content. ' +
                     'Never use "Answer not provided" - always generate a complete answer.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 8000, // Increased to allow for longer, more detailed answers (1-3 paragraphs)
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Groq API error:', errorData);
      throw new Error(`Groq API error: ${errorData?.error?.message || 'Unknown error'}`);
    }

    const data: GroqResponse = await response.json();
    
    if (data.error) {
      throw new Error(`Groq API error: ${data.error}`);
    }

    // Parse the response content
    const responseContent = data.choices[0]?.message?.content;
    if (!responseContent) {
      console.error('Groq API response structure:', JSON.stringify(data, null, 2));
      throw new Error('No content in Groq API response');
    }

    console.log(`Groq API response length: ${responseContent.length} characters`);
    console.log(`Groq API response preview: ${responseContent.substring(0, 200)}`);

    // Try to parse the JSON response
    try {
      // Remove any markdown code blocks
      let jsonString = responseContent.trim();
      
      // Remove markdown code blocks if present
      if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      
      // Try to find JSON array in the response
      const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
      
      console.log(`Parsing JSON, length: ${jsonString.length}`);
      const parsed = JSON.parse(jsonString);
      
      // Validate it's an array
      if (!Array.isArray(parsed)) {
        console.error('Groq returned non-array:', typeof parsed);
        throw new Error('Expected an array of questions');
      }

      // Map and filter questions - be lenient, accept questions even without answers
      const questions = parsed
        .map((q: any) => ({
          question: String(q.question || q.Question || '').trim(),
          answer: String(q.answer || q.Answer || q.solution || 'Answer not provided in document').trim(),
          importance: ['high', 'medium', 'low'].includes(String(q.importance || q.Importance || 'medium').toLowerCase()) 
            ? String(q.importance || q.Importance || 'medium').toLowerCase() as 'high' | 'medium' | 'low' 
            : 'medium',
          topic: String(q.topic || q.Topic || detectTopicFromFilename(filename) || 'General'),
          difficulty: ['easy', 'medium', 'hard'].includes(String(q.difficulty || q.Difficulty || 'medium').toLowerCase())
            ? String(q.difficulty || q.Difficulty || 'medium').toLowerCase() as 'easy' | 'medium' | 'hard'
            : 'medium',
          confidence: Math.min(Math.max(Number(q.confidence || q.Confidence || 0.8), 0), 1)
        }))
        .filter((q: any) => q.question && q.question.length > 10); // Only filter by question length, accept even without answer
      
      console.log(`Parsed ${questions.length} questions from Groq response`);
      return questions;

    } catch (parseError) {
      console.error('Error parsing Groq API response:', parseError);
      throw new Error('Failed to parse questions from Groq API response');
    }
  } catch (error) {
    console.error('Groq API call failed:', error);
    throw error; // Re-throw to allow fallback to other methods
  }
};

// AI-powered question analysis that extracts and ranks actual questions from uploaded papers
const analyzePapersWithAI = async (papers: UploadedPaper[]): Promise<Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}>> => {
  const questions: Array<{
    question: string;
    answer: string;
    importance: 'high' | 'medium' | 'low';
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    confidence: number;
  }> = [];

  if (papers.length === 0) {
    return questions;
  }

  // Extract only actual questions from uploaded documents using AI
  for (const paper of papers) {
    console.log(`Processing paper: ${paper.filename}, content length: ${paper.content.length}`);
    console.log(`Content preview: ${paper.content.substring(0, 300)}`);
    
    const extractedQuestions = await extractActualQuestionsFromDocument(paper);
    console.log(`Extracted ${extractedQuestions.length} questions from ${paper.filename}`);
    questions.push(...extractedQuestions);
  }

  // Filter and rank by importance using AI-like scoring
  const importantQuestions = selectImportantQuestions(questions);
  
  return importantQuestions.sort((a, b) => {
    const importanceOrder = { high: 3, medium: 2, low: 1 };
    const importanceDiff = importanceOrder[b.importance] - importanceOrder[a.importance];
    if (importanceDiff !== 0) return importanceDiff;
    return b.confidence - a.confidence;
  });
};

/**
 * SIMPLE TEXT EXTRACTION: Use best library for each file type
 */
async function extractTextFromFile(filePath: string, filename: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  
  console.log(`Extracting text from ${ext} file: ${filename}`);
  
  try {
    if (ext === '.pdf') {
      // Use pdf-parse - simple and reliable
      const data = await pdf(buffer);
      return data.text || '';
    } else if (ext === '.docx' || ext === '.doc') {
      // Use mammoth for DOCX files
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } else if (ext === '.txt') {
      // Plain text file
      return buffer.toString('utf-8');
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (error: any) {
    console.error(`Error extracting text from ${ext} file:`, error?.message);
    throw new Error(`Failed to extract text: ${error?.message}`);
  }
}

/**
 * SIMPLE FLOW: Extract text → Chunk if needed → Send to AI → Get questions
 */
const extractActualQuestionsFromDocument = async (paper: UploadedPaper): Promise<Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}>> => {
  console.log(`\n=== Processing: ${paper.filename} ===`);
  
  // Step 1: Read file from disk
  if (!paper.filePath || !fs.existsSync(paper.filePath)) {
    throw new Error(`File not found: ${paper.filePath}`);
  }
  
  console.log(`Reading file: ${paper.filePath}`);
  const fileSize = fs.statSync(paper.filePath).size;
  console.log(`File size: ${fileSize} bytes`);
  
  // Step 2: Extract text using appropriate library
  let extractedText = '';
  try {
    extractedText = await extractTextFromFile(paper.filePath, paper.filename);
    console.log(`✓ Extracted ${extractedText.length} characters of text`);
  } catch (error: any) {
    throw new Error(`Failed to extract text: ${error?.message}`);
  }
  
  if (!extractedText || extractedText.trim().length < 50) {
    throw new Error('Insufficient text extracted from file');
  }
  
  // Step 3: Simple cleanup
  const cleanText = extractedText
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{3,}/g, ' ')
    .trim();
  
  console.log(`Cleaned text: ${cleanText.length} characters`);
  console.log(`Preview: ${cleanText.substring(0, 200)}...`);
  
  // Step 4: Chunk text if too large (Groq limit is ~12k tokens, roughly 8k chars)
  const MAX_CHUNK_SIZE = 8000; // Safe limit for Groq
  const chunks: string[] = [];
  
  if (cleanText.length > MAX_CHUNK_SIZE) {
    console.log(`Text too large (${cleanText.length} chars), chunking...`);
    for (let i = 0; i < cleanText.length; i += MAX_CHUNK_SIZE) {
      chunks.push(cleanText.substring(i, i + MAX_CHUNK_SIZE));
    }
    console.log(`Split into ${chunks.length} chunks`);
  } else {
    chunks.push(cleanText);
  }
  
  // Step 5: Process each chunk and combine questions
  const allQuestions: Array<{
    question: string;
    answer: string;
    importance: 'high' | 'medium' | 'low';
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    confidence: number;
  }> = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
    try {
      const questions = await extractQuestionsWithGroq(chunks[i], paper.filename);
      if (questions && questions.length > 0) {
        allQuestions.push(...questions);
        console.log(`✓ Got ${questions.length} questions from chunk ${i + 1}`);
      }
    } catch (error: any) {
      console.error(`Error processing chunk ${i + 1}:`, error?.message);
      // Continue with next chunk
    }
  }
  
  if (allQuestions.length === 0) {
    throw new Error('No questions generated by AI');
  }
  
  console.log(`✓ Total: ${allQuestions.length} questions generated`);
  return allQuestions;
};

// This function is no longer used - kept for backward compatibility
const analyzeDocumentWithAI = async (content: string, filename: string): Promise<Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}>> => {
  // Just call Groq directly with the content
  return await extractQuestionsWithGroq(content, filename);
};

// AI-like function to select only the most important questions
const selectImportantQuestions = (allQuestions: Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}>): Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}> => {
  
  // Filter out low-quality questions
  const qualityQuestions = allQuestions.filter(q => 
    q.confidence > 0.6 && 
    q.question.length > 20 && 
    q.answer.length > 30 &&
    !q.question.includes('What is the main concept') &&
    !q.question.includes('What does this statement mean')
  );

  // Prioritize high importance questions
  const highImportance = qualityQuestions.filter(q => q.importance === 'high');
  const mediumImportance = qualityQuestions.filter(q => q.importance === 'medium');
  
  // Select top questions from each category (increased limits)
  const selectedQuestions = [
    ...highImportance.slice(0, 15), // Top 15 high importance
    ...mediumImportance.slice(0, 10) // Top 10 medium importance
  ];

  console.log(`Selected ${selectedQuestions.length} important questions from ${allQuestions.length} total`);
  return selectedQuestions;
};

// Extract readable text from garbled PDF content
const extractReadableTextFromGarbled = (content: string): string => {
  console.log('Extracting readable text from garbled content...');
  
  // First, look for actual readable English words and sentences
  const readableSequences = [];
  
  // Split content into chunks and filter for readable text
  const chunks = content.split(/[\s\n\r]+/);
  
  for (const chunk of chunks) {
    // Only keep chunks that are mostly letters and common punctuation
    const letterCount = (chunk.match(/[a-zA-Z]/g) || []).length;
    const totalLength = chunk.length;
    
    // Must be at least 70% letters and 3+ characters long
    if (letterCount >= totalLength * 0.7 && totalLength >= 3) {
      // Additional filter: must not contain too many special symbols
      const symbolCount = (chunk.match(/[^\w\s.,!?;:()\-]/g) || []).length;
      if (symbolCount < totalLength * 0.3) {
        readableSequences.push(chunk);
      }
    }
  }
  
  let extractedText = readableSequences.join(' ');
  
  // If no readable sequences found, try to find question-like patterns
  if (extractedText.length < 20) {
    console.log('No readable sequences found, looking for question patterns...');
    
    // Look for patterns that might be questions even if garbled
    const questionPatterns = [
      /(?:What|How|Why|When|Where|Which|Define|Explain|Calculate|Find|Determine|Solve|Show|Prove|State|List|Name|Describe|Compare|Analyze)\s+[a-zA-Z\s]{5,50}\?/gi,
      /Q\d+[:.]\s*[a-zA-Z\s]{10,100}/gi,
      /\d+[:.]\s*[a-zA-Z\s]{10,100}/gi
    ];
    
    for (const pattern of questionPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        extractedText += matches.join(' ') + ' ';
      }
    }
  }
  
  // Final cleanup - remove any remaining symbols
  extractedText = extractedText
    .replace(/[^\w\s.,!?;:()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log(`Extracted ${extractedText.length} characters of readable text`);
  console.log(`Readable text sample: "${extractedText.substring(0, 200)}"`);
  
  return extractedText;
};

// Extract questions from readable text using strict validation
const extractQuestionsFromReadableText = (text: string, filename: string): Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}> => {
  const questions: Array<{
    question: string;
    answer: string;
    importance: 'high' | 'medium' | 'low';
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    confidence: number;
  }> = [];
  
  const topic = detectTopicFromFilename(filename);
  
  // Only extract if text contains actual readable English
  const englishWordCount = (text.match(/\b[a-zA-Z]{3,}\b/g) || []).length;
  const totalWords = text.split(/\s+/).length;
  
  console.log(`Text analysis: ${englishWordCount} English words out of ${totalWords} total`);
  
  // Require at least 50% English words
  if (englishWordCount < totalWords * 0.5) {
    console.log('Text does not contain enough readable English - rejecting extraction');
    return questions;
  }
  
  // Very strict question patterns - must be proper English
  const questionPatterns = [
    // Complete questions with proper English words
    /(?:What|How|Why|When|Where|Which|Define|Explain|Calculate|Find|Determine|Solve|Show|Prove|State|List|Name|Describe|Compare|Analyze)\s+(?:[a-zA-Z]+\s+){2,10}[a-zA-Z]+\?/gi,
    // Numbered questions with proper English
    /(?:Q\d+[:.]\s*|^\d+[:.]\s*)(?:[A-Z][a-zA-Z]+\s+){3,15}[a-zA-Z]+\?/gm
  ];
  
  for (const pattern of questionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const questionText = match[0];
      
      // Validate question quality
      const words = questionText.split(/\s+/);
      const validWords = words.filter(word => /^[a-zA-Z]{2,}$/.test(word));
      
      // Must be at least 80% valid English words
      if (validWords.length >= words.length * 0.8 && validWords.length >= 4) {
        const cleanQuestion = questionText
          .replace(/^Q\d+[:.]\s*/i, '')
          .replace(/^\d+[:.]\s*/, '')
          .trim();
        
        // Final validation - must be a proper question
        if (cleanQuestion.length > 15 && cleanQuestion.includes('?') && 
            /^[A-Z]/.test(cleanQuestion) && !/[^\w\s.,!?;:()\-]/.test(cleanQuestion)) {
          
          questions.push({
            question: cleanQuestion,
            answer: generateBasicAnswer(cleanQuestion, topic),
            importance: analyzeQuestionImportanceFromText(cleanQuestion),
            topic: topic,
            difficulty: analyzeQuestionDifficultyFromText(cleanQuestion),
            confidence: 0.9 // Very high confidence for validated questions
          });
        }
      }
    }
  }
  
  // Remove duplicates
  const uniqueQuestions = questions.filter((q, index, arr) => 
    arr.findIndex(other => other.question.toLowerCase() === q.question.toLowerCase()) === index
  );
  
  console.log(`Strict validation found ${uniqueQuestions.length} valid English questions`);
  return uniqueQuestions.slice(0, 10);
};

// Smart extraction from AI response when JSON parsing fails - handles question papers WITHOUT answers
const extractQuestionsFromAIResponse = (aiText: string, filename: string): Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}> => {
  const questions: Array<{
    question: string;
    answer: string;
    importance: 'high' | 'medium' | 'low';
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    confidence: number;
  }> = [];

  // Extract questions from AI response (even if no answers provided)
  const lines = aiText.split('\n').filter(line => line.trim());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect questions (more flexible patterns)
    if (line.match(/^(What|How|Why|When|Where|Which|Define|Explain|Calculate|Find|Determine|Solve|Prove|Show)/i) || 
        line.includes('?') || 
        line.match(/^\d+[\.)]\s/)) {
      
      const cleanQuestion = line.replace(/^(Q\d+[:.]\s*|\d+[\.)]\s*)/i, '');
      
      if (cleanQuestion.length > 10) { // Valid question
        questions.push({
          question: cleanQuestion,
          answer: generateBasicAnswer(cleanQuestion, detectTopicFromFilename(filename)),
          importance: analyzeQuestionImportanceFromText(cleanQuestion),
          topic: detectTopicFromFilename(filename),
          difficulty: analyzeQuestionDifficultyFromText(cleanQuestion),
          confidence: 0.8
        });
      }
    }
  }

  console.log(`Smart extraction found ${questions.length} questions from document`);
  return questions.slice(0, 15); // Return up to 15 questions
};

// Generate basic answers for questions when not provided
const generateBasicAnswer = (question: string, topic: string): string => {
  const questionLower = question.toLowerCase();
  
  // Math/Science questions
  if (topic === 'Mathematics' || topic === 'Physics' || topic === 'Chemistry') {
    if (questionLower.includes('calculate') || questionLower.includes('find') || questionLower.includes('solve')) {
      return `This is a calculation problem in ${topic}. Follow the given formula and substitute the values to find the solution.`;
    }
    if (questionLower.includes('prove') || questionLower.includes('show')) {
      return `This requires a step-by-step proof using relevant theorems and principles in ${topic}.`;
    }
    if (questionLower.includes('define') || questionLower.includes('what is')) {
      return `This asks for the definition and explanation of a key concept in ${topic}.`;
    }
  }
  
  // General questions
  if (questionLower.includes('explain') || questionLower.includes('describe')) {
    return `This question requires a detailed explanation of the concept with examples and key points.`;
  }
  if (questionLower.includes('compare') || questionLower.includes('difference')) {
    return `This question asks you to compare and contrast different concepts, highlighting similarities and differences.`;
  }
  if (questionLower.includes('why') || questionLower.includes('reason')) {
    return `This question requires you to provide reasons and explanations for the given phenomenon or concept.`;
  }
  
  return `This question requires understanding of ${topic} concepts. Provide a comprehensive answer with relevant details and examples.`;
};

// Analyze question importance from text
const analyzeQuestionImportanceFromText = (question: string): 'high' | 'medium' | 'low' => {
  const questionLower = question.toLowerCase();
  
  // High importance indicators
  if (questionLower.includes('important') || questionLower.includes('main') || 
      questionLower.includes('key') || questionLower.includes('fundamental') ||
      questionLower.includes('define') || questionLower.includes('what is')) {
    return 'high';
  }
  
  // Low importance indicators
  if (questionLower.includes('example') || questionLower.includes('list') ||
      questionLower.includes('name') || question.length < 20) {
    return 'low';
  }
  
  return 'medium';
};

// Analyze question difficulty from text
const analyzeQuestionDifficultyFromText = (question: string): 'easy' | 'medium' | 'hard' => {
  const questionLower = question.toLowerCase();
  
  // Hard difficulty indicators
  if (questionLower.includes('prove') || questionLower.includes('derive') ||
      questionLower.includes('analyze') || questionLower.includes('evaluate') ||
      questionLower.includes('complex') || questionLower.includes('advanced')) {
    return 'hard';
  }
  
  // Easy difficulty indicators
  if (questionLower.includes('define') || questionLower.includes('list') ||
      questionLower.includes('name') || questionLower.includes('what is') ||
      question.length < 30) {
    return 'easy';
  }
  
  return 'medium';
};

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

// Decode UTF-16 encoded text from PDF
const decodeUTF16 = (text: string): string => {
  try {
    // Handle UTF-16 BE encoding (common in PDFs)
    if (text.startsWith('\xFE\xFF') || text.includes('\x00')) {
      let decoded = '';
      for (let i = 0; i < text.length; i += 2) {
        const charCode = (text.charCodeAt(i) << 8) | text.charCodeAt(i + 1);
        if (charCode > 31 && charCode < 127) { // Printable ASCII
          decoded += String.fromCharCode(charCode);
        }
      }
      return decoded;
    }
    
    // Handle regular text with escape sequences
    return text
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\\/g, '\\')
      .replace(/\\([0-7]{3})/g, (match, octal) => String.fromCharCode(parseInt(octal, 8)))
      .replace(/[^\x20-\x7E]/g, ' ') // Remove non-printable characters
      .trim();
  } catch (error) {
    return text.replace(/[^\x20-\x7E]/g, ' ').trim();
  }
};

// Extract questions from content when no answers are provided (typical exam papers)
const extractQuestionsFromContentOnly = (content: string, filename: string): Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}> => {
  const questions: Array<{
    question: string;
    answer: string;
    importance: 'high' | 'medium' | 'low';
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    confidence: number;
  }> = [];

  const lines = content.split('\n').filter(line => line.trim());
  const topic = detectTopicFromFilename(filename);

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Enhanced question detection patterns
    if (
      // Numbered questions: 1. 2. Q1. Q2.
      trimmedLine.match(/^\d+[\.)]\s+.{10,}/) ||
      trimmedLine.match(/^Q\d+[\.)]\s+.{10,}/i) ||
      // Question words
      trimmedLine.match(/^(What|How|Why|When|Where|Which|Who|Can|Could|Would|Should|Is|Are|Do|Does|Did|Will|Shall)\s/i) || // Question words
      // Contains question mark
      (trimmedLine.includes('?') && trimmedLine.length > 15) ||
      // Section headers that are questions
      trimmedLine.match(/^(Question|Problem|Exercise)\s*\d*/i)
    ) {
      
      const cleanQuestion = trimmedLine
        .replace(/^\d+[\.)]\s*/, '')
        .replace(/^Q\d+[\.)]\s*/i, '')
        .replace(/^(Question|Problem|Exercise)\s*\d*[:.]\s*/i, '')
        .trim();

      if (cleanQuestion.length > 10 && !cleanQuestion.match(/^(Section|Chapter|Part|Unit)/i)) {
        questions.push({
          question: cleanQuestion,
          answer: generateBasicAnswer(cleanQuestion, topic),
          importance: analyzeQuestionImportanceFromText(cleanQuestion),
          topic: topic,
          difficulty: analyzeQuestionDifficultyFromText(cleanQuestion),
          confidence: 0.75
        });
      }
    }
  }

  console.log(`Pattern matching found ${questions.length} questions from ${filename}`);
  return questions.slice(0, 20); // Return up to 20 questions
};

// Create fallback questions when PDF extraction fails
const createFallbackQuestionsFromMetadata = (filename: string, content: string): Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}> => {
  const topic = detectTopicFromFilename(filename);
  const questions: Array<{
    question: string;
    answer: string;
    importance: 'high' | 'medium' | 'low';
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    confidence: number;
  }> = [];

  // Extract any readable text fragments
  const readableFragments = content.match(/[A-Za-z][A-Za-z\s]{10,}/g) || [];
  const hasReadableContent = readableFragments.length > 0;

  // REMOVED: Generic subject questions - AI extraction only

  return questions.slice(0, 10);
};

// REMOVED: All generic questions - AI extraction only
const getSubjectSpecificQuestions = (topic: string): Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
}> => {
  // Return empty array to force AI extraction
  return [];
};

// Detect topic from filename
const detectTopicFromFilename = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.includes('math') || lower.includes('calculus') || lower.includes('algebra')) return 'Mathematics';
  if (lower.includes('physics')) return 'Physics';
  if (lower.includes('chemistry')) return 'Chemistry';
  if (lower.includes('biology')) return 'Biology';
  if (lower.includes('english') || lower.includes('literature')) return 'English';
  if (lower.includes('history')) return 'History';
  if (lower.includes('computer') || lower.includes('programming')) return 'Computer Science';
  if (lower.includes('science')) return 'Physics'; // Default science to Physics
  return 'General';
};

// AI-like analysis of question importance based on content and context
const analyzeQuestionImportance = (question: string, answer: string, documentContent: string): 'high' | 'medium' | 'low' => {
  const questionLower = question.toLowerCase();
  const answerLower = answer.toLowerCase();
  const docLower = documentContent.toLowerCase();
  
  // High importance indicators
  const highKeywords = ['important', 'key', 'essential', 'fundamental', 'critical', 'main', 'primary', 'define', 'explain', 'what is', 'how does', 'why'];
  const highScore = highKeywords.filter(keyword => 
    questionLower.includes(keyword) || answerLower.includes(keyword)
  ).length;
  
  // Check if question appears multiple times in document (indicates importance)
  const questionWords = questionLower.split(' ').filter(word => word.length > 4);
  const repetitionScore = questionWords.reduce((score, word) => {
    const matches = (docLower.match(new RegExp(word, 'g')) || []).length;
    return score + (matches > 2 ? 1 : 0);
  }, 0);
  
  if (highScore >= 2 || repetitionScore >= 2) return 'high';
  if (highScore >= 1 || repetitionScore >= 1) return 'medium';
  return 'low';
};

// AI-like analysis of question difficulty
const analyzeQuestionDifficulty = (question: string, answer: string): 'easy' | 'medium' | 'hard' => {
  const questionLower = question.toLowerCase();
  const answerLower = answer.toLowerCase();
  
  // Hard difficulty indicators
  const hardKeywords = ['analyze', 'evaluate', 'critically', 'synthesize', 'compare and contrast', 'discuss implications', 'derive', 'prove'];
  const hardScore = hardKeywords.filter(keyword => questionLower.includes(keyword)).length;
  
  // Easy difficulty indicators  
  const easyKeywords = ['define', 'list', 'name', 'identify', 'what is', 'who is', 'when did'];
  const easyScore = easyKeywords.filter(keyword => questionLower.includes(keyword)).length;
  
  // Answer complexity analysis
  const answerComplexity = answer.split(/[.!?]+/).length; // Number of sentences
  const technicalTerms = (answerLower.match(/\b[a-z]{8,}\b/g) || []).length; // Long technical words
  
  if (hardScore >= 1 || (answerComplexity > 4 && technicalTerms > 3)) return 'hard';
  if (easyScore >= 1 || (answerComplexity <= 2 && technicalTerms <= 1)) return 'easy';
  return 'medium';
};

// Calculate confidence score for extracted questions
const calculateQuestionConfidence = (question: { question: string; answer: string }, paper: UploadedPaper, index: number): number => {
  let confidence = 0.7; // Base confidence
  
  // Higher confidence for well-structured questions
  if (question.question.match(/^\d+\./) || question.question.match(/^[A-Z]\)/)) confidence += 0.1;
  if (question.question.includes('?')) confidence += 0.1;
  
  // Higher confidence for substantial answers
  if (question.answer.length > 100) confidence += 0.1;
  if (question.answer.length > 200) confidence += 0.1;
  
  // Lower confidence for later questions (as extraction quality may decrease)
  confidence -= index * 0.02;
  
  // Higher confidence for papers with more content
  if (paper.content.length > 2000) confidence += 0.05;
  
  return Math.min(0.95, Math.max(0.3, confidence));
};

const detectTopicsFromContent = (filename: string, content: string): string[] => {
  const topics: string[] = [];
  
  // Enhanced topic detection based on uploaded content
  const topicPatterns = {
    'Mathematics': ['math', 'mathematics', 'calculus', 'algebra', 'geometry', 'trigonometry', 'statistics', 'probability', 'differential', 'integral', 'equation', 'function'],
    'Physics': ['physics', 'mechanics', 'thermodynamics', 'electromagnetism', 'optics', 'quantum', 'wave', 'particle', 'force', 'energy', 'motion', 'gravity'],
    'Chemistry': ['chemistry', 'organic', 'inorganic', 'biochemistry', 'analytical', 'physical', 'molecule', 'reaction', 'bond', 'acid', 'base', 'solution'],
    'Biology': ['biology', 'cell', 'genetics', 'ecology', 'evolution', 'microbiology', 'organism', 'tissue', 'organ', 'system', 'dna', 'protein'],
    'Computer Science': ['programming', 'algorithm', 'data structure', 'database', 'software', 'coding', 'computer', 'code', 'function', 'variable', 'loop', 'array'],
    'Economics': ['economics', 'microeconomics', 'macroeconomics', 'finance', 'accounting', 'market', 'demand', 'supply', 'price', 'cost', 'revenue', 'profit'],
    'Literature': ['literature', 'poetry', 'novel', 'drama', 'essay', 'criticism', 'author', 'character', 'plot', 'theme', 'metaphor', 'symbolism'],
    'History': ['history', 'ancient', 'medieval', 'modern', 'world war', 'civilization', 'empire', 'kingdom', 'revolution', 'battle', 'treaty', 'dynasty'],
    'Psychology': ['psychology', 'cognitive', 'behavioral', 'social', 'clinical', 'developmental', 'mind', 'behavior', 'personality', 'memory', 'learning', 'emotion'],
    'English': ['english', 'grammar', 'composition', 'vocabulary', 'sentence', 'paragraph', 'essay', 'writing', 'reading', 'comprehension', 'literature'],
    'Geography': ['geography', 'map', 'continent', 'country', 'climate', 'weather', 'landform', 'river', 'mountain', 'ocean', 'population', 'culture'],
    'Political Science': ['politics', 'government', 'democracy', 'constitution', 'election', 'parliament', 'president', 'minister', 'policy', 'law', 'rights', 'freedom']
  };

  Object.entries(topicPatterns).forEach(([topic, keywords]) => {
    const hasKeyword = keywords.some(keyword => 
      filename.includes(keyword) || content.includes(keyword)
    );
    if (hasKeyword) {
      topics.push(topic);
    }
  });

  return topics.length > 0 ? topics : ['General Academic'];
};

const detectExamTypeFromPapers = (papers: UploadedPaper[]): string | undefined => {
  const examTypePatterns = {
    'University Exam': ['university', 'college', 'semester', 'final', 'midterm', 'bachelor', 'master', 'phd'],
    'Competitive Exam': ['competitive', 'entrance', 'gate', 'cat', 'jee', 'neet', 'upsc', 'ssc'],
    'Board Exam': ['board', 'cbse', 'icse', 'state board', 'secondary', 'higher secondary'],
    'Entrance Exam': ['entrance', 'admission', 'gate', 'cat', 'jee', 'neet', 'clat']
  };

  const allText = papers.map(p => `${p.filename} ${p.content}`).join(' ').toLowerCase();
  
  for (const [examType, keywords] of Object.entries(examTypePatterns)) {
    if (keywords.some(keyword => allText.includes(keyword))) {
      return examType;
    }
  }
  
  return undefined;
};

const detectSubjectFromPapers = (papers: UploadedPaper[]): string | undefined => {
  const subjectPatterns = {
    'Mathematics': ['math', 'mathematics', 'calculus', 'algebra', 'geometry', 'trigonometry', 'statistics'],
    'Physics': ['physics', 'mechanics', 'thermodynamics', 'electromagnetism', 'optics', 'quantum'],
    'Chemistry': ['chemistry', 'organic', 'inorganic', 'biochemistry', 'analytical'],
    'Biology': ['biology', 'cell', 'genetics', 'ecology', 'evolution', 'microbiology'],
    'Computer Science': ['computer', 'programming', 'algorithm', 'data structure', 'software', 'coding'],
    'Economics': ['economics', 'microeconomics', 'macroeconomics', 'finance', 'accounting'],
    'English': ['english', 'literature', 'grammar', 'composition', 'poetry'],
    'History': ['history', 'ancient', 'medieval', 'modern', 'world war']
  };

  const allText = papers.map(p => `${p.filename} ${p.content}`).join(' ').toLowerCase();
  
  for (const [subject, keywords] of Object.entries(subjectPatterns)) {
    if (keywords.some(keyword => allText.includes(keyword))) {
      return subject;
    }
  }
  
  return undefined;
};

export const handleUploadPapers: RequestHandler = (req, res) => {
  try {
    const files = req.body.files || [];
    const uploadedFiles: UploadedPaper[] = [];

    files.forEach((file: any) => {
      // Use the actual content sent from the frontend (should be base64 for binary files)
      const realContent = file.content || "No content provided";
      
      // Determine if content is base64 (binary file) or plain text
      // PDFs, DOCX, images should be base64
      const isBinary = file.filename && (
        file.filename.toLowerCase().endsWith('.pdf') ||
        file.filename.toLowerCase().endsWith('.docx') ||
        file.filename.toLowerCase().endsWith('.doc') ||
        file.filename.toLowerCase().endsWith('.png') ||
        file.filename.toLowerCase().endsWith('.jpg') ||
        file.filename.toLowerCase().endsWith('.jpeg')
      );
      
      // Save file to disk and get file ID
      const fileId = saveFile(realContent, isBinary);
      
      const paper: UploadedPaper = {
        id: fileId, // Use the file ID as the paper ID
        filename: file.filename || `question_paper_${paperIdCounter}.pdf`,
        content: realContent.substring(0, 5000), // Store only a preview of the content
        uploadedAt: new Date(),
        source: 'local',
        topics: detectTopicsFromContent(file.filename?.toLowerCase() || '', realContent),
        questionCount: countQuestionsInContent(realContent),
        filePath: path.join(UPLOAD_DIR, fileId) // Store the full file path
      };
      
      uploadedPapers.push(paper);
      uploadedFiles.push(paper);
      paperIdCounter++;
    });

    res.json({
      success: true,
      message: `Successfully uploaded ${uploadedFiles.length} question papers`,
      uploadedFiles: uploadedFiles.map(f => ({ id: f.id, filename: f.filename }))
    });
  } catch (error) {
    console.error("Upload papers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload question papers"
    });
  }
};

// Generate realistic sample content for testing
const generateSampleContent = (filename: string): string => {
  const lowerFilename = filename.toLowerCase();
  
  if (lowerFilename.includes('math') || lowerFilename.includes('calculus')) {
    return `Mathematics Exam Paper

1. What is the derivative of f(x) = x² + 3x + 1?
Answer: The derivative is f'(x) = 2x + 3. We use the power rule for x² and the constant rule for 3x and 1.

2. Explain the concept of limits in calculus.
Answer: A limit describes the behavior of a function as its input approaches a particular value. It's fundamental to understanding continuity and derivatives.

3. Solve the equation: 2x + 5 = 13
Answer: Subtracting 5 from both sides: 2x = 8. Dividing by 2: x = 4.

4. What is the area under the curve y = x² from x = 0 to x = 2?
Answer: We integrate ∫₀² x² dx = [x³/3]₀² = 8/3 - 0 = 8/3 square units.

5. Define what a function is in mathematics.
Answer: A function is a relation between a set of inputs and a set of outputs where each input is related to exactly one output.`;
  }
  
  if (lowerFilename.includes('physics') || lowerFilename.includes('mechanics')) {
    return `Physics Exam Paper

Q1: State Newton's three laws of motion.
Answer: 1st Law: An object at rest stays at rest unless acted upon by an external force. 2nd Law: F = ma. 3rd Law: For every action, there is an equal and opposite reaction.

Q2: What is the formula for kinetic energy?
Answer: Kinetic energy = ½mv² where m is mass and v is velocity.

Q3: Explain the concept of acceleration.
Answer: Acceleration is the rate of change of velocity with respect to time. It can be positive (speeding up) or negative (slowing down).

Q4: What is the principle of conservation of energy?
Answer: Energy cannot be created or destroyed, only transformed from one form to another. Total energy in a closed system remains constant.`;
  }
  
  if (lowerFilename.includes('chemistry') || lowerFilename.includes('organic')) {
    return `Chemistry Exam Paper

Question 1: What is the difference between an element and a compound?
Answer: An element is a pure substance made of only one type of atom, while a compound is made of two or more different elements chemically combined.

Question 2: Explain the concept of chemical bonding.
Answer: Chemical bonding occurs when atoms share, donate, or accept electrons to achieve a stable electron configuration. Types include ionic, covalent, and metallic bonds.

Question 3: What is the pH scale and what does it measure?
Answer: The pH scale measures the acidity or basicity of a solution. pH < 7 is acidic, pH = 7 is neutral, pH > 7 is basic.

Question 4: Define what a catalyst is.
Answer: A catalyst is a substance that increases the rate of a chemical reaction without being consumed in the process.`;
  }
  
  // Default sample content
  return `General Academic Paper

1. What is the scientific method?
Answer: The scientific method is a systematic approach to research involving observation, hypothesis formation, experimentation, data analysis, and conclusion drawing.

2. Explain the importance of critical thinking in academic studies.
Answer: Critical thinking involves analyzing information objectively, evaluating evidence, and forming reasoned conclusions. It's essential for academic success and informed decision-making.

3. What are the key components of effective communication?
Answer: Effective communication includes clarity, conciseness, appropriate language, active listening, and feedback. It's crucial for academic and professional success.

4. Define what research methodology means.
Answer: Research methodology refers to the systematic approach used to conduct research, including data collection methods, analysis techniques, and validation procedures.`;
};

// Count actual questions in the content
const countQuestionsInContent = (content: string): number => {
  const questionPatterns = [
    /^\d+\./gm,           // Numbered questions: "1."
    /^[a-z]\)/gm,         // Lettered questions: "a)"
    /^[A-Z]\)/gm,         // Capital lettered questions: "A)"
    /^Q\d*:/gim,          // Question indicators: "Q1:", "Q:"
    /^Question\s*\d*:/gim, // "Question 1:"
    /^[A-Z][^.!?]*\?/gm,  // Lines containing question mark
    /^[A-Z][^.!?]*:$/gm   // Lines ending with colon (potential questions)
  ];
  
  let totalQuestions = 0;
  questionPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      totalQuestions += matches.length;
    }
  });
  
  return totalQuestions || 1; // At least 1 question
};

export const handleUploadFromGoogleDrive: RequestHandler = async (req, res) => {
  try {
    const { fileIds, accessToken }: UploadFromGoogleDriveRequest = req.body;
    
    if (!fileIds || !accessToken) {
      return res.status(400).json({
        success: false,
        message: "Missing file IDs or access token"
      });
    }

    // For demo purposes, don't actually upload files
    // In production, use Google Drive API to fetch files
    const response: UploadFromGoogleDriveResponse = {
      success: true,
      message: "Google Drive integration is a demo feature. In production, this would upload the selected files.",
      uploadedFiles: []
    };

    res.json(response);
  } catch (error) {
    console.error("Google Drive upload error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload files from Google Drive"
    });
  }
};

export const handleAnalyzePapers: RequestHandler = async (req, res) => {
  try {
    const { paperIds }: AnalyzePapersRequest = req.body;

    // Get relevant papers
    const relevantPapers = uploadedPapers.filter(paper =>
      !paperIds || paperIds.includes(paper.id)
    );

    if (relevantPapers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No papers found for analysis"
      });
    }

    // Detect exam type and subject from uploaded papers
    const examType = detectExamTypeFromPapers(relevantPapers);
    const subject = detectSubjectFromPapers(relevantPapers);

    // Perform AI analysis based on uploaded papers only
    const predictedQuestions = await analyzePapersWithAI(relevantPapers);

    // Analyze topics and their frequencies
    const topicAnalysis = new Map<string, { frequency: number; importance: 'high' | 'medium' | 'low' }>();
    
    relevantPapers.forEach(paper => {
      paper.topics?.forEach(topic => {
        const current = topicAnalysis.get(topic) || { frequency: 0, importance: 'medium' as const };
        topicAnalysis.set(topic, {
          frequency: current.frequency + 1,
          importance: current.frequency >= 2 ? 'high' : 'medium'
        });
      });
    });

    const topics = Array.from(topicAnalysis.entries()).map(([name, data]) => ({
      name,
      frequency: data.frequency,
      importance: data.importance
    }));

    const response: AnalyzePapersResponse = {
      success: true,
      message: "Papers analyzed successfully using AI",
      analysis: {
        totalQuestions: relevantPapers.reduce((sum, paper) => sum + (paper.questionCount || 0), 0),
        topics,
        predictedQuestions,
        detectedExamType: examType,
        detectedSubject: subject
      }
    };

    res.json(response);
  } catch (error) {
    console.error("Analyze papers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to analyze papers"
    });
  }
};

export const handleGenerateQuestions: RequestHandler = async (req, res) => {
  console.log('=== handleGenerateQuestions called ===');
  console.log('Request body:', JSON.stringify(req.body));
  console.log('Request method:', req.method);
  console.log('Request path:', req.path);
  
  // Forward to Python backend for processing
  try {
    const data = req.body;
    const paperIds = data.paperIds || [];
    
    if (!paperIds || paperIds.length === 0) {
      console.log('No paper IDs provided');
      return res.status(400).json({ 
        success: false,
        message: 'Paper IDs are required' 
      });
    }
    
    console.log(`Looking for papers with IDs: ${paperIds.join(', ')}`);
    console.log(`Total uploaded papers: ${uploadedPapers.length}`);
    console.log('Available paper IDs:', uploadedPapers.map(p => p.id));
    
    // Find papers and get their file paths
    const selectedPapers = uploadedPapers.filter(paper => 
      paperIds.includes(paper.id)
    );
    
    console.log(`Found ${selectedPapers.length} papers`);
    
    if (selectedPapers.length === 0) {
      console.log('No papers found, returning 400 (not 404)');
      return res.status(400).json({ 
        success: false,
        message: `No papers found with provided IDs. Available IDs: ${uploadedPapers.map(p => p.id).join(', ')}` 
      });
    }
    
    // Try Python backend first, fallback to Express backend if it fails
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5000';
    console.log(`Attempting to call Python backend at: ${pythonBackendUrl}/api/generate-questions`);
    
    try {
      // Prepare papers data with file paths for Python backend
      const papersData = selectedPapers.map(paper => ({
        id: paper.id,
        filename: paper.filename,
        filePath: paper.filePath
      }));
      
      console.log('Prepared papers data:', JSON.stringify(papersData, null, 2));
      
      // Call Python backend with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${pythonBackendUrl}/api/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ papers: papersData }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log(`Python backend response status: ${response.status}`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Python backend result:', JSON.stringify(result, null, 2));
        return res.json(result);
      } else {
        const errorResult = await response.json().catch(() => ({}));
        console.warn('Python backend returned error, falling back to Express backend:', errorResult);
        throw new Error('Python backend error');
      }
    } catch (fetchError: any) {
      // Python backend not available or failed - use Express backend fallback
      console.log('Python backend not available, using Express backend fallback');
      console.error('Fetch error:', fetchError?.message);
      
      // Fallback: Generate questions using Express backend (Groq API)
      try {
        const allQuestions: Array<{
          question: string;
          answer: string;
          importance: 'high' | 'medium' | 'low';
          topic: string;
          difficulty: 'easy' | 'medium' | 'hard';
          confidence: number;
        }> = [];
        
        for (const paper of selectedPapers) {
          if (!paper.filePath || !fs.existsSync(paper.filePath)) {
            console.warn(`File not found for paper ${paper.id}: ${paper.filePath}`);
            continue;
          }
          
          try {
            const extractedText = await extractTextFromFile(paper.filePath, paper.filename);
            
            if (extractedText && extractedText.length > 50) {
              const questions = await extractQuestionsWithGroq(extractedText, paper.filename);
              if (questions && questions.length > 0) {
                allQuestions.push(...questions);
              }
            }
          } catch (paperError) {
            console.error(`Error processing paper ${paper.filename}:`, paperError);
            continue;
          }
        }
        
        if (allQuestions.length === 0) {
          return res.status(500).json({
            success: false,
            message: 'No questions could be generated from the uploaded papers. Please ensure the papers contain readable text.'
          });
        }
        
        // Apply importance-based filtering and selection
        const importantQuestions = selectImportantQuestions(allQuestions);
        
        console.log(`Generated ${allQuestions.length} total questions from ${selectedPapers.length} papers`);
        console.log(`Selected ${importantQuestions.length} important questions after filtering`);
        
        // Create questions record
        const questionsRecord: GeneratedQuestions = {
          id: String(questionsIdCounter++),
          questions: importantQuestions,
          generatedAt: new Date()
        };
        
        generatedQuestions.push(questionsRecord);
        
        return res.json({
          success: true,
          message: `Generated ${importantQuestions.length} important questions from ${selectedPapers.length} paper(s)`,
          questions: importantQuestions,
          questionsId: questionsRecord.id
        });
      } catch (fallbackError: any) {
        console.error('Fallback question generation also failed:', fallbackError);
        return res.status(500).json({
          success: false,
          message: `Failed to generate questions: ${fallbackError?.message || 'Unknown error'}. Please check that papers contain readable text and try again.`
        });
      }
    }
  } catch (error: any) {
    console.error('Unexpected error in handleGenerateQuestions:', error);
    console.error('Error stack:', error?.stack);
    return res.status(500).json({
      success: false,
      message: `Failed to generate questions: ${error?.message || 'Unknown error'}`
    });
  }
};

// OLD VERSION - keeping for reference but not used
const handleGenerateQuestions_OLD: RequestHandler = async (req, res) => {
  try {
    const { paperIds, sections, questionTypes } = req.body;

    if (!paperIds || !Array.isArray(paperIds) || paperIds.length === 0) {
      return res.status(400).json({ error: 'Paper IDs are required' });
    }

    // Find the uploaded papers
    const selectedPapers = uploadedPapers.filter(paper => 
      paperIds.includes(paper.id)
    );

    if (selectedPapers.length === 0) {
      return res.status(404).json({ error: 'No papers found with provided IDs' });
    }

    console.log(`Generating questions for ${selectedPapers.length} papers using AI`);

    // Use real AI-powered analysis to extract questions
    const aiQuestions = await analyzePapersWithAI(selectedPapers);

    console.log(`AI analysis result: ${aiQuestions.length} questions found`);
    
    if (aiQuestions.length === 0) {
      console.log('No questions found from AI, creating emergency fallback questions...');
      
      // REMOVED: Emergency fallback questions - force AI to work properly
      
      return res.status(200).json({
        success: false,
        message: `No meaningful questions could be extracted from the uploaded documents. Document analysis: ${selectedPapers.length} papers processed. Please check if the documents contain readable text with questions.`,
        questions: []
      });
    }

    // Convert AI questions to the expected format
    const generatedQuestionsData = aiQuestions.map(q => ({
      id: Math.random().toString(36).substr(2, 9),
      question: q.question,
      answer: q.answer,
      type: 'extracted' as const,
      difficulty: q.difficulty,
      importance: q.importance,
      topic: q.topic,
      confidence: q.confidence
    }));

    const questions: GeneratedQuestions = {
      id: questionsIdCounter.toString(),
      questions: generatedQuestionsData,
      generatedAt: new Date(),
      analysis: {
        totalQuestions: selectedPapers.reduce((sum, paper) => sum + (paper.questionCount || 0), 0),
        topics: []
      }
    };

    generatedQuestions.push(questions);
    questionsIdCounter++;

    console.log(`AI generated ${generatedQuestionsData.length} questions`);

    const response: GenerateQuestionsResponse = {
      success: true,
      message: "Important questions generated successfully using AI analysis",
      questions: generatedQuestionsData
    };

    res.json(response);
  } catch (error) {
    console.error("Generate questions error:", error);
    const response: GenerateQuestionsResponse = {
      success: false,
      message: "Failed to generate questions. Please check your AI API configuration."
    };
    res.status(500).json(response);
  }
};

// Create fallback questions if AI analysis fails
const createFallbackQuestions = (papers: UploadedPaper[]): Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}> => {
  const questions: Array<{
    question: string;
    answer: string;
    importance: 'high' | 'medium' | 'low';
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    confidence: number;
  }> = [];

  console.log('Creating fallback questions for papers:', papers.length);

  papers.forEach((paper, paperIndex) => {
    console.log(`Processing paper ${paperIndex + 1}: ${paper.filename}`);
    
    // Create simple questions from paper content
    const simpleQuestions = createSimpleQuestionsFromContent(paper.content);
    console.log(`Created ${simpleQuestions.length} simple questions from paper ${paperIndex + 1}`);
    
    simpleQuestions.forEach((q, qIndex) => {
      const topic = paper.topics?.[0] || 'General Academic';
      const importance = paperIndex < 2 ? 'high' : 'medium';
      const difficulty = qIndex % 3 === 0 ? 'easy' : qIndex % 3 === 1 ? 'medium' : 'hard';
      const confidence = 0.7 + (paperIndex * 0.1) + (qIndex * 0.05);
      
      const questionObj = {
        question: q.question,
        answer: q.answer,
        topic,
        importance: importance as 'high' | 'medium' | 'low',
        difficulty: difficulty as 'easy' | 'medium' | 'hard',
        confidence: Math.min(0.95, Math.max(0.3, confidence))
      };
      
      console.log(`Fallback question ${qIndex + 1}:`, {
        question: questionObj.question.substring(0, 50) + '...',
        answerLength: questionObj.answer.length,
        topic: questionObj.topic,
        importance: questionObj.importance,
        difficulty: questionObj.difficulty,
        confidence: questionObj.confidence
      });
      
      questions.push(questionObj);
    });
  });

  console.log(`Total fallback questions created: ${questions.length}`);
  return questions.slice(0, 10); // Limit to 10 questions
};

export const handleDownloadQuestions: RequestHandler = (req, res) => {
  try {
    const { questionsId, format = 'txt' } = req.query;

    // Find the questions
    let questions = questionsId 
      ? generatedQuestions.find(q => q.id === String(questionsId))
      : null;
    
    if (!questions && generatedQuestions.length > 0) {
      questions = generatedQuestions[generatedQuestions.length - 1];
    }

    if (!questions) {
      return res.status(404).json({
        success: false,
        message: "No questions found. Please generate questions first."
      });
    }

    const timestamp = questions.generatedAt.toLocaleDateString() + ' ' + questions.generatedAt.toLocaleTimeString();
    const filename = `important_questions_${new Date().toISOString().split('T')[0]}.${format}`;
    const encodedFilename = encodeURIComponent(filename);

    if (format === 'pdf') {
      // Generate PDF using PDFKit
      const pdfDoc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50
        }
      });

      // Handle PDF errors
      pdfDoc.on('error', (error) => {
        console.error("PDF generation error:", error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Failed to generate PDF file"
          });
        }
      });

      // Set response headers for PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);

      // Pipe PDF to response
      pdfDoc.pipe(res);

      // Add header
      pdfDoc.fontSize(20)
            .font('Helvetica-Bold')
            .text('IMPORTANT QUESTIONS & ANSWERS', { align: 'center' });
      
      pdfDoc.moveDown(0.5);
      pdfDoc.fontSize(10)
            .font('Helvetica')
            .text('Generated by StudyAI - AI-Powered Academic Analysis', { align: 'center' });
      pdfDoc.text(`Generated on: ${timestamp}`, { align: 'center' });
      pdfDoc.moveDown(1);

      // Add questions
      questions.questions.forEach((q, index) => {
        // Check if we need a new page
        if (pdfDoc.y > 700) {
          pdfDoc.addPage();
        }

        // Question number and importance
        const importanceText = q.importance.toUpperCase();
        
        pdfDoc.fontSize(12)
              .font('Helvetica-Bold')
              .fillColor('#000000')
              .text(`Question ${index + 1} [${importanceText}]`, { continued: false });
        
        pdfDoc.moveDown(0.3);

        // Question text
        pdfDoc.fontSize(11)
              .font('Helvetica')
              .fillColor('#000000')
              .text(q.question, {
                align: 'left',
                width: 495
              });

        pdfDoc.moveDown(0.3);

        // Metadata
        pdfDoc.fontSize(9)
              .fillColor('#666666')
              .text(`Difficulty: ${q.difficulty.toUpperCase()} | Confidence: ${(q.confidence * 100).toFixed(0)}% | Topic: ${q.topic || 'General'}`);

        pdfDoc.moveDown(0.5);

        // Answer
        pdfDoc.fontSize(10)
              .font('Helvetica-Bold')
              .fillColor('#000000')
              .text('Answer:', { continued: false });
        
        pdfDoc.moveDown(0.2);
        
        pdfDoc.fontSize(10)
              .font('Helvetica')
              .fillColor('#000000')
              .text(q.answer || 'Answer not provided', {
                align: 'left',
                width: 495
              });

        pdfDoc.moveDown(1);

        // Separator line
        pdfDoc.moveTo(50, pdfDoc.y)
              .lineTo(545, pdfDoc.y)
              .strokeColor('#cccccc')
              .lineWidth(0.5)
              .stroke();

        pdfDoc.moveDown(0.8);
      });

      // Add summary on last page
      if (pdfDoc.y > 600) {
        pdfDoc.addPage();
      }

      pdfDoc.moveDown(1);
      pdfDoc.fontSize(12)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text('SUMMARY', { align: 'center' });
      
      pdfDoc.moveDown(0.5);

      const highPriority = questions.questions.filter(q => q.importance === 'high').length;
      const mediumPriority = questions.questions.filter(q => q.importance === 'medium').length;
      const lowPriority = questions.questions.filter(q => q.importance === 'low').length;

      pdfDoc.fontSize(10)
            .font('Helvetica')
            .text(`Total Questions: ${questions.questions.length}`, { align: 'left' });
      pdfDoc.text(`High Priority: ${highPriority}`, { align: 'left' });
      pdfDoc.text(`Medium Priority: ${mediumPriority}`, { align: 'left' });
      pdfDoc.text(`Low Priority: ${lowPriority}`, { align: 'left' });

      pdfDoc.moveDown(1);
      pdfDoc.fontSize(9)
            .fillColor('#666666')
            .text('Generated by StudyAI - AI-Powered Academic Solution', { align: 'center' });

      // Finalize PDF
      pdfDoc.end();
    } else {
      // Generate text content for TXT format
      const content = generateTextContent(questions, true, true, timestamp);
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
      res.send(content);
    }
  } catch (error: any) {
    console.error("Download questions error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: `Failed to download questions: ${error?.message || 'Unknown error'}`
      });
    }
  }
};

const generateTextContent = (
  questions: GeneratedQuestions, 
  includeAnswers: boolean, 
  includeTopics: boolean,
  timestamp: string
): string => {
  let content = `IMPORTANT QUESTIONS & ANSWERS
Generated by StudyAI - AI-Powered Academic Analysis
Generated on: ${timestamp}

==================================================

`;

  questions.questions.forEach((q, index) => {
    const prioritySymbol = q.importance === 'high' ? '🔴' : q.importance === 'medium' ? '🟡' : '🟢';
    const difficultySymbol = q.difficulty === 'hard' ? '🔴' : q.difficulty === 'medium' ? '🟡' : '🟢';

    content += `${index + 1}. [${q.importance.toUpperCase()}] ${prioritySymbol} ${q.question}\n`;
    
      content += `   Difficulty: ${q.difficulty.toUpperCase()} ${difficultySymbol}\n`;
      content += `   Confidence: ${(q.confidence * 100).toFixed(1)}%\n`;

    if (includeAnswers) {
      content += `\nANSWER:\n${q.answer}\n`;
    }

    content += `\n==================================================\n\n`;
  });

  // Add summary
  const highPriority = questions.questions.filter(q => q.importance === 'high').length;
  const mediumPriority = questions.questions.filter(q => q.importance === 'medium').length;
  const lowPriority = questions.questions.filter(q => q.importance === 'low').length;

  content += `\nSUMMARY:
- Total Questions: ${questions.questions.length}
- High Priority: ${highPriority}
- Medium Priority: ${mediumPriority}
- Low Priority: ${lowPriority}

Generated by StudyAI - AI-Powered Academic Solution
For more features, visit our platform.
`;

  return content;
};

const generateDocxContent = (
  questions: GeneratedQuestions, 
  includeAnswers: boolean, 
  includeTopics: boolean,
  timestamp: string
): string => {
  // For demo purposes, return formatted text
  // In production, use a proper DOCX library like docx or officegen
  return generateTextContent(questions, includeAnswers, includeTopics, timestamp);
};

// Get all uploaded papers
export const handleGetUploadedPapers: RequestHandler = (req, res) => {
  try {
    const response: GetUploadedPapersResponse = {
      success: true,
      message: `Found ${uploadedPapers.length} uploaded papers`,
      papers: uploadedPapers.map(paper => ({
        ...paper,
        uploadedAt: paper.uploadedAt
      }))
    };

    res.json(response);
  } catch (error) {
    console.error("Get uploaded papers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve uploaded papers"
    });
  }
};

// Remove a specific paper
export const handleRemovePaper: RequestHandler = async (req, res) => {
  try {
    // Support both URL parameter and body parameter
    const paperId = req.params.paperId || req.body?.paperId;

    if (!paperId) {
      return res.status(400).json({
        success: false,
        message: "Paper ID is required"
      });
    }

    const paperIndex = uploadedPapers.findIndex(paper => paper.id === paperId);
    
    if (paperIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Paper not found"
      });
    }

    const removedPaper = uploadedPapers.splice(paperIndex, 1)[0];
    
    // Delete the file from the filesystem if it exists
    if (removedPaper.filePath && fs.existsSync(removedPaper.filePath)) {
      try {
        await fs.promises.unlink(removedPaper.filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    // Also remove any generated questions for this paper
    const questionIndex = generatedQuestions.findIndex(q => q.id === `questions_${paperId}`);
    if (questionIndex !== -1) {
      generatedQuestions.splice(questionIndex, 1);
    }

    const response: RemovePaperResponse = {
      success: true,
      message: `Successfully removed paper: ${removedPaper.filename}`
    };

    res.json(response);
  } catch (error) {
    console.error("Remove paper error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove paper"
    });
  }
};

// Clear all uploaded papers
export const handleClearAllPapers: RequestHandler = async (req, res) => {
  try {
    // Delete all files from filesystem
    for (const paper of uploadedPapers) {
      if (paper.filePath && fs.existsSync(paper.filePath)) {
        try {
          await fs.promises.unlink(paper.filePath);
        } catch (error) {
          console.error(`Error deleting file ${paper.filePath}:`, error);
        }
      }
    }
    
    const count = uploadedPapers.length;
    uploadedPapers.length = 0; // Clear the array
    generatedQuestions.length = 0; // Also clear generated questions
    
    res.json({
      success: true,
      message: `Successfully cleared ${count} papers`
    });
  } catch (error) {
    console.error("Clear all papers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear papers"
    });
  }
};

// This function is now replaced by extractActualQuestionsFromDocument
// Keeping for backward compatibility but redirecting to new AI-based method
const extractQuestionsFromPaper = async (paper: UploadedPaper): Promise<Array<{
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}>> => {
  return await extractActualQuestionsFromDocument(paper);
};

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
 * Extract text using Mistral Vision API for OCR
 */
async function extractTextWithMistralOCR(buffer: Buffer): Promise<string> {
  const mistralApiKey = process.env.MISTRAL_API_KEY;
  if (!mistralApiKey) {
    throw new Error('MISTRAL_API_KEY is not set in environment variables');
  }

  try {
    console.log('Using Mistral Vision API for OCR...');
    
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
    
    // Load PDF with pdf.js
    let pdfDoc;
    try {
      const loadingTask = pdfjsLib.getDocument({ 
        data: uint8Array,
        verbosity: 0,
        stopAtErrors: false,
        maxImageSize: 1024 * 1024 * 10,
      });
      pdfDoc = await loadingTask.promise;
    } catch (pdfError: any) {
      if (pdfError.name === 'InvalidPDFException' || pdfError.message?.includes('Invalid PDF')) {
        throw new Error('PDF structure too corrupted for OCR processing');
      }
      throw pdfError;
    }
    
    let fullText = '';
    const numPages = Math.min(pdfDoc.numPages, 10); // Limit to first 10 pages
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        console.log(`Processing page ${pageNum} of ${numPages} with Mistral Vision API...`);
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
        
        // Convert canvas to base64 image
        const imageBuffer = canvas.toBuffer('image/png');
        const base64Image = imageBuffer.toString('base64');
        const imageDataUrl = `data:image/png;base64,${base64Image}`;
        
        // Call Mistral Vision API
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralApiKey}`
          },
          body: JSON.stringify({
            model: 'pixtral-12b-2409', // Mistral's vision model
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'You are an OCR system. Extract ALL text from this PDF page image. Return the complete text content exactly as it appears, including questions, answers, numbers, and all visible text. Preserve line breaks and structure. Do not summarize or explain - only return the extracted text.'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageDataUrl
                    }
                  }
                ]
              }
            ],
            max_tokens: 8000, // Increased for longer text
            temperature: 0.0 // Lower temperature for more accurate extraction
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Mistral API error:', errorData);
          throw new Error(`Mistral API error: ${errorData?.error?.message || response.statusText}`);
        }

        const data = await response.json();
        let pageText = data.choices?.[0]?.message?.content || '';
        
        // Remove markdown code blocks if present
        pageText = pageText
          .replace(/^```[\w]*\n?/gm, '') // Remove opening code blocks
          .replace(/\n?```$/gm, '') // Remove closing code blocks
          .trim();
        
        console.log(`Mistral API response for page ${pageNum}:`, {
          hasContent: !!pageText,
          contentLength: pageText.length,
          preview: pageText.substring(0, 150)
        });
        
        if (pageText && pageText.trim().length > 0) {
          fullText += pageText + '\n\n';
          console.log(`✓ Extracted ${pageText.length} characters from page ${pageNum}`);
        } else {
          console.warn(`⚠ No text extracted from page ${pageNum} by Mistral`);
        }
      } catch (pageError: any) {
        console.warn(`Failed to process page ${pageNum} with Mistral OCR:`, pageError?.message || pageError);
        continue;
      }
    }
    
    if (fullText.trim().length === 0) {
      throw new Error('Mistral OCR did not extract any text from PDF pages');
    }
    
    return cleanText(fullText);
  } catch (error: any) {
    console.error('Error extracting text with Mistral OCR:', error?.message || error);
    throw new Error(`Failed to extract text using Mistral OCR: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Extract text using OCR for scanned PDFs (fallback to Tesseract)
 */
async function extractTextWithOCR(buffer: Buffer): Promise<string> {
  // Try Mistral Vision API first if available
  const mistralKey = process.env.MISTRAL_API_KEY;
  console.log(`MISTRAL_API_KEY check: ${mistralKey ? 'FOUND (length: ' + mistralKey.length + ')' : 'NOT FOUND'}`);
  
  if (mistralKey) {
    try {
      console.log('Attempting to use Mistral Vision API for OCR...');
      return await extractTextWithMistralOCR(buffer);
    } catch (mistralError: any) {
      console.error('Mistral OCR failed, falling back to Tesseract:', mistralError?.message || mistralError);
      console.error('Mistral error details:', mistralError);
      // Fall through to Tesseract
    }
  } else {
    console.warn('MISTRAL_API_KEY not found in environment variables. Using Tesseract OCR instead.');
  }

  // Fallback to Tesseract OCR
  let worker;
  try {
    console.log('Using Tesseract OCR to extract text from PDF...');
    
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
    
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const uint8Array = new Uint8Array(buffer);
    
    let pdfDoc;
    try {
      const loadingTask = pdfjsLib.getDocument({ 
        data: uint8Array,
        verbosity: 0,
        stopAtErrors: false,
        maxImageSize: 1024 * 1024 * 10,
      });
      pdfDoc = await loadingTask.promise;
    } catch (pdfError: any) {
      if (pdfError.name === 'InvalidPDFException' || pdfError.message?.includes('Invalid PDF')) {
        throw new Error('PDF structure too corrupted for OCR processing');
      }
      throw pdfError;
    }
    
    let fullText = '';
    const numPages = Math.min(pdfDoc.numPages, 10);
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        console.log(`Processing page ${pageNum} of ${numPages} with Tesseract OCR...`);
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        
        const imageBuffer = canvas.toBuffer('image/png');
        const { data: { text } } = await worker.recognize(imageBuffer);
        if (text && text.trim().length > 0) {
          fullText += text + '\n\n';
        }
      } catch (pageError: any) {
        console.warn(`Failed to process page ${pageNum}:`, pageError?.message || pageError);
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

// Balanced content cleaning that removes corruption but preserves readable content
const cleanContentThoroughly = (content: string): string => {
  console.log('=== Starting Balanced Content Cleaning ===');
  console.log('Original content length:', content.length);
  
  let cleaned = content;
  
  // Step 1: Remove PDF-specific artifacts and metadata
  cleaned = cleaned
    .replace(/<<\s*\/[^>]*>>/g, '') // Remove PDF object definitions
    .replace(/\/[A-Za-z]+\s*\d*/g, '') // Remove PDF commands like /Subtype, /Width, /PageLabels, /XObject, etc.
    .replace(/\/[A-Za-z]+\s*\[.*?\]/g, '') // Remove PDF arrays like /PageLabels[]
    .replace(/\/[A-Za-z]+\s*<<.*?>>/g, '') // Remove PDF dictionaries
    .replace(/\d+\s+0\s+obj/g, '') // Remove PDF object references
    .replace(/\d+\s+0\s+R/g, '') // Remove PDF reference objects like "0R"
    .replace(/endobj/g, '') // Remove endobj markers
    .replace(/stream[\s\S]*?endstream/g, '') // Remove PDF stream content
    .replace(/xref[\s\S]*?trailer/g, '') // Remove PDF cross-reference tables
    .replace(/startxref[\s\S]*?%%EOF/g, '') // Remove PDF end markers
    .replace(/>>+/g, '') // Remove multiple >> symbols
    .replace(/<<+/g, '') // Remove multiple << symbols
    .replace(/\[\d+\]/g, '') // Remove array indices like [3558]
    .replace(/\d{4,}/g, '') // Remove long numbers (likely PDF internal references)
  
  // Step 2: Remove all non-printable and control characters
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  
  // Step 3: Remove excessive whitespace and normalize
  cleaned = cleaned
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{3,}/g, ' ')
    .trim();
  
  // Step 4: Filter lines by quality - be less aggressive
  const lines = cleaned.split('\n');
  const cleanLines = lines.filter(line => {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (trimmed.length === 0) return false;
    
    // Be more lenient with line length
    if (trimmed.length < 8) return false; // Reduced from 15
    
    // Calculate readability score
    const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
    const totalChars = trimmed.length;
    
    // More lenient readability threshold
    if (letterCount < totalChars * 0.3) return false; // Reduced from 0.6
    
    // Skip lines that are clearly just technical artifacts
    if (/^\d+[^\w]*$/.test(trimmed)) return false; // Just numbers
    if (/^[^\w\s]*$/.test(trimmed)) return false; // Just symbols
    
    // Keep lines that have some meaningful content
    return true;
  });
  
  const result = cleanLines.join('\n');
  
  console.log('Cleaned content length:', result.length);
  console.log('Number of clean lines:', cleanLines.length);
  console.log('Sample clean content:', result.substring(0, 200));
  
  return result;
};

// Extract questions from paper content
const extractQuestionsFromContent = (content: string): Array<{ question: string; answer: string }> => {
  const questions: Array<{ question: string; answer: string }> = [];
  
  console.log('\n=== Starting Question Extraction ===');
  console.log('Original content length:', content.length);
  
  // Use the aggressive cleaning function
  const cleanContent = cleanContentThoroughly(content);
  
  // Check if we have enough clean content
  if (cleanContent.length < 50) {
    console.log('Content too short after cleaning, length:', cleanContent.length);
    console.log('Falling back to simple question creation...');
    return createSimpleQuestionsFromContent(content); // Use original content as fallback
  }
  
  console.log('Content cleaned successfully, proceeding with extraction');
  
  // Split content into lines and look for question patterns
  const lines = cleanContent.split('\n')
    .map(line => line.trim())
    .filter(line => {
      // More lenient filtering for question extraction
      if (line.length < 10) return false; // Reduced from 20
      if (line.length > 400) return false; // Increased from 300
      
      // More lenient meaningful text requirement
      const letterCount = (line.match(/[a-zA-Z]/g) || []).length;
      const totalChars = line.length;
      
      return (letterCount / totalChars) > 0.4; // Reduced from 0.7
    });
  
  console.log('Total lines after filtering:', lines.length);
  console.log('Sample lines:', lines.slice(0, 5));
  
  let currentQuestion = '';
  let currentAnswer = '';
  let questionCount = 0;
  const maxQuestions = 15; // Limit to prevent excessive processing
  
  for (let i = 0; i < lines.length && questionCount < maxQuestions; i++) {
    const line = lines[i];
    
    // Look for question indicators
    if (isQuestionLine(line)) {
      console.log('Found question line:', line.substring(0, 100));
      // Save previous question if exists
      if (currentQuestion && currentAnswer && currentAnswer.length > 30) {
        questions.push({
          question: currentQuestion.trim(),
          answer: currentAnswer.trim()
        });
        questionCount++;
        console.log('Added question', questionCount, 'with answer length:', currentAnswer.length);
      }
      
      currentQuestion = line;
      currentAnswer = '';
    } else if (currentQuestion && isAnswerLine(line)) {
      currentAnswer += line + ' ';
    } else if (currentQuestion && line.length > 20 && line.length < 300) {
      // More lenient criteria for answer content
      const letterCount = (line.match(/[a-zA-Z]/g) || []).length;
      const totalChars = line.length;
      
      if ((letterCount / totalChars) > 0.5) { // Reduced from 60% to 50% letters
        currentAnswer += line + ' ';
      }
    }
  }
  
  // Add the last question
  if (currentQuestion && currentAnswer && currentAnswer.length > 30 && questionCount < maxQuestions) {
    questions.push({
      question: currentQuestion.trim(),
      answer: currentAnswer.trim()
    });
    questionCount++;
    console.log('Added final question', questionCount, 'with answer length:', currentAnswer.length);
  }
  
  console.log('Total questions extracted from patterns:', questions.length);
  
  // If no questions found, try harder to extract actual questions before falling back
  if (questions.length === 0) {
    console.log('No structured questions found, trying alternative extraction methods');
    
    // Try to find questions with more flexible patterns
    const alternativeQuestions = extractQuestionsWithFlexiblePatterns(cleanContent);
    if (alternativeQuestions.length > 0) {
      console.log('Alternative questions found:', alternativeQuestions.length);
      return alternativeQuestions;
    }
    
    // Only create generic questions as last resort
    console.log('No actual questions found, creating simple questions as fallback');
    const simpleQuestions = createSimpleQuestionsFromContent(cleanContent);
    console.log('Simple questions created:', simpleQuestions.length);
    return simpleQuestions;
  }
  
  console.log('Returning extracted questions:', questions.length);
  return questions;
};

// Extract questions with more flexible patterns when structured extraction fails
const extractQuestionsWithFlexiblePatterns = (content: string): Array<{ question: string; answer: string }> => {
  const questions: Array<{ question: string; answer: string }> = [];

  console.log('Starting flexible pattern extraction');
  
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 10);
  
  for (let i = 0; i < lines.length && questions.length < 10; i++) {
    const line = lines[i];
    
    // Skip PDF artifacts
    if (line.includes('/') || line.includes('>>') || line.includes('<<') || line.match(/\d{4,}/)) {
      continue; // Skip streams that don't contain text
    }
    
    // Look for actual questions in the content
    const isQuestion = 
      line.includes('?') || // Contains question mark
      /^(What|How|Why|When|Where|Which|Who|Can|Could|Would|Should|Is|Are|Do|Does|Did|Will|Shall)\s/i.test(line) || // Question words
      /^(Explain|Define|Describe|Compare|Contrast|Analyze|Evaluate|Discuss|List|Name|Identify)\s/i.test(line) || // Command words
      /^\d+\./.test(line) || // Numbered items
      /^[A-Z]\)/.test(line) || // Lettered items
      /^Q\d*[:.]/.test(line); // Q1., Q:, etc.
    
    if (isQuestion) {
      // Look for the answer in the next few lines
      let answer = '';
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j];
        
        // Stop if we hit another question
        if (nextLine.includes('?') || /^(What|How|Why|When|Where|Which|Who)\s/i.test(nextLine) || 
            /^\d+\./.test(nextLine) || /^[A-Z]\)/.test(nextLine)) {
          break;
        }
        
        // Skip PDF artifacts
        if (nextLine.includes('/') || nextLine.includes('>>') || nextLine.includes('<<') || nextLine.match(/\d{4,}/)) {
          continue;
        }
        
        // Add to answer if it looks like content
        if (nextLine.length > 20 && (nextLine.match(/[a-zA-Z]/g) || []).length / nextLine.length > 0.6) {
          answer += nextLine + ' ';
        }
      }
      
      // Only add if we found a reasonable answer
      if (answer.trim().length > 30) {
        questions.push({
          question: line,
          answer: answer.trim()
        });
        console.log('Found flexible question:', line.substring(0, 50));
      }
    }
  }
  
  console.log('Flexible extraction found:', questions.length, 'questions');
  return questions;
};

// Check if a line looks like a question
const isQuestionLine = (line: string): boolean => {
  // Clean the line first
  const cleanLine = line.trim();
  
  // Skip empty or very short lines
  if (cleanLine.length < 10) return false;
  
  // Skip lines with PDF artifacts
  if (cleanLine.includes('/') || cleanLine.includes('>>') || cleanLine.includes('<<') || cleanLine.match(/\d{4,}/)) {
    return false;
  }
  
  const questionPatterns = [
    /^\d+\./, // Numbered questions: "1."
    /^[a-z]\)/, // Lettered questions: "a)"
    /^[A-Z]\)/, // Capital lettered questions: "A)"
    /^Q\d*\./i, // Question indicators: "Q1.", "Q."
    /^Q\d*:/i, // Question indicators: "Q1:", "Q:"
    /^Question\s*\d*:/i, // "Question 1:"
    /\?/, // Any line containing a question mark
    /^[A-Z][^.!?]*:$/, // Lines ending with colon (potential questions)
    /^(What|How|Why|When|Where|Which|Who|Can|Could|Would|Should|Is|Are|Do|Does|Did|Will|Shall)\s/i, // Question words
    /^(Explain|Define|Describe|Compare|Contrast|Analyze|Evaluate|Discuss|List|Name|Identify)\s/i, // Command words often used in questions
  ];
  
  return questionPatterns.some(pattern => pattern.test(cleanLine));
};

// Check if a line looks like an answer
const isAnswerLine = (line: string): boolean => {
  const answerPatterns = [
    /^[a-z]\)/, // Lettered answers: "a)"
    /^[A-Z]\)/, // Capital lettered answers: "A)"
    /^Answer:/i, // "Answer:"
    /^Solution:/i, // "Solution:"
    /^Explanation:/i, // "Explanation:"
    /^[A-Z][^.!?]*\.$/, // Lines ending with period
    /^[A-Z][^.!?]*[.!]/, // Lines ending with period or exclamation
  ];
  
  return answerPatterns.some(pattern => pattern.test(line));
};

// Create questions from content if no structured questions found
const createQuestionsFromContent = (content: string): Array<{ question: string; answer: string }> => {
  const questions: Array<{ question: string; answer: string }> = [];
  
  // Split content into paragraphs
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 50);
  
  paragraphs.forEach((paragraph, index) => {
    // No limit - process all paragraphs
    const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    if (sentences.length >= 2) {
      const question = `Explain the concept discussed in the following context: ${sentences[0].trim()}`;
      const answer = sentences.slice(1, Math.min(4, sentences.length)).join('. ').trim();
      
      questions.push({ question, answer });
    }
  });
  
  return questions;
};

// Create simple questions from content if no structured questions found
const createSimpleQuestionsFromContent = (content: string): Array<{ question: string; answer: string }> => {
  const questions: Array<{ question: string; answer: string }> = [];

  console.log('Creating simple questions from content, length:', content.length);

  // Method 1: Try to find readable sentences first
  let readableContent = content;
  
  // Apply the same aggressive cleaning as the main function
  readableContent = readableContent
    .replace(/<<\s*\/[^>]*>>/g, '') // Remove PDF object definitions
    .replace(/\/[A-Za-z]+\s+\d+/g, '') // Remove PDF commands
    .replace(/\d+\s+0\s+obj/g, '') // Remove PDF object references
    .replace(/endobj/g, '') // Remove endobj markers
    .replace(/stream[\s\S]*?endstream/g, '') // Remove PDF stream content
    .replace(/xref[\s\S]*?trailer/g, '') // Remove PDF cross-reference tables
    .replace(/startxref[\s\S]*?%%EOF/g, '') // Remove PDF end markers
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control chars
    .replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  
  // Split content into sentences
  const sentences = readableContent
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => {
      // More lenient filtering for sentences
      if (s.length < 15 || s.length > 300) return false; // Reduced from 25
      
      const letterCount = (s.match(/[a-zA-Z]/g) || []).length;
      const totalChars = s.length;
      
      // More lenient readability requirement
      return (letterCount / totalChars) > 0.5; // Reduced from 0.7
    })
    .slice(0, 15); // Limit to 15 sentences
  
  console.log('Found readable sentences for simple questions:', sentences.length);
  
  sentences.forEach((sentence, index) => {
    if (index < 8) { // Limit to 8 questions
      // Create different types of questions
      let question = '';
      if (index % 3 === 0) {
        question = `Explain the concept discussed in: ${sentence.substring(0, 80)}...`;
      } else if (index % 3 === 1) {
        question = `What is the main idea in: ${sentence.substring(0, 80)}...`;
      } else {
        question = `Describe the following: ${sentence.substring(0, 80)}...`;
      }
      
      const answer = sentence;
      
      questions.push({ question, answer });
      console.log('Created simple question:', question.substring(0, 50));
    }
  });
  
  // Method 2: If still no questions, create basic questions from content chunks
  if (questions.length === 0) {
    console.log('No readable sentences found, creating basic questions from content chunks');
    
    // Split into paragraphs and find readable ones
    const paragraphs = readableContent
      .split(/\n\s*\n/)
      .filter(chunk => {
        const letterCount = (chunk.match(/[a-zA-Z]/g) || []).length;
        const totalChars = chunk.length;
        return chunk.trim().length > 40 && 
               (letterCount / totalChars) > 0.4; // Reduced from 0.6
      });
    
    console.log('Found readable paragraphs:', paragraphs.length);
    
    paragraphs.forEach((chunk, index) => {
      if (index < 5) {
        // Extract meaningful content from the chunk to create a specific question
        const firstSentence = chunk.split(/[.!?]+/)[0]?.trim();
        
        // Validate that the sentence doesn't contain PDF artifacts
        const isValidSentence = firstSentence && 
          firstSentence.length > 20 && 
          !firstSentence.includes('/') && 
          !firstSentence.includes('>>') && 
          !firstSentence.includes('<<') && 
          !firstSentence.match(/\d{4,}/) && // No long numbers
          (firstSentence.match(/[a-zA-Z]/g) || []).length / firstSentence.length > 0.7; // At least 70% letters
        
        const question = isValidSentence
          ? `Explain: ${firstSentence.substring(0, 80)}${firstSentence.length > 80 ? '...' : ''}`
          : `What is discussed in this section of the document?`;
        const answer = chunk.substring(0, 200) + (chunk.length > 200 ? '...' : '');
        questions.push({ question, answer });
      }
    });
  }

  // Method 3: If still no questions, create questions from readable lines
  if (questions.length === 0) {
    console.log('No readable paragraphs found, creating questions from readable lines');
    
    const lines = readableContent
      .split(/\n/)
      .filter(line => {
        const letterCount = (line.match(/[a-zA-Z]/g) || []).length;
        const totalChars = line.length;
        return line.trim().length > 25 && 
               (letterCount / totalChars) > 0.5; // Reduced from 0.7
      });
    
    console.log('Found readable lines:', lines.length);
    
    lines.forEach((line, index) => {
      if (index < 5) {
        // Create more specific questions based on line content
        const trimmedLine = line.trim();
        
        // Validate line doesn't contain PDF artifacts
        const isValidLine = trimmedLine.length > 30 && 
          !trimmedLine.includes('/') && 
          !trimmedLine.includes('>>') && 
          !trimmedLine.includes('<<') && 
          !trimmedLine.match(/\d{4,}/) && 
          (trimmedLine.match(/[a-zA-Z]/g) || []).length / trimmedLine.length > 0.6;
        
        const question = isValidLine
          ? `Explain: ${trimmedLine.substring(0, 60)}${trimmedLine.length > 60 ? '...' : ''}`
          : `What does this statement mean: ${trimmedLine}`;
        const answer = line.substring(0, 150) + (line.length > 150 ? '...' : '');
        questions.push({ question, answer });
      }
    });
  }
  
  // Method 4: Last resort - create generic questions from any readable content
  if (questions.length === 0) {
    console.log('No readable content found, creating generic questions');
    
    // Find any content that's mostly readable
    const contentLength = readableContent.length;
    const chunkSize = Math.floor(contentLength / 5);
    
    for (let i = 0; i < 5; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, contentLength);
      const chunk = readableContent.substring(start, end);
      
      // Check if chunk is readable
      const letterCount = (chunk.match(/[a-zA-Z]/g) || []).length;
      const totalChars = chunk.length;
      
      if (chunk.trim().length > 20 && (letterCount / totalChars) > 0.3) {
        // Extract meaningful content to create specific questions instead of generic section references
        const sentences = chunk.split(/[.!?]+/).filter(s => s.trim().length > 15);
        const firstMeaningfulSentence = sentences[0]?.trim();
        
        // Validate sentence doesn't contain PDF artifacts
        const isValidSentence = firstMeaningfulSentence && 
          firstMeaningfulSentence.length > 20 &&
          !firstMeaningfulSentence.includes('/') && 
          !firstMeaningfulSentence.includes('>>') && 
          !firstMeaningfulSentence.includes('<<') && 
          !firstMeaningfulSentence.match(/\d{4,}/) && 
          (firstMeaningfulSentence.match(/[a-zA-Z]/g) || []).length / firstMeaningfulSentence.length > 0.7;
        
        const question = isValidSentence
          ? `Explain: ${firstMeaningfulSentence.substring(0, 70)}${firstMeaningfulSentence.length > 70 ? '...' : ''}`
          : null; // Don't create generic questions
        
        if (question) { // Only add if we have a valid question
          const answer = chunk.trim();
          questions.push({ question, answer });
        }
      }
    }
  }

  console.log('Total simple questions created:', questions.length);
  
  // Do NOT create fallback questions - return empty if no real questions found
  if (questions.length === 0) {
    console.log('No valid questions found in document - returning empty array');
  }
  
  return questions;
};

// Determine importance based on question content and paper context
const determineImportance = (question: { question: string; answer: string }, paperContent: string): 'high' | 'medium' | 'low' => {
  const questionText = question.question.toLowerCase();
  const answerText = question.answer.toLowerCase();
  const paperText = paperContent.toLowerCase();
  
  // High importance indicators
  const highPriorityKeywords = ['important', 'key', 'essential', 'fundamental', 'critical', 'main', 'primary'];
  const hasHighPriority = highPriorityKeywords.some(keyword => 
    questionText.includes(keyword) || answerText.includes(keyword) || paperText.includes(keyword)
  );
  
  if (hasHighPriority) return 'high';
  
  // Medium importance indicators
  const mediumPriorityKeywords = ['explain', 'describe', 'discuss', 'analyze', 'compare', 'contrast'];
  const hasMediumPriority = mediumPriorityKeywords.some(keyword => 
    questionText.includes(keyword)
  );
  
  if (hasMediumPriority) return 'medium';
  
  return 'low';
};

// Determine difficulty based on question content
const determineDifficulty = (question: { question: string; answer: string }): 'easy' | 'medium' | 'hard' => {
  const questionText = question.question.toLowerCase();
  const answerText = question.answer.toLowerCase();
  
  // Hard difficulty indicators
  const hardKeywords = ['analyze', 'evaluate', 'critically', 'synthesize', 'compare and contrast', 'discuss implications'];
  const hasHardKeywords = hardKeywords.some(keyword => questionText.includes(keyword));
  
  if (hasHardKeywords) return 'hard';
  
  // Easy difficulty indicators  
  const easyKeywords = ['define', 'list', 'name', 'identify', 'what is', 'who is'];
  const easyScore = easyKeywords.some(keyword => questionText.includes(keyword));
  
  if (easyScore) return 'easy';
  
  return 'medium';
};

// Calculate confidence based on paper quality and question extraction
const calculateConfidence = (paper: UploadedPaper, questionIndex: number): number => {
  let confidence = 0.7; // Base confidence
  
  // Higher confidence for papers with more content
  if (paper.content.length > 1000) confidence += 0.1;
  if (paper.content.length > 2000) confidence += 0.1;
  
  // Higher confidence for papers with detected topics
  if (paper.topics && paper.topics.length > 0) confidence += 0.1;
  
  // Slight decrease for later questions (as extraction quality may decrease)
  confidence -= questionIndex * 0.02;
  
  // Higher confidence for papers with more content
  if (paper.content.length > 2000) confidence += 0.05;
  
  return Math.min(0.95, Math.max(0.3, confidence));
};

