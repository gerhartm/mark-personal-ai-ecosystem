import { Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Skeleton } from './components/primitives';
import { Topics } from './screens/Topics';
import { TopicDetail } from './screens/TopicDetail';
import { Timeline } from './screens/Timeline';
import { Prep } from './screens/Prep';
import { CreatorBot } from './screens/CreatorBot';

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
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/prep" element={<Prep />} />
          <Route path="/haseeb" element={<CreatorBot creator="Haseeb" />} />
          <Route path="/tarun" element={<CreatorBot creator="Tarun" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

function NotFound() {
  return <Navigate to="/" replace />;
}
