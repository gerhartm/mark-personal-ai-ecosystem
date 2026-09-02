import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Skeleton } from './components/primitives';
import { Topics } from './screens/Topics';
import { TopicDetail } from './screens/TopicDetail';
import { Timeline } from './screens/Timeline';
import { Library } from './screens/Library';
import { EventDetail } from './screens/EventDetail';
import { SourceDetail } from './screens/SourceDetail';
import { ThemeDetail } from './screens/ThemeDetail';
import { Connections } from './screens/Connections';
import { Studio } from './screens/Studio';
import { Quiz } from './screens/Recall';
import { Archive } from './screens/Archive';
import { Settings } from './screens/Settings';
import { Capture } from './screens/Capture';
import { Ask } from './screens/Ask';
import { Prep } from './screens/Prep';
import { CreatorReference } from './screens/CreatorReference';

export default function App() {
  // Appearance preferences are applied before first paint of any screen.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.contrast = localStorage.getItem('contrast') ?? 'normal';
    root.dataset.density = localStorage.getItem('density') ?? 'comfortable';
  }, []);

  return (
    <Shell>
      <Suspense fallback={<Skeleton rows={5} height={72} />}>
        <Routes>
          <Route path="/" element={<Topics />} />
          <Route path="/topics/:tag" element={<TopicDetail />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/library" element={<Library />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/source/:id" element={<SourceDetail />} />
          <Route path="/theme/:id" element={<ThemeDetail />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/prep" element={<Prep />} />
          <Route path="/creator-reference" element={<CreatorReference />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/studio/:id" element={<Studio />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/quiz/:id" element={<Quiz />} />
          <Route path="/recall" element={<Navigate to="/quiz" replace />} />
          <Route path="/recall/:id" element={<LegacyRecallRedirect />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/archive/:id" element={<Archive />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

function LegacyRecallRedirect() {
  const id = window.location.pathname.split('/').pop();
  return <Navigate to={id ? `/quiz/${id}` : '/quiz'} replace />;
}

function NotFound() {
  return (
    <div className="page">
      <h1>That route does not exist</h1>
      <p className="page-sub">
        Every object in this workspace is reachable from Library, Timeline, or the command surface on Cmd K.
      </p>
    </div>
  );
}
