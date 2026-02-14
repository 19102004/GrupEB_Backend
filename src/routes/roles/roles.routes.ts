import { Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { 
  getRoles,
  getPrivilegiosByRol 
} from "../../controllers/roles/roles.controller";
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
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: { 
    error: "Demasiadas solicitudes. Intenta más tarde." 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(generalLimiter);

// ==========================
// RUTAS
// ==========================
router.get("/", authMiddleware, getRoles);
router.get("/:id/privilegios", authMiddleware, getPrivilegiosByRol);

export default router;