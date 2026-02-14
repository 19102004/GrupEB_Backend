import { Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { 
  getCatalogosPlastico,
  searchProductosPlastico,
  verificarProductoExiste,
  getCalibres
} from "../../controllers/productos/catalogos-productos.controller";
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

// Obtener catálogos de productos plástico
router.get("/plastico", authMiddleware, getCatalogosPlastico);

// Buscar productos plástico (con filtros o últimos 50)
router.get("/plastico/search", authMiddleware, searchProductosPlastico);

router.get("/plastico/calibres", authMiddleware, getCalibres);

// Verificar si un producto ya existe
router.post("/plastico/verificar", authMiddleware, verificarProductoExiste);

export default router;