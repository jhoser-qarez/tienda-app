import { createClient } from "@/lib/supabase/client";
import { dbLocal } from "@/lib/db-local";

export async function sincronizarVentasPendientes() {
  const pendientes = await dbLocal.ventasPendientes
    .where("sincronizada")
    .equals(0)
    .toArray();

  if (pendientes.length === 0) return { sincronizadas: 0, fallidas: 0 };

  const supabase = createClient();
  let sincronizadas = 0;
  let fallidas = 0;

  for (const venta of pendientes) {
    const { error } = await supabase.rpc("registrar_venta", {
      p_vendedor_id: venta.vendedor_id,
      p_metodo_pago: venta.metodo_pago,
      p_items: venta.items.map((i) => ({
        producto_id: i.producto_id,
        cantidad: i.cantidad,
      })),
      p_cliente_id: venta.cliente_id,
      p_creada_offline: true,
    });

    if (!error) {
      await dbLocal.ventasPendientes.delete(venta.id!);
      sincronizadas++;
    } else {
      fallidas++;
    }
  }

  return { sincronizadas, fallidas };
}