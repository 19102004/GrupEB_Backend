import { Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import {
  createCliente,
  getClientes,
  getClienteById,
  updateCliente,
  deleteCliente,
} from "../../controllers/clientes/clientes.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  validateId,
  preventSQLInjection,
  validateCreateCliente,
  validateUpdateCliente,
} from "../../middlewares/validation.middleware";

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
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 50, // 50 clientes por hora
  message: {
    error: "Demasiados clientes creados. Intenta más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

const updateDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 operaciones por 15 minutos
  message: {
    error: "Demasiadas operaciones. Intenta más tarde.",
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

// Crear cliente - Con validación completa
router.post(
  "/",
  authMiddleware,
  createLimiter,
  preventSQLInjection,
  validateCreateCliente,
  createCliente
);

// Obtener todos los clientes
router.get("/", authMiddleware, getClientes);

// Obtener cliente por ID
router.get("/:id", authMiddleware, validateId, getClienteById);

// Actualizar cliente - Con validación completa
router.put(
  "/:id",
  authMiddleware,
  updateDeleteLimiter,
  preventSQLInjection,
  validateId,
  validateUpdateCliente,
  updateCliente
);

// Eliminar cliente
router.delete("/:id", authMiddleware, updateDeleteLimiter, validateId, deleteCliente);

export default router;