import { Request, Response } from "express";
import { pool } from "../../config/db";

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type ProcesoOrigen = "bolseo" | "asa_flexible";

interface FkBulto {
  tipo: ProcesoOrigen;
  id:   number;
}

// ─────────────────────────────────────────────
// HELPER — resuelve qué FK usar
// ─────────────────────────────────────────────
async function resolverFkBulto(idproduccion: number): Promise<FkBulto | null> {
  const { rows: asaRows } = await pool.query(
    `SELECT idasa_flexible, estado_produccion_cat_idestado_produccion_cat AS estado_id
     FROM asa_flexible
     WHERE orden_produccion_idproduccion = $1`,
    [idproduccion]
  );

  if (asaRows.length > 0 && Number(asaRows[0].estado_id) === 3) {
    return { tipo: "asa_flexible", id: Number(asaRows[0].idasa_flexible) };
  }

  const { rows: bolRows } = await pool.query(
    `SELECT idbolseo FROM bolseo WHERE orden_produccion_idproduccion = $1`,
    [idproduccion]
  );

  if (bolRows.length > 0) {
    return { tipo: "bolseo", id: Number(bolRows[0].idbolseo) };
  }

  return null;
}

// ─────────────────────────────────────────────
// GET /api/seguimiento/:idproduccion/bultos
// ─────────────────────────────────────────────
export const getBultos = async (req: Request, res: Response): Promise<Response> => {
  try {
    const idproduccion = Number(req.params.idproduccion);

    const { rows: ordenRows } = await pool.query(
      `SELECT bultos_finalizado FROM orden_produccion WHERE idproduccion = $1`,
      [idproduccion]
    );

    if (ordenRows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const bultos_finalizado = Boolean(ordenRows[0].bultos_finalizado);

    const { rows } = await pool.query(
      `SELECT
         b.idbulto,
         b.cantidad_unidades,
         b.fecha_creacion,
         CASE
           WHEN b.bolseo_idbolseo             IS NOT NULL THEN 'bolseo'
           WHEN b.asa_flexible_idasa_flexible IS NOT NULL THEN 'asa_flexible'
         END AS proceso_origen
       FROM bultos b
       WHERE
         b.bolseo_idbolseo IN (
           SELECT idbolseo FROM bolseo
           WHERE orden_produccion_idproduccion = $1
         )
         OR
         b.asa_flexible_idasa_flexible IN (
           SELECT idasa_flexible FROM asa_flexible
           WHERE orden_produccion_idproduccion = $1
         )
       ORDER BY b.idbulto ASC`,
      [idproduccion]
    );

    const total_unidades: number = rows.reduce(
      (sum: number, r: any) => sum + Number(r.cantidad_unidades),
      0
    );

    return res.json({
      bultos_finalizado,
      bultos: rows.map((r: any) => ({
        idbulto:           Number(r.idbulto),
        cantidad_unidades: Number(r.cantidad_unidades),
        fecha_creacion:    r.fecha_creacion,
        proceso_origen:    r.proceso_origen as ProcesoOrigen,
      })),
      total_bultos:   rows.length,
      total_unidades,
    });
  } catch (error: any) {
    console.error("❌ GET BULTOS ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener bultos" });
  }
};

