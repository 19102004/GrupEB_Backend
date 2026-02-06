import { Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { 
  getRegimenesFiscales,
  getMetodosPago,
  getFormasPago
} from "../../controllers/catalogos/catalogos.controller";
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
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { 
    error: "Demasiadas solicitudes. Intenta más tarde." 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(generalLimiter);

// ==========================
// RUTAS DE CATÁLOGOS
// ==========================
router.get("/regimenes-fiscales", authMiddleware, getRegimenesFiscales);
router.get("/metodos-pago", authMiddleware, getMetodosPago);
router.get("/formas-pago", authMiddleware, getFormasPago);

export default router;