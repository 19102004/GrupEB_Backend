import { Request, Response } from "express";
import { pool } from "../../config/db";

// ==========================
// OBTENER TODOS LOS PRIVILEGIOS
// ==========================
export const getPrivilegios = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM privilegios ORDER BY idprivilegios LIMIT 1000"
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error("❌ GET PRIVILEGIOS ERROR:", error.message);
    res.status(500).json({ 
      error: "Error al obtener privilegios" 
    });
  }
};