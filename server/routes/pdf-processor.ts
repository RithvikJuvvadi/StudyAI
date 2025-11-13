import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { promisify } from 'util';

const router = Router();
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

// In-memory storage for processed PDFs
interface ProcessedPDF {
  id: string;
  filename: string;
  questions: Array<{
    question: string;
    answer: string;
    confidence: number;
  }>;
  processedAt: Date;
}

const processedPDFs: Record<string, ProcessedPDF> = {};

// Endpoint to process PDF and extract questions
router.post('/process-pdf', async (req: any, res: any) => {
  try {
    if (!req.files || !req.files.pdf) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const pdfFile = req.files.pdf;
    const uploadDir = path.join(__dirname, '../../uploads');
    const filename = `${Date.now()}-${pdfFile.name}`;
    const filePath = path.join(uploadDir, filename);

    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Save uploaded file
    await writeFile(filePath, pdfFile.data);

    // Process PDF using Python script
    const processId = uuidv4();
    const pythonProcess = spawn('python', [
      path.join(__dirname, '../../pdf_processor.py'),
      filePath
    ]);

    let result = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    return new Promise<void>((resolve) => {
      pythonProcess.on('close', async (code) => {
        try {
          // Clean up the uploaded file
          await unlink(filePath);

          if (code !== 0) {
            console.error('Python script error:', error);
            return res.status(500).json({ 
              error: 'Failed to process PDF',
              details: error 
            });
          }

          // Parse the result
          let qaPairs;
          try {
            qaPairs = JSON.parse(result);
          } catch (e) {
            console.error('Failed to parse Python script output:', e);
            return res.status(500).json({ 
              error: 'Invalid response from PDF processor' 
            });
          }

          // Store the processed PDF
          const processedPDF: ProcessedPDF = {
            id: processId,
            filename: pdfFile.name,
            questions: qaPairs.map((qa: any) => ({
              question: qa.question,
              answer: qa.answer,
              confidence: qa.confidence
            })),
            processedAt: new Date()
          };

          processedPDFs[processId] = processedPDF;

          res.json({
            id: processId,
            filename: pdfFile.name,
            questionCount: processedPDF.questions.length,
            processedAt: processedPDF.processedAt
          });
        } catch (err) {
          console.error('Error in PDF processing:', err);
          res.status(500).json({ 
            error: 'Failed to process PDF',
            details: err instanceof Error ? err.message : String(err)
          });
        } finally {
          resolve();
        }
      });
    });
  } catch (err) {
    console.error('Error processing PDF:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      details: err instanceof Error ? err.message : String(err)
    });
  }
});

// Get processed PDF results
router.get('/processed-pdf/:id', (req, res) => {
  const { id } = req.params;
  const processedPDF = processedPDFs[id];

  if (!processedPDF) {
    return res.status(404).json({ error: 'Processed PDF not found' });
  }

  res.json(processedPDF);
});

export default router;
