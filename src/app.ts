import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { setupSecurity, corsOptions } from "./config/security.config";

// Rutas
import authRoutes from "./routes/auth/auth.routes";
import rolesRoutes from "./routes/roles/roles.routes";
import privilegiosRoutes from "./routes/privilegios/privilegios.routes";
import usuariosRoutes from "./routes/usuarios/usuarios.routes";
import catalogosRoutes from "./routes/catalogos_fiscales/catalogos.routes";
import clientesRoutes from "./routes/clientes/clientes.routes";
import tarifasRoutes from "./routes/tarifas/tarifas.routes";
import catalogosProductosRoutes from "./routes/productos/catalogos-productos.routes";
import productosPlasticoRoutes from "./routes/productos/productos-plastico.routes";
import catalogosProduccionRoutes from "./routes/catalogos_produccion/catalogos-produccion.routes"; // ✅ NUEVO
import cotizacionesRoutes from "./routes/cotizaciones/cotizaciones.routes"; // ✅ NUEVO
import calcularPrecioRoutes from "./routes/cotizaciones/calcular-precio.routes"; // ✅ NUEVO
import suajesRoutes from "./routes/suajes/suajes.routes";

const app = express();

// ==========================
// CONFIGURACIÓN DE SEGURIDAD
// ==========================
setupSecurity(app);

// ==========================
// MIDDLEWARES
// ==========================
app.use(cors(corsOptions));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(cookieParser());

// ==========================
// RUTAS
// ==========================
app.use("/api/auth", authRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/privilegios", privilegiosRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/catalogos", catalogosRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/tarifas", tarifasRoutes);
app.use("/api/catalogos-productos", catalogosProductosRoutes);
app.use("/api/productos-plastico", productosPlasticoRoutes);
app.use("/api/catalogos-produccion", catalogosProduccionRoutes); // ✅ NUEVO
app.use("/api/cotizaciones", cotizacionesRoutes); // ✅ NUEVO
app.use("/api", calcularPrecioRoutes); // ✅ NUEVO
app.use("/api", suajesRoutes); // ✅ NUEVO

// ==========================
// HEALTH CHECK
// ==========================
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==========================
// 404 - RUTA NO ENCONTRADA (debe ir al final)
// ==========================
app.use((req, res, next) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ==========================
// MANEJO DE ERRORES GLOBAL
// ==========================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("❌ Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

export default app;