"use client";

import { useEffect, useRef, useState } from "react";
import { MemoryGraph } from "./MemoryGraph";

type Theme = "light" | "dark";
type View = "overview" | "about";

const systemLinks = [
  {
    label: "Central Brain",
    detail: "Open the Hermes intelligence interface",
    href: "https://brain.forkedbrain.fyi/",
    access: "Private",
  },
  {
    label: "Crypto Intelligence",
    detail: "Research, timelines, sources, and analysis",
    href: "https://crypto.forkedbrain.fyi/",
    access: "Operational",
  },
  {
    label: "System Management",
    detail: "Infrastructure and deployment controls",
    href: "https://manage.forkedbrain.fyi/",
    access: "Staff only",
  },
];

const systemStatus = [
  {
    name: "Central brain",
    detail: "Hermes reasoning and orchestration",
    state: "Online",
    tone: "active",
  },
  {
    name: "Unified memory",
    detail: "One persistent context layer",
    state: "Active",
    tone: "active",
  },
  {
    name: "Crypto Intelligence",
    detail: "First complete intelligence branch",
    state: "Operational",
    tone: "signal",
  },
  {
    name: "Future branches",
    detail: "Reserved for new priorities",
    state: "Not built",
    tone: "future",
  },
];

type Point = { x: number; y: number };

