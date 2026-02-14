import { Request, Response } from "express";
import { pool } from "../../config/db";

// ==========================
// OBTENER CATÁLOGOS
// (caras + tintas)
// ==========================
export const getCatalogosProduccion = async (req: Request, res: Response) => {
  try {
    console.log("📋 Obteniendo catálogos de producción");

    const [caras, tintas] = await Promise.all([
      pool.query(`
        SELECT idcaras as id, cantidad
        FROM caras
        ORDER BY cantidad ASC
      `),
      pool.query(`
        SELECT idtintas as id, cantidad
        FROM tintas
        ORDER BY cantidad ASC
      `),
    ]);

    console.log("✅ Catálogos obtenidos");

    res.json({
      caras: caras.rows,
      tintas: tintas.rows,
    });
  } catch (error: any) {
    console.error("❌ GET CATÁLOGOS PRODUCCIÓN ERROR:", error.message);
    res.status(500).json({ error: "Error al obtener catálogos de producción" });
  }
};

// ==========================
// OBTENER TARIFAS
// ==========================
export const getTarifasProduccion = async (req: Request, res: Response) => {
  try {
    console.log("📋 Obteniendo tarifas de producción");

    const result = await pool.query(`
      SELECT 
        tp.idtarifas_produccion  AS id,
        tp.tintas_idtintas,
        tp.kilogramos_idkilogramos,
        tp.caras_idcaras,
        tp.precio,
        tp.merma_porcentaje,
        k.kg_min,
        k.kg_max
      FROM tarifas_produccion tp
      JOIN kilogramos k 
        ON tp.kilogramos_idkilogramos = k.idkilogramos
      ORDER BY tp.caras_idcaras, tp.tintas_idtintas, k.kg_min ASC
    `);

    console.log(`✅ Tarifas obtenidas: ${result.rowCount}`);

    res.json(result.rows);
  } catch (error: any) {
    console.error("❌ GET TARIFAS PRODUCCIÓN ERROR:", error.message);
    res.status(500).json({ error: "Error al obtener tarifas de producción" });
  }
};
