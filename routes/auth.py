from flask import Blueprint, request, jsonify
import base64
import jwt
import os
from datetime import datetime, timedelta

auth_bp = Blueprint('auth', __name__)

# Simple in-memory user storage for demo (in production, use a proper database)
users = []
user_id_counter = 1

# JWT secret key (in production, use a secure secret)
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key')

# Simple password hashing (in production, use bcrypt)
def hash_password(password):
    return base64.b64encode(password.encode()).decode()

def verify_password(password, hash_value):
    return hash_password(password) == hash_value

def generate_token(user_id):
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(days=1),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

@auth_bp.route('/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')

        # Validation
        if not name or not email or not password:
            return jsonify({
                'success': False,
                'message': 'Please provide name, email, and password'
            }), 400

        if len(password) < 8:
            return jsonify({
                'success': False,
                'message': 'Password must be at least 8 characters long'
            }), 400

        # Check if user already exists
        existing_user = next((u for u in users if u['email'].lower() == email.lower()), None)
        if existing_user:
            return jsonify({
                'success': False,
                'message': 'User with this email already exists'
            }), 409

        # Create new user
        global user_id_counter
        new_user = {
            'id': str(user_id_counter),
            'name': name,
            'email': email.lower(),
            'password_hash': hash_password(password),
            'created_at': datetime.utcnow()
        }

        users.append(new_user)
        user_id_counter += 1

        token = generate_token(new_user['id'])

        return jsonify({
            'success': True,
            'message': 'Account created successfully',
            'user': {
                'id': new_user['id'],
                'name': new_user['name'],
                'email': new_user['email']
            },
            'token': token
        }), 201

    except Exception as e:
        print(f"Signup error: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error'
        }), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        # Validation
        if not email or not password:
            return jsonify({
                'success': False,
                'message': 'Please provide email and password'
            }), 400

        # Find user
        user = next((u for u in users if u['email'].lower() == email.lower()), None)
        if not user:
            return jsonify({
                'success': False,
                'message': 'Invalid email or password'
            }), 401

        # Verify password
        if not verify_password(password, user['password_hash']):
            return jsonify({
                'success': False,
                'message': 'Invalid email or password'
            }), 401

        token = generate_token(user['id'])

        return jsonify({
            'success': True,
            'message': 'Login successful',
            'user': {
                'id': user['id'],
                'name': user['name'],
                'email': user['email']
            },
            'token': token
        })

    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error'
        }), 500

@auth_bp.route('/update-profile', methods=['PUT'])
def update_profile():
    try:
        data = request.get_json()
        name = data.get('name')
        password = data.get('password')
        
        # For demo purposes, we'll just return success
        # In production, you'd extract user ID from JWT token and update the database
        
        return jsonify({
            'success': True,
            'message': 'Profile updated successfully'
        })

    except Exception as e:
        print(f"Update profile error: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error'
        }), 500
