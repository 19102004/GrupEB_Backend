import { Request, Response } from "express";
import { pool } from "../../config/db";

// ==========================
// OBTENER TODOS LOS ROLES
// ==========================
export const getRoles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        idroles,
        nombre,
        descripcion,
        acceso_total
      FROM roles
      ORDER BY idroles ASC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error("❌ GET ROLES ERROR:", error.message);
    res.status(500).json({ 
      error: "Error al obtener roles" 
    });
  }
};

// ==========================
// OBTENER PRIVILEGIOS DE UN ROL
// ==========================
export const getPrivilegiosByRol = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validar ID
    if (!Number.isInteger(Number(id)) || Number(id) < 1) {
      return res.status(400).json({ 
        error: "ID de rol inválido" 
      });
    }

    console.log(`📋 Obteniendo privilegios del rol ${id}`);

    // Verificar que el rol existe
    const rolExiste = await pool.query(
      "SELECT idroles, nombre, acceso_total FROM roles WHERE idroles = $1 LIMIT 1",
      [id]
    );

    if ((rolExiste.rowCount ?? 0) === 0) {
      return res.status(404).json({ 
        error: "Rol no encontrado" 
      });
    }

    const rol = rolExiste.rows[0];

    // Si tiene acceso total, devolver array vacío
    if (rol.acceso_total) {
      console.log("👑 Rol con acceso total, sin privilegios específicos");
      return res.json({
        rol_id: rol.idroles,
        rol_nombre: rol.nombre,
        acceso_total: true,
        privilegios: [],
      });
    }

    // Obtener privilegios del rol
    const result = await pool.query(
      `
      SELECT privilegios_idprivilegios as privilegio_id
      FROM roles_privilegios
      WHERE roles_idroles = $1
      ORDER BY privilegios_idprivilegios ASC
    `,
      [id]
    );

    const privilegios = result.rows.map(row => row.privilegio_id);

    console.log(`✅ Privilegios encontrados: ${privilegios.length}`);

    res.json({
      rol_id: rol.idroles,
      rol_nombre: rol.nombre,
      acceso_total: false,
      privilegios,
    });
  } catch (error: any) {
    console.error("❌ GET PRIVILEGIOS BY ROL ERROR:", error.message);
    res.status(500).json({ 
      error: "Error al obtener privilegios del rol" 
    });
  }
};