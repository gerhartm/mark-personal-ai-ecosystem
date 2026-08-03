import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Skeleton } from './components/primitives';
import { Brief } from './screens/Brief';
import { Timeline } from './screens/Timeline';
import { Library } from './screens/Library';
import { EventDetail } from './screens/EventDetail';
import { SourceDetail } from './screens/SourceDetail';
import { ThemeDetail } from './screens/ThemeDetail';
import { Connections } from './screens/Connections';
import { Studio } from './screens/Studio';
import { Recall } from './screens/Recall';
import { Archive } from './screens/Archive';
import { Settings } from './screens/Settings';

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
          <Route path="/" element={<Brief />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/library" element={<Library />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/source/:id" element={<SourceDetail />} />
          <Route path="/theme/:id" element={<ThemeDetail />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/studio/:id" element={<Studio />} />
          <Route path="/recall" element={<Recall />} />
          <Route path="/recall/:id" element={<Recall />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/archive/:id" element={<Archive />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Shell>
  );
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
