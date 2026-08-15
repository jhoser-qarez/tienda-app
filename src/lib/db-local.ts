import Dexie, { type Table } from "dexie";

export type VentaPendiente = {
  id?: number;
  vendedor_id: string;
  cliente_id: string | null;
  metodo_pago: string;
  items: { producto_id: string; cantidad: number; nombre: string; precio: number }[];
  total: number;
  created_at: string;
  sincronizada: number; // 0 = pendiente, 1 = sincronizada (IndexedDB NO acepta booleanos en campos indexados)
};

class TiendaDB extends Dexie {
  ventasPendientes!: Table<VentaPendiente, number>;

  constructor() {
    super("tienda-app-db");
    this.version(1).stores({
      ventasPendientes: "++id, sincronizada",
    });
  }
}

export const dbLocal = new TiendaDB();