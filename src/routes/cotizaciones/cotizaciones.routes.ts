import { Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import {
  crearCotizacion,
  getCotizaciones,
  actualizarEstadoCotizacion,
  eliminarCotizacion,
  aprobarDetalle,
  actualizarObservacion,
} from "../../controllers/cotizaciones/cotizaciones.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.use(
  helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Demasiadas solicitudes. Intenta más tarde." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(limiter);

// ── Rutas específicas PRIMERO (evitar conflicto con /:id/estado) ──────────
// PATCH /api/cotizaciones/detalle/:id/aprobar
router.patch("/detalle/:id/aprobar", authMiddleware, aprobarDetalle);

// PATCH /api/cotizaciones/producto/:id/observacion
router.patch("/producto/:id/observacion", authMiddleware, actualizarObservacion);

// ── Rutas generales ───────────────────────────────────────────────────────
// GET    /api/cotizaciones
router.get("/", authMiddleware, getCotizaciones);

// POST   /api/cotizaciones
router.post("/", authMiddleware, crearCotizacion);

// PATCH  /api/cotizaciones/:id/estado
router.patch("/:id/estado", authMiddleware, actualizarEstadoCotizacion);

// DELETE /api/cotizaciones/:id
router.delete("/:id", authMiddleware, eliminarCotizacion);

export default router;