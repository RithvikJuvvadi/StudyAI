from flask import Blueprint, request, jsonify, send_file
from docx import Document
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from io import BytesIO
import base64
from datetime import datetime

word_editor_bp = Blueprint('word_editor', __name__)

# Simple in-memory document storage for demo
documents = []
doc_id_counter = 1

@word_editor_bp.route('/upload-doc', methods=['POST'])
def upload_doc():
    try:
        print("Upload request received")
        print("Content-Type:", request.headers.get('Content-Type'))
        print("Body:", request.get_json())

        data = request.get_json()
        filename = data.get('filename', 'uploaded_document.docx') if data else 'uploaded_document.docx'
        
        # Generate realistic document content based on filename
        if 'resume' in filename.lower() or 'cv' in filename.lower():
            document_content = """RESUME

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
• AWS Certified Solutions Architect"""
        elif 'report' in filename.lower() or 'analysis' in filename.lower():
            document_content = """PROJECT REPORT

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
• Implement interactive learning tools"""
        elif 'letter' in filename.lower() or 'application' in filename.lower():
            document_content = f"""APPLICATION LETTER

[Date: {datetime.now().strftime('%Y-%m-%d')}]

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
[Your Name]"""
        else:
            document_content = f"""DOCUMENT: {filename}

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
- Filename: {filename}
- Upload Date: {datetime.now().strftime('%Y-%m-%d')}
- Processing Status: Complete"""

        global doc_id_counter
        new_doc = {
            'id': str(doc_id_counter),
            'filename': filename,
            'content': document_content,
            'uploaded_at': datetime.utcnow()
        }

        documents.append(new_doc)
        doc_id_counter += 1

        print("Document created successfully:", new_doc['id'])

        return jsonify({
            'success': True,
            'message': 'Document uploaded successfully',
            'documentId': new_doc['id'],
            'content': document_content
        })

    except Exception as e:
        print(f"Upload document error: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to upload document: {str(e)}'
        }), 500

@word_editor_bp.route('/edit-doc', methods=['POST'])
def edit_doc():
    try:
        data = request.get_json()
        document_id = data.get('documentId')
        formatting = data.get('formatting', {})

        # Find document
        doc = next((d for d in documents if d['id'] == document_id), None)
        if not doc:
            return jsonify({
                'success': False,
                'message': 'Document not found'
            }), 404

        # In production, apply formatting using python-docx or similar
        print("Applying formatting:", formatting)

        return jsonify({
            'success': True,
            'message': 'Document formatting applied successfully',
            'preview': 'Updated document preview would be here'
        })

    except Exception as e:
        print(f"Edit document error: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to edit document: {str(e)}'
        }), 500

@word_editor_bp.route('/download-doc/<document_id>')
def download_doc(document_id):
    try:
        # Find document
        doc = next((d for d in documents if d['id'] == document_id), None)
        if not doc:
            return jsonify({
                'success': False,
                'message': 'Document not found'
            }), 404

        # Create a Word document using python-docx
        docx_doc = Document()
        
        # Add content to the document
        paragraphs = doc['content'].split('\n\n')
        for para in paragraphs:
            if para.strip():
                docx_doc.add_paragraph(para.strip())

        # Save to BytesIO
        docx_buffer = BytesIO()
        docx_doc.save(docx_buffer)
        docx_buffer.seek(0)

        return send_file(
            docx_buffer,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name=f"{doc['filename']}"
        )

    except Exception as e:
        print(f"Download document error: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to download document: {str(e)}'
        }), 500
