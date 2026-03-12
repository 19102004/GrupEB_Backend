import { Request, Response } from "express";
import { pool } from "../../config/db";

// ============================================================
// GET /api/rodillos/buscar?valor=36
// Devuelve la fila más cercana de cada máquina con todas
// las columnas de repetición para que el frontend calcule
// cuál rep es la más próxima al valor buscado
// ============================================================
export const buscarRodillo = async (req: Request, res: Response) => {
  try {
    const valor = parseFloat(req.query.valor as string);

    if (isNaN(valor) || valor <= 0) {
      return res.status(400).json({ error: "Valor de búsqueda inválido" });
    }

    const { rows } = await pool.query(`
      WITH busqueda AS (SELECT $1::NUMERIC AS valor),

      -- ── KIDDER: fila cuya rep más cercana al valor buscado sea la menor distancia ──
      kidder_candidatos AS (
        SELECT
          sin_grabado,
          con_grabado_1rep, con_grabado_2rep, con_grabado_3rep,
          NULL::NUMERIC AS con_grabado_4rep,
          NULL::NUMERIC AS con_grabado_5rep,
          LEAST(
            ABS(con_grabado_1rep - (SELECT valor FROM busqueda)),
            ABS(con_grabado_2rep - (SELECT valor FROM busqueda)),
            ABS(con_grabado_3rep - (SELECT valor FROM busqueda))
          ) AS distancia_min
        FROM rodillos_kidder
      ),
      kidder_mejor AS (
        SELECT * FROM kidder_candidatos
        ORDER BY distancia_min ASC
        LIMIT 1
      ),

      -- ── SICOSA: igual pero con 5 reps ──
      sicosa_candidatos AS (
        SELECT
          sin_grabado,
          con_grabado_1rep, con_grabado_2rep, con_grabado_3rep,
          con_grabado_4rep, con_grabado_5rep,
          LEAST(
            ABS(con_grabado_1rep - (SELECT valor FROM busqueda)),
            ABS(con_grabado_2rep - (SELECT valor FROM busqueda)),
            ABS(con_grabado_3rep - (SELECT valor FROM busqueda)),
            ABS(con_grabado_4rep - (SELECT valor FROM busqueda)),
            ABS(con_grabado_5rep - (SELECT valor FROM busqueda))
          ) AS distancia_min
        FROM rodillos_sicosa
      ),
      sicosa_mejor AS (
        SELECT * FROM sicosa_candidatos
        ORDER BY distancia_min ASC
        LIMIT 1
      )

      SELECT 'KIDDER' AS maquina, sin_grabado,
             con_grabado_1rep, con_grabado_2rep, con_grabado_3rep,
             con_grabado_4rep, con_grabado_5rep,
             distancia_min = 0 AS es_exacto
      FROM kidder_mejor

      UNION ALL

      SELECT 'SICOSA' AS maquina, sin_grabado,
             con_grabado_1rep, con_grabado_2rep, con_grabado_3rep,
             con_grabado_4rep, con_grabado_5rep,
             distancia_min = 0 AS es_exacto
      FROM sicosa_mejor
    `, [valor]);

    return res.json({ valor_buscado: valor, resultados: rows });

  } catch (error: any) {
    console.error("❌ BUSCAR RODILLO ERROR:", error.message);
    return res.status(500).json({ error: "Error al buscar rodillo" });
  }
};