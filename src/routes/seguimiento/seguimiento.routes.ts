import { Router } from "express";
import { getSeguimiento } from "../../controllers/seguimiento/seguimiento.controller";
import { getOrdenProduccion } from "../../controllers/seguimiento/getOrdenProduccion.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

// GET /api/seguimiento
router.get("/", authMiddleware, getSeguimiento);

// GET /api/seguimiento/:noPedido/orden-produccion
router.get("/:noPedido/orden-produccion", authMiddleware, getOrdenProduccion);

export default router;