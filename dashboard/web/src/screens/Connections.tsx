import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { plural, truncate } from '../lib/format';
import {
  CategoryChip,
  EmptyState,
  ErrorState,
  Panel,
  Segmented,
  SignificanceMeter,
  Skeleton,
  StatusChip,
} from '../components/primitives';
import { ENTITY_LABEL, hueOf } from '../lib/taxonomy';
import { IconDepth } from '../components/icons';
import { canRenderDepth, fallbackReason, prefersReducedMotion, probeWebGL } from '../three/capability';
import type { GraphEdge, GraphNode } from '../three/ConnectionField';
import './connections.css';

const ConnectionField = lazy(() => import('../three/ConnectionField'));

export function Connections() {
  const [minShared, setMinShared] = useState(2);
  const [depth, setDepth] = useState(false);
  const [depthFailure, setDepthFailure] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const onDepthUnavailable = useCallback((why: string) => {
    setDepth(false);
    setDepthFailure(why);
  }, []);
  const { data, error, refetch } = useQuery(`/graph?minShared=${minShared}`, [minShared]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    const nodes: GraphNode[] = [
      ...data.events.map((e: any) => ({
        id: e.id,
        kind: 'event' as const,
        label: e.summary ?? e.id,
        hue: readHue(e.primary_category),
        weight: e.significance ?? 2,
      })),
      ...data.entities.map((x: any) => ({
        id: `entity:${x.entity_type}:${x.value}`,
        kind: 'entity' as const,
        label: x.value,
        hue: '#94a0aa',
        weight: x.events,
      })),
    ];
    const edges: GraphEdge[] = [
      ...data.shared.map((s: any) => ({ a: s.a, b: s.b, weight: s.weight, kind: 'shared' as const })),
      ...data.explicit.map((e: any) => ({
        a: e.from_event_id,
        b: e.to_event_id,
        weight: 3,
        kind: 'explicit' as const,
      })),
      ...data.membership.map((m: any) => ({
        a: m.event_id,
        b: `entity:${m.entity_type}:${m.value}`,
        weight: 1,
        kind: 'membership' as const,
      })),
    ];
    return { nodes, edges };
  }, [data]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={4} height={120} />;

  const depthAvailable = canRenderDepth();
  const focusNode = focus ? nodes.find((n) => n.id === focus) : null;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>Connections</h1>
          <p className="page-sub">
            {plural(data.events.length, 'event')}, {plural(data.entities.length, 'recurring entity', 'recurring entities')},{' '}
            {plural(data.shared.length, 'shared-entity link')} and {plural(data.explicit.length, 'explicit link')}.
            Everything drawn here is also in the table below, so nothing depends on the graph.
          </p>
        </div>
        <div className="connections-controls">
          <label className="filter-inline">
            <span className="label">Shared entities at least</span>
            <select value={minShared} onChange={(e) => setMinShared(Number(e.target.value))}>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`btn ${depth ? 'btn-primary' : ''}`}
            onClick={() => setDepth((d) => !d)}
            disabled={!depthAvailable}
            title={
              depthAvailable
                ? 'Render the same graph with depth'
                : prefersReducedMotion()
                  ? 'Depth is off because you have reduced motion enabled'
                  : `Depth is unavailable: ${fallbackReason() || 'no WebGL2'}`
            }
          >
            <IconDepth /> {depth ? 'Depth on' : 'Depth'}
          </button>
        </div>
      </header>

      <Panel
        title={depth ? 'Connection field' : 'Relationship map'}
        action={
          focusNode ? (
            <span className="focus-readout">
              <span className="label">Selected</span> {truncate(focusNode.label, 70)}
            </span>
          ) : (
            <span className="faint">Select a node to focus it</span>
          )
        }
      >
        <div className="graph-stage">
          {depth && depthAvailable ? (
            <Suspense fallback={<FlatGraph nodes={nodes} edges={edges} focus={focus} onSelect={setFocus} />}>
              <ConnectionField
                nodes={nodes}
                edges={edges}
                focusId={focus}
                onSelect={setFocus}
                onUnavailable={onDepthUnavailable}
              />
            </Suspense>
          ) : (
            <FlatGraph nodes={nodes} edges={edges} focus={focus} onSelect={setFocus} />
          )}
        </div>
        {(!depthAvailable || depthFailure) && (
          <p className="graph-note">
            <StatusChip tone="neutral">
              {depthFailure
                ? `Depth switched off and the flat map restored: ${depthFailure}`
                : prefersReducedMotion()
                  ? 'Depth stays off while reduced motion is enabled'
                  : `Depth unavailable: ${fallbackReason() || 'WebGL2 not detected'}`}
            </StatusChip>
          </p>
        )}
      </Panel>

      <div className="connections-columns">
        <Panel title={`Recurring entities (${data.entities.length})`}>
          <ul className="entity-rank">
            {data.entities.slice(0, 24).map((x: any) => (
              <li key={`${x.entity_type}-${x.value}`}>
                <button
                  type="button"
                  className={`entity-rank-row ${focus === `entity:${x.entity_type}:${x.value}` ? 'is-focus' : ''}`}
                  onClick={() => setFocus(`entity:${x.entity_type}:${x.value}`)}
                >
                  <span className="entity-rank-name">{truncate(x.value, 40)}</span>
                  <span className="label entity-rank-type">{ENTITY_LABEL[x.entity_type] ?? x.entity_type}</span>
                  <span className="mono entity-rank-count">{x.events}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={`Strongest links (${data.shared.length})`}>
          {data.shared.length === 0 ? (
            <EmptyState title="No links at this threshold">
              Lower the shared-entity threshold to see weaker relationships.
            </EmptyState>
          ) : (
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col" className="col-num">Shared</th>
                    <th scope="col">Event</th>
                    <th scope="col">Event</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.shared]
                    .sort((a: any, b: any) => b.weight - a.weight)
                    .slice(0, 40)
                    .map((s: any) => (
                      <tr key={`${s.a}-${s.b}`}>
                        <td className="mono col-num">{s.weight}</td>
                        <td>
                          <Link to={`/event/${s.a}`} className="table-link mono">
                            {s.a}
                          </Link>
                        </td>
                        <td>
                          <Link to={`/event/${s.b}`} className="table-link mono">
                            {s.b}
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/**
 * The default view. A flat, keyboard-reachable SVG map: depth is an addition,
 * never a prerequisite.
 */
function FlatGraph({
  nodes,
  edges,
  focus,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focus: string | null;
  onSelect: (id: string) => void;
}) {
  const layout = useMemo(() => {
    const events = nodes.filter((n) => n.kind === 'event');
    const entities = nodes.filter((n) => n.kind === 'entity').slice(0, 60);
    const map = new Map<string, { x: number; y: number; n: GraphNode }>();
    events.forEach((n, i) => {
      const a = (i / events.length) * Math.PI * 2;
      map.set(n.id, { x: 50 + Math.cos(a) * 26, y: 50 + Math.sin(a) * 32, n });
    });
    entities.forEach((n, i) => {
      const a = (i / entities.length) * Math.PI * 2 + 0.4;
      map.set(n.id, { x: 50 + Math.cos(a) * 44, y: 50 + Math.sin(a) * 44, n });
    });
    return map;
  }, [nodes]);

  const visibleEdges = edges.filter((e) => layout.has(e.a) && layout.has(e.b)).slice(0, 700);

  return (
    <svg className="flat-graph" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`Relationship map, ${nodes.length} nodes and ${visibleEdges.length} links. The same relationships are listed in the tables below.`}>
      <g className="flat-edges">
        {visibleEdges.map((e, i) => {
          const a = layout.get(e.a)!;
          const b = layout.get(e.b)!;
          const active = focus === e.a || focus === e.b;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={`flat-edge flat-edge-${e.kind} ${active ? 'is-active' : ''}`}
            />
          );
        })}
      </g>
      <g className="flat-nodes">
        {[...layout.values()].map(({ x, y, n }) => (
          <circle
            key={n.id}
            cx={x}
            cy={y}
            r={n.kind === 'event' ? 0.75 + Math.min(n.weight, 5) * 0.22 : 0.5 + Math.min(n.weight, 8) * 0.1}
            fill={n.hue}
            className={`flat-node ${focus === n.id ? 'is-focus' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={n.label}
            onClick={() => onSelect(n.id)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onSelect(n.id);
              }
            }}
          >
            <title>{n.label}</title>
          </circle>
        ))}
      </g>
    </svg>
  );
}

/** Resolves a CSS variable to a literal so Three.js can parse it. */
function readHue(category?: string | null): string {
  const token = hueOf(category);
  const name = token.match(/var\((--[a-z-]+)\)/)?.[1];
  if (!name) return '#94a0aa';
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || '#94a0aa';
}
