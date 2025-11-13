import express from 'express';
import multer from 'multer';
import { Request, Response } from 'express';
import { processPDF } from './document-processor';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

// Configure multer with file filter
const uploadMiddleware = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Helper function to handle file cleanup
const cleanupFile = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', filePath, err);
    });
  }
};

// Process PDF endpoint
router.post('/process-pdf', (req: Request, res: Response) => {
  uploadMiddleware.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ 
        success: false,
        error: err.message || 'Error uploading file',
        message: 'Failed to process uploaded file'
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded',
        message: 'Please upload a PDF file'
      });
    }

    const filePath = req.file.path;
    
    try {
      const result = await processPDF(filePath);
      
      // Clean up the uploaded file
      cleanupFile(filePath);
      
      if (result.success) {
        return res.json({
          success: true,
          text: result.text,
          questions: result.questions,
          message: result.message
        });
      } else {
        return res.status(400).json({
          success: false,
          error: result.error || 'Unknown error',
          message: result.message
        });
      }
    } catch (error: any) {
      // Clean up the uploaded file in case of error
      cleanupFile(filePath);
      
      console.error('Error processing PDF:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'An error occurred',
        message: 'Failed to process PDF'
      });
    }
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

// Delete uploaded file endpoint
router.delete('/delete-file', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Security check: Ensure the file is within the uploads directory
    const uploadsDir = path.resolve('uploads');
    const resolvedPath = path.resolve(filePath);
    
    if (!resolvedPath.startsWith(uploadsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete the file
    fs.unlink(resolvedPath, (err) => {
      if (err) {
        console.error('Error deleting file:', err);
        return res.status(500).json({ error: 'Failed to delete file' });
      }
      res.json({ success: true, message: 'File deleted successfully' });
    });
  } catch (error) {
    console.error('Error in delete endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});


export default router;
