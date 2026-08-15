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
};

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Campos del formulario para agregar producto
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precio, setPrecio] = useState("");
  const [stock, setStock] = useState("");

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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- patrón válido de "cargar datos al montar"; ver https://github.com/facebook/react/issues/34743
  cargarProductos();
}, []);

  const handleAgregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const { error } = await supabase.from("productos").insert({
      nombre,
      categoria: categoria || null,
      precio: parseFloat(precio),
      stock: parseInt(stock),
    });

    if (error) {
      setError("Error al agregar: " + error.message);
      return;
    }

    // Limpiar formulario y recargar lista
    setNombre("");
    setCategoria("");
    setPrecio("");
    setStock("");
    setLoading(true);
    cargarProductos();
  };

  const handleEditarStock = async (id: string, nuevoStock: number) => {
    if (nuevoStock < 0) return;

    const { error } = await supabase
      .from("productos")
      .update({ stock: nuevoStock })
      .eq("id", id);

    if (error) {
      setError("Error al actualizar stock: " + error.message);
      return;
    }
    setLoading(true);
    cargarProductos();
  };

  const handleEliminar = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este producto?")) return;

    // No borramos de verdad, solo lo marcamos inactivo (para no perder historial de ventas)
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

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Inventario</h1>

      {/* Formulario para agregar producto */}
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
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Precio (S/)"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="w-full rounded border p-2"
            required
          />
          <input
            type="number"
            min="0"
            placeholder="Stock inicial"
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

      {/* Lista de productos */}
      {loading ? (
        <p>Cargando...</p>
      ) : productos.length === 0 ? (
        <p className="text-gray-500">Aún no tienes productos registrados.</p>
      ) : (
        <div className="space-y-2">
          {productos.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border rounded p-3"
            >
              <div>
                <p className="font-medium">{p.nombre}</p>
                <p className="text-sm text-gray-500">
                  {p.categoria || "Sin categoría"} · S/ {p.precio.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEditarStock(p.id, p.stock - 1)}
                  className="rounded border w-8 h-8"
                >
                  −
                </button>
                <span className="w-10 text-center">{p.stock}</span>
                <button
                  onClick={() => handleEditarStock(p.id, p.stock + 1)}
                  className="rounded border w-8 h-8"
                >
                  +
                </button>
                <button
                  onClick={() => handleEliminar(p.id)}
                  className="text-red-600 text-sm ml-2"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}