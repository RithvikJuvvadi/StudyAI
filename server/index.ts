import "dotenv/config";
import express from "express";
import cors from "cors";
import fileUpload from 'express-fileupload';
import { handleDemo } from "./routes/demo";
import { handleSignup, handleLogin, handleUpdateProfile, handleGoogleLogin, handleSyncUser } from "./routes/auth";
import { handleUploadDoc, handleEditDoc, handleDownloadDoc } from "./routes/word-editor";
import { 
  handleUploadPapers, 
  handleGenerateQuestions, 
  handleDownloadQuestions, 
  handleUploadFromGoogleDrive, 
  handleAnalyzePapers,
  handleGetUploadedPapers,
  handleRemovePaper,
  handleClearAllPapers
} from "./routes/exam-prep";
import pdfProcessorRouter from "./routes/pdf-processor";
import documentApiRouter from "./routes/document-api";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' })); // Increased limit for large file uploads
  app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Increased limit for large file uploads
  app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
    useTempFiles: true,
    tempFileDir: '/tmp/'
  }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Authentication routes
  app.post("/api/signup", handleSignup);
  app.post("/api/login", handleLogin);
  app.post("/api/google-login", handleGoogleLogin);
  app.post("/api/sync-user", handleSyncUser);
  app.put("/api/update-profile", handleUpdateProfile);

  // Word Editor routes
  app.post("/api/upload-doc", handleUploadDoc);
  app.post("/api/edit-doc", handleEditDoc);
  app.get("/api/download-doc/:documentId", handleDownloadDoc);

  // Document processing routes
  app.use("/api/documents", documentApiRouter);
  
  // Exam preparation routes
  app.post("/api/upload-papers", handleUploadPapers);
  app.post("/api/generate-questions", handleGenerateQuestions);
  app.get("/api/download-questions", handleDownloadQuestions);
  app.post("/api/upload-from-drive", handleUploadFromGoogleDrive);
  app.post("/api/analyze-papers", handleAnalyzePapers);
  app.get("/api/uploaded-papers", handleGetUploadedPapers);
  app.delete("/api/remove-paper/:paperId", handleRemovePaper);
  app.post("/api/remove-paper", handleRemovePaper); // Also support POST with body
  app.post("/api/clear-all-papers", handleClearAllPapers);
  
  // PDF processing routes
  app.use("/api/pdf", pdfProcessorRouter);

  return app;
}
