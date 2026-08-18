"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/ventas", label: "Ventas" },
  { href: "/productos", label: "Productos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/historial", label: "Historial" },
];

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
        {LINKS.map((link) => {
          const activo =
            link.href === "/ventas"
              ? pathname === "/ventas"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={activo ? "font-bold text-black" : "text-gray-600"}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
      <button onClick={handleLogout} className="text-sm text-red-600">
        Cerrar sesión
      </button>
    </nav>
  );
}