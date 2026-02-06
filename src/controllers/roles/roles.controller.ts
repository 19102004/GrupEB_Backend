import { Request, Response } from "express";
import { pool } from "../../config/db";

// ==========================
// OBTENER TODOS LOS ROLES
// ==========================
export const getRoles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM roles ORDER BY idroles LIMIT 100"
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error("❌ GET ROLES ERROR:", error.message);
    res.status(500).json({ 
      error: "Error al obtener roles" 
    });
  }
};