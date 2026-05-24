import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WelcomeGate } from "@/components/WelcomeGate";
import { AccountLinkSync } from "@/components/AccountLinkSync";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Sonner />
    <BrowserRouter>
      <ErrorBoundary>
        <WelcomeGate>
          <AccountLinkSync />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </WelcomeGate>
      </ErrorBoundary>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
