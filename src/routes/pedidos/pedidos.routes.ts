import { Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { getPedidos, eliminarPedido } from "../../controllers/pedidos/pedidos.controller";
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

// GET  /api/pedidos
router.get("/", authMiddleware, getPedidos);

// DELETE /api/pedidos/:id   (id = no_pedido)
router.delete("/:id", authMiddleware, eliminarPedido);

export default router;