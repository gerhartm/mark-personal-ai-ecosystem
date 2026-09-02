import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { CommandSurface } from './CommandSurface';
import './shell.css';

const NAV = [
  { idx: '01', label: 'Topics', to: '/', end: true },
  { idx: '02', label: 'Timeline', to: '/timeline' },
  { idx: '03', label: 'Sources', to: '/library' },
  { idx: '04', label: 'Ask', to: '/ask' },
  { idx: '05', label: 'Prep', to: '/prep' },
  { idx: '06', label: 'Studio', to: '/studio' },
  { idx: '07', label: 'Creator reference', to: '/creator-reference' },
  { idx: '08', label: 'Quiz', to: '/quiz' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const brief = useQuery<any>('/brief');
  const ingestion = useQuery<any>('/ingestion');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [location.pathname]);

  const counts = brief.data?.counts;
  const pipelineReady = Boolean(ingestion.data?.configured && ingestion.data?.connected);

  return (
    <div className="desk-shell">
      <a className="skip-link" href="#main">Skip to content</a>

      <aside className={`desk-rail ${menuOpen ? 'is-open' : ''}`}>
        <div className="desk-brand-row">
          <Link className="desk-brand" to="/" aria-label="Open Crypto Intelligence topics">
            <strong>Crypto Intelligence</strong>
            <span>Private workspace</span>
          </Link>
          <button className="desk-menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Toggle navigation">
            <span />
            <span />
          </button>
        </div>

        <nav className="desk-nav" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `desk-nav-link ${isActive ? 'is-active' : ''}`}>
              <span>{item.idx}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="desk-rail-foot">
          <button type="button" className="desk-search-trigger" onClick={() => setCommandOpen(true)}>
            Search or jump anywhere
            <kbd>⌘K</kbd>
          </button>
          <div className="desk-system-state">
            <span className={`desk-state-dot ${pipelineReady ? 'is-live' : ''}`} />
            <strong>{pipelineReady ? 'Ingestion connected' : 'Corpus online'}</strong>
            <small>{counts ? `${counts.sources} sources · ${counts.events} events` : 'Reading current workspace'}</small>
          </div>
          <div className="desk-utility-links">
            <Link to="/capture">Add source</Link>
            <Link to="/archive">History</Link>
            <Link to="/settings">Settings</Link>
          </div>
        </div>
      </aside>

      <main id="main" className="desk-main" tabIndex={-1}>
        <div className="desk-page">{children}</div>
      </main>

      {commandOpen ? <CommandSurface onClose={() => setCommandOpen(false)} /> : null}
    </div>
  );
}