function BrainCanvas({ theme, onOpenGraph }: { theme: Theme; onOpenGraph: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let animationFrame = 0;

    const color = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    const resize = () => {
      const rect = frame.getBoundingClientRect();
      const density = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * density));
      canvas.height = Math.max(1, Math.round(height * density));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(density, 0, 0, density, 0, 0);
    };

    const drawHemisphere = (
      centerX: number,
      centerY: number,
      brainWidth: number,
      brainHeight: number,
      side: -1 | 1,
    ) => {
      const x = (value: number) => centerX + value * brainWidth * side;
      const y = (value: number) => centerY + value * brainHeight;

      const path = new Path2D();
      path.moveTo(x(0.02), y(-0.78));
      path.bezierCurveTo(x(0.12), y(-0.93), x(0.34), y(-0.93), x(0.42), y(-0.79));
      path.bezierCurveTo(x(0.63), y(-0.84), x(0.82), y(-0.69), x(0.78), y(-0.51));
      path.bezierCurveTo(x(0.95), y(-0.43), x(1.02), y(-0.20), x(0.91), y(-0.05));
      path.bezierCurveTo(x(1.01), y(0.10), x(0.94), y(0.34), x(0.78), y(0.40));
      path.bezierCurveTo(x(0.82), y(0.61), x(0.62), y(0.78), x(0.45), y(0.70));
      path.bezierCurveTo(x(0.35), y(0.88), x(0.13), y(0.86), x(0.05), y(0.68));
      path.bezierCurveTo(x(-0.01), y(0.50), x(0.01), y(0.22), x(0.02), y(-0.02));
      path.bezierCurveTo(x(0.04), y(-0.28), x(-0.02), y(-0.57), x(0.02), y(-0.78));
      path.closePath();
      return path;
    };

    const drawSulci = (
      centerX: number,
      centerY: number,
      brainWidth: number,
      brainHeight: number,
      side: -1 | 1,
    ) => {
      const x = (value: number) => centerX + value * brainWidth * side;
      const y = (value: number) => centerY + value * brainHeight;
      const paths = [
        [[0.12, -0.69], [0.25, -0.82], [0.48, -0.73], [0.49, -0.55]],
        [[0.52, -0.68], [0.70, -0.68], [0.78, -0.55], [0.70, -0.42]],
        [[0.17, -0.48], [0.34, -0.58], [0.58, -0.45], [0.50, -0.26]],
        [[0.79, -0.31], [0.64, -0.37], [0.58, -0.18], [0.72, -0.08]],
        [[0.12, -0.16], [0.28, -0.33], [0.45, -0.18], [0.38, 0.02]],
        [[0.50, -0.05], [0.68, -0.18], [0.83, 0.00], [0.72, 0.17]],
        [[0.15, 0.13], [0.31, -0.02], [0.53, 0.13], [0.46, 0.34]],
        [[0.75, 0.24], [0.58, 0.16], [0.52, 0.37], [0.61, 0.48]],
        [[0.13, 0.43], [0.28, 0.29], [0.45, 0.43], [0.39, 0.61]],
        [[0.39, 0.64], [0.53, 0.51], [0.66, 0.58], [0.62, 0.66]],
      ] as const;

      for (const path of paths) {
        context.beginPath();
        context.moveTo(x(path[0][0]), y(path[0][1]));
        context.bezierCurveTo(
          x(path[1][0]), y(path[1][1]),
          x(path[2][0]), y(path[2][1]),
          x(path[3][0]), y(path[3][1]),
        );
        context.stroke();
      }
    };

    const draw = (time = 0) => {
      const centerX = width * 0.48;
      const centerY = height * 0.48;
      const brainWidth = Math.min(width * 0.34, height * 0.41);
      const brainHeight = brainWidth * 0.92;
      const accent = color("--signal");
      const outline = color("--brain-outline");
      const fold = color("--brain-fold");
      const fill = color("--brain-fill");
      const fillAlt = color("--brain-fill-alt");
      const paper = color("--surface");
      const motion = reducedMotion.matches ? 0 : 1;
      const pulse = (Math.sin(time * 0.0015) + 1) / 2;

      context.clearRect(0, 0, width, height);

      const left = drawHemisphere(centerX, centerY, brainWidth, brainHeight, -1);
      const right = drawHemisphere(centerX, centerY, brainWidth, brainHeight, 1);

      context.save();
      context.shadowColor = color("--brain-shadow");
      context.shadowBlur = 28;
      context.fillStyle = fillAlt;
      context.fill(left);
      context.fillStyle = fill;
      context.fill(right);
      context.shadowBlur = 0;
      context.strokeStyle = outline;
      context.lineWidth = 1.7;
      context.stroke(left);
      context.stroke(right);

      context.strokeStyle = fold;
      context.lineWidth = 1.1;
      context.lineCap = "round";
      drawSulci(centerX, centerY, brainWidth, brainHeight, -1);
      drawSulci(centerX, centerY, brainWidth, brainHeight, 1);

      context.strokeStyle = outline;
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(centerX, centerY - brainHeight * 0.78);
      context.bezierCurveTo(
        centerX - 4,
        centerY - brainHeight * 0.38,
        centerX + 5,
        centerY + brainHeight * 0.30,
        centerX,
        centerY + brainHeight * 0.68,
      );
      context.stroke();

      const core: Point = { x: centerX, y: centerY + brainHeight * 0.04 };
      const crypto: Point = {
        x: centerX + brainWidth * 1.31,
        y: centerY - brainHeight * 0.10,
      };
      const futureTop: Point = {
        x: centerX - brainWidth * 1.25,
        y: centerY - brainHeight * 0.35,
      };
      const futureBottom: Point = {
        x: centerX - brainWidth * 1.18,
        y: centerY + brainHeight * 0.49,
      };

      context.strokeStyle = accent;
      context.lineWidth = 1.6;
      context.beginPath();
      context.moveTo(core.x + brainWidth * 0.12, core.y);
      context.bezierCurveTo(
        centerX + brainWidth * 0.68,
        centerY - brainHeight * 0.01,
        centerX + brainWidth * 0.92,
        centerY - brainHeight * 0.10,
        crypto.x,
        crypto.y,
      );
      context.stroke();

      context.strokeStyle = fold;
      context.lineWidth = 1;
      context.setLineDash([3, 7]);
      for (const target of [futureTop, futureBottom]) {
        context.beginPath();
        context.moveTo(core.x - brainWidth * 0.12, core.y);
        context.lineTo(target.x, target.y);
        context.stroke();
      }
      context.setLineDash([]);

      context.fillStyle = paper;
      context.strokeStyle = outline;
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(core.x, core.y, 7, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      context.fillStyle = accent;
      context.beginPath();
      context.arc(crypto.x, crypto.y, 4.5 + pulse * 1.5 * motion, 0, Math.PI * 2);
      context.fill();

      if (motion) {
        const progress = (time * 0.00018) % 1;
        const x = core.x + (crypto.x - core.x) * progress;
        const arc = Math.sin(progress * Math.PI) * brainHeight * 0.11;
        const y = core.y + (crypto.y - core.y) * progress - arc;
        context.globalAlpha = 0.35 + pulse * 0.55;
        context.beginPath();
        context.arc(x, y, 2.6, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }

      context.restore();
      if (!reducedMotion.matches) animationFrame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reducedMotion.matches) draw();
    });
    observer.observe(frame);
    resize();
    draw();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [theme]);

  return (
    <button
      className="brain-map"
      ref={frameRef}
      type="button"
      onClick={onOpenGraph}
      aria-label="Open the interactive memory graph"
    >
      <canvas className="brain-map__canvas" ref={canvasRef} aria-hidden="true" />
      <div className="brain-map__label brain-map__label--core">
        <span>MARK</span>
        <strong>Central brain</strong>
      </div>
      <span className="brain-map__label brain-map__label--crypto">
        <span>ACTIVE BRANCH</span>
        <strong>Crypto Intelligence</strong>
      </span>
      <div className="brain-map__label brain-map__label--future-one">
        <span>FUTURE</span>
        <strong>Branch 01</strong>
      </div>
      <div className="brain-map__label brain-map__label--future-two">
        <span>FUTURE</span>
        <strong>Branch 02</strong>
      </div>
      <p className="sr-only">
        A brain-shaped system map with Mark at its center. Crypto Intelligence is active. Two future branches are reserved but not built.
      </p>
      <span className="brain-map__hint">Open memory graph</span>
    </button>
  );
}

