import { Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Skeleton } from './components/primitives';
import { Topics } from './screens/Topics';
import { TopicDetail } from './screens/TopicDetail';
import { Timeline } from './screens/Timeline';
import { Prep } from './screens/Prep';
import { CreatorBot } from './screens/CreatorBot';
import { Sources, RetainedSource } from './screens/Sources';
import { SavedWork, LegacySavedWork } from './screens/SavedWork';
import { ControlCenter } from './screens/ControlCenter';
import { Login, SessionChecking, WorkspaceOpening } from './screens/Login';
import './styles/login.css';

type SessionState = 'checking' | 'authenticated' | 'unauthenticated' | 'opening' | 'unavailable';
type AuthConfig = { mode: string; turnstile: boolean; turnstileSiteKey: string };

export default function App() {
  const [session, setSession] = useState<SessionState>('checking');
  const [authConfig, setAuthConfig] = useState<AuthConfig>({ mode: 'development', turnstile: false, turnstileSiteKey: '' });

  // Appearance preferences are applied before first paint of any screen.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.contrast = localStorage.getItem('contrast') ?? 'normal';
    root.dataset.density = localStorage.getItem('density') ?? 'comfortable';
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/auth/config').then((response) => response.ok ? response.json() : Promise.reject()),
      fetch('/api/auth/session').then((response) => response.ok ? response.json() : Promise.reject()),
    ])
      .then(([config, current]) => {
        if (!active) return;
        setAuthConfig(config as AuthConfig);
        setSession((current as { authenticated?: boolean }).authenticated ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (active) setSession('unavailable');
      });
    return () => { active = false; };
  }, []);

  if (session === 'checking') return <SessionChecking />;
  if (session === 'opening') return <WorkspaceOpening />;
  if (session === 'unauthenticated' || session === 'unavailable') {
    return (
      <Login
        turnstile={authConfig.turnstile}
        turnstileSiteKey={authConfig.turnstileSiteKey}
        unavailable={session === 'unavailable'}
        onAuthenticated={() => {
          setSession('opening');
          window.setTimeout(() => setSession('authenticated'), 850);
        }}
      />
    );
  }

  return (
    <Shell>
      <Suspense fallback={<Skeleton rows={5} height={72} />}>
        <Routes>
          <Route path="/" element={<Topics />} />
          <Route path="/topics/:tag" element={<TopicDetail />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/prep" element={<Prep />} />
          <Route path="/haseeb" element={<CreatorBot key="haseeb" creator="Haseeb" />} />
          <Route path="/tarun" element={<CreatorBot key="tarun" creator="Tarun" />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/sources/:id" element={<RetainedSource />} />
          <Route path="/saved" element={<SavedWork />} />
          <Route path="/saved/:id" element={<LegacySavedWork />} />
          <Route path="/control-center" element={<ControlCenter />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

function NotFound() {
  return <Navigate to="/" replace />;
}
