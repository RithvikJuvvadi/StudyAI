from flask import Blueprint, jsonify

demo_bp = Blueprint('demo', __name__)

@demo_bp.route('/demo')
def demo():
    return jsonify({
        'message': 'Hello from Flask! This is a demo endpoint.',
        'timestamp': '2024-01-01T00:00:00Z',
        'status': 'success'
    })
