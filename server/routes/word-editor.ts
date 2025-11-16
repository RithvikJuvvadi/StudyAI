import { RequestHandler } from "express";
import { UploadDocResponse, EditDocRequest } from "@shared/api";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber } from "docx";
import mammoth from 'mammoth';

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
  formattedContent?: string; // HTML content with inline formatting
  formatting?: DocumentFormatting;
  uploadedAt: Date;
}

// Interface for parsed text segments with formatting
interface FormattedSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
}

// Parse HTML to extract text with formatting
function parseHTMLContent(html: string): FormattedSegment[][] {
  if (!html) return [];
  
  // Remove script and style tags
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Split by block elements (div, p, br) - but keep the structure
  const blockRegex = /(<div[^>]*>|<\/div>|<p[^>]*>|<\/p>|<br\s*\/?>)/gi;
  const parts = html.split(blockRegex);
  const blocks: string[] = [];
  let currentBlock = '';
  
  for (const part of parts) {
    if (blockRegex.test(part)) {
      if (currentBlock.trim()) {
        blocks.push(currentBlock);
        currentBlock = '';
      }
    } else {
      currentBlock += part;
    }
  }
  if (currentBlock.trim()) {
    blocks.push(currentBlock);
  }
  
  return blocks.filter(b => b.trim()).map(block => {
    const segments: FormattedSegment[] = [];
    const formatStack: Partial<FormattedSegment>[] = [{}];
    
    // Simple regex-based HTML parsing
    const tagRegex = /<(\/?)([a-z]+)(?:\s+[^>]*)?>/gi;
    let lastIndex = 0;
    let match;
    
    while ((match = tagRegex.exec(block)) !== null) {
      // Add text before tag
      if (match.index > lastIndex) {
        const text = block.substring(lastIndex, match.index);
        if (text.trim()) {
          const currentFormat = { ...formatStack[formatStack.length - 1] };
          segments.push({
            text: text,
            ...currentFormat
          });
        }
      }
      
      const isClosing = match[1] === '/';
      const tagName = match[2].toLowerCase();
      
      if (!isClosing) {
        // Opening tag - apply formatting
        const newFormat: Partial<FormattedSegment> = { ...formatStack[formatStack.length - 1] };
        
        if (tagName === 'b' || tagName === 'strong') {
          newFormat.bold = true;
        } else if (tagName === 'i' || tagName === 'em') {
          newFormat.italic = true;
        } else if (tagName === 'u') {
          newFormat.underline = true;
        } else if (tagName === 'span') {
          // Extract style attributes
          const styleMatch = match[0].match(/style="([^"]*)"/i);
          if (styleMatch) {
            const styles = styleMatch[1];
            if (styles.includes('font-weight:bold') || styles.includes('font-weight: bold') || styles.includes('font-weight:700')) {
              newFormat.bold = true;
            }
            if (styles.includes('font-style:italic') || styles.includes('font-style: italic')) {
              newFormat.italic = true;
            }
            if (styles.includes('text-decoration:underline') || styles.includes('text-decoration: underline')) {
              newFormat.underline = true;
            }
            const colorMatch = styles.match(/color:\s*([^;]+)/i);
            if (colorMatch) {
              newFormat.color = colorMatch[1].trim();
            }
            const fontSizeMatch = styles.match(/font-size:\s*([^;]+)/i);
            if (fontSizeMatch) {
              const sizeStr = fontSizeMatch[1].trim();
              const sizeNum = parseFloat(sizeStr);
              if (!isNaN(sizeNum)) {
                newFormat.fontSize = sizeNum;
              }
            }
            const fontFamilyMatch = styles.match(/font-family:\s*([^;]+)/i);
            if (fontFamilyMatch) {
              newFormat.fontFamily = fontFamilyMatch[1].trim().replace(/['"]/g, '').split(',')[0].trim();
            }
          }
        }
        
        formatStack.push(newFormat);
      } else {
        // Closing tag - pop formatting
        if (formatStack.length > 1) {
          formatStack.pop();
        }
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < block.length) {
      const text = block.substring(lastIndex);
      if (text.trim()) {
        const currentFormat = { ...formatStack[formatStack.length - 1] };
        segments.push({
          text: text,
          ...currentFormat
        });
      }
    }
    
    return segments.length > 0 ? segments : [{ text: block.replace(/<[^>]+>/g, '').trim() }];
  });
}

const documents: StoredDocument[] = [];
let docIdCounter = 1;

export const handleUploadDoc: RequestHandler = async (req, res) => {
  try {
    console.log("Upload request received");
    console.log("Content-Type:", req.headers['content-type']);
    console.log("Body keys:", Object.keys(req.body || {}));

    let filename = 'uploaded_document.docx';
    let documentContent = '';

    // Get filename and content from request body
    if (req.body) {
      if (req.body.filename) {
        filename = req.body.filename;
      }
      
      // Extract content from uploaded file
      if (req.body.content) {
        try {
          // Content is base64 encoded
          const base64Content = req.body.content;
          console.log(`Received base64 content length: ${base64Content.length} characters`);
          
          const fileBuffer = Buffer.from(base64Content, 'base64');
          console.log(`Decoded buffer size: ${fileBuffer.length} bytes`);
          
          // Use mammoth to extract text from DOCX with better options
          const result = await mammoth.extractRawText({ 
            buffer: fileBuffer,
            includeDefaultStyleMap: true,
            includeEmbeddedStyleMap: true
          });
          
          documentContent = result.value;
          
          // Check for warnings
          if (result.messages && result.messages.length > 0) {
            console.warn('Mammoth extraction warnings:', result.messages);
          }
          
          console.log(`Extracted ${documentContent.length} characters from DOCX`);
          console.log(`Content preview (first 500 chars): ${documentContent.substring(0, 500)}`);
          console.log(`Content preview (last 200 chars): ${documentContent.substring(Math.max(0, documentContent.length - 200))}`);
          
          if (!documentContent || documentContent.trim().length === 0) {
            throw new Error('No text could be extracted from the DOCX file');
          }
        } catch (extractError: any) {
          console.error("Error extracting text from DOCX:", extractError);
          console.error("Error stack:", extractError?.stack);
          return res.status(400).json({
            success: false,
            message: `Failed to extract content from DOCX file: ${extractError?.message || 'Unknown error'}`
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "No file content provided. Please upload a valid .docx file."
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid request. Please upload a .docx file."
      });
    }

    const newDoc: StoredDocument = {
      id: String(docIdCounter++),
      filename: filename,
      content: documentContent,
      uploadedAt: new Date()
    };

    documents.push(newDoc);

    const response: UploadDocResponse = {
      success: true,
      documentId: newDoc.id,
      filename: newDoc.filename,
      preview: newDoc.content.substring(0, 500),
      content: newDoc.content // Send FULL content to frontend (not truncated)
    };
    
    console.log(`Sending response. Full content length: ${newDoc.content.length} characters`);
    res.json(response);
  } catch (error: any) {
    console.error("Upload document error:", error);
    const response: UploadDocResponse = {
      success: false,
      message: `Failed to upload document: ${error?.message || 'Unknown error'}`
    };
    res.status(500).json(response);
  }
};

export const handleEditDoc: RequestHandler = (req, res) => {
  try {
    const { documentId, formatting, content, formattedContent }: EditDocRequest & { content?: string; formattedContent?: string } = req.body;

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

    // Save formattedContent (HTML) if provided
    if (typeof formattedContent === 'string') {
      doc.formattedContent = formattedContent;
      console.log("FormattedContent (HTML) updated. Length:", formattedContent.length);
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

export const handleDownloadDoc: RequestHandler = async (req, res) => {
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
    console.log(`FormattedContent length: ${doc.formattedContent?.length || 0}`);
    console.log(`Content preview (first 200 chars): ${doc.content.substring(0, 200)}`);
    console.log(`Formatting:`, doc.formatting);

    const baseFilename = doc.filename.replace('.docx', '').replace('.pdf', '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = format === 'pdf' ? `${baseFilename}_edited.pdf` : `${baseFilename}_edited.docx`;
    const encodedFilename = encodeURIComponent(filename);
    
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

    // Parse HTML formattedContent if available, otherwise use plain content
    const parsedContent = doc.formattedContent ? parseHTMLContent(doc.formattedContent) : null;

    if (format === 'pdf') {
      // Generate PDF using PDFKit with formatting
      const margins = formatting.margins || { top: 1, bottom: 1, left: 1, right: 1 };
      const pdfDoc = new PDFDocument({
        size: 'A4',
        bufferPages: formatting.pageNumbers || false, // Enable buffering if page numbers are needed
        margins: {
          top: margins.top * 72,
          bottom: margins.bottom * 72,
          left: margins.left * 72,
          right: margins.right * 72
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

      // Font mapping for PDF (PDFKit uses standard PDF fonts)
      const fontMap: { [key: string]: string } = {
        'Arial': 'Helvetica',
        'Calibri': 'Helvetica',
        'Georgia': 'Times-Roman',
        'Times New Roman': 'Times-Roman'
      };
      
      const defaultFontFamily = formatting.fontFamily || 'Arial';
      const baseFont = fontMap[defaultFontFamily] || 'Helvetica';
      
      // Function to get the correct font variant based on bold/italic
      const getFontVariant = (isBold: boolean, isItalic: boolean, baseFontName: string = baseFont) => {
        const useBold = isBold;
        const useItalic = isItalic;
        
        if (baseFontName === 'Times-Roman') {
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

      const defaultFontSize = formatting.fontSize || 12;
      const alignment = formatting.alignment || 'left';
      const alignMap: { [key: string]: 'left' | 'center' | 'right' | 'justify' } = {
        'left': 'left',
        'center': 'center',
        'right': 'right',
        'justify': 'left' // PDFKit doesn't support justify, use left
      };

      // Add main content with formatting
      try {
        if (parsedContent && parsedContent.length > 0) {
          // Use parsed HTML content with inline formatting
          parsedContent.forEach((block) => {
            if (pdfDoc.y > 700) {
              pdfDoc.addPage();
            }
            
            block.forEach((segment) => {
              const segmentFontFamily = segment.fontFamily || defaultFontFamily;
              const segmentBaseFont = fontMap[segmentFontFamily] || baseFont;
              const segmentFont = getFontVariant(
                segment.bold || false,
                segment.italic || false,
                segmentBaseFont
              );
              const segmentSize = segment.fontSize || defaultFontSize;
              const segmentColor = segment.color || formatting.fontColor || '#000000';
              
              pdfDoc.fontSize(segmentSize)
                    .font(segmentFont)
                    .fillColor(segmentColor)
                    .text(segment.text, {
                      align: alignMap[alignment] || 'left',
                      underline: segment.underline || false,
                      continued: true
                    });
            });
            
            pdfDoc.moveDown((formatting.lineSpacing || 1.5) * 0.5);
          });
        } else {
          // Fallback to plain content
          const contentLines = doc.content.split('\n');
          
          contentLines.forEach((line) => {
            if (line.trim()) {
              const isHeader = line.match(/^[A-Z\s]+$/) && line.length < 50;
              const lineFontSize = isHeader ? defaultFontSize + 2 : defaultFontSize;
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
        }

        // Add page numbers to ALL pages after content is written (using buffered pages)
        if (formatting.pageNumbers) {
          try {
            const range = pdfDoc.bufferedPageRange();
            const totalPages = range.count;
            console.log(`Adding page numbers to ${totalPages} pages (range: ${range.start} to ${range.start + range.count - 1})`);
            
            // Add page numbers to all pages
            for (let i = range.start; i < range.start + range.count; i++) {
              try {
                pdfDoc.switchToPage(i);
                const page = pdfDoc.page;
                const pageNumber = i - range.start + 1;
                
                // Calculate bottom position (accounting for margins)
                const bottomY = page.height - (margins.bottom * 72) - 15;
                const pageWidth = page.width - (margins.left * 72) - (margins.right * 72);
                
                // Save current position
                const savedY = pdfDoc.y;
                const savedX = pdfDoc.x;
                
                // Move to bottom and add page number
                pdfDoc.y = bottomY;
                pdfDoc.x = margins.left * 72;
                
                pdfDoc.fontSize(10)
                      .font('Helvetica')
                      .fillColor('#666666')
                      .text(`Page ${pageNumber}`, {
                        width: pageWidth,
                        align: 'center'
                      });
                
                // Restore position
                pdfDoc.x = savedX;
                pdfDoc.y = savedY;
                
                console.log(`Added page number ${pageNumber} to page index ${i}`);
              } catch (pageError) {
                console.error(`Error adding page number to page ${i + 1}:`, pageError);
                // Continue with other pages even if one fails
              }
            }
            
            // Switch back to last page before ending
            if (totalPages > 0) {
              pdfDoc.switchToPage(range.start + range.count - 1);
            }
          } catch (error) {
            console.error("Error adding page numbers:", error);
            // Continue - PDF will still be generated without page numbers
          }
        }

        // Finalize PDF
        pdfDoc.end();
      } catch (error) {
        console.error("Error writing PDF content:", error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Failed to generate PDF content"
          });
        } else {
          pdfDoc.end();
        }
      }
    } else {
      // Generate DOCX using docx library
      const margins = formatting.margins || { top: 1, bottom: 1, left: 1, right: 1 };
      
      // Define alignment map first
      const alignmentMap: { [key: string]: AlignmentType } = {
        'left': AlignmentType.LEFT,
        'center': AlignmentType.CENTER,
        'right': AlignmentType.RIGHT,
        'justify': AlignmentType.JUSTIFIED
      };
      
      const footer = formatting.pageNumbers ? new Footer({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES],
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
            ...(parsedContent && parsedContent.length > 0
              ? parsedContent.map(block => {
                  const children = block.map(segment => {
                    const segmentFontFamily = segment.fontFamily || formatting.fontFamily || 'Arial';
                    const segmentSize = Math.round((segment.fontSize || formatting.fontSize || 12) * 2); // Convert to half-points
                    const segmentColor = segment.color || formatting.fontColor || '#000000';
                    
                    // Validate font family
                    const validFonts = ['Arial', 'Calibri', 'Georgia', 'Times New Roman'];
                    const validFontFamily = validFonts.includes(segmentFontFamily) ? segmentFontFamily : 'Arial';
                    
                    return new TextRun({
                      text: segment.text,
                      bold: segment.bold || false,
                      italics: segment.italic || false,
                      underline: segment.underline ? {} : undefined,
                      color: segmentColor.replace('#', ''),
                      size: segmentSize,
                      font: validFontFamily
                    });
                  });
                  
                  return new Paragraph({
                    children: children,
                    spacing: {
                      after: Math.round((formatting.lineSpacing || 1.5) * 120), // Line spacing in twips (1.5 = 180 twips)
                      line: Math.round((formatting.lineSpacing || 1.5) * 240) // Line height in twips
                    },
                    alignment: alignmentMap[formatting.alignment || 'left']
                  });
                })
              : doc.content.split('\n').map(line => {
                  const trimmedLine = line.trim();
                  if (!trimmedLine) {
                    return new Paragraph({ 
                      children: [new TextRun({ text: '' })],
                      spacing: {
                        after: Math.round((formatting.lineSpacing || 1.5) * 120),
                        line: Math.round((formatting.lineSpacing || 1.5) * 240)
                      }
                    });
                  }
                  
                  const isHeader = trimmedLine.match(/^[A-Z\s]+$/) && trimmedLine.length < 50;
                  const fontSize = isHeader ? (formatting.fontSize || 12) + 2 : (formatting.fontSize || 12);
                  
                  // Parse color (remove # if present)
                  const color = (formatting.fontColor || '#000000').replace('#', '');
                  
                  // Validate font family
                  const validFonts = ['Arial', 'Calibri', 'Georgia', 'Times New Roman'];
                  const fontFamily = validFonts.includes(formatting.fontFamily || '') 
                    ? (formatting.fontFamily || 'Arial')
                    : 'Arial';
                  
                  return new Paragraph({
                    children: [
                      new TextRun({
                        text: trimmedLine,
                        bold: formatting.bold || isHeader,
                        italics: formatting.italic || false,
                        underline: formatting.underline ? {} : undefined,
                        color: color,
                        size: Math.round(fontSize * 2), // Convert to half-points
                        font: fontFamily
                      })
                    ],
                    spacing: {
                      after: Math.round((formatting.lineSpacing || 1.5) * 120), // Line spacing in twips
                      line: Math.round((formatting.lineSpacing || 1.5) * 240) // Line height in twips (240 twips = 12pt single spacing)
                    },
                    alignment: alignmentMap[formatting.alignment || 'left']
                  });
                })
            )
          ]
        }]
      });

      // Generate DOCX buffer
      try {
        const buffer = await Packer.toBuffer(docxDoc);
        console.log(`DOCX generated successfully. Buffer size: ${buffer.length} bytes`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
        res.setHeader('Content-Length', buffer.length.toString());
        res.send(buffer);
      } catch (error: any) {
        console.error("DOCX generation error:", error);
        console.error("Error stack:", error?.stack);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: `Failed to generate DOCX file: ${error?.message || 'Unknown error'}`
          });
        }
      }
    }
  } catch (error) {
    console.error("Download document error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to download document"
      });
    }
  }
};
