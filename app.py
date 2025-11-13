from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import base64
import jwt
import json
from datetime import datetime, timedelta
from io import BytesIO
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

# Import route handlers
from routes.auth import auth_bp
from routes.word_editor import word_editor_bp
from routes.exam_prep import exam_prep_bp
from routes.demo import demo_bp

# Load environment variables
load_dotenv()

def create_app():
    app = Flask(__name__)
    
    # Configure CORS
    CORS(app)
    
    # Register blueprints
    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(word_editor_bp, url_prefix='/api')
    app.register_blueprint(exam_prep_bp, url_prefix='/api')
    app.register_blueprint(demo_bp, url_prefix='/api')
    
    # Basic ping endpoint
    @app.route('/api/ping')
    def ping():
        ping_message = os.getenv('PING_MESSAGE', 'ping')
        return jsonify({'message': ping_message})
    
    # Debug: List all routes
    @app.route('/api/routes', methods=['GET'])
    def list_routes():
        routes = [str(rule) for rule in app.url_map.iter_rules()]
        return jsonify({'routes': routes})
    
    # Error handler for 404
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            'success': False,
            'error': {
                'message': f'Route not found: {request.path}',
                'code': 'NOT_FOUND',
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }
        }), 404
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, host='0.0.0.0', port=5000)
