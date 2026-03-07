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
      WITH busqueda AS (
        SELECT $1::NUMERIC AS valor
      ),

      kidder_exacto AS (
        SELECT 'KIDDER' AS maquina, sin_grabado,
               con_grabado_1rep, con_grabado_2rep, con_grabado_3rep,
               NULL::NUMERIC AS con_grabado_4rep,
               NULL::NUMERIC AS con_grabado_5rep,
               true AS es_exacto
        FROM rodillos_kidder, busqueda
        WHERE sin_grabado = valor
      ),

      sicosa_exacto AS (
        SELECT 'SICOSA' AS maquina, sin_grabado,
               con_grabado_1rep, con_grabado_2rep, con_grabado_3rep,
               con_grabado_4rep, con_grabado_5rep,
               true AS es_exacto
        FROM rodillos_sicosa, busqueda
        WHERE sin_grabado = valor
      ),

      kidder_cercano AS (
        SELECT 'KIDDER' AS maquina, sin_grabado,
               con_grabado_1rep, con_grabado_2rep, con_grabado_3rep,
               NULL::NUMERIC AS con_grabado_4rep,
               NULL::NUMERIC AS con_grabado_5rep,
               false AS es_exacto
        FROM rodillos_kidder, busqueda
        WHERE NOT EXISTS (SELECT 1 FROM kidder_exacto)
        ORDER BY ABS(sin_grabado - valor)
        LIMIT 1
      ),

      sicosa_cercano AS (
        SELECT 'SICOSA' AS maquina, sin_grabado,
               con_grabado_1rep, con_grabado_2rep, con_grabado_3rep,
               con_grabado_4rep, con_grabado_5rep,
               false AS es_exacto
        FROM rodillos_sicosa, busqueda
        WHERE NOT EXISTS (SELECT 1 FROM sicosa_exacto)
        ORDER BY ABS(sin_grabado - valor)
        LIMIT 1
      )

      SELECT * FROM kidder_exacto
      UNION ALL SELECT * FROM sicosa_exacto
      UNION ALL SELECT * FROM kidder_cercano
      UNION ALL SELECT * FROM sicosa_cercano
    `, [valor]);

    console.log(`✅ Rodillos para valor ${valor}: ${rows.length} resultado(s)`);
    return res.json({ valor_buscado: valor, resultados: rows });

  } catch (error: any) {
    console.error("❌ BUSCAR RODILLO ERROR:", error.message);
    return res.status(500).json({ error: "Error al buscar rodillo" });
  }
};