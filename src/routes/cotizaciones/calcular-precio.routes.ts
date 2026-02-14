// src/routes/calcular-precio.routes.ts
import { Router } from "express";
import {
  calcularPrecioPreview,
  calcularPreciosBatch,
} from "../../controllers/cotizaciones/calcular-precio.controller";

const router = Router();

router.post("/calcular-precio", calcularPrecioPreview);
router.post("/calcular-precios-batch", calcularPreciosBatch);

export default router;