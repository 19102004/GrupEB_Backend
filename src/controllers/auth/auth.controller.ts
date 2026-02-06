import { Request, Response } from "express";
import { pool } from "../../config/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import validator from "validator";

// ==========================
// CONSTANTES DE SEGURIDAD
// ==========================
const JWT_EXPIRATION = "8h";
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 100;

// ==========================
// LOGIN (MEJORADO)
// ==========================
export const login = async (req: Request, res: Response) => {
  try {
    const { codigo } = req.body;

    console.log("🔑 Intento de login");

    // Validación estricta
    if (!codigo || !/^\d{5}$/.test(codigo)) {
      return res.status(401).json({ 
        error: "Credenciales inválidas" 
      });
    }

    // Sanitización
    const codigoSanitizado = codigo.replace(/\D/g, "");

    // Consulta optimizada con LIMIT
    const result = await pool.query(
      `SELECT u.idusuario, u.nombre, u.apellido, u.correo, u.codigo, 
              r.nombre as rol, r.acceso_total
       FROM usuarios u
       LEFT JOIN roles r ON u.roles_idroles = r.idroles
       LIMIT $1`,
      [MAX_LOGIN_ATTEMPTS]
    );

    if ((result.rowCount ?? 0) === 0) {
      return res.status(401).json({ 
        error: "Credenciales inválidas" 
      });
    }

    // Búsqueda del usuario
    let usuario = null;
    for (const u of result.rows) {
      const isMatch = await bcrypt.compare(codigoSanitizado, u.codigo);
      if (isMatch) {
        usuario = u;
        break;
      }
    }

    if (!usuario) {
      // Delay para prevenir timing attacks
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return res.status(401).json({ 
        error: "Credenciales inválidas" 
      });
    }

    // Validar JWT_SECRET
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("❌ JWT_SECRET no configurado");
      return res.status(500).json({ 
        error: "Error de configuración del servidor" 
      });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: usuario.idusuario,
        correo: usuario.correo,
        rol: usuario.rol,
        acceso_total: usuario.acceso_total,
      },
      jwtSecret,
      { 
        expiresIn: JWT_EXPIRATION,
        algorithm: "HS256"
      }
    );

    // Cookie segura
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    res.json({
      usuario: {
        id: usuario.idusuario,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        rol: usuario.rol,
        acceso_total: usuario.acceso_total,
      },
    });

    console.log("✅ Login exitoso:", { id: usuario.idusuario, rol: usuario.rol });
  } catch (error: any) {
    console.error("❌ LOGIN ERROR:", error.message);
    res.status(500).json({ 
      error: "Error al procesar la solicitud" 
    });
  }
};

// ==========================
// LOGOUT (MEJORADO)
// ==========================
export const logout = (req: Request, res: Response) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    res.json({ message: "Sesión cerrada exitosamente" });
    console.log("✅ Logout exitoso");
  } catch (error: any) {
    console.error("❌ LOGOUT ERROR:", error.message);
    res.status(500).json({ 
      error: "Error al cerrar sesión" 
    });
  }
};

// ==========================
// VERIFICAR TOKEN (NUEVO)
// ==========================
export const verifyToken = (req: Request, res: Response) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ 
        error: "No autenticado",
        isAuthenticated: false 
      });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ 
        error: "Error de configuración del servidor" 
      });
    }

    const decoded = jwt.verify(token, jwtSecret) as any;

    res.json({
      isAuthenticated: true,
      usuario: {
        id: decoded.id,
        correo: decoded.correo,
        rol: decoded.rol,
        acceso_total: decoded.acceso_total,
      },
    });
  } catch (error: any) {
    console.error("❌ TOKEN VERIFICATION ERROR:", error.message);
    res.status(401).json({ 
      error: "Token inválido o expirado",
      isAuthenticated: false 
    });
  }
};