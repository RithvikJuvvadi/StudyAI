import { RequestHandler } from "express";
import { AuthResponse, SignupRequest, LoginRequest, UpdateProfileRequest, GoogleLoginRequest } from "@shared/api";

// Simple in-memory user storage for demo (in production, use a proper database)
interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

interface SyncedUser {
  clerkId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  imageUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const users: User[] = [];
const syncedUsers: SyncedUser[] = [];
let userIdCounter = 1;

// Simple password hashing (in production, use bcrypt)
function hashPassword(password: string): string {
  return Buffer.from(password).toString('base64');
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

function generateToken(userId: string): string {
  // Simple token generation (in production, use JWT)
  return Buffer.from(`${userId}-${Date.now()}`).toString('base64');
}

// Validation functions
function isValidEmail(email: string): boolean {
  // Check if email ends with @gmail.com
  return email.toLowerCase().endsWith('@gmail.com');
}

function isValidPassword(password: string): boolean {
  // Password must be at least 8 characters long
  return password.length >= 8;
}

export const handleSignup: RequestHandler = (req, res) => {
  try {
    const { name, email, password, confirmPassword }: SignupRequest = req.body;

    // Basic validation - check if all fields are provided
    if (!name || !email || !password || !confirmPassword) {
      const response: AuthResponse = {
        success: false,
        message: "Please provide name, email, password, and confirm password"
      };
      return res.status(400).json(response);
    }

    // Email validation - must end with @gmail.com
    if (!isValidEmail(email)) {
      const response: AuthResponse = {
        success: false,
        message: "Incorrect email"
      };
      return res.status(400).json(response);
    }

    // Password validation - must be at least 8 characters
    if (!isValidPassword(password)) {
      const response: AuthResponse = {
        success: false,
        message: "Password must be at least 8 characters long"
      };
      return res.status(400).json(response);
    }

    // Password confirmation validation - passwords must match
    if (password !== confirmPassword) {
      const response: AuthResponse = {
        success: false,
        message: "Passwords do not match"
      };
      return res.status(400).json(response);
    }

    // Check if user already exists
    const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      const response: AuthResponse = {
        success: false,
        message: "User with this email already exists"
      };
      return res.status(409).json(response);
    }

    // Create new user
    const newUser: User = {
      id: userIdCounter.toString(),
      name,
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
      createdAt: new Date()
    };

    users.push(newUser);
    userIdCounter++;

    const token = generateToken(newUser.id);

    const response: AuthResponse = {
      success: true,
      message: "Account created successfully",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email
      },
      token
    };

    res.status(201).json(response);
  } catch (error) {
    console.error("Signup error:", error);
    const response: AuthResponse = {
      success: false,
      message: "Internal server error"
    };
    res.status(500).json(response);
  }
};

export const handleLogin: RequestHandler = (req, res) => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Basic validation - check if all fields are provided
    if (!email || !password) {
      const response: AuthResponse = {
        success: false,
        message: "Please provide email and password"
      };
      return res.status(400).json(response);
    }

    // Email validation - must end with @gmail.com
    if (!isValidEmail(email)) {
      const response: AuthResponse = {
        success: false,
        message: "Incorrect email"
      };
      return res.status(400).json(response);
    }

    // Find user
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      const response: AuthResponse = {
        success: false,
        message: "Invalid email or password"
      };
      return res.status(401).json(response);
    }

    // Verify password
    if (!verifyPassword(password, user.passwordHash)) {
      const response: AuthResponse = {
        success: false,
        message: "Invalid email or password"
      };
      return res.status(401).json(response);
    }

    const token = generateToken(user.id);

    const response: AuthResponse = {
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      token
    };

    res.json(response);
  } catch (error) {
    console.error("Login error:", error);
    const response: AuthResponse = {
      success: false,
      message: "Internal server error"
    };
    res.status(500).json(response);
  }
};

export const handleUpdateProfile: RequestHandler = (req, res) => {
  try {
    const { name, password }: UpdateProfileRequest = req.body;
    
    // For demo purposes, we'll just return success
    // In production, you'd extract user ID from JWT token and update the database
    
    const response: AuthResponse = {
      success: true,
      message: "Profile updated successfully"
    };

    res.json(response);
  } catch (error) {
    console.error("Update profile error:", error);
    const response: AuthResponse = {
      success: false,
      message: "Internal server error"
    };
    res.status(500).json(response);
  }
};

export const handleGoogleLogin: RequestHandler = async (req, res) => {
  try {
    const { idToken }: GoogleLoginRequest = req.body;
    console.log('Google login request received'); // Debug log
    
    if (!idToken) {
      console.error('Missing idToken in request'); // Debug log
      return res.status(400).json({ success: false, message: "Missing idToken" });
    }

    console.log('Verifying token with Google...'); // Debug log
    // Verify token with Google
    const googleResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    console.log('Google verification response status:', googleResp.status); // Debug log
    
    if (!googleResp.ok) {
      console.error('Google token verification failed:', googleResp.status, googleResp.statusText); // Debug log
      return res.status(401).json({ success: false, message: "Invalid Google token" });
    }
    
    const profile: any = await googleResp.json();
    console.log('Google profile received:', { email: profile?.email, name: profile?.name }); // Debug log

    const email: string | undefined = profile?.email;
    const name: string = profile?.name || profile?.given_name || "Google User";
    if (!email) {
      console.error('Google profile missing email'); // Debug log
      return res.status(400).json({ success: false, message: "Google profile missing email" });
    }

    // Find or create user
    let user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      console.log('Creating new user for Google login'); // Debug log
      user = {
        id: userIdCounter.toString(),
        name,
        email: email.toLowerCase(),
        passwordHash: hashPassword("google-auth"),
        createdAt: new Date()
      };
      users.push(user);
      userIdCounter++;
    } else {
      console.log('Found existing user for Google login'); // Debug log
    }

    const token = generateToken(user.id);
    const response: AuthResponse = {
      success: true,
      message: "Login successful",
      user: { id: user.id, name: user.name, email: user.email },
      token
    };
    
    console.log('Google login successful for user:', user.email); // Debug log
    res.json(response);
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const handleSyncUser: RequestHandler = (req, res) => {
  try {
    const { clerk_id, email, first_name, last_name, full_name, image_url } = req.body ?? {};

    if (!clerk_id || !email) {
      return res.status(400).json({
        success: false,
        message: "clerk_id and email are required"
      });
    }

    const payload = {
      clerkId: clerk_id,
      email: email.toLowerCase(),
      firstName: first_name,
      lastName: last_name,
      fullName: full_name || `${first_name ?? ''} ${last_name ?? ''}`.trim() || undefined,
      imageUrl: image_url
    };

    const existing = syncedUsers.find((user) => user.clerkId === clerk_id);
    if (existing) {
      Object.assign(existing, payload, { updatedAt: new Date() });
    } else {
      syncedUsers.push({
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return res.json({
      success: true,
      message: "User synced successfully"
    });
  } catch (error) {
    console.error("Sync user error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
