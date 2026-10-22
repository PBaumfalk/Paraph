import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession } from './lib/session';
import { Spinner, ToastProvider } from './components/ui';
import { Shell } from './components/Shell';
import { useLang } from './lib/i18n';

const Login = lazy(() => import('./pages/auth/Login'));
const Setup = lazy(() => import('./pages/auth/Setup'));
const Invite = lazy(() => import('./pages/auth/Invite'));
const Reset = lazy(() => import('./pages/auth/Reset'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EnvelopePage = lazy(() => import('./pages/EnvelopePage'));
const EnvelopeEditor = lazy(() => import('./pages/EnvelopeEditor'));
const Templates = lazy(() => import('./pages/Templates'));
const TemplateEditor = lazy(() => import('./pages/TemplateEditor'));
const Forms = lazy(() => import('./pages/Forms'));
const Activity = lazy(() => import('./pages/Activity'));
const Settings = lazy(() => import('./pages/settings/Settings'));
const Sign = lazy(() => import('./pages/sign/Sign'));
const PublicForm = lazy(() => import('./pages/sign/PublicForm'));
const Verify = lazy(() => import('./pages/Verify'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

const Loading = () => (
  <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
    <Spinner />
  </div>
);

function Protected({ children }: { children: React.ReactNode }) {
  const { auth, me } = useSession();
  const loc = useLocation();
  if (auth.setup_required) return <Navigate to="/setup" replace />;
  if (!auth.session || auth.session.mfa_pending || !me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <Shell>{children}</Shell>;
}

export function App() {
  useLang();
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              {/* Öffentlich, ohne Sitzung */}
              <Route path="/s/:token" element={<Sign />} />
              <Route path="/embed/s/:token" element={<Sign embedded />} />
              <Route path="/f/:slug" element={<PublicForm />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/docs/api" element={<ApiDocs />} />
              <Route
                path="*"
                element={
                  <SessionProvider fallback={<Loading />}>
                    <Routes>
                      <Route path="/login" element={<Login />} />
                      <Route path="/setup" element={<Setup />} />
                      <Route path="/invite/:token" element={<Invite />} />
                      <Route path="/reset/:token" element={<Reset />} />
                      <Route path="/" element={<Protected><Dashboard /></Protected>} />
                      <Route path="/envelopes/:id" element={<Protected><EnvelopePage /></Protected>} />
                      <Route path="/envelopes/:id/edit" element={<Protected><EnvelopeEditor /></Protected>} />
                      <Route path="/templates" element={<Protected><Templates /></Protected>} />
                      <Route path="/templates/:id/edit" element={<Protected><TemplateEditor /></Protected>} />
                      <Route path="/forms" element={<Protected><Forms /></Protected>} />
                      <Route path="/activity" element={<Protected><Activity /></Protected>} />
                      <Route path="/settings/*" element={<Protected><Settings /></Protected>} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </SessionProvider>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
