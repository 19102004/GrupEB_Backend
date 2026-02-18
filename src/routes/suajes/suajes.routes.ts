// src/routes/suajes/suajes.routes.ts
import { Router } from "express";
import { getSuajes } from "../../controllers/suajes/suajesController";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

// GET /suajes
// Retorna todos los suajes/asas registrados en la BD para productos plásticos
router.get("/suajes", authMiddleware, getSuajes);

export default router;