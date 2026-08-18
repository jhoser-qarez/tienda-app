"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DetalleItem = {
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  productos: { nombre: string; unidad: "unidad" | "kg" } | null;
};

type Venta = {
  id: string;
  total: number;
  metodo_pago: string;
  created_at: string;
  clientes: { nombre: string } | null;
  detalle_ventas: DetalleItem[];
};

type DiaAgrupado = {
  fecha: string;
  etiqueta: string;
  ventas: Venta[];
  total: number;
};

const DIAS_A_MOSTRAR = 30;

function formatearProducto(item: DetalleItem) {
  if (!item.productos) return "Producto eliminado";
  const nombre = item.productos.nombre;
  if (item.productos.unidad === "kg") {
    return `${item.cantidad.toFixed(3)}kg ${nombre}`;
  }
  return `${item.cantidad}x ${nombre}`;
}

function etiquetaMetodoPago(metodo: string) {
  const mapa: Record<string, string> = {
    efectivo: "Efectivo",
    yape: "Yape",
    plin: "Plin",
    fiado: "Fiado",
  };
  return mapa[metodo] || metodo;
}

function etiquetaDia(fechaISO: string) {
  const fecha = new Date(fechaISO + "T00:00:00");
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);

  const mismaFecha = (a: Date, b: Date) =>
    a.toDateString() === b.toDateString();

  const textoFecha = fecha.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
  });

  if (mismaFecha(fecha, hoy)) return `Hoy · ${textoFecha}`;
  if (mismaFecha(fecha, ayer)) return `Ayer · ${textoFecha}`;

  const diaSemana = fecha.toLocaleDateString("es-PE", { weekday: "long" });
  const diaSemanaCap = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
  return `${diaSemanaCap} · ${textoFecha}`;
}

export default function HistorialPage() {
  const [dias, setDias] = useState<DiaAgrupado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [diaExpandido, setDiaExpandido] = useState<string | null>(null);

  const supabase = createClient();

  const cargarHistorial = async () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - DIAS_A_MOSTRAR);

    const { data, error } = await supabase
      .from("ventas")
      .select(
        `id, total, metodo_pago, created_at,
         clientes(nombre),
         detalle_ventas(cantidad, precio_unitario, subtotal, productos(nombre, unidad))`
      )
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      setError("Error al cargar historial: " + error.message);
      setLoading(false);
      return;
    }

    const ventas = data as unknown as Venta[];

    const grupos = new Map<string, Venta[]>();
    for (const venta of ventas) {
      const clave = venta.created_at.slice(0, 10);
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave)!.push(venta);
    }

    const diasAgrupados: DiaAgrupado[] = Array.from(grupos.entries()).map(
      ([fecha, ventasDelDia]) => ({
        fecha,
        etiqueta: etiquetaDia(fecha),
        ventas: ventasDelDia,
        total: ventasDelDia.reduce((sum, v) => sum + v.total, 0),
      })
    );

    setDias(diasAgrupados);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- patrón válido de "cargar datos al montar"
    cargarHistorial();
  }, []);

  if (loading) return <p className="max-w-2xl">Cargando historial...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Historial de ventas</h1>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {dias.length === 0 ? (
        <p className="text-gray-500">Aún no hay ventas registradas.</p>
      ) : (
        <div className="space-y-2">
          {dias.map((dia) => (
            <div key={dia.fecha} className="border rounded p-3">
              <button
                onClick={() =>
                  setDiaExpandido(diaExpandido === dia.fecha ? null : dia.fecha)
                }
                className="w-full flex justify-between items-center"
              >
                <div className="text-left">
                  <p className="font-medium">{dia.etiqueta}</p>
                  <p className="text-xs text-gray-500">
                    {dia.ventas.length} venta(s)
                  </p>
                </div>
                <p className="text-lg font-semibold">
                  S/ {dia.total.toFixed(2)}
                </p>
              </button>

              {diaExpandido === dia.fecha && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  {dia.ventas.map((venta) => (
                    <div key={venta.id}>
                      <div className="flex justify-between items-center bg-gray-100 rounded px-2 py-1.5">
                        <span className="text-sm">
                          <span
                            className={
                              venta.metodo_pago === "fiado"
                                ? "text-red-600 font-medium"
                                : "text-gray-700 font-medium"
                            }
                          >
                            {etiquetaMetodoPago(venta.metodo_pago)}
                          </span>
                          {venta.clientes && ` · ${venta.clientes.nombre}`}
                        </span>
                        <span className="text-sm font-semibold">
                          S/ {venta.total.toFixed(2)}
                        </span>
                      </div>
                      <div className="pl-3 mt-1">
                        {venta.detalle_ventas.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between text-sm text-gray-600 py-0.5"
                          >
                            <span>{formatearProducto(item)}</span>
                            <span>S/ {item.subtotal.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}