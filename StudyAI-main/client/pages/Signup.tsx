import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GraduationCap, User, Mail, Lock, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button as UIButton } from "@/components/ui/button";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const validateEmail = (email: string) => {
    // Email must end with @gmail.com
    return email.toLowerCase().endsWith('@gmail.com');
  };

  const validatePassword = (password: string) => {
    // Password must be at least 8 characters long
    return password.length >= 8;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!name || !email || !password || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    // Email validation - must end with @gmail.com
    if (!validateEmail(email)) {
      setError("Incorrect email");
      return;
    }

    // Password validation - must be at least 8 characters
    if (!validatePassword(password)) {
      setError("Password must be at least 8 characters long");
      return;
    }

    // Password confirmation validation - passwords must match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });

      const data = await response.json();

      if (data.success) {
        // Use the auth context to login
        if (data.user && data.token) {
          login(data.user, data.token);
          // Redirect to home page
          navigate('/', { replace: true });
        } else {
          setError("Invalid response from server");
        }
      } else {
        setError(data.message || "Signup failed");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
      console.log('Google Client ID:', clientId); // Debug log
      
      if (!clientId) {
        setError('Google sign-in not configured');
        console.warn('Missing VITE_GOOGLE_CLIENT_ID');
        return;
      }

      const waitForGoogle = async (retries = 20, intervalMs = 250): Promise<any | null> => {
        for (let i = 0; i < retries; i++) {
          const g = (window as any).google;
          if (g?.accounts?.id) {
            console.log('Google script loaded successfully'); // Debug log
            return g;
          }
          await new Promise(r => setTimeout(r, intervalMs));
        }
        console.error('Google script failed to load after retries'); // Debug log
        return null;
      };

      const google = await waitForGoogle();
      if (!google) {
        setError('Google script not loaded. Please refresh and try again.');
        return;
      }

      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          try {
            console.log('Google callback received:', response); // Debug log
            const idToken = response?.credential;
            if (!idToken) {
              setError('Google sign-in failed - no credential received');
              return;
            }
            
            console.log('Sending token to server...'); // Debug log
            const res = await fetch('/api/google-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken })
            });
            
            if (!res.ok) {
              console.error('Server response not ok:', res.status, res.statusText); // Debug log
              setError(`Server error: ${res.status} ${res.statusText}`);
              return;
            }
            
            const data = await res.json();
            console.log('Server response:', data); // Debug log
            
            if (data?.success && data.user && data.token) {
              login(data.user, data.token);
              navigate('/', { replace: true });
            } else {
              setError(data?.message || 'Google login failed');
            }
          } catch (err) {
            console.error('Google callback error:', err); // Debug log
            setError('Network error. Please try again.');
          }
        }
      });

      console.log('Prompting Google sign-in...'); // Debug log
      google.accounts.id.prompt();
    } catch (err) {
      console.error('Google sign-in setup error:', err); // Debug log
      setError('Google sign-in error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <GraduationCap className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">StudyAI</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Join StudyAI</h1>
          <p className="text-muted-foreground mt-2">Create your account to get started</p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
            <CardDescription>Enter your information to create your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your Gmail address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Create a password (min 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating Account..." : "Create Account"}
              </Button>
            </form>

            <div className="mt-4">
              <UIButton
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
              >
                Continue with Google
              </UIButton>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
