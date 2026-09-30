import { useState } from "react";
// import "./Login.css";

function Login({ onAuthenticated }) {
    const [mode, setMode] = useState("login");
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        brokerId: ""
    });
    const [error, setError] = useState("");

    function updateField(event) {
        const { name, value } = event.target;
        setForm(previous => ({
            ...previous,
            [name]: value
        }));
        setError("");
    }

    function handleSubmit(event) {
        event.preventDefault();
        setError("");

        if (!form.email.trim() || !form.password.trim()) {
            setError("Please enter your email and password.");
            return;
        }

        if (mode === "signup") {
            if (!form.name.trim()) {
                setError("Please enter your name.");
                return;
            }

            if (form.password !== form.confirmPassword) {
                setError("Passwords do not match.");
                return;
            }
        }

        if (!form.brokerId.trim()) {
            setError("Broker ID / Client Code is required for broker login. Use Guest if you do not have one.");
            return;
        }

        // Temporary frontend session. Real account and Angel One
        // authentication will be connected to the backend next.
        const session = {
            mode: "broker",
            userType: mode,
            email: form.email.trim(),
            brokerId: form.brokerId.trim(),
            dataSource: "angel"
        };

        localStorage.setItem(
            "ema360_session",
            JSON.stringify(session)
        );

        onAuthenticated(session);
    }

    function continueAsGuest() {
        const session = {
            mode: "guest",
            userType: "guest",
            email: null,
            brokerId: null,
            dataSource: "nse"
        };

        localStorage.setItem(
            "ema360_session",
            JSON.stringify(session)
        );

        onAuthenticated(session);
    }

    return (
        <div className="authPage">
            <div className="authGlow authGlowOne" />
            <div className="authGlow authGlowTwo" />

            <section className="authCard">
                <div className="authBrand">
                    <div className="authLogo">E</div>
                    <div>
                        <div className="authBrandName">EMA360</div>
                        <div className="authBrandSub">MARKET INTELLIGENCE</div>
                    </div>
                </div>

                <div className="authHeading">
                    <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
                    <p>
                        {mode === "login"
                            ? "Login to connect your broker and access EMA360."
                            : "Create your EMA360 account and connect your broker."}
                    </p>
                </div>

                <div className="authTabs">
                    <button
                        type="button"
                        className={mode === "login" ? "authTab active" : "authTab"}
                        onClick={() => {
                            setMode("login");
                            setError("");
                        }}
                    >
                        Login
                    </button>
                    <button
                        type="button"
                        className={mode === "signup" ? "authTab active" : "authTab"}
                        onClick={() => {
                            setMode("signup");
                            setError("");
                        }}
                    >
                        Sign Up
                    </button>
                </div>

                <form className="authForm" onSubmit={handleSubmit}>
                    {mode === "signup" && (
                        <label className="authField">
                            <span>Full Name</span>
                            <input
                                name="name"
                                value={form.name}
                                onChange={updateField}
                                placeholder="Enter your name"
                                autoComplete="name"
                            />
                        </label>
                    )}

                    <label className="authField">
                        <span>Email</span>
                        <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={updateField}
                            placeholder="you@example.com"
                            autoComplete="email"
                        />
                    </label>

                    <label className="authField">
                        <span>Password</span>
                        <input
                            type="password"
                            name="password"
                            value={form.password}
                            onChange={updateField}
                            placeholder="Enter your password"
                            autoComplete={mode === "login" ? "current-password" : "new-password"}
                        />
                    </label>

                    {mode === "signup" && (
                        <label className="authField">
                            <span>Confirm Password</span>
                            <input
                                type="password"
                                name="confirmPassword"
                                value={form.confirmPassword}
                                onChange={updateField}
                                placeholder="Confirm your password"
                                autoComplete="new-password"
                            />
                        </label>
                    )}

                    <label className="authField">
                        <span>Broker ID / Client Code</span>
                        <input
                            name="brokerId"
                            value={form.brokerId}
                            onChange={updateField}
                            placeholder="Enter your broker ID"
                            autoComplete="off"
                        />
                    </label>

                    {error && <div className="authError">{error}</div>}

                    <button className="authPrimaryButton" type="submit">
                        {mode === "login" ? "Login & Connect Broker" : "Create Account & Connect Broker"}
                    </button>
                </form>

                <div className="authDivider">
                    <span>OR</span>
                </div>

                <button
                    type="button"
                    className="guestButton"
                    onClick={continueAsGuest}
                >
                    <span>Continue as Guest</span>
                    <small>No Broker ID? Use NSE market data</small>
                </button>

                <p className="authNote">
                    Your broker credentials will be handled through the secure backend connection.
                </p>
            </section>
        </div>
    );
}

export default Login;
