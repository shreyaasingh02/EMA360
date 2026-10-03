import React, { useEffect, useRef, useState } from "react";
// import "./Login.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");

function saveFrontendSession(data) {
    const session = {
        mode: "broker",
        userType: "broker",
        email: data?.user?.email || null,
        brokerId: data?.user?.clientId || null,
        dataSource: "angel",
        brokerConnected: true
    };
    localStorage.setItem("ema360_session", JSON.stringify(session));
    return session;
}

function saveGuestSession(onAuthenticated) {
    const session = { mode: "guest", userType: "guest", email: null, brokerId: null, dataSource: "nse", brokerConnected: false };
    localStorage.setItem("ema360_session", JSON.stringify(session));
    onAuthenticated?.(session);
}

export default function Login({ onAuthenticated }) {
    const [clientId, setClientId] = useState("");
    const [pin, setPin] = useState("");
    const [totp, setTotp] = useState("");
    const [showPin, setShowPin] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [error, setError] = useState("");
    const authenticatedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch(`${API_URL}/api/auth/me`, { credentials: "include", headers: { Accept: "application/json" } });
                const data = await response.json().catch(() => ({}));
                if (response.ok && data.success && !cancelled && !authenticatedRef.current) {
                    authenticatedRef.current = true;
                    onAuthenticated?.(saveFrontendSession(data));
                }
            } catch (err) {
                console.error("EMA360 session check failed:", err);
            } finally {
                if (!cancelled) setCheckingSession(false);
            }
        })();
        return () => { cancelled = true; };
    }, [onAuthenticated]);

    async function connectWithAngelOne(event) {
        event.preventDefault();
        setError("");
        const cleanClientId = clientId.trim();
        const cleanPin = pin.trim();
        const cleanTotp = totp.trim();

        if (!cleanClientId || !cleanPin || !cleanTotp) {
            setError("Enter your Angel One Client ID, PIN and current TOTP.");
            return;
        }
        if (!/^\d{6}$/.test(cleanTotp)) {
            setError("TOTP must be the current 6-digit TOTP.");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/auth/angel/login`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ clientId: cleanClientId, pin: cleanPin, totp: cleanTotp })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.message || "Angel One authentication failed.");
            authenticatedRef.current = true;
            onAuthenticated?.(saveFrontendSession(data));
        } catch (err) {
            console.error("Angel One login failed:", err);
            setError(err.message || "Could not connect to Angel One.");
        } finally {
            setLoading(false);
        }
    }

    if (checkingSession) {
        return <div className="login-page login-loading-page"><div className="login-loading-card"><div className="loading-spinner" /><h2>Checking your session</h2><p>Verifying EMA360 securely...</p></div></div>;
    }

    return (
        <main className="login-page">
            <div className="login-glow login-glow-one" /><div className="login-glow login-glow-two" />
            <section className="login-card" aria-label="EMA360 login">
                <header className="login-header">
                    <div className="login-brand-mark"><span>EMA</span><span>360</span></div>
                    <h1>Welcome to EMA360</h1>
                    <p>Connect your Angel One account or continue with NSE guest mode.</p>
                </header>

                <form className="connection-card" onSubmit={connectWithAngelOne}>
                    <div className="connection-icon">↗</div>
                    <div className="connection-content"><h2>Connect Angel One</h2><p>Use your own Angel One Client ID, PIN and current TOTP. These are sent to Angel One for authentication and are not stored in EMA360.</p></div>

                    <label className="login-field"><span>Angel One Client ID</span><input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Client ID" autoComplete="username" disabled={loading} /></label>
                    <label className="login-field"><span>Angel One PIN</span><div className="password-wrap"><input type={showPin ? "text" : "password"} value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN" autoComplete="current-password" disabled={loading} /><button type="button" className="password-toggle" onClick={() => setShowPin(v => !v)}>{showPin ? "Hide" : "Show"}</button></div></label>
                    <label className="login-field"><span>Current TOTP</span><input value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit TOTP" inputMode="numeric" maxLength={6} autoComplete="one-time-code" disabled={loading} /></label>

                    <button type="submit" className="angel-button" disabled={loading}><span className="angel-button-icon">A</span><span>{loading ? "Connecting..." : "Connect with Angel One"}</span>{!loading && <span className="button-arrow">→</span>}</button>
                </form>

                {error && <div className="login-error" role="alert"><span className="error-icon">!</span><div><strong>Connection failed</strong><p>{error}</p></div></div>}

                <div className="login-divider"><span /><b>OR</b><span /></div>
                <button type="button" className="guest-button" onClick={() => saveGuestSession(onAuthenticated)} disabled={loading}><span className="guest-icon">◉</span>Continue as Guest<span className="guest-arrow">→</span></button>
                <div className="login-note"><span className="shield-icon">✓</span><p><strong>Guest mode</strong> uses NSE market data. Connected mode uses the authenticated Angel One account.</p></div>
                <footer className="login-footer"><span>EMA360</span><span>•</span><span>Market Intelligence</span></footer>
            </section>
        </main>
    );
}
