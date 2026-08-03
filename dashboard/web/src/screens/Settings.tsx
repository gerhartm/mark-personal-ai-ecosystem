import { useEffect, useState } from 'react';
import { useQuery } from '../lib/api';
import { formatDateTime, plural } from '../lib/format';
import { ErrorState, Panel, Skeleton, StatusChip } from '../components/primitives';
import { fallbackReason, prefersReducedMotion, probeWebGL } from '../three/capability';
import { sceneStats } from '../three/SceneHost';
import './settings.css';

export function Settings() {
  const { data, error, refetch } = useQuery('/reconciliation');
  const [contrast, setContrast] = useState(() => localStorage.getItem('contrast') ?? 'normal');
  const [density, setDensity] = useState(() => localStorage.getItem('density') ?? 'comfortable');
  const [depth, setDepth] = useState(() => localStorage.getItem('depth') ?? 'on');

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast;
    localStorage.setItem('contrast', contrast);
  }, [contrast]);
  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem('density', density);
  }, [density]);
  useEffect(() => {
    localStorage.setItem('depth', depth);
  }, [depth]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={4} height={80} />;

  const stats = sceneStats();
  const webgl = probeWebGL();

  return (
    <div className="page settings">
      <header className="page-head">
        <div className="page-title">
          <h1>Settings</h1>
          <p className="page-sub">
            Appearance, and the state of the data underneath. Everything on this screen is read from the active
            database, not from a cached summary.
          </p>
        </div>
      </header>

      <div className="settings-columns">
        <Panel title="Appearance">
          <div className="settings-block">
            <Choice
              label="Contrast"
              hint="Raises ink and border contrast within the dark theme."
              value={contrast}
              onChange={setContrast}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
              ]}
            />
            <Choice
              label="Density"
              hint="Compact tightens spacing for long working sessions."
              value={density}
              onChange={setDensity}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
            <Choice
              label="Depth"
              hint={
                prefersReducedMotion()
                  ? 'Your system asks for reduced motion, so depth stays off regardless of this setting.'
                  : 'Optional 3D on the Brief header and the Connections graph. Nothing depends on it.'
              }
              value={depth}
              onChange={setDepth}
              options={[
                { value: 'on', label: 'Allowed' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </div>
        </Panel>

        <Panel title="Rendering">
          <dl className="kv settings-kv">
            <dt>Reduced motion</dt>
            <dd>{prefersReducedMotion() ? 'requested by your system' : 'not requested'}</dd>
            <dt>WebGL2</dt>
            <dd>
              {webgl ? <StatusChip tone="good">available</StatusChip> : <StatusChip tone="warning">unavailable</StatusChip>}
            </dd>
            {!webgl && fallbackReason() && (
              <>
                <dt>Reason</dt>
                <dd>{fallbackReason()}</dd>
              </>
            )}
            <dt>Scenes mounted</dt>
            <dd className="mono">{stats.scenes}</dd>
            <dt>Loop running</dt>
            <dd className="mono">{String(stats.running)}</dd>
            <dt>Half rate</dt>
            <dd className="mono">{String(stats.halfRate)}</dd>
          </dl>
        </Panel>

        <Panel title="Reconciliation" className="settings-wide">
          <div className="settings-block">
            <div className="recon-summary">
              {data.orphanEvents === 0 && data.foreignKeyErrors === 0 ? (
                <StatusChip tone="good">Every event resolves to its canonical source</StatusChip>
              ) : (
                <StatusChip tone="critical">
                  {data.orphanEvents} orphan events, {data.foreignKeyErrors} foreign key errors
                </StatusChip>
              )}
              {data.unresolvedConnections > 0 && (
                <StatusChip tone="warning">
                  {plural(data.unresolvedConnections, 'connection')} reference an event outside this corpus, reported not
                  dropped
                </StatusChip>
              )}
            </div>

            <div className="scroll-x">
              <table className="table recon-table">
                <thead>
                  <tr>
                    <th scope="col">Table</th>
                    <th scope="col" className="col-num">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.counts).map(([k, v]) => (
                    <tr key={k}>
                      <td className="mono">{k}</td>
                      <td className="mono col-num">{v as number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="recon-origin">
              <p className="label">By origin</p>
              <ul>
                {data.byOrigin.events.map((o: any) => (
                  <li key={o.origin} className="mono">
                    events, {o.origin}: {o.c}
                  </li>
                ))}
                {data.byOrigin.sources.map((o: any) => (
                  <li key={o.origin} className="mono">
                    sources, {o.origin}: {o.c}
                  </li>
                ))}
              </ul>
            </div>

            <div className="recon-origin">
              <p className="label">Migrations applied</p>
              <ul>
                {data.migrations.map((m: any) => (
                  <li key={m.id} className="mono">
                    {m.id} {m.name}, {formatDateTime(m.applied_at)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="recon-origin">
              <p className="label">Handoff</p>
              <ul>
                {data.handoff.map((h: any) => (
                  <li key={h.key} className="mono">
                    {h.key}: {h.value}
                  </li>
                ))}
                <li className="mono">identity register: {data.identityRegister} rows</li>
                <li className="mono">search index: {data.searchRows} rows</li>
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Choice({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset className="choice">
      <legend className="label">{label}</legend>
      <div className="choice-options">
        {options.map((o) => (
          <label key={o.value} className={`choice-option ${value === o.value ? 'is-active' : ''}`}>
            <input
              type="radio"
              name={label}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
      <p className="choice-hint">{hint}</p>
    </fieldset>
  );
}