// ─────────────────────────────────────────────
// POST /api/seguimiento/:idproduccion/bultos
// ─────────────────────────────────────────────
export const agregarBulto = async (req: Request, res: Response): Promise<Response> => {
  try {
    const idproduccion      = Number(req.params.idproduccion);
    const cantidad_unidades = Number(req.body.cantidad_unidades);

    if (!cantidad_unidades || cantidad_unidades <= 0) {
      return res.status(400).json({ error: "La cantidad de unidades debe ser mayor a 0" });
    }

    const { rows: ordenRows } = await pool.query(
      `SELECT idestado_produccion_cat, proceso_actual, bultos_finalizado
       FROM orden_produccion WHERE idproduccion = $1`,
      [idproduccion]
    );

    if (ordenRows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    if (
      ordenRows[0].proceso_actual !== null ||
      Number(ordenRows[0].idestado_produccion_cat) !== 3
    ) {
      return res.status(400).json({
        error: "La orden debe estar completamente terminada para registrar bultos",
      });
    }

    if (Boolean(ordenRows[0].bultos_finalizado)) {
      return res.status(400).json({
        error: "Los bultos de esta orden ya fueron finalizados. No se pueden agregar más.",
      });
    }

    const fk = await resolverFkBulto(idproduccion);
    if (!fk) {
      return res.status(404).json({
        error: "No existe registro de bolseo ni asa_flexible para esta orden",
      });
    }

    const columnaFk = fk.tipo === "bolseo"
      ? "bolseo_idbolseo"
      : "asa_flexible_idasa_flexible";

    const { rows: inserted } = await pool.query(
      `INSERT INTO bultos (${columnaFk}, cantidad_unidades)
       VALUES ($1, $2)
       RETURNING idbulto, cantidad_unidades, fecha_creacion`,
      [fk.id, cantidad_unidades]
    );

    return res.status(201).json({
      idbulto:           Number(inserted[0].idbulto),
      cantidad_unidades: Number(inserted[0].cantidad_unidades),
      fecha_creacion:    inserted[0].fecha_creacion,
      proceso_origen:    fk.tipo,
    });
  } catch (error: any) {
    console.error("❌ AGREGAR BULTO ERROR:", error.message);
    return res.status(500).json({ error: "Error al agregar bulto" });
  }
};

// ─────────────────────────────────────────────
// DELETE /api/seguimiento/:idproduccion/bultos/:idbulto
// ─────────────────────────────────────────────
export const eliminarBulto = async (req: Request, res: Response): Promise<Response> => {
  try {
    const idproduccion = Number(req.params.idproduccion);
    const idbulto      = Number(req.params.idbulto);

    const { rows: ordenRows } = await pool.query(
      `SELECT bultos_finalizado FROM orden_produccion WHERE idproduccion = $1`,
      [idproduccion]
    );

    if (ordenRows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    if (Boolean(ordenRows[0].bultos_finalizado)) {
      return res.status(400).json({
        error: "Los bultos ya fueron finalizados. No se pueden eliminar.",
      });
    }

    const { rows } = await pool.query(
      `SELECT b.idbulto FROM bultos b
       WHERE b.idbulto = $1
         AND (
           b.bolseo_idbolseo IN (
             SELECT idbolseo FROM bolseo
             WHERE orden_produccion_idproduccion = $2
           )
           OR
           b.asa_flexible_idasa_flexible IN (
             SELECT idasa_flexible FROM asa_flexible
             WHERE orden_produccion_idproduccion = $2
           )
         )`,
      [idbulto, idproduccion]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Bulto no encontrado" });
    }

    await pool.query(`DELETE FROM bultos WHERE idbulto = $1`, [idbulto]);

    return res.json({ message: "Bulto eliminado", idbulto });
  } catch (error: any) {
    console.error("❌ ELIMINAR BULTO ERROR:", error.message);
    return res.status(500).json({ error: "Error al eliminar bulto" });
  }
};

// ─────────────────────────────────────────────
// PATCH /api/seguimiento/:idproduccion/bultos/finalizar
// ─────────────────────────────────────────────
export const finalizarBultos = async (req: Request, res: Response): Promise<Response> => {
  try {
    const idproduccion = Number(req.params.idproduccion);

    const { rows: ordenRows } = await pool.query(
      `SELECT bultos_finalizado FROM orden_produccion WHERE idproduccion = $1`,
      [idproduccion]
    );

    if (ordenRows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    if (Boolean(ordenRows[0].bultos_finalizado)) {
      return res.status(400).json({ error: "Los bultos ya fueron finalizados previamente" });
    }

    // Debe haber al menos un bulto antes de finalizar
    const { rows: bultosRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM bultos b
       WHERE
         b.bolseo_idbolseo IN (
           SELECT idbolseo FROM bolseo
           WHERE orden_produccion_idproduccion = $1
         )
         OR
         b.asa_flexible_idasa_flexible IN (
           SELECT idasa_flexible FROM asa_flexible
           WHERE orden_produccion_idproduccion = $1
         )`,
      [idproduccion]
    );

    if (Number(bultosRows[0].total) === 0) {
      return res.status(400).json({
        error: "Debes registrar al menos un bulto antes de finalizar",
      });
    }

    await pool.query(
      `UPDATE orden_produccion SET bultos_finalizado = TRUE WHERE idproduccion = $1`,
      [idproduccion]
    );

    return res.json({
      message:           "Bultos finalizados correctamente",
      idproduccion,
      bultos_finalizado: true,
    });
  } catch (error: any) {
    console.error("❌ FINALIZAR BULTOS ERROR:", error.message);
    return res.status(500).json({ error: "Error al finalizar bultos" });
  }
};