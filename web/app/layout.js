import "./globals.css";
import Link from "next/link";
import { getSession } from "@/lib/session";
import LogoutButton from "@/components/LogoutButton";

export const metadata = { title: "Comps Engine", description: "Comparable company analysis" };

export default async function RootLayout({ children }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body>
        {session && (
          <nav className="nav">
            <Link href="/" className="brand">Comps Engine</Link>
            <Link href="/">Companies</Link>
            <Link href="/sectors">Sectors</Link>
            {session.role === "admin" && <Link href="/admin">Admin</Link>}
            <span className="spacer" />
            <span className="who">
              {session.email}<span className="role">{session.role}</span>
            </span>
            <LogoutButton />
          </nav>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
