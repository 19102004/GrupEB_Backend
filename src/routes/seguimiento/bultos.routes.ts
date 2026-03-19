// routes/seguimiento/bultos.routes.ts
import { Router } from "express";
import {
  getBultos,
  agregarBulto,
  eliminarBulto,
  finalizarBultos,
} from "../../controllers/bultos/bultos.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router({ mergeParams: true });

router.get(    "/",           authMiddleware, getBultos);
router.post(   "/",           authMiddleware, agregarBulto);
router.delete( "/:idbulto",   authMiddleware, eliminarBulto);
router.patch(  "/finalizar",  authMiddleware, finalizarBultos);

export default router;