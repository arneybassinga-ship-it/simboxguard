import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthGuard } from "./components/auth/AuthGuard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Unauthorized from "./pages/Unauthorized";

// Pages Agent
import AgentDashboard from "./pages/agent/Dashboard";
import ImportCDR from "./pages/agent/ImportCDR";
import AgregationCDR from "./pages/agent/AgregationCDR";
import SimboxDetection from "./pages/agent/SimboxDetection";
import AgentAnalyses from "./pages/agent/Analyses";
import AgentBlocking from "./pages/agent/Blocking";

// Pages Analyste
import AnalysteDashboard from "./pages/analyste/Dashboard";
import SuspiciousSims from "./pages/analyste/SuspiciousSims";
import SimboxValidation from "./pages/analyste/SimboxValidation";
import AnalysteHistory from "./pages/analyste/History";
import AnalysteReports from "./pages/analyste/Reports";

// Pages ARPCE
import ArpceDashboard from "./pages/arpce/Dashboard";
import ArpceReports from "./pages/arpce/Reports";
import ArpceBlocking from "./pages/arpce/Blocking";
import ArpceSanctions from "./pages/arpce/Sanctions";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          
          {/* Routes Agent */}
          <Route path="/agent/dashboard" element={
            <AuthGuard allowedRoles={['AGENT_MTN', 'AGENT_AIRTEL']}>
              <AgentDashboard />
            </AuthGuard>
          } />
          <Route path="/agent/import" element={
            <AuthGuard allowedRoles={['AGENT_MTN', 'AGENT_AIRTEL']}>
              <ImportCDR />
            </AuthGuard>
          } />
          <Route path="/agent/agregation" element={
            <AuthGuard allowedRoles={['AGENT_MTN', 'AGENT_AIRTEL']}>
              <AgregationCDR />
            </AuthGuard>
          } />
          <Route path="/agent/simbox" element={
            <AuthGuard allowedRoles={['AGENT_MTN', 'AGENT_AIRTEL']}>
              <SimboxDetection />
            </AuthGuard>
          } />
          <Route path="/agent/analyses" element={
            <AuthGuard allowedRoles={['AGENT_MTN', 'AGENT_AIRTEL']}>
              <AgentAnalyses />
            </AuthGuard>
          } />
          <Route path="/agent/blocking" element={
            <AuthGuard allowedRoles={['AGENT_MTN', 'AGENT_AIRTEL']}>
              <AgentBlocking />
            </AuthGuard>
          } />

          {/* Routes Analyste */}
          <Route path="/analyste/dashboard" element={
            <AuthGuard allowedRoles={['ANALYSTE']}>
              <AnalysteDashboard />
            </AuthGuard>
          } />
          <Route path="/analyste/suspicious" element={
            <AuthGuard allowedRoles={['ANALYSTE']}>
              <SuspiciousSims />
            </AuthGuard>
          } />
          <Route path="/analyste/simbox" element={
            <AuthGuard allowedRoles={['ANALYSTE']}>
              <SimboxValidation />
            </AuthGuard>
          } />
          <Route path="/analyste/history" element={
            <AuthGuard allowedRoles={['ANALYSTE']}>
              <AnalysteHistory />
            </AuthGuard>
          } />
          <Route path="/analyste/reports" element={
            <AuthGuard allowedRoles={['ANALYSTE']}>
              <AnalysteReports />
            </AuthGuard>
          } />

          {/* Routes ARPCE */}
          <Route path="/arpce/dashboard" element={
            <AuthGuard allowedRoles={['ARPCE']}>
              <ArpceDashboard />
            </AuthGuard>
          } />
          <Route path="/arpce/reports" element={
            <AuthGuard allowedRoles={['ARPCE']}>
              <ArpceReports />
            </AuthGuard>
          } />
          <Route path="/arpce/blocking" element={
            <AuthGuard allowedRoles={['ARPCE']}>
              <ArpceBlocking />
            </AuthGuard>
          } />
          <Route path="/arpce/sanctions" element={
            <AuthGuard allowedRoles={['ARPCE']}>
              <ArpceSanctions />
            </AuthGuard>
          } />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
