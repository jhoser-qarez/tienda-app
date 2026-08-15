"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/lib/useOnline";
import { dbLocal } from "@/lib/db-local";
import { sincronizarVentasPendientes } from "@/lib/sincronizar";

type Producto = {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
};

type Cliente = {
  id: string;
  nombre: string;
};

type ItemCarrito = {
  producto: Producto;
  cantidad: number;
};

const METODOS = ["efectivo", "yape", "plin", "fiado"] as const;

function esErrorDeRed(err: unknown) {
  const msg = extraerMensaje(err).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("internet_disconnected") ||
    msg.includes("err_")
  );
}

function extraerMensaje(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Error desconocido";
}

export default function VentasPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<string>("efectivo");
  const [clienteId, setClienteId] = useState<string>("");
  const [nuevoCliente, setNuevoCliente] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const online = useOnline();
  const [pendientesCount, setPendientesCount] = useState(0);

  const supabase = createClient();

  const cargarDatos = async () => {
    try {
      const [prodRes, cliRes] = await Promise.all([
        supabase
          .from("productos")
          .select("id, nombre, precio, stock")
          .eq("activo", true)
          .gt("stock", 0)
          .order("nombre"),
        supabase.from("clientes").select("id, nombre").order("nombre"),
      ]);

      if (prodRes.data) setProductos(prodRes.data as Producto[]);
      if (cliRes.data) setClientes(cliRes.data as Cliente[]);
    } catch {
      // Sin conexión real: simplemente no se refresca la lista, no rompe la pantalla
    }
  };

  const actualizarPendientes = async () => {
    const count = await dbLocal.ventasPendientes
      .where("sincronizada")
      .equals(0)
      .count();
    setPendientesCount(count);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- patrón válido de "cargar datos al montar"
    cargarDatos();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- patrón válido de "cargar datos al montar"
    actualizarPendientes();
  }, []);

  useEffect(() => {
    if (online) {
      sincronizarVentasPendientes().then(() => {
        actualizarPendientes();
        cargarDatos();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo queremos reaccionar al cambio de "online"
  }, [online]);

  const agregarAlCarrito = (producto: Producto) => {
    setError("");
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === producto.id);
      if (existente) {
        if (existente.cantidad >= producto.stock) return prev;
        return prev.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        );
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (productoId: string, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((i) =>
          i.producto.id === productoId
            ? { ...i, cantidad: Math.min(i.cantidad + delta, i.producto.stock) }
            : i
        )
        .filter((i) => i.cantidad > 0)
    );
  };

  const total = carrito.reduce(
    (sum, i) => sum + i.producto.precio * i.cantidad,
    0
  );

  const registrarVenta = async () => {
    setError("");
    setMensaje("");

    if (carrito.length === 0) {
      setError("Agrega al menos un producto");
      return;
    }

    let clienteFinal = clienteId;
    setGuardando(true);

    if (metodoPago === "fiado" && !clienteFinal && nuevoCliente.trim()) {
      try {
        const { data, error } = await supabase
          .from("clientes")
          .insert({ nombre: nuevoCliente.trim() })
          .select("id")
          .single();
        if (error) throw error;
        clienteFinal = data.id;
      } catch (err) {
        if (esErrorDeRed(err)) {
          setError(
            "Sin internet no se puede fiar a un cliente nuevo. Elige uno ya registrado o usa otro método de pago."
          );
        } else {
          setError("Error al crear cliente: " + extraerMensaje(err));
        }
        setGuardando(false);
        return;
      }
    }

    if (metodoPago === "fiado" && !clienteFinal) {
      setError("Para fiar, selecciona o escribe el nombre del cliente");
      setGuardando(false);
      return;
    }

    let userId: string | null = null;

try {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  userId = user?.id ?? null;
} catch {
  // Sin red no se puede validar contra el servidor: usar la sesión local
}

if (!userId) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  userId = session?.user?.id ?? null;
}

if (!userId) {
  setError("No se pudo identificar tu sesión. Vuelve a iniciar sesión.");
  setGuardando(false);
  return;
}

    try {
      const { error: rpcError } = await supabase.rpc("registrar_venta", {
        p_vendedor_id: userId,
        p_metodo_pago: metodoPago,
        p_items: carrito.map((i) => ({
          producto_id: i.producto.id,
          cantidad: i.cantidad,
        })),
        p_cliente_id: metodoPago === "fiado" ? clienteFinal : null,
      });

      if (rpcError) throw rpcError;

      setMensaje(`Venta registrada: S/ ${total.toFixed(2)} (${metodoPago})`);
      setCarrito([]);
      setClienteId("");
      setNuevoCliente("");
      setMetodoPago("efectivo");
      cargarDatos();
    } catch (err) {
      if (esErrorDeRed(err)) {
        try {
          await dbLocal.ventasPendientes.add({
            vendedor_id: userId,
            cliente_id: metodoPago === "fiado" ? clienteFinal : null,
            metodo_pago: metodoPago,
            items: carrito.map((i) => ({
              producto_id: i.producto.id,
              cantidad: i.cantidad,
              nombre: i.producto.nombre,
              precio: i.producto.precio,
            })),
            total,
            created_at: new Date().toISOString(),
            sincronizada: 0,
          });

          setMensaje(
            `Venta guardada sin conexión: S/ ${total.toFixed(2)} (se sincronizará cuando vuelva el internet)`
          );
          setCarrito([]);
          setClienteId("");
          setNuevoCliente("");
          setMetodoPago("efectivo");
          actualizarPendientes();
        } catch (dbErr) {
          setError(
            "No se pudo guardar la venta ni en línea ni localmente: " +
              extraerMensaje(dbErr)
          );
        }
      } else {
        setError("Error al registrar la venta: " + extraerMensaje(err));
      }
    } finally {
      setGuardando(false);
    }
  };

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Nueva venta</h1>

      {!online && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 rounded p-2 mb-4 text-sm">
          📴 Sin conexión — las ventas se guardan en este dispositivo y se
          sincronizarán automáticamente cuando vuelva el internet.
        </div>
      )}
      {pendientesCount > 0 && (
        <div className="bg-blue-100 border border-blue-400 text-blue-800 rounded p-2 mb-4 text-sm">
          🔄 {pendientesCount} venta(s) pendiente(s) de sincronizar.
        </div>
      )}

      <input
        type="text"
        placeholder="Buscar producto..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full rounded border p-2 mb-2"
      />

      <div className="grid grid-cols-2 gap-2 mb-6">
        {productosFiltrados.map((p) => (
          <button
            key={p.id}
            onClick={() => agregarAlCarrito(p)}
            className="rounded border p-3 text-left hover:bg-gray-50"
          >
            <p className="font-medium">{p.nombre}</p>
            <p className="text-sm text-gray-500">
              S/ {p.precio.toFixed(2)} · Stock: {p.stock}
            </p>
          </button>
        ))}
      </div>

      <div className="border rounded p-4 mb-4">
        <h2 className="font-semibold mb-2">Carrito</h2>
        {carrito.length === 0 ? (
          <p className="text-gray-500 text-sm">Toca un producto para agregarlo</p>
        ) : (
          <div className="space-y-2">
            {carrito.map((i) => (
              <div
                key={i.producto.id}
                className="flex items-center justify-between"
              >
                <span>{i.producto.nombre}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => cambiarCantidad(i.producto.id, -1)}
                    className="rounded border w-8 h-8"
                  >
                    −
                  </button>
                  <span className="w-8 text-center">{i.cantidad}</span>
                  <button
                    onClick={() => cambiarCantidad(i.producto.id, 1)}
                    className="rounded border w-8 h-8"
                  >
                    +
                  </button>
                  <span className="w-20 text-right">
                    S/ {(i.producto.precio * i.cantidad).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span>S/ {total.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4">
        <h2 className="font-semibold mb-2">Método de pago</h2>
        <div className="flex gap-2">
          {METODOS.map((m) => (
            <button
              key={m}
              onClick={() => setMetodoPago(m)}
              className={`rounded border px-4 py-2 capitalize ${
                metodoPago === m ? "bg-black text-white" : ""
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {metodoPago === "fiado" && (
        <div className="mb-4 space-y-2">
          <h2 className="font-semibold">¿A quién se le fía?</h2>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full rounded border p-2"
          >
            <option value="">— Selecciona un cliente —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {!clienteId && (
            <input
              type="text"
              placeholder="...o escribe el nombre de un cliente nuevo"
              value={nuevoCliente}
              onChange={(e) => setNuevoCliente(e.target.value)}
              className="w-full rounded border p-2"
            />
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {mensaje && <p className="text-sm text-green-600 mb-2">{mensaje}</p>}

      <button
        onClick={registrarVenta}
        disabled={guardando}
        className="w-full rounded bg-black p-3 text-white font-semibold disabled:opacity-50"
      >
        {guardando ? "Guardando..." : `Cobrar S/ ${total.toFixed(2)}`}
      </button>
    </div>
  );
}