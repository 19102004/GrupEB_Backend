import { Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { getTarifas, updateTarifasBatch } from "../../controllers/tarifas/tarifas.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

// ==========================
// HELMET
// ==========================
router.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ==========================
// RATE LIMITING
// ==========================
const updateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // 50 actualizaciones por 15 minutos
  message: {
    error: "Demasiadas actualizaciones. Intenta más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // 200 solicitudes por 15 minutos
  message: {
    error: "Demasiadas solicitudes. Intenta más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(generalLimiter);

// ==========================
// RUTAS PROTEGIDAS
// ==========================

// Obtener todas las tarifas
router.get("/", authMiddleware, getTarifas);

// Actualizar múltiples tarifas
router.put("/batch", authMiddleware, updateLimiter, updateTarifasBatch);

export default router;