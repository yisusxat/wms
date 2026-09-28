import { NextResponse } from "next/server";
import { getWarehouseSeedLocations } from "../../../lib/locations-data";

export interface InventoryApiResponseItem {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  quantity: number;
  reservedQuantity: number;
  locationCode: string;
  locationId?: string;
  category?: string;
  unit?: string;
}

export async function GET() {
  const rawInsforgeUrl = process.env.NEXT_PUBLIC_INSFORGE_URL ?? "https://jirv3k8h.us-east.insforge.app";
  const insforgeUrl = rawInsforgeUrl.replace(/-\w+\.us-east/, ".us-east").replace(/\/$/, "");
  const insforgeAnonKey =
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ??
    "anon_8c78b5a48a1c49627477ca316a70504fab071593359304c6f8484186628ad952";

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${insforgeAnonKey}`,
      apikey: insforgeAnonKey,
    };

    const res = await fetch(
      `${insforgeUrl}/api/database/records/inventory?select=id,quantity,reserved_quantity,product:products(*),location:locations(*)&limit=500`,
      { headers }
    );

    if (res.ok) {
      const data = await res.json().catch(() => []);
      if (Array.isArray(data) && data.length > 0) {
        const items: InventoryApiResponseItem[] = data
          .filter((item: any) => item && item.product && item.location)
          .map((item: any) => ({
            id: item.id || `inv-${item.product?.sku}-${item.location?.code}`,
            sku: item.product?.sku || "SKU-N/A",
            name: item.product?.name || "Producto sin nombre",
            barcode: item.product?.barcode || undefined,
            quantity: Number(item.quantity) || 0,
            reservedQuantity: Number(item.reserved_quantity) || 0,
            locationCode: item.location?.code || "A-C-01-01",
            locationId: item.location?.id,
            category: item.product?.category || "General",
            unit: item.product?.unit || "unidad",
          }));

        return NextResponse.json({
          success: true,
          items,
          total: items.length,
          source: "insforge",
        });
      }
    }
  } catch (err) {
    console.warn("[Inventory API] Error querying InsForge:", err);
  }

  // Fallback to seed catalog inventory
  const seedLocations = getWarehouseSeedLocations();
  const seedItems: InventoryApiResponseItem[] = [
    {
      id: "inv-seed-1",
      sku: "ARR-DIA-001",
      name: "Arroz Diana Especial 1kg",
      barcode: "7702010010015",
      quantity: 85,
      reservedQuantity: 5,
      locationCode: "A-C-01-01",
      category: "Granos y Abarrotes",
      unit: "kg",
    },
    {
      id: "inv-seed-2",
      sku: "ACE-PRE-002",
      name: "Aceite Premier 1000ml",
      barcode: "7702010010022",
      quantity: 42,
      reservedQuantity: 0,
      locationCode: "A-C-01-02",
      category: "Aceites y Grasas",
      unit: "litro",
    },
    {
      id: "inv-seed-3",
      sku: "BEV-001",
      name: "Cerveza Artesanal IPA 330ml",
      barcode: "7702010010039",
      quantity: 120,
      reservedQuantity: 12,
      locationCode: "A-P-02-04",
      category: "Bebidas",
      unit: "botella",
    },
    {
      id: "inv-seed-4",
      sku: "HAR-PAN-002",
      name: "Harina PAN 1kg",
      barcode: "7702010010046",
      quantity: 64,
      reservedQuantity: 4,
      locationCode: "A-C-01-05",
      category: "Harinas",
      unit: "paquete",
    },
    {
      id: "inv-seed-5",
      sku: "AZU-INC-003",
      name: "Azúcar Incauca 1kg",
      barcode: "7702010010053",
      quantity: 90,
      reservedQuantity: 0,
      locationCode: "B-C-01-02",
      category: "Endulzantes",
      unit: "kg",
    },
    {
      id: "inv-seed-6",
      sku: "CAFE-COL-004",
      name: "Café Juan Valdez 500g",
      barcode: "7702010010060",
      quantity: 55,
      reservedQuantity: 2,
      locationCode: "A-P-01-06",
      category: "Café",
      unit: "bolsa",
    },
    {
      id: "inv-seed-7",
      sku: "LECH-COL-005",
      name: "Leche Entera Colanta 1L",
      barcode: "7702010010077",
      quantity: 110,
      reservedQuantity: 10,
      locationCode: "B-P-02-14",
      category: "Lácteos",
      unit: "litro",
    },
    {
      id: "inv-seed-8",
      sku: "PRD-1029-A",
      name: "Detergente Multiuso Industrial 5L",
      barcode: "7702010010084",
      quantity: 34,
      reservedQuantity: 0,
      locationCode: "A-C-02-08",
      category: "Aseo y Limpieza",
      unit: "galón",
    },
  ];

  return NextResponse.json({
    success: true,
    items: seedItems,
    total: seedItems.length,
    source: "seed",
  });
}
