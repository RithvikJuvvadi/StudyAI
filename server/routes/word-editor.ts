import { RequestHandler } from "express";
import { UploadDocResponse, EditDocRequest } from "@shared/api";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";

// Simple in-memory document storage for demo
interface StoredDocument {
  id: string;
  filename: string;
  content: string;
  uploadedAt: Date;
}

const documents: StoredDocument[] = [];
let docIdCounter = 1;

export const handleUploadDoc: RequestHandler = (req, res) => {
  try {
    console.log("Upload request received");
    console.log("Content-Type:", req.headers['content-type']);
    console.log("Body:", req.body);

    // For demo purposes, we'll simulate file upload and content extraction
    // In production, use multer middleware to handle actual file uploads

    let filename = 'uploaded_document.docx';
    let documentContent = '';

    // Get filename from JSON request body
    if (req.body && req.body.filename) {
      filename = req.body.filename;
    }

    // Generate realistic document content based on filename
    if (filename.toLowerCase().includes('resume') || filename.toLowerCase().includes('cv')) {
      documentContent = `RESUME

John Doe
Software Engineer
Email: john.doe@email.com
Phone: (555) 123-4567

EXPERIENCE
Senior Software Engineer at TechCorp (2020-Present)
• Developed web applications using React and Node.js
• Led a team of 5 developers
• Improved application performance by 40%

Software Engineer at StartupXYZ (2018-2020)
• Built mobile applications using React Native
• Collaborated with design team on user interfaces

EDUCATION
Bachelor of Computer Science
University of Technology (2014-2018)

SKILLS
• JavaScript, Python, Java
• React, Node.js, MongoDB
• Git, Docker, AWS

ACHIEVEMENTS
• Published 3 technical articles
• Speaker at 2 tech conferences
• AWS Certified Solutions Architect`;
    } else if (filename.toLowerCase().includes('report') || filename.toLowerCase().includes('analysis')) {
      documentContent = `PROJECT REPORT

Title: Analysis of Student Performance in Online Learning

ABSTRACT
This report analyzes the impact of online learning on student performance during the academic year 2023-2024. The study examines various factors affecting student engagement and academic outcomes.

INTRODUCTION
The transition to online learning has significantly changed educational methodologies. This study examines the effectiveness of digital learning platforms and their impact on student achievement.

METHODOLOGY
Data was collected from 500 students across different departments using:
• Online surveys and questionnaires
• Academic performance records
• Engagement metrics from learning platforms
• Focus group discussions

FINDINGS
1. Student engagement decreased by 15% in online formats
2. Technical difficulties affected 30% of students
3. Self-motivated students performed better in online settings
4. Interactive content improved retention by 25%

CONCLUSION
Online learning presents both challenges and opportunities for educational institutions. Proper implementation and support systems are crucial for success.

RECOMMENDATIONS
• Improve technical infrastructure
• Provide training for both students and faculty
• Develop hybrid learning models
• Implement interactive learning tools`;
    } else if (filename.toLowerCase().includes('letter') || filename.toLowerCase().includes('application')) {
      documentContent = `APPLICATION LETTER

[Date: ${new Date().toLocaleDateString()}]

Dear Hiring Manager,

I am writing to express my strong interest in the Software Engineer position at your esteemed organization. With my background in computer science and hands-on experience in web development, I am confident that I would be a valuable addition to your team.

QUALIFICATIONS
• Bachelor's degree in Computer Science
• 3+ years of experience in software development
• Proficiency in React, Node.js, and Python
• Strong problem-solving and analytical skills

ACHIEVEMENTS
In my previous role, I successfully led a team project that resulted in a 40% improvement in application performance. I have also contributed to open-source projects and maintained a strong commitment to clean, maintainable code.

I am excited about the opportunity to contribute to your organization's continued success and would welcome the chance to discuss how my skills and enthusiasm can benefit your team.

Thank you for your time and consideration.

Sincerely,
[Your Name]`;
    } else {
      documentContent = `DOCUMENT: ${filename}

This is a sample document that demonstrates the Word Editor functionality.

INTRODUCTION
This document contains sample text that would normally be extracted from an uploaded .docx file. In a production environment, the system would use libraries like python-docx to extract the actual content from uploaded documents.

CONTENT SECTIONS

Section 1: Document Overview
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.

Section 2: Features and Capabilities
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Section 3: Technical Implementation
Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.

CONCLUSION
This document demonstrates how uploaded content would appear in the Word Editor. Users can apply various formatting options including font changes, alignment, spacing, and more.

---
Document Information:
- Filename: ${filename}
- Upload Date: ${new Date().toLocaleDateString()}
- Processing Status: Complete`;
    }

    const newDoc: StoredDocument = {
      id: docIdCounter.toString(),
      filename,
      content: documentContent,
      uploadedAt: new Date()
    };

    documents.push(newDoc);
    docIdCounter++;

    console.log("Document created successfully:", newDoc.id);

    const response: UploadDocResponse = {
      success: true,
      message: "Document uploaded successfully",
      documentId: newDoc.id,
      content: documentContent
    };

    res.json(response);
  } catch (error) {
    console.error("Upload document error:", error);
    const response: UploadDocResponse = {
      success: false,
      message: `Failed to upload document: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
    res.status(500).json(response);
  }
};

export const handleEditDoc: RequestHandler = (req, res) => {
  try {
    const { documentId, formatting }: EditDocRequest = req.body;

    // Find document
    const doc = documents.find(d => d.id === documentId);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    // In production, apply formatting using python-docx or similar
    console.log("Applying formatting:", formatting);

    res.json({
      success: true,
      message: "Document formatting applied successfully",
      preview: "Updated document preview would be here"
    });
  } catch (error) {
    console.error("Edit document error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to apply formatting"
    });
  }
};

export const handleDownloadDoc: RequestHandler = (req, res) => {
  try {
    const { documentId } = req.params;
    const { format } = req.query;

    // Find document
    const doc = documents.find(d => d.id === documentId);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    const baseFilename = doc.filename.replace('.docx', '').replace('.pdf', '');
    const filename = format === 'pdf' ? `${baseFilename}.pdf` : `${baseFilename}.docx`;

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

      // Set response headers for PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Pipe PDF to response
      pdfDoc.pipe(res);

      // Add content to PDF
      pdfDoc.fontSize(16).font('Helvetica-Bold').text('DOCUMENT', { align: 'center' });
      pdfDoc.moveDown();
      pdfDoc.fontSize(12).font('Helvetica').text(`Filename: ${doc.filename}`, { align: 'left' });
      pdfDoc.text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'left' });
      pdfDoc.text(`Format: PDF`, { align: 'left' });
      pdfDoc.moveDown();

      // Add main content
      const contentLines = doc.content.split('\n');
      contentLines.forEach(line => {
        if (line.trim()) {
          // Check if it's a header (all caps and short)
          if (line.match(/^[A-Z\s]+$/) && line.length < 50) {
            pdfDoc.fontSize(14).font('Helvetica-Bold').text(line.trim());
          } else {
            pdfDoc.fontSize(12).font('Helvetica').text(line.trim());
          }
          pdfDoc.moveDown(0.5);
        } else {
          pdfDoc.moveDown();
        }
      });

      pdfDoc.moveDown();
      pdfDoc.fontSize(10).font('Helvetica-Oblique').text('---', { align: 'center' });
      pdfDoc.text('Generated by StudyAI Word Editor', { align: 'center' });
      pdfDoc.text(`Document ID: ${doc.id}`, { align: 'center' });
      pdfDoc.text(`Upload Date: ${doc.uploadedAt.toLocaleDateString()}`, { align: 'center' });

      // Finalize PDF
      pdfDoc.end();

    } else {
      // Generate DOCX using docx library
      const docxDoc = new Document({
        sections: [{
          properties: {},
          children: [
            // Title
            new Paragraph({
              children: [
                new TextRun({
                  text: 'DOCUMENT',
                  bold: true,
                  size: 32
                })
              ],
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Filename: ${doc.filename}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Generated: ${new Date().toLocaleDateString()}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Format: DOCX',
                  size: 24
                })
              ]
            }),
            new Paragraph({ children: [new TextRun({ text: '' })] }), // Empty line

            // Main content
            ...doc.content.split('\n').map(line => {
              const trimmedLine = line.trim();
              if (!trimmedLine) {
                return new Paragraph({ children: [new TextRun({ text: '' })] });
              }
              
              // Check if it's a header
              if (trimmedLine.match(/^[A-Z\s]+$/) && trimmedLine.length < 50) {
                return new Paragraph({
                  children: [
                    new TextRun({
                      text: trimmedLine,
                      bold: true,
                      size: 28
                    })
                  ]
                });
              }
              
              return new Paragraph({
                children: [
                  new TextRun({
                    text: trimmedLine,
                    size: 24
                  })
                ]
              });
            }),

            // Footer
            new Paragraph({ children: [new TextRun({ text: '' })] }),
            new Paragraph({
              children: [
                new TextRun({
                  text: '---',
                  size: 20
                })
              ],
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Generated by StudyAI Word Editor',
                  size: 20
                })
              ],
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Document ID: ${doc.id}`,
                  size: 20
                })
              ],
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Upload Date: ${doc.uploadedAt.toLocaleDateString()}`,
                  size: 20
                })
              ],
              alignment: AlignmentType.CENTER
            })
          ]
        }]
      });

      // Set response headers for DOCX
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Generate and send DOCX buffer
      Packer.toBuffer(docxDoc).then(buffer => {
        res.send(buffer);
      }).catch(error => {
        console.error("DOCX generation error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to generate DOCX file"
        });
      });
    }
  } catch (error) {
    console.error("Download document error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download document"
    });
  }
};