function SystemLink({ link }: { link: (typeof systemLinks)[number] }) {
  return (
    <a className="system-link" href={link.href} target="_blank" rel="noreferrer">
      <span className="system-link__copy">
        <strong>{link.label}</strong>
        <span>{link.detail}</span>
      </span>
      <span className="system-link__meta">
        <span>{link.access}</span>
        <span aria-hidden="true">&#8599;</span>
      </span>
    </a>
  );
}

function Overview({ theme, onOpenGraph }: { theme: Theme; onOpenGraph: () => void }) {
  return (
    <div className="overview">
      <section className="summary" aria-labelledby="overview-title">
        <div>
          <p className="eyebrow">PERSONAL AI ECOSYSTEM</p>
          <h1 id="overview-title">Mark&apos;s private intelligence system</h1>
          <p>One central brain, one persistent memory, and specialized branches for each area of work.</p>
        </div>
        <div className="summary__state" aria-label="System is online">
          <span className="state-dot" aria-hidden="true" />
          <span>
            <small>CURRENT STATE</small>
            <strong>Online</strong>
          </span>
        </div>
      </section>

      <section className="workspace" aria-label="Ecosystem overview">
        <div className="panel panel--brain">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">SYSTEM MAP</p>
              <h2>One brain, built to expand</h2>
            </div>
            <span>1 active branch</span>
          </div>
          <BrainCanvas theme={theme} onOpenGraph={onOpenGraph} />
        </div>

        <div className="panel panel--status">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">SYSTEM STATUS</p>
              <h2>What is running now</h2>
            </div>
          </div>
          <div className="status-list">
            {systemStatus.map((item) => (
              <div className="status-row" key={item.name}>
                <span className={`status-row__marker status-row__marker--${item.tone}`} aria-hidden="true" />
                <span className="status-row__copy">
                  <strong>{item.name}</strong>
                  <span>{item.detail}</span>
                </span>
                <span className={`status-row__state status-row__state--${item.tone}`}>{item.state}</span>
              </div>
            ))}
          </div>
          <a className="primary-action" href="https://crypto.forkedbrain.fyi/" target="_blank" rel="noreferrer">
            Open Crypto Intelligence
            <span aria-hidden="true">&#8599;</span>
          </a>
        </div>
      </section>

      <section className="systems" aria-labelledby="systems-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SYSTEMS</p>
            <h2 id="systems-title">Open a workspace</h2>
          </div>
          <p>Access depends on your account permissions.</p>
        </div>
        <div className="system-links">
          {systemLinks.map((link) => <SystemLink link={link} key={link.href} />)}
        </div>
      </section>
    </div>
  );
}

function AboutMark() {
  return (
    <div className="about-view">
      <section className="about-intro">
        <p className="eyebrow">ABOUT MARK</p>
        <h1>Built around how Mark works</h1>
        <p>
          Mark Gerhart works across crypto, emerging technology, research, and long-term ideas. ForkedBrain keeps the information behind that work organized, searchable, and useful.
        </p>
      </section>

      <section className="about-grid" aria-label="About the ecosystem">
        <div className="about-block">
          <p className="eyebrow">PURPOSE</p>
          <h2>Turn information into working context</h2>
          <p>Capture source material, preserve its history, prepare for important conversations, and create useful outputs without starting over each time.</p>
        </div>
        <div className="about-block">
          <p className="eyebrow">CURRENT SCOPE</p>
          <h2>Crypto Intelligence is operational</h2>
          <p>The shared brain and memory foundation are in place. Future branches remain available for the priorities Mark chooses next.</p>
        </div>
      </section>

      <section className="systems systems--about" aria-labelledby="about-systems-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PRIVATE SYSTEM INDEX</p>
            <h2 id="about-systems-title">Authorized workspaces</h2>
          </div>
        </div>
        <div className="system-links">
          {systemLinks.map((link) => <SystemLink link={link} key={link.href} />)}
        </div>
      </section>
    </div>
  );
}

export function BrainExperience() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [view, setView] = useState<View>("overview");
  const [graphOpen, setGraphOpen] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("forkedbrain-theme-v2");
    if (savedTheme === "dark" || savedTheme === "light") {
      const frame = window.requestAnimationFrame(() => setTheme(savedTheme));
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("forkedbrain-theme-v2", theme);
  }, [theme]);

  const returnToOverview = () => {
    setGraphOpen(false);
    setView("overview");
  };

  return (
    <div className="site-shell">
      <header className="masthead">
        <button
          className="wordmark"
          type="button"
          onClick={() => setView("overview")}
          aria-label="Open ForkedBrain overview"
        >
          <span className="logo-mark" aria-hidden="true">
            <span className="logo-mark__lobe logo-mark__lobe--left" />
            <span className="logo-mark__lobe logo-mark__lobe--right" />
            <span className="logo-mark__branch" />
          </span>
        </button>

        <nav className="primary-nav" aria-label="Main navigation">
          <button
            type="button"
            className={view === "overview" ? "is-active" : ""}
            onClick={() => setView("overview")}
            aria-pressed={view === "overview"}
          >
            Overview
          </button>
          <button
            type="button"
            className={view === "about" ? "is-active" : ""}
            onClick={() => setView("about")}
            aria-pressed={view === "about"}
          >
            About Mark
          </button>
        </nav>

        <div className="header-actions">
          <span className="private-label">PRIVATE</span>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? "Dark" : "Light"}
            <span className="theme-toggle__track" aria-hidden="true"><span /></span>
          </button>
        </div>
      </header>

      <main>
        {view === "overview" ? (
          <Overview theme={theme} onOpenGraph={() => setGraphOpen(true)} />
        ) : (
          <AboutMark />
        )}
      </main>

      <footer className="footer">
        <span>Mark Gerhart</span>
        <span>Private intelligence system</span>
      </footer>
      {graphOpen ? <MemoryGraph onClose={returnToOverview} /> : null}
    </div>
  );
}
