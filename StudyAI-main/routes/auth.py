from flask import Blueprint, request, jsonify
import os
import sys

# Add parent directory to path to import database
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import create_or_update_user, get_user_by_clerk_id, delete_user, get_user_data, set_user_data

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/sync-user', methods=['POST'])
def sync_user():
    """Sync Clerk user data to SQLite database"""
    try:
        data = request.get_json()
        clerk_id = data.get('clerk_id')
        email = data.get('email')
        
        if not clerk_id or not email:
            return jsonify({
                'success': False,
                'message': 'clerk_id and email are required'
            }), 400
        
        # Extract name components
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        full_name = data.get('full_name') or data.get('name')
        image_url = data.get('image_url')
        
        # Create or update user in database
        user = create_or_update_user(
            clerk_id=clerk_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
            full_name=full_name,
            image_url=image_url
        )
        
        if user:
            return jsonify({
                'success': True,
                'message': 'User synced successfully',
                'user': {
                    'id': user['id'],
                    'clerk_id': user['clerk_id'],
                    'email': user['email'],
                    'full_name': user['full_name'],
                    'first_name': user['first_name'],
                    'last_name': user['last_name']
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to sync user'
            }), 500
            
    except Exception as e:
        print(f"Sync user error: {e}")
        return jsonify({
            'success': False,
            'message': f'Internal server error: {str(e)}'
        }), 500

@auth_bp.route('/get-user/<clerk_id>', methods=['GET'])
def get_user(clerk_id):
    """Get user data from database by Clerk ID"""
    try:
        user = get_user_by_clerk_id(clerk_id)
        
        if user:
            return jsonify({
                'success': True,
                'user': {
                    'id': user['id'],
                    'clerk_id': user['clerk_id'],
                    'email': user['email'],
                    'full_name': user['full_name'],
                    'first_name': user['first_name'],
                    'last_name': user['last_name'],
                    'image_url': user['image_url'],
                    'created_at': user['created_at'],
                    'updated_at': user['updated_at']
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404
            
    except Exception as e:
        print(f"Get user error: {e}")
        return jsonify({
            'success': False,
            'message': f'Internal server error: {str(e)}'
        }), 500

@auth_bp.route('/delete-user/<clerk_id>', methods=['DELETE'])
def delete_user_endpoint(clerk_id):
    """Delete user from database (called when user is deleted in Clerk)"""
    try:
        deleted = delete_user(clerk_id)
        
        if deleted:
            return jsonify({
                'success': True,
                'message': 'User deleted successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404
            
    except Exception as e:
        print(f"Delete user error: {e}")
        return jsonify({
            'success': False,
            'message': f'Internal server error: {str(e)}'
        }), 500

@auth_bp.route('/user-data/<clerk_id>', methods=['GET', 'POST', 'PUT'])
def user_data(clerk_id):
    """Get or set user data (preferences, settings, etc.)"""
    try:
        user = get_user_by_clerk_id(clerk_id)
        if not user:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404
        
        user_id = user['id']
        
        if request.method == 'GET':
            # Get all user data
            from database import get_all_user_data
            data = get_all_user_data(user_id)
            return jsonify({
                'success': True,
                'data': data
            }), 200
        
        elif request.method in ['POST', 'PUT']:
            # Set user data
            data = request.get_json()
            if not data:
                return jsonify({
                    'success': False,
                    'message': 'No data provided'
                }), 400
            
            for key, value in data.items():
                set_user_data(user_id, key, str(value))
            
            return jsonify({
                'success': True,
                'message': 'User data updated successfully'
            }), 200
            
    except Exception as e:
        print(f"User data error: {e}")
        return jsonify({
            'success': False,
            'message': f'Internal server error: {str(e)}'
        }), 500
