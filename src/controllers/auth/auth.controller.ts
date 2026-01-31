import { Request, Response } from "express";
import { pool } from "../../config/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// ==========================
// REGISTER
// ==========================
export const register = async (req: Request, res: Response) => {
  try {
    const { nombre, apellido, correo, codigo } = req.body;

    const hash = await bcrypt.hash(codigo, 10);

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, apellido, correo, codigo)
       VALUES ($1,$2,$3,$4)
       RETURNING id_usuario, nombre, apellido, correo`,
      [nombre, apellido, correo, hash]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
};

// ==========================
// LOGIN (COOKIE HTTPONLY)
// ==========================
export const login = async (req: Request, res: Response) => {
  try {
    const { codigo } = req.body;

    const result = await pool.query(
      "SELECT * FROM usuarios WHERE activo = true"
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const usuario = result.rows.find((u) =>
      bcrypt.compareSync(codigo, u.codigo)
    );

    if (!usuario) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const token = jwt.sign(
      {
        id: usuario.id_usuario,
        correo: usuario.correo,
        // rol: usuario.rol || "user", // preparado para futuro
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "8h" }
    );

    // 👉 COOKIE SEGURA
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
    });

    // 👉 SOLO DEVOLVEMOS USUARIO
    res.json({
      usuario: {
        id: usuario.id_usuario,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
      },
    });
  } catch (error: any) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// LOGOUT
// ==========================
export const logout = (req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ message: "Sesión cerrada" });
};
