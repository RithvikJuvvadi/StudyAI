/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

/**
 * Authentication API types
 */
export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  token?: string;
}

export interface UpdateProfileRequest {
  name?: string;
  password?: string;
}

export interface GoogleLoginRequest {
  idToken: string;
}

/**
 * Word Editor API types
 */
export interface UploadDocResponse {
  success: boolean;
  message: string;
  documentId?: string;
  content?: string;
}

export interface DownloadDocResponse {
  success: boolean;
  message: string;
  buffer?: Buffer;
}

export interface EditDocRequest {
  documentId: string;
  formatting: {
    fontFamily?: string;
    fontSize?: number;
    fontColor?: string;
    margins?: {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
    alignment?: 'left' | 'center' | 'right' | 'justify';
    lineSpacing?: number;
    pageNumbers?: boolean;
  };
}

/**
 * Exam Preparation API types
 */
export interface GenerateQuestionsResponse {
  success: boolean;
  message: string;
  questions?: Array<{
    question: string;
    answer: string;
    importance: 'high' | 'medium' | 'low';
    topic?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }>;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink?: string;
}

export interface GeneratedQuestion {
  question: string;
  answer: string;
  importance: 'high' | 'medium' | 'low';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}

export interface UploadFromGoogleDriveRequest {
  fileIds: string[];
  accessToken: string;
}

export interface UploadFromGoogleDriveResponse {
  success: boolean;
  message: string;
  uploadedFiles?: Array<{
    id: string;
    filename: string;
    content?: string;
  }>;
}

export interface AnalyzePapersRequest {
  paperIds: string[];
  examType?: string;
  subject?: string;
  focusAreas?: string[];
}

export interface AnalyzePapersResponse {
  success: boolean;
  message: string;
  analysis?: {
    totalQuestions: number;
    topics: Array<{
      name: string;
      frequency: number;
      importance: 'high' | 'medium' | 'low';
    }>;
    predictedQuestions: GeneratedQuestion[];
    detectedExamType?: string;
    detectedSubject?: string;
  };
}

export interface UploadedPaper {
  id: string;
  filename: string;
  content: string;
  uploadedAt: Date;
  source: 'local' | 'google-drive';
  topics?: string[];
  questionCount?: number;
}

export interface GetUploadedPapersResponse {
  success: boolean;
  message: string;
  papers: UploadedPaper[];
}

export interface RemovePaperRequest {
  paperId: string;
}

export interface RemovePaperResponse {
  success: boolean;
  message: string;
}

export interface DownloadQuestionsRequest {
  questionsId: string;
  format: 'pdf' | 'docx' | 'txt';
  includeAnswers: boolean;
  includeTopics: boolean;
}
