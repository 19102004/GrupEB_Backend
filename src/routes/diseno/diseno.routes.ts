import { Router } from "express";
import {
  getDisenoByPedido,
  actualizarEstadoProducto,
  verificarCondicionesProduccion,
} from "../../controllers/diseno/diseno.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

// Obtener diseño completo de un pedido (cabecera + productos)
router.get("/pedido/:noPedido",            authMiddleware, getDisenoByPedido);

// La diseñadora aprueba o rechaza un producto específico
router.patch("/producto/:id/estado",       authMiddleware, actualizarEstadoProducto);

// Verificar si el pedido cumple condiciones para pasar a producción
router.get("/pedido/:noPedido/produccion", authMiddleware, verificarCondicionesProduccion);

export default router;