"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (pathname === "/login") return null;

  return (
    <nav className="flex items-center justify-between border-b p-4">
      <div className="flex gap-4">
        <Link href="/" className="font-semibold">
          Inicio
        </Link>
        <Link href="/productos">Productos</Link>
        <Link href="/ventas">Ventas</Link>
        <Link href="/clientes">Clientes</Link>
      </div>
      <button onClick={handleLogout} className="text-sm text-red-600">
        Cerrar sesión
      </button>
    </nav>
  );
}