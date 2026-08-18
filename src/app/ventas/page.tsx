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
  unidad: "unidad" | "kg";
  favorito: boolean;
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
const MONTOS_RAPIDOS = [10, 20, 50, 100];

function extraerMensaje(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Error desconocido";
}

function esErrorDeRed(err: unknown) {
  const msg = extraerMensaje(err).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("internet_disconnected") ||
    msg.includes("err_")
  );
}

export default function VentasPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<string>("efectivo");
  const [clienteId, setClienteId] = useState<string>("");
  const [nuevoCliente, setNuevoCliente] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [montoRecibido, setMontoRecibido] = useState("");
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
          .select("id, nombre, precio, stock, unidad, favorito")
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

      if (producto.unidad === "kg") {
        if (existente) return prev;
        const cantidadInicial = Math.min(0.5, producto.stock);
        return [...prev, { producto, cantidad: cantidadInicial }];
      }

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

  const cambiarCantidadUnidad = (productoId: string, delta: number) => {
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

  const cambiarCantidadKg = (productoId: string, valorTexto: string) => {
    const valor = parseFloat(valorTexto);
    setCarrito((prev) =>
      prev.map((i) => {
        if (i.producto.id !== productoId) return i;
        if (isNaN(valor)) return i;
        const clamped = Math.max(0, Math.min(valor, i.producto.stock));
        return { ...i, cantidad: clamped };
      })
    );
  };

  const quitarDelCarrito = (productoId: string) => {
    setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
  };

  const total = carrito.reduce(
    (sum, i) => sum + i.producto.precio * i.cantidad,
    0
  );

  const vuelto =
    metodoPago === "efectivo" && montoRecibido
      ? parseFloat(montoRecibido) - total
      : null;

  const registrarVenta = async () => {
    setError("");
    setMensaje("");

    if (carrito.length === 0) {
      setError("Agrega al menos un producto");
      return;
    }

    if (carrito.some((i) => i.cantidad <= 0)) {
      setError("Hay un producto con cantidad en 0, quítalo o corrige la cantidad");
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
      setMontoRecibido("");
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
          setMontoRecibido("");
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

  const favoritos = productos.filter((p) => p.favorito);
  const resultadosBusqueda = busqueda.trim()
    ? productos.filter((p) =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase())
      )
    : [];

  const listaAMostrar = busqueda.trim() ? resultadosBusqueda : favoritos;

  return (
    <div className="max-w-2xl pb-28">
      <h1 className="text-3xl font-bold mb-5">Nueva venta</h1>

      {!online && (
        <div className="bg-amber-50 border-2 border-amber-400 text-amber-900 rounded-xl p-3 mb-4 text-base font-medium">
          📴 Sin conexión — la venta se guarda en este dispositivo y se
          sincroniza sola cuando vuelva el internet.
        </div>
      )}
      {pendientesCount > 0 && (
        <div className="bg-primary/10 border-2 border-primary text-primary rounded-xl p-3 mb-4 text-base font-medium">
          🔄 {pendientesCount} venta(s) pendiente(s) de sincronizar.
        </div>
      )}

      <input
        type="text"
        placeholder="Buscar producto..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full rounded-xl border-2 border-gray-300 p-4 text-lg mb-3"
      />

      {!busqueda.trim() && (
        <p className="text-lg font-semibold text-gray-700 mb-2">Favoritos</p>
      )}

      {listaAMostrar.length === 0 ? (
        <p className="text-base text-gray-500 mb-6">
          {busqueda.trim()
            ? "No se encontró ningún producto con ese nombre."
            : "Aún no tienes productos favoritos. Márcalos con la estrella en Inventario."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {listaAMostrar.map((p) => (
            <button
              key={p.id}
              onClick={() => agregarAlCarrito(p)}
              className="rounded-xl border-2 border-gray-300 bg-white p-4 text-left active:bg-gray-100"
            >
              <p className="text-lg font-bold text-gray-900">{p.nombre}</p>
              <p className="text-base text-primary font-semibold mt-1">
                S/ {p.precio.toFixed(2)}
                {p.unidad === "kg" ? " /kg" : ""}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                Stock: {p.unidad === "kg" ? p.stock.toFixed(3) : p.stock}
                {p.unidad === "kg" ? " kg" : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="border-2 border-gray-300 rounded-xl p-4 mb-4">
        <h2 className="text-lg font-bold mb-3">Carrito</h2>
        {carrito.length === 0 ? (
          <p className="text-gray-500 text-base">
            Busca o toca un favorito para agregarlo
          </p>
        ) : (
          <div className="space-y-3">
            {carrito.map((i) => (
              <div
                key={i.producto.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-base font-medium flex-1 min-w-0 truncate">
                  {i.producto.nombre}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {i.producto.unidad === "unidad" ? (
                    <>
                      <button
                        onClick={() => cambiarCantidadUnidad(i.producto.id, -1)}
                        className="rounded-lg border-2 border-gray-300 w-11 h-11 text-xl font-bold"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-lg font-semibold">
                        {i.cantidad}
                      </span>
                      <button
                        onClick={() => cambiarCantidadUnidad(i.producto.id, 1)}
                        className="rounded-lg border-2 border-gray-300 w-11 h-11 text-xl font-bold"
                      >
                        +
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max={i.producto.stock}
                        value={i.cantidad}
                        onChange={(e) =>
                          cambiarCantidadKg(i.producto.id, e.target.value)
                        }
                        className="w-24 rounded-lg border-2 border-gray-300 p-2 text-right text-base"
                      />
                      <span className="text-base text-gray-600">kg</span>
                      <button
                        onClick={() => quitarDelCarrito(i.producto.id)}
                        className="text-danger text-base font-semibold"
                      >
                        Quitar
                      </button>
                    </>
                  )}
                  <span className="w-20 text-right text-base font-semibold">
                    S/ {(i.producto.precio * i.cantidad).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
            <div className="border-t-2 pt-3 flex justify-between text-xl font-bold">
              <span>Total</span>
              <span>S/ {total.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-bold mb-3">Método de pago</h2>
        <div className="grid grid-cols-2 gap-2">
          {METODOS.map((m) => (
            <button
              key={m}
              onClick={() => setMetodoPago(m)}
              className={`rounded-xl border-2 py-4 text-lg font-semibold capitalize ${
                metodoPago === m
                  ? "bg-primary border-primary text-white"
                  : "border-gray-300 text-gray-700"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {metodoPago === "efectivo" && (
        <div className="mb-4 border-2 border-gray-300 rounded-xl p-4">
          <p className="text-base font-medium text-gray-700 mb-3">
            ¿Con cuánto paga?
          </p>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {MONTOS_RAPIDOS.map((m) => (
              <button
                key={m}
                onClick={() => setMontoRecibido(String(m))}
                className={`rounded-lg border-2 py-3 text-base font-semibold ${
                  montoRecibido === String(m)
                    ? "bg-primary border-primary text-white"
                    : "border-gray-300"
                }`}
              >
                S/{m}
              </button>
            ))}
          </div>
          <input
            type="number"
            step="0.10"
            min="0"
            placeholder="Otro monto"
            value={montoRecibido}
            onChange={(e) => setMontoRecibido(e.target.value)}
            className="w-full rounded-lg border-2 border-gray-300 p-3 text-lg mb-3"
          />
          {vuelto !== null && (
            <div className="flex justify-between text-lg pt-3 border-t-2">
              <span className="text-gray-700 font-medium">Vuelto</span>
              <span
                className={`font-bold ${
                  vuelto < 0 ? "text-danger" : "text-success"
                }`}
              >
                S/ {vuelto.toFixed(2)}
                {vuelto < 0 ? " (falta)" : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {metodoPago === "fiado" && (
        <div className="mb-4 space-y-3">
          <h2 className="text-lg font-bold">¿A quién se le fía?</h2>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full rounded-xl border-2 border-gray-300 p-4 text-lg"
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
              className="w-full rounded-xl border-2 border-gray-300 p-4 text-lg"
            />
          )}
        </div>
      )}

      {error && (
        <p className="text-base font-medium text-danger mb-3">{error}</p>
      )}
      {mensaje && (
        <p className="text-base font-medium text-success mb-3">{mensaje}</p>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-600">{carrito.length} producto(s)</p>
            <p className="text-2xl font-bold">S/ {total.toFixed(2)}</p>
          </div>
          <button
            onClick={registrarVenta}
            disabled={guardando}
            className="rounded-xl bg-accent px-8 py-4 text-white text-xl font-bold disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Cobrar"}
          </button>
        </div>
      </div>
    </div>
  );
}