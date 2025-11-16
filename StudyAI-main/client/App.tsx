import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { Navigation } from "@/components/Navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useSyncUser } from "@/hooks/useSyncUser";
import Index from "./pages/Index";
import WordEditor from "./pages/WordEditor";
import ExamPrep from "./pages/ExamPrep";
import NotFound from "./pages/NotFound";

// Component to sync user data when authenticated
function UserSync() {
  useSyncUser();
  return null;
}

const queryClient = new QueryClient();

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env.local file.");
}

const App = () => (
  <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
    <UserSync />
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<><Navigation /><Index /></>} />
          <Route path="/word-editor" element={
            <ProtectedRoute>
              <><Navigation /><WordEditor /></>
            </ProtectedRoute>
          } />
          <Route path="/exam-prep" element={
            <ProtectedRoute>
              <><Navigation /><ExamPrep /></>
            </ProtectedRoute>
          } />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<><Navigation /><NotFound /></>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </ClerkProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
