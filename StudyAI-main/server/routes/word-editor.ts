import { RequestHandler } from "express";
import { UploadDocResponse, EditDocRequest } from "@shared/api";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber } from "docx";

// Simple in-memory document storage for demo
interface DocumentFormatting {
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
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

interface StoredDocument {
  id: string;
  filename: string;
  content: string;
  formatting?: DocumentFormatting;
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
      formatting: {
        fontFamily: 'Arial',
        fontSize: 12,
        fontColor: '#000000',
        margins: { top: 1, bottom: 1, left: 1, right: 1 },
        alignment: 'left',
        lineSpacing: 1.5,
        pageNumbers: false,
        bold: false,
        italic: false,
        underline: false
      },
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
    const { documentId, formatting, content }: EditDocRequest & { content?: string } = req.body;

    // Find document
    const doc = documents.find(d => d.id === documentId);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    // Save formatting if provided
    if (formatting) {
      doc.formatting = {
        ...doc.formatting,
        ...formatting
      };
      console.log("Formatting saved:", doc.formatting);
    }

    // Save content if provided
    if (typeof content === 'string') {
      doc.content = content;
      console.log("Content updated. New length:", content.length);
      console.log("Content preview (first 200 chars):", content.substring(0, 200));
    }

    res.json({
      success: true,
      message: "Document formatting applied successfully",
      preview: doc.content
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

    // Debug: Log what we're using
    console.log(`Downloading document ${documentId}`);
    console.log(`Content length: ${doc.content.length}`);
    console.log(`Content preview (first 200 chars): ${doc.content.substring(0, 200)}`);
    console.log(`Formatting:`, doc.formatting);

    const baseFilename = doc.filename.replace('.docx', '').replace('.pdf', '');
    const filename = format === 'pdf' ? `${baseFilename}_edited.pdf` : `${baseFilename}_edited.docx`;
    
    const formatting = doc.formatting || {
      fontFamily: 'Arial',
      fontSize: 12,
      fontColor: '#000000',
      margins: { top: 1, bottom: 1, left: 1, right: 1 },
      alignment: 'left',
      lineSpacing: 1.5,
      pageNumbers: false,
      bold: false,
      italic: false,
      underline: false
    };

    if (format === 'pdf') {
      // Generate PDF using PDFKit with formatting
      const margins = formatting.margins || { top: 1, bottom: 1, left: 1, right: 1 };
      const pdfDoc = new PDFDocument({
        size: 'A4',
        margins: {
          top: margins.top * 72,
          bottom: margins.bottom * 72,
          left: margins.left * 72,
          right: margins.right * 72
        }
      });

      // Set response headers for PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Pipe PDF to response
      pdfDoc.pipe(res);

      // Font mapping for PDF (PDFKit uses standard PDF fonts)
      const fontMap: { [key: string]: string } = {
        'Arial': 'Helvetica',
        'Calibri': 'Helvetica',
        'Georgia': 'Times-Roman',
        'Times New Roman': 'Times-Roman'
      };
      
      const fontFamily = formatting.fontFamily || 'Arial';
      const baseFont = fontMap[fontFamily] || 'Helvetica';
      
      // Function to get the correct font variant based on bold/italic
      const getFontVariant = (isBold: boolean, isItalic: boolean, isHeader: boolean = false) => {
        const useBold = isBold || isHeader;
        const useItalic = isItalic;
        
        if (baseFont === 'Times-Roman') {
          if (useBold && useItalic) return 'Times-BoldItalic';
          if (useBold) return 'Times-Bold';
          if (useItalic) return 'Times-Italic';
          return 'Times-Roman';
        } else {
          // Helvetica
          if (useBold && useItalic) return 'Helvetica-BoldOblique';
          if (useBold) return 'Helvetica-Bold';
          if (useItalic) return 'Helvetica-Oblique';
          return 'Helvetica';
        }
      };

      const fontSize = formatting.fontSize || 12;
      const alignment = formatting.alignment || 'left';
      const alignMap: { [key: string]: 'left' | 'center' | 'right' | 'justify' } = {
        'left': 'left',
        'center': 'center',
        'right': 'right',
        'justify': 'left' // PDFKit doesn't support justify, use left
      };

      // Track pages for page numbering
      let pageNumber = 0;
      
      // Add page numbers if enabled - add to each page as it's created
      if (formatting.pageNumbers) {
        // Add page number to first page immediately
        pageNumber = 1;
        const firstPage = pdfDoc.page;
        const savedY = pdfDoc.y;
        const savedX = pdfDoc.x;
        
        pdfDoc.fontSize(10)
              .font('Helvetica')
              .fillColor('#666666')
              .text(`Page ${pageNumber}`, 0, firstPage.height - 40, {
                width: firstPage.width,
                align: 'center'
              });
        
        // Restore cursor to start writing content
        pdfDoc.x = savedX;
        pdfDoc.y = savedY;
        
        // Add page numbers to subsequent pages
        pdfDoc.on('pageAdded', () => {
          pageNumber++;
          const currentPageIndex = pageNumber - 1;
          
          // Switch to the newly added page
          pdfDoc.switchToPage(currentPageIndex);
          
          // Save current cursor position
          const savedY = pdfDoc.y;
          const savedX = pdfDoc.x;
          
          // Add page number at the bottom center
          const page = pdfDoc.page;
          pdfDoc.fontSize(10)
                .font('Helvetica')
                .fillColor('#666666')
                .text(`Page ${pageNumber}`, 0, page.height - 40, {
                  width: page.width,
                  align: 'center'
                });
          
          // Restore cursor position
          pdfDoc.x = savedX;
          pdfDoc.y = savedY;
        });
      }

      // Add main content with formatting
      const contentLines = doc.content.split('\n');
      contentLines.forEach(line => {
        if (line.trim()) {
          const isHeader = line.match(/^[A-Z\s]+$/) && line.length < 50;
          const lineFontSize = isHeader ? fontSize + 2 : fontSize;
          const lineFont = getFontVariant(formatting.bold || false, formatting.italic || false, isHeader);
          
          pdfDoc.fontSize(lineFontSize)
                .font(lineFont)
                .fillColor(formatting.fontColor || '#000000')
                .text(line.trim(), { 
                  align: alignMap[alignment] || 'left',
                  underline: formatting.underline || false
                });
          pdfDoc.moveDown((formatting.lineSpacing || 1.5) * 0.5);
        } else {
          pdfDoc.moveDown((formatting.lineSpacing || 1.5) * 0.3);
        }
      });

      // Finalize PDF
      pdfDoc.end();

    } else {
      // Generate DOCX using docx library with formatting
      const margins = formatting.margins || { top: 1, bottom: 1, left: 1, right: 1 };
      const alignmentMap: { [key: string]: AlignmentType } = {
        'left': AlignmentType.LEFT,
        'center': AlignmentType.CENTER,
        'right': AlignmentType.RIGHT,
        'justify': AlignmentType.JUSTIFIED
      };

      // Build footer with page numbers if enabled
      const footer = formatting.pageNumbers ? new Footer({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                size: 20, // 10pt in half-points
                color: '666666'
              })
            ],
            alignment: AlignmentType.CENTER
          })
        ]
      }) : undefined;

      const docxDoc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: margins.top * 1440, // Convert inches to twips (1 inch = 1440 twips)
                bottom: margins.bottom * 1440,
                left: margins.left * 1440,
                right: margins.right * 1440
              }
            }
          },
          headers: {},
          footers: {
            default: footer
          },
          children: [
            // Main content with formatting
            ...doc.content.split('\n').map(line => {
              const trimmedLine = line.trim();
              if (!trimmedLine) {
                return new Paragraph({ children: [new TextRun({ text: '' })] });
              }
              
              const isHeader = trimmedLine.match(/^[A-Z\s]+$/) && trimmedLine.length < 50;
              const fontSize = isHeader ? (formatting.fontSize || 12) + 2 : (formatting.fontSize || 12);
              
              // Parse color (remove # if present)
              const color = (formatting.fontColor || '#000000').replace('#', '');
              
              // Ensure font family is one of the supported fonts
              const fontFamily = formatting.fontFamily || 'Arial';
              const validFonts = ['Arial', 'Times New Roman', 'Georgia', 'Calibri'];
              const selectedFont = validFonts.includes(fontFamily) ? fontFamily : 'Arial';
              
              return new Paragraph({
                children: [
                  new TextRun({
                    text: trimmedLine,
                    font: selectedFont,
                    size: fontSize * 2, // docx uses half-points
                    color: color,
                    bold: isHeader || formatting.bold || false,
                    italics: formatting.italic || false,
                    underline: formatting.underline ? {} : undefined
                  })
                ],
                alignment: alignmentMap[formatting.alignment || 'left'] || AlignmentType.LEFT,
                spacing: {
                  line: (formatting.lineSpacing || 1.5) * 240, // Convert to twips
                  lineRule: 'auto'
                }
              });
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
