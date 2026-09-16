import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import { MotionConfig } from 'framer-motion';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import MainLayout from './components/MainLayout';

// Route-level code splitting → smaller initial bundle, faster + more stable loads.
const BriefPage = lazy(() => import('./pages/BriefPage'));
const ApprovalPage = lazy(() => import('./pages/ApprovalPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const ListsPage = lazy(() => import('./pages/ListsPage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const SalesTeamsPage = lazy(() => import('./pages/SalesTeamsPage'));
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const DemoPage = lazy(() => import('./pages/DemoPage'));

function FullScreenLoader() {
    return (
        <div className="flex h-screen items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
}

function Protected({ children }) {
    const { isAuthed, loading } = useAuth();
    if (loading) return <FullScreenLoader />;
    if (!isAuthed) return <Navigate to="/login" replace />;
    return <MainLayout>{children}</MainLayout>;
}

function PublicOnly({ children }) {
    const { isAuthed, loading } = useAuth();
    if (loading) return <FullScreenLoader />;
    if (isAuthed) return <Navigate to="/" replace />;
    return children;
}

// Root: marketing landing page for logged-out visitors, the app for members.
function Home() {
    const { isAuthed, loading } = useAuth();
    if (loading) return <FullScreenLoader />;
    return isAuthed ? <MainLayout><BriefPage /></MainLayout> : <LandingPage />;
}

function App() {
    return (
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            {/* reducedMotion="user" → honors OS "reduce motion"; default spring is fast + GPU-friendly. */}
            <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.6 }}>
                <AuthProvider>
                    <ErrorBoundary>
                        <Router>
                            <Toaster position="top-right" richColors closeButton />
                            <Suspense fallback={<FullScreenLoader />}>
                                <Routes>
                                    <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
                                    <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
                                    <Route path="/" element={<Home />} />
                                    <Route path="/demo" element={<DemoPage />} />
                                    <Route path="/approval/:id" element={<Protected><ApprovalPage /></Protected>} />
                                    <Route path="/dashboard/:id" element={<Protected><DashboardPage /></Protected>} />
                                    <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
                                    <Route path="/inbox" element={<Protected><InboxPage /></Protected>} />
                                    <Route path="/leads" element={<Protected><LeadsPage /></Protected>} />
                                    <Route path="/team" element={<Protected><TeamPage /></Protected>} />
                                    <Route path="/sales-teams" element={<Protected><SalesTeamsPage /></Protected>} />
                                    <Route path="/accept-invite" element={<Protected><AcceptInvitePage /></Protected>} />
                                    <Route path="/contacts" element={<Protected><ContactsPage /></Protected>} />
                                    <Route path="/lists" element={<Protected><ListsPage /></Protected>} />
                                    <Route path="/templates" element={<Protected><TemplatesPage /></Protected>} />
                                    <Route path="/billing" element={<Protected><BillingPage /></Protected>} />
                                    <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
                                    <Route path="*" element={<Navigate to="/" replace />} />
                                </Routes>
                            </Suspense>
                        </Router>
                    </ErrorBoundary>
                </AuthProvider>
            </MotionConfig>
        </ThemeProvider>
    );
}

export default App;
