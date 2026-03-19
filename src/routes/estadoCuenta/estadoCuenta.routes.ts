import { Router } from "express";
import { getEstadoCuenta, getListaEstadoCuenta } from "../../controllers/estadoCuenta/estadoCuentaController";

const router = Router();

router.get("/",           getListaEstadoCuenta);
router.get("/:noPedido",  getEstadoCuenta);

export default router;