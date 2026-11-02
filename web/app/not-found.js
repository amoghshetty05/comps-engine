import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <h1>Not found</h1>
      <p className="muted">There is no company or page at this address.</p>
      <Link href="/">Back to companies</Link>
    </div>
  );
}
