import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, BookOpen, Zap, CheckCircle, ArrowRight } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";

export default function Index() {
  const { isSignedIn } = useAuth();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center space-y-8">
          <Badge variant="secondary" className="mb-4">
            <Zap className="h-3 w-3 mr-1" />
            AI-Powered Academic Solution
          </Badge>
          
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            <span className="text-foreground">Single Step Solution for</span>
            <br />
            <span className="text-primary">Student's Academics</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Transform your academic workflow with AI-powered tools for document editing and exam preparation. 
            Everything you need to excel in your studies, in one intelligent platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
            {isSignedIn ? (
              <>
                <Link to="/word-editor">
                  <Button size="lg" className="min-w-[200px]">
                    Open Word Editor
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/exam-prep">
                  <Button variant="outline" size="lg" className="min-w-[200px]">
                    Start Exam Prep
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Sign in or sign up using the buttons in the navigation bar to get started.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Tools Overview */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Powerful Tools for Academic Success
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our AI-powered platform provides everything you need to enhance your academic performance
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Word Editor Tool */}
          <Card className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
            <CardHeader className="text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Word Editor</CardTitle>
              <CardDescription className="text-base">
                Professional document editing with advanced formatting capabilities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                <li className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>Upload .docx files instantly</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>Advanced formatting controls</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>Live document preview</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>Export to .docx or .pdf</span>
                </li>
              </ul>
              {isSignedIn ? (
                <Link to="/word-editor" className="block">
                  <Button className="w-full mt-6" size="lg">
                    Start Editing
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground text-center mt-6">
                  Sign in to access this feature
                </p>
              )}
            </CardContent>
          </Card>

          {/* Exam Preparation Tool */}
          <Card className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
            <CardHeader className="text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4 group-hover:bg-secondary/70 transition-colors">
                <BookOpen className="h-8 w-8 text-secondary-foreground" />
              </div>
              <CardTitle className="text-2xl">Exam Preparation Guide</CardTitle>
              <CardDescription className="text-base">
                AI-powered question generation from previous year papers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                <li className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>Upload previous year papers</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>AI-generated important questions</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>Comprehensive answers provided</span>
                </li>
                <li className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>Download as formatted PDF</span>
                </li>
              </ul>
              {isSignedIn ? (
                <Link to="/exam-prep" className="block">
                  <Button variant="secondary" className="w-full mt-6" size="lg">
                    Start Preparing
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground text-center mt-6">
                  Sign in to access this feature
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

    </div>
  );
}
