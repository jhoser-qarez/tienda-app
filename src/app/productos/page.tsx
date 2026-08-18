"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Producto = {
  id: string;
  nombre: string;
  categoria: string | null;
  precio: number;
  stock: number;
  activo: boolean;
  unidad: "unidad" | "kg";
  favorito: boolean;
};

type FormEdicion = {
  nombre: string;
  categoria: string;
  precio: string;
  stock: string;
};

const MAX_FAVORITOS = 6;
const SIN_CATEGORIA = "Sin categoría";

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precio, setPrecio] = useState("");
  const [stock, setStock] = useState("");
  const [unidad, setUnidad] = useState<"unidad" | "kg">("unidad");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicion, setFormEdicion] = useState<FormEdicion>({
    nombre: "",
    categoria: "",
    precio: "",
    stock: "",
  });

  const supabase = createClient();

  const cargarProductos = async () => {
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .eq("activo", true)
      .order("nombre");

    if (error) {
      setError("Error al cargar productos: " + error.message);
    } else {
      setProductos(data as Producto[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- patrón válido de "cargar datos al montar"
    cargarProductos();
  }, []);

  const handleAgregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const { error } = await supabase.from("productos").insert({
      nombre,
      categoria: categoria || null,
      precio: parseFloat(precio),
      stock: parseFloat(stock),
      unidad,
    });

    if (error) {
      setError("Error al agregar: " + error.message);
      return;
    }

    setNombre("");
    setCategoria("");
    setPrecio("");
    setStock("");
    setUnidad("unidad");
    setLoading(true);
    cargarProductos();
  };

  const handleToggleFavorito = async (producto: Producto) => {
    setError("");

    if (!producto.favorito) {
      const cantidadActual = productos.filter((p) => p.favorito).length;
      if (cantidadActual >= MAX_FAVORITOS) {
        setError(
          `Ya tienes ${MAX_FAVORITOS} favoritos. Desmarca uno antes de agregar otro.`
        );
        return;
      }
    }

    const { error } = await supabase
      .from("productos")
      .update({ favorito: !producto.favorito })
      .eq("id", producto.id);

    if (error) {
      setError("Error al actualizar favorito: " + error.message);
      return;
    }
    cargarProductos();
  };

  const handleEliminar = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este producto?")) return;

    const { error } = await supabase
      .from("productos")
      .update({ activo: false })
      .eq("id", id);

    if (error) {
      setError("Error al eliminar: " + error.message);
      return;
    }
    setLoading(true);
    cargarProductos();
  };

  const iniciarEdicion = (p: Producto) => {
    setError("");
    setEditandoId(p.id);
    setFormEdicion({
      nombre: p.nombre,
      categoria: p.categoria || "",
      precio: String(p.precio),
      stock: String(p.stock),
    });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
  };

  const guardarEdicion = async (id: string, unidadProducto: "unidad" | "kg") => {
    setError("");

    const nuevoNombre = formEdicion.nombre.trim();
    const nuevoPrecio = parseFloat(formEdicion.precio);
    const nuevoStock = parseFloat(formEdicion.stock);

    if (!nuevoNombre) {
      setError("El nombre no puede quedar vacío");
      return;
    }
    if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
      setError("El precio no es válido");
      return;
    }
    if (isNaN(nuevoStock) || nuevoStock < 0) {
      setError("El stock no es válido");
      return;
    }

    const { error } = await supabase
      .from("productos")
      .update({
        nombre: nuevoNombre,
        categoria: formEdicion.categoria.trim() || null,
        precio: nuevoPrecio,
        stock: nuevoStock,
      })
      .eq("id", id);

    if (error) {
      setError("Error al guardar los cambios: " + error.message);
      return;
    }

    setEditandoId(null);
    setLoading(true);
    cargarProductos();
    void unidadProducto;
  };

  const cantidadFavoritos = productos.filter((p) => p.favorito).length;

  const grupos = new Map<string, Producto[]>();
  for (const p of productos) {
    const clave = p.categoria?.trim() || SIN_CATEGORIA;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(p);
  }
  const categoriasOrdenadas = Array.from(grupos.keys()).sort((a, b) => {
    if (a === SIN_CATEGORIA) return 1;
    if (b === SIN_CATEGORIA) return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Inventario</h1>
      <p className="text-sm text-gray-500 mb-4">
        Favoritos: {cantidadFavoritos}/{MAX_FAVORITOS}
      </p>

      <form onSubmit={handleAgregar} className="space-y-2 border rounded p-4 mb-6">
        <h2 className="font-semibold">Agregar producto</h2>
        <input
          type="text"
          placeholder="Nombre del producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded border p-2"
          required
        />
        <input
          type="text"
          placeholder="Categoría (opcional)"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="w-full rounded border p-2"
        />

        <div>
          <p className="text-sm text-gray-600 mb-1">¿Cómo se vende?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUnidad("unidad")}
              className={`flex-1 rounded border p-2 ${
                unidad === "unidad" ? "bg-black text-white" : ""
              }`}
            >
              Por unidad
            </button>
            <button
              type="button"
              onClick={() => setUnidad("kg")}
              className={`flex-1 rounded border p-2 ${
                unidad === "kg" ? "bg-black text-white" : ""
              }`}
            >
              Por kilo
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder={unidad === "kg" ? "Precio por kilo (S/)" : "Precio (S/)"}
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="w-full rounded border p-2"
            required
          />
          <input
            type="number"
            step={unidad === "kg" ? "0.001" : "1"}
            min="0"
            placeholder={unidad === "kg" ? "Stock inicial (kg)" : "Stock inicial"}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="w-full rounded border p-2"
            required
          />
        </div>
        <button type="submit" className="w-full rounded bg-black p-2 text-white">
          Agregar
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p>Cargando...</p>
      ) : productos.length === 0 ? (
        <p className="text-gray-500">Aún no tienes productos registrados.</p>
      ) : (
        <div className="space-y-6">
          {categoriasOrdenadas.map((cat) => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                {cat}
              </h3>
              <div className="space-y-2">
                {grupos
                  .get(cat)!
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map((p) =>
                    editandoId === p.id ? (
                      <div
                        key={p.id}
                        className="border-2 border-black rounded-xl p-3 space-y-2"
                      >
                        <div>
                          <label className="text-xs text-gray-500">Nombre</label>
                          <input
                            type="text"
                            value={formEdicion.nombre}
                            onChange={(e) =>
                              setFormEdicion((f) => ({
                                ...f,
                                nombre: e.target.value,
                              }))
                            }
                            className="w-full rounded border p-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">
                            Categoría
                          </label>
                          <input
                            type="text"
                            value={formEdicion.categoria}
                            onChange={(e) =>
                              setFormEdicion((f) => ({
                                ...f,
                                categoria: e.target.value,
                              }))
                            }
                            className="w-full rounded border p-2 text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-gray-500">
                              Precio (S/)
                              {p.unidad === "kg" ? " por kg" : ""}
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={formEdicion.precio}
                              onChange={(e) =>
                                setFormEdicion((f) => ({
                                  ...f,
                                  precio: e.target.value,
                                }))
                              }
                              className="w-full rounded border p-2 text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-gray-500">
                              Stock{p.unidad === "kg" ? " (kg)" : ""}
                            </label>
                            <input
                              type="number"
                              step={p.unidad === "kg" ? "0.001" : "1"}
                              min="0"
                              value={formEdicion.stock}
                              onChange={(e) =>
                                setFormEdicion((f) => ({
                                  ...f,
                                  stock: e.target.value,
                                }))
                              }
                              className="w-full rounded border p-2 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => guardarEdicion(p.id, p.unidad)}
                            className="flex-1 rounded bg-black text-white py-2 text-sm font-medium"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={cancelarEdicion}
                            className="flex-1 rounded border py-2 text-sm"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={p.id}
                        className="flex items-center justify-between border rounded p-3"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            onClick={() => handleToggleFavorito(p)}
                            className="text-xl leading-none shrink-0"
                            aria-label={
                              p.favorito
                                ? "Quitar de favoritos"
                                : "Marcar como favorito"
                            }
                          >
                            {p.favorito ? (
                              <span className="text-yellow-500">★</span>
                            ) : (
                              <span className="text-gray-300">☆</span>
                            )}
                          </button>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{p.nombre}</p>
                            <p className="text-sm text-gray-500">
                              S/ {p.precio.toFixed(2)}
                              {p.unidad === "kg" ? " /kg" : ""} · Stock:{" "}
                              {p.unidad === "kg" ? p.stock.toFixed(3) : p.stock}
                              {p.unidad === "kg" ? " kg" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => iniciarEdicion(p)}
                            className="rounded border px-3 py-1.5 text-sm font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleEliminar(p.id)}
                            className="rounded border border-red-300 text-red-600 px-3 py-1.5 text-sm font-medium"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}