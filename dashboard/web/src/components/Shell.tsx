import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  IconArchive,
  IconBrief,
  IconConnections,
  IconLibrary,
  IconRecall,
  IconSearch,
  IconSettings,
  IconStudio,
  IconTimeline,
} from './icons';
import { CommandSurface } from './CommandSurface';
import './shell.css';

const GROUPS = [
  {
    label: 'Work',
    items: [
      { to: '/', label: 'Brief', icon: IconBrief, end: true },
      { to: '/timeline', label: 'Timeline', icon: IconTimeline },
      { to: '/library', label: 'Library', icon: IconLibrary },
      { to: '/connections', label: 'Connections', icon: IconConnections },
    ],
  },
  {
    label: 'Produce',
    items: [
      { to: '/studio', label: 'Studio', icon: IconStudio },
      { to: '/recall', label: 'Recall', icon: IconRecall },
    ],
  },
  {
    label: 'History',
    items: [
      { to: '/archive', label: 'Archive', icon: IconArchive },
      { to: '/settings', label: 'Settings', icon: IconSettings },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(true);
      }
      if (e.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <nav className="rail" aria-label="Primary">
        <a className="rail-brand" href="https://forkedbrain.fyi/" aria-label="Return to ForkedBrain">
          <span className="rail-brand-mark" aria-hidden="true">
            <span className="rail-brand-lobe rail-brand-lobe-left" />
            <span className="rail-brand-lobe rail-brand-lobe-right" />
            <span className="rail-brand-branch" />
          </span>
          <span className="rail-brand-text">
            <span className="rail-brand-name">Crypto Intelligence</span>
            <span className="rail-brand-scope label">Mark Gerhart</span>
          </span>
        </a>

        <div className="rail-groups">
          {GROUPS.map((group) => (
            <div className="rail-group" key={group.label}>
              <p className="rail-group-label label">{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={(item as any).end}
                  className={({ isActive }) => `rail-item ${isActive ? 'is-active' : ''}`}
                >
                  <span className="rail-icon">
                    <item.icon />
                  </span>
                  <span className="rail-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        <div className="rail-foot">
          <p className="label">Workspace</p>
          <div className="rail-workspace" title="This is the active intelligence branch">
            <span className="rail-workspace-active">Crypto Intelligence</span>
            <span className="faint">Future branches remain reserved</span>
          </div>
        </div>
      </nav>

      <div className="frame">
        <header className="topbar">
          <button type="button" className="omni" onClick={() => setCommandOpen(true)}>
            <IconSearch />
            <span className="omni-text">Search the corpus, or ask a question</span>
            <kbd className="omni-key mono">⌘K</kbd>
          </button>
        </header>

        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
      </div>

      {commandOpen && <CommandSurface onClose={() => setCommandOpen(false)} />}
    </div>
  );
}
