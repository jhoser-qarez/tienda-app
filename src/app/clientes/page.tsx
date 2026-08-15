"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Abono = { monto: number };

type Venta = {
  id: string;
  total: number;
  estado_pago: string;
  created_at: string;
  abonos: Abono[];
};

type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  ventas: Venta[];
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [montoAbono, setMontoAbono] = useState<Record<string, string>>({});
  const [metodoAbono, setMetodoAbono] = useState<Record<string, string>>({});
  const [guardandoAbono, setGuardandoAbono] = useState<string | null>(null);

  const supabase = createClient();

  const cargarClientes = async () => {
    const { data, error } = await supabase
      .from("clientes")
      .select(
        "id, nombre, telefono, ventas(id, total, estado_pago, created_at, abonos(monto))"
      )
      .eq("ventas.metodo_pago", "fiado")
      .order("nombre");

    if (error) {
      setError("Error al cargar clientes: " + error.message);
    } else {
      setClientes(data as unknown as Cliente[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- patrón válido de "cargar datos al montar"
    cargarClientes();
  }, []);

  const saldoVenta = (venta: Venta) => {
    const abonado = venta.abonos.reduce((sum, a) => sum + a.monto, 0);
    return venta.total - abonado;
  };

  const saldoCliente = (cliente: Cliente) =>
    cliente.ventas.reduce((sum, v) => sum + saldoVenta(v), 0);

  const handleAbonar = async (ventaId: string) => {
    setError("");
    const monto = parseFloat(montoAbono[ventaId] || "0");
    const metodo = metodoAbono[ventaId] || "efectivo";

    if (!monto || monto <= 0) {
      setError("Ingresa un monto válido");
      return;
    }

    setGuardandoAbono(ventaId);
    const { error } = await supabase.rpc("registrar_abono", {
      p_venta_id: ventaId,
      p_monto: monto,
      p_metodo_pago: metodo,
    });
    setGuardandoAbono(null);

    if (error) {
      setError("Error al registrar abono: " + error.message);
      return;
    }

    setMontoAbono((prev) => ({ ...prev, [ventaId]: "" }));
    setLoading(true);
    cargarClientes();
  };

  const clientesConDeuda = clientes
    .map((c) => ({ ...c, saldo: saldoCliente(c) }))
    .filter((c) => c.saldo > 0);

  if (loading) return <p>Cargando...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Clientes con deuda (fiado)</h1>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {clientesConDeuda.length === 0 ? (
        <p className="text-gray-500">Nadie te debe nada por ahora 🎉</p>
      ) : (
        <div className="space-y-3">
          {clientesConDeuda.map((c) => (
            <div key={c.id} className="border rounded p-3">
              <button
                onClick={() => setExpandido(expandido === c.id ? null : c.id)}
                className="w-full flex justify-between items-center"
              >
                <div className="text-left">
                  <p className="font-medium">{c.nombre}</p>
                  {c.telefono && (
                    <p className="text-sm text-gray-500">{c.telefono}</p>
                  )}
                </div>
                <p className="font-semibold text-red-600">
                  S/ {c.saldo.toFixed(2)}
                </p>
              </button>

              {expandido === c.id && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  {c.ventas
                    .filter((v) => saldoVenta(v) > 0)
                    .map((v) => (
                      <div key={v.id} className="bg-gray-50 rounded p-3">
                        <div className="flex justify-between text-sm mb-2">
                          <span>
                            {new Date(v.created_at).toLocaleDateString("es-PE")}
                          </span>
                          <span>
                            Total: S/ {v.total.toFixed(2)} · Debe: S/{" "}
                            {saldoVenta(v).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Monto a abonar"
                            value={montoAbono[v.id] || ""}
                            onChange={(e) =>
                              setMontoAbono((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                            className="rounded border p-2 flex-1"
                          />
                          <select
                            value={metodoAbono[v.id] || "efectivo"}
                            onChange={(e) =>
                              setMetodoAbono((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                            className="rounded border p-2"
                          >
                            <option value="efectivo">Efectivo</option>
                            <option value="yape">Yape</option>
                            <option value="plin">Plin</option>
                          </select>
                          <button
                            onClick={() => handleAbonar(v.id)}
                            disabled={guardandoAbono === v.id}
                            className="rounded bg-black text-white px-4 disabled:opacity-50"
                          >
                            {guardandoAbono === v.id ? "..." : "Abonar"}
                          </button>
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