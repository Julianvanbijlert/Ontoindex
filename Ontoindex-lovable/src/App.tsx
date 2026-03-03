import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { DefinitionsProvider } from "@/context/DefinitionsContext";
import Index from "./pages/Index";
import Browse from "./pages/Browse";
import Compare from "./pages/Compare";
import UploadPage from "./pages/Upload";
import Sources from "./pages/Sources";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <DefinitionsProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="flex min-h-screen">
            <AppSidebar />
            <main className="flex-1 ml-16 lg:ml-56">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/browse" element={<Browse />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/sources" element={<Sources />} />
                <Route path="/settings" element={<div className="p-8 text-muted-foreground text-sm">Settings — coming soon</div>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </DefinitionsProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
