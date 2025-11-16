import sqlite3
import os
from datetime import datetime
from typing import Optional, Dict, Any

# Database file path
DB_PATH = os.path.join(os.path.dirname(__file__), 'studyai.db')

def get_db_connection():
    """Get a database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Return rows as dictionaries
    return conn

def init_db():
    """Initialize the database with required tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            clerk_id TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            first_name TEXT,
            last_name TEXT,
            full_name TEXT,
            image_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create user_sessions table to track activity
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            session_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            session_end TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    # Create user_data table for storing additional user preferences/data
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, key)
        )
    ''')
    
    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")

def create_or_update_user(clerk_id: str, email: str, first_name: Optional[str] = None, 
                          last_name: Optional[str] = None, full_name: Optional[str] = None,
                          image_url: Optional[str] = None) -> Dict[str, Any]:
    """Create or update a user in the database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if user exists by clerk_id
    cursor.execute('SELECT id FROM users WHERE clerk_id = ?', (clerk_id,))
    existing = cursor.fetchone()
    
    if existing:
        # Update existing user
        cursor.execute('''
            UPDATE users 
            SET email = ?, first_name = ?, last_name = ?, full_name = ?, 
                image_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE clerk_id = ?
        ''', (email, first_name, last_name, full_name, image_url, clerk_id))
        user_id = existing['id']
    else:
        # Create new user
        user_id = clerk_id  # Use clerk_id as the primary key
        cursor.execute('''
            INSERT INTO users (id, clerk_id, email, first_name, last_name, full_name, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, clerk_id, email, first_name, last_name, full_name, image_url))
    
    conn.commit()
    
    # Fetch the updated/created user
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    return dict(user) if user else None

def get_user_by_clerk_id(clerk_id: str) -> Optional[Dict[str, Any]]:
    """Get a user by Clerk ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE clerk_id = ?', (clerk_id,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Get a user by email"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def delete_user(clerk_id: str) -> bool:
    """Delete a user from the database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM users WHERE clerk_id = ?', (clerk_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def set_user_data(user_id: str, key: str, value: str):
    """Set user data (preferences, settings, etc.)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO user_data (user_id, key, value, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ''', (user_id, key, value))
    conn.commit()
    conn.close()

def get_user_data(user_id: str, key: str) -> Optional[str]:
    """Get user data by key"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT value FROM user_data WHERE user_id = ? AND key = ?', (user_id, key))
    result = cursor.fetchone()
    conn.close()
    return result['value'] if result else None

def get_all_user_data(user_id: str) -> Dict[str, str]:
    """Get all user data for a user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT key, value FROM user_data WHERE user_id = ?', (user_id,))
    results = cursor.fetchall()
    conn.close()
    return {row['key']: row['value'] for row in results}

# Initialize database on import
init_db()

