import { Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import {
  getCatalogosProduccion,
  getTarifasProduccion, // ✅ NUEVO
} from "../../controllers/catalogos_produccion/catalogos-produccion.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Demasiadas solicitudes. Intenta más tarde." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(generalLimiter);

// GET /api/catalogos-produccion
router.get("/", authMiddleware, getCatalogosProduccion);

// GET /api/catalogos-produccion/tarifas ✅ NUEVO
router.get("/tarifas", authMiddleware, getTarifasProduccion);

export default router;