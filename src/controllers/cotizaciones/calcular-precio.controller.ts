import { Request, Response } from "express";
import { pool } from "../../config/db";

// ============================================
// TIPOS
// ============================================
interface TarifaProduccion {
  idtarifas_produccion: number;
  tintas_idtintas: number;
  kilogramos_idkilogramos: number;
  caras_idcaras: number;
  precio: number;
  merma_porcentaje: number;
  // Datos del catálogo kilogramos
  kg: number;
  kg_min: number | null;
  kg_max: number | null;
}

interface ResultadoCalculo {
  peso_total_kg: number;
  precio_kg: number;
  merma_porcentaje: number;
  costo_produccion: number;
  costo_merma: number;
  costo_total: number;
  precio_unitario: number;
  kilogramos_rango: number;
  tarifa_id: number;
  kilogramos_id: number;
}

// ============================================
// BUSCAR TARIFA CORRECTA
// ============================================
const buscarTarifa = (
  tarifas: TarifaProduccion[],
  tintasId: number,
  carasId: number,
  pesoTotalKg: number
): TarifaProduccion | null => {
  const tarifa = tarifas.find(
    (t) =>
      t.tintas_idtintas === tintasId &&
      t.caras_idcaras === carasId &&
      pesoTotalKg >= (t.kg_min ?? 0) &&
      (t.kg_max === null || pesoTotalKg < t.kg_max)
  );

  if (!tarifa) {
    console.warn("⚠️ No se encontró tarifa para:", {
      pesoTotalKg,
      tintasId,
      carasId,
    });
    return null;
  }

  return tarifa;
};

// ============================================
// CALCULAR PRECIO UNITARIO (BACKEND)
// ============================================
const calcularPrecioUnitarioBackend = (
  cantidad: number,
  porKilo: number,
  tintasId: number,
  carasId: number,
  tarifas: TarifaProduccion[]
): ResultadoCalculo | null => {
  if (cantidad <= 0 || porKilo <= 0 || !tarifas.length) return null;

  // 1️⃣ Calcular peso total
  const peso_total_kg = cantidad / porKilo;

  // 2️⃣ Buscar tarifa según rango definido en BD
  const tarifa = buscarTarifa(tarifas, tintasId, carasId, peso_total_kg);
  if (!tarifa) return null;

  // 3️⃣ Calcular costos base
  const costo_produccion = peso_total_kg * tarifa.precio;

  // ⚠️ Merma solo informativa
  const costo_merma = costo_produccion * (tarifa.merma_porcentaje / 100);

  // ✅ El costo total NO incluye merma
  const costo_total = costo_produccion;

  // ✅ Precio unitario limpio
  const precio_unitario = costo_produccion / cantidad;

  console.log("💰 Cálculo producción (BACKEND):", {
    cantidad,
    peso_total_kg: peso_total_kg.toFixed(2) + " kg",
    rango_aplicado: `${tarifa.kg_min ?? 0} - ${tarifa.kg_max ?? "∞"} kg`,
    tintas: tintasId,
    caras: carasId,
    precio_kg: "$" + tarifa.precio,
    merma: tarifa.merma_porcentaje + "%",
    costo_produccion: "$" + costo_produccion.toFixed(2),
    costo_merma: "$" + costo_merma.toFixed(2) + " (informativo)",
    costo_total: "$" + costo_total.toFixed(2),
    precio_unitario: "$" + precio_unitario.toFixed(4),
  });

  return {
    peso_total_kg,
    precio_kg: tarifa.precio,
    merma_porcentaje: tarifa.merma_porcentaje,
    costo_produccion,
    costo_merma,
    costo_total,
    precio_unitario,
    kilogramos_rango: tarifa.kg_min ?? 0,
    tarifa_id: tarifa.idtarifas_produccion,
    kilogramos_id: tarifa.kilogramos_idkilogramos,
  };
};

// ============================================
// ENDPOINT: CALCULAR PRECIO PREVIEW
// ============================================
export const calcularPrecioPreview = async (req: Request, res: Response) => {
  try {
    const { cantidad, porKilo, tintasId, carasId } = req.body;

    // Validaciones
    if (!cantidad || !porKilo || !tintasId || !carasId) {
      return res.status(400).json({
        error: "Se requieren: cantidad, porKilo, tintasId, carasId",
      });
    }

    if (cantidad <= 0 || porKilo <= 0) {
      return res.status(400).json({
        error: "Cantidad y porKilo deben ser mayores a 0",
      });
    }

    // 🔥 Obtener todas las tarifas con JOIN a kilogramos
    const { rows: tarifasRows } = await pool.query<TarifaProduccion>(`
      SELECT 
        tp.idtarifas_produccion,
        tp.tintas_idtintas,
        tp.kilogramos_idkilogramos,
        tp.caras_idcaras,
        tp.precio,
        tp.merma_porcentaje,
        k.kg,
        k.kg_min,
        k.kg_max
      FROM tarifas_produccion tp
      INNER JOIN kilogramos k 
        ON k.idkilogramos = tp.kilogramos_idkilogramos
      ORDER BY k.kg_min ASC
    `);

    if (tarifasRows.length === 0) {
      return res.status(404).json({
        error: "No hay tarifas configuradas en el sistema",
      });
    }

    console.log(`✅ Tarifas cargadas: ${tarifasRows.length}`);

    // 🔥 Calcular precio
    const resultado = calcularPrecioUnitarioBackend(
      Number(cantidad),
      Number(porKilo),
      Number(tintasId),
      Number(carasId),
      tarifasRows
    );

    if (!resultado) {
      return res.status(404).json({
        error: "No se encontró tarifa aplicable para estos parámetros",
        detalles: {
          cantidad,
          peso_kg: (Number(cantidad) / Number(porKilo)).toFixed(2),
          tintasId,
          carasId,
        },
      });
    }

    // ✅ Devolver resultado
    return res.json({
      success: true,
      ...resultado,
    });

  } catch (error: any) {
    console.error("❌ CALCULAR PRECIO ERROR:", error.message);
    return res.status(500).json({
      error: "Error al calcular precio",
      detalles: error.message,
    });
  }
};

// ============================================
// ENDPOINT: CALCULAR PRECIOS EN BATCH
// ============================================
export const calcularPreciosBatch = async (req: Request, res: Response) => {
  try {
    const { cantidades, porKilo, tintasId, carasId } = req.body;

    if (!Array.isArray(cantidades) || cantidades.length === 0) {
      return res.status(400).json({
        error: "Se requiere un array de cantidades",
      });
    }

    if (!porKilo || !tintasId || !carasId) {
      return res.status(400).json({
        error: "Se requieren: porKilo, tintasId, carasId",
      });
    }

    // 🔥 Obtener tarifas con JOIN a kilogramos
    const { rows: tarifasRows } = await pool.query<TarifaProduccion>(`
      SELECT 
        tp.idtarifas_produccion,
        tp.tintas_idtintas,
        tp.kilogramos_idkilogramos,
        tp.caras_idcaras,
        tp.precio,
        tp.merma_porcentaje,
        k.kg,
        k.kg_min,
        k.kg_max
      FROM tarifas_produccion tp
      INNER JOIN kilogramos k 
        ON k.idkilogramos = tp.kilogramos_idkilogramos
      ORDER BY k.kg_min ASC
    `);

    if (tarifasRows.length === 0) {
      return res.status(404).json({
        error: "No hay tarifas configuradas en el sistema",
      });
    }

    console.log(`✅ Tarifas cargadas para batch: ${tarifasRows.length}`);

    // Calcular cada cantidad
    const resultados = cantidades.map((cantidad) => {
      if (cantidad <= 0) {
        return null;
      }

      return calcularPrecioUnitarioBackend(
        Number(cantidad),
        Number(porKilo),
        Number(tintasId),
        Number(carasId),
        tarifasRows
      );
    });

    return res.json({
      success: true,
      resultados,
    });

  } catch (error: any) {
    console.error("❌ CALCULAR PRECIOS BATCH ERROR:", error.message);
    return res.status(500).json({
      error: "Error al calcular precios",
      detalles: error.message,
    });
  }
};