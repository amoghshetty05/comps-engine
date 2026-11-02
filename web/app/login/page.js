import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function LoginPage({ searchParams }) {
  return (
    <>
      {searchParams?.registered && (
        <div className="msg ok auth" style={{ marginBottom: -50 }}>Account created. Log in below.</div>
      )}
      <Suspense><AuthForm mode="login" /></Suspense>
    </>
  );
}
