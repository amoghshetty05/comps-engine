"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/** Shared login / register form. Posts JSON to the matching /api/auth route. */
export default function AuthForm({ mode }) {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      setBusy(false);
      return;
    }
    if (isLogin) {
      router.push(next.startsWith("/") ? next : "/");
      router.refresh();
    } else {
      router.push("/login?registered=1");
    }
  }

  return (
    <div className="auth panel">
      <h1>{isLogin ? "Log in" : "Create an analyst account"}</h1>
      <p className="sub">Comps Engine: comparable company analysis</p>
      <form className="stack" onSubmit={submit}>
        {!isLogin && (
          <label>Full name<input name="full_name" required minLength={2} /></label>
        )}
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>
          Password
          <input name="password" type="password" required minLength={isLogin ? 1 : 8}
                 autoComplete={isLogin ? "current-password" : "new-password"} />
        </label>
        {error && <div className="msg err">{error}</div>}
        <button disabled={busy}>{busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}</button>
      </form>
      <p className="small muted" style={{ marginTop: 16 }}>
        {isLogin ? <>No account? <Link href="/register">Register</Link></>
                 : <>Already registered? <Link href="/login">Log in</Link></>}
      </p>
    </div>
  );
}
