// ============================================================
// src/routes/rodillos/rodillos.routes.ts
// ============================================================
import { Router } from "express";
import { buscarRodillo } from "../../controllers/rodillos/rodillos.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

// GET /api/rodillos/buscar?valor=36
router.get("/buscar", authMiddleware, buscarRodillo);

export default router;