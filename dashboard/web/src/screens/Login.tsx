import { FormEvent, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

type LoginProps = {
  turnstile: boolean;
  turnstileSiteKey: string;
  unavailable?: boolean;
  onAuthenticated: () => void;
};

const turnstileScript = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export function Login({ turnstile, turnstileSiteKey, unavailable = false, onAuthenticated }: LoginProps) {
  const [username, setUsername] = useState('mark');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(unavailable ? 'The workspace login is temporarily unavailable.' : '');
  const verificationRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef('');

  useEffect(() => {
    if (!turnstile || !turnstileSiteKey || !verificationRef.current) return;
    let disposed = false;

    const render = () => {
      if (disposed || !verificationRef.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(verificationRef.current, {
        sitekey: turnstileSiteKey,
        theme: 'light',
        size: 'flexible',
        appearance: 'always',
        action: 'workspace_login',
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => {
          setTurnstileToken('');
          setError('Human verification could not load. Please refresh and try again.');
        },
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${turnstileScript}"]`);
    if (window.turnstile) {
      render();
    } else if (existing) {
      existing.addEventListener('load', render, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = turnstileScript;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', render, { once: true });
      script.addEventListener('error', () => {
        if (!disposed) setError('Human verification could not load. Please refresh and try again.');
      }, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      disposed = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = '';
    };
  }, [turnstile, turnstileSiteKey]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || unavailable) return;
    if (turnstile && !turnstileToken) {
      setError('Complete the human verification before entering the workspace.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, turnstileToken }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? 'The workspace could not be opened. Please try again.');
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
        setTurnstileToken('');
        return;
      }
      onAuthenticated();
    } catch {
      setError('The workspace could not be reached. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page" data-testid="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-mark" aria-hidden="true"><i /><i /></span>
          <div>
            <p className="login-name">Crypto Intelligence</p>
            <p className="login-private">Private / Single seat</p>
          </div>
        </div>

        <div className="login-thesis">
          <p className="login-kicker">Mark's research workspace</p>
          <h1 id="login-title">Evidence, organized for decisions.</h1>
          <p>
            A private view of the sources, arguments, events, and creator references
            that shape your work.
          </p>
        </div>

        <div className="login-index" aria-hidden="true">
          <span>Sources</span>
          <span>Claims</span>
          <span>Timeline</span>
          <span>Preparation</span>
        </div>
      </section>

      <section className="login-access" aria-label="Workspace access">
        <form className="login-form" onSubmit={submit} noValidate>
          <header>
            <p className="login-kicker">Secure access</p>
            <h2>Enter the workspace</h2>
            <p>Use the private credentials provided for this research desk.</p>
          </header>

          <div className="login-field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={128}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting || unavailable}
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <div className="login-password-wrap">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                maxLength={256}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting || unavailable}
                required
              />
              <button
                type="button"
                className="login-reveal"
                onClick={() => setShowPassword((value) => !value)}
                aria-controls="login-password"
                aria-pressed={showPassword}
                disabled={submitting || unavailable}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {turnstile ? (
            <div className="login-verification">
              <span className="login-label">Human verification</span>
              <div ref={verificationRef} className="login-turnstile" data-testid="turnstile" />
            </div>
          ) : null}

          {error ? <p className="login-error" role="alert">{error}</p> : null}

          <button className="login-submit" type="submit" disabled={submitting || unavailable}>
            <span>{submitting ? 'Verifying access' : 'Enter workspace'}</span>
            <span aria-hidden="true">&#8594;</span>
          </button>

          <p className="login-footnote">Protected access. Session expires after 12 hours.</p>
        </form>
      </section>
    </main>
  );
}

export function WorkspaceOpening() {
  return (
    <main className="login-opening" aria-live="polite" data-testid="workspace-opening">
      <div className="login-opening-mark" aria-hidden="true"><i /><i /></div>
      <p>Crypto Intelligence</p>
      <h1>Opening your workspace</h1>
      <div className="login-opening-rule" aria-hidden="true"><span /></div>
    </main>
  );
}

export function SessionChecking() {
  return (
    <main className="login-checking" aria-label="Checking workspace access">
      <span className="login-checking-mark" aria-hidden="true"><i /><i /></span>
    </main>
  );
}
