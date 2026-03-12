import { Request, Response } from "express";
import { pool } from "../../config/db";

const ESTADO = {
  PENDIENTE:       1,
  EN_PROCESO:      2,
  APROBADO:        3,
  RECHAZADO:       4,
  ANTICIPO_PAGADO: 2,
  PAGADO:          6,
} as const;

// ── Helper: generar folio de orden de producción ─────────────
async function generarNoProduccion(client: any): Promise<string> {
  const anio = new Date().getFullYear().toString().slice(-2);
  const { rows } = await client.query(
    `SELECT COUNT(*) AS total FROM orden_produccion 
     WHERE no_produccion::text LIKE $1`,
    [`OP${anio}%`]
  );
  const siguiente = Number(rows[0].total) + 1;
  return `OP${anio}${String(siguiente).padStart(3, "0")}`;
}

// ── Helper: generar órdenes pendientes al cubrir anticipo ────
async function generarOrdenesPendientes(
  client:      any,
  solicitudId: number
): Promise<string[]> {
  // Buscar productos con diseño aprobado que NO tienen orden aún
  const { rows: pendientes } = await client.query(`
    SELECT dp.solicitud_producto_idsolicitud_producto AS idsolicitud_producto
    FROM diseno d
    JOIN diseno_producto dp
        ON dp.diseno_iddiseno = d.iddiseno
    WHERE d.solicitud_idsolicitud = $1
      AND dp.estado_administrativo_cat_idestado_administrativo_cat = $2
      AND NOT EXISTS (
        SELECT 1 FROM orden_produccion op
        WHERE op.idsolicitud_producto = dp.solicitud_producto_idsolicitud_producto
      )
  `, [solicitudId, ESTADO.APROBADO]);

  const ordenesCreadas: string[] = [];

  for (const prod of pendientes) {
    const noProduccion = await generarNoProduccion(client);

    await client.query(
      `INSERT INTO orden_produccion (
        estado_administrativo_cat_idestado_administrativo_cat,
        no_produccion,
        fecha,
        idsolicitud,
        idsolicitud_producto,
        idestado_produccion_cat
      ) VALUES ($1, $2, NOW(), $3, $4, $5)`,
      [ESTADO.PENDIENTE, noProduccion, solicitudId, prod.idsolicitud_producto, ESTADO.PENDIENTE]
    );

    ordenesCreadas.push(noProduccion);
    console.log(`✅ Orden ${noProduccion} creada automáticamente al cubrir anticipo`);
  }

  return ordenesCreadas;
}

// ============================================================
// OBTENER TODAS LAS VENTAS
// ============================================================
export const getVentas = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        v.idventas,
        v.solicitud_idsolicitud,
        v.subtotal,
        v.iva,
        v.total,
        v.anticipo,
        v.saldo,
        v.abono,
        v.fecha_creacion,
        v.fecha_liquidacion,
        v.estado_administrativo_cat_idestado_administrativo_cat AS estado_id,
        est.nombre    AS estado_nombre,
        s.no_pedido,
        s.no_cotizacion,
        s.fecha       AS fecha_pedido,
        cli.razon_social AS cliente,
        cli.empresa,
        cli.telefono,
        cli.correo
      FROM ventas v
      JOIN solicitud s   ON s.idsolicitud = v.solicitud_idsolicitud
      JOIN clientes cli  ON cli.idclientes = s.clientes_idclientes
      JOIN estado_administrativo_cat est
          ON est.idestado_administrativo_cat = v.estado_administrativo_cat_idestado_administrativo_cat
      ORDER BY v.idventas DESC
    `);
    return res.json(rows);
  } catch (error: any) {
    console.error("❌ GET VENTAS ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener ventas" });
  }
};

// ============================================================
// OBTENER UNA VENTA POR ID (con detalle de pagos)
// ============================================================
export const getVentaById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: ventaRows } = await pool.query(`
      SELECT
        v.idventas,
        v.solicitud_idsolicitud,
        v.subtotal,
        v.iva,
        v.total,
        v.anticipo,
        v.saldo,
        v.abono,
        v.fecha_creacion,
        v.fecha_liquidacion,
        v.estado_administrativo_cat_idestado_administrativo_cat AS estado_id,
        est.nombre    AS estado_nombre,
        s.no_pedido,
        s.no_cotizacion,
        s.fecha       AS fecha_pedido,
        cli.razon_social AS cliente,
        cli.empresa,
        cli.telefono,
        cli.correo
      FROM ventas v
      JOIN solicitud s   ON s.idsolicitud = v.solicitud_idsolicitud
      JOIN clientes cli  ON cli.idclientes = s.clientes_idclientes
      JOIN estado_administrativo_cat est
          ON est.idestado_administrativo_cat = v.estado_administrativo_cat_idestado_administrativo_cat
      WHERE v.idventas = $1
    `, [id]);

    if (ventaRows.length === 0)
      return res.status(404).json({ error: "Venta no encontrada" });

    const { rows: pagos } = await pool.query(`
      SELECT
        vp.idventa_pago,
        vp.monto,
        vp.es_anticipo,
        vp.observacion,
        vp.fecha,
        mp.tipo_pago AS metodo_pago,
        mp.idmetodo_pago
      FROM venta_pago vp
      JOIN metodo_pago mp ON mp.idmetodo_pago = vp.metodo_pago_idmetodo_pago
      WHERE vp.ventas_idventas = $1
      ORDER BY vp.fecha ASC
    `, [id]);

    return res.json({ ...ventaRows[0], pagos });
  } catch (error: any) {
    console.error("❌ GET VENTA BY ID ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener venta" });
  }
};

// ============================================================
// OBTENER VENTA POR no_pedido
// ============================================================
export const getVentaByPedido = async (req: Request, res: Response) => {
  try {
    const { noPedido } = req.params;

    const { rows: ventaRows } = await pool.query(`
      SELECT
        v.idventas,
        v.solicitud_idsolicitud,
        v.subtotal,
        v.iva,
        v.total,
        v.anticipo,
        v.saldo,
        v.abono,
        v.fecha_creacion,
        v.fecha_liquidacion,
        v.estado_administrativo_cat_idestado_administrativo_cat AS estado_id,
        est.nombre    AS estado_nombre,
        s.no_pedido,
        s.no_cotizacion,
        s.fecha       AS fecha_pedido,
        cli.razon_social AS cliente,
        cli.empresa,
        cli.telefono,
        cli.correo
      FROM ventas v
      JOIN solicitud s   ON s.idsolicitud = v.solicitud_idsolicitud
      JOIN clientes cli  ON cli.idclientes = s.clientes_idclientes
      JOIN estado_administrativo_cat est
          ON est.idestado_administrativo_cat = v.estado_administrativo_cat_idestado_administrativo_cat
      WHERE s.no_pedido = $1
    `, [noPedido]);

    if (ventaRows.length === 0)
      return res.status(404).json({ error: "Venta no encontrada para este pedido" });

    const { rows: pagos } = await pool.query(`
      SELECT
        vp.idventa_pago,
        vp.monto,
        vp.es_anticipo,
        vp.observacion,
        vp.fecha,
        mp.tipo_pago AS metodo_pago,
        mp.idmetodo_pago
      FROM venta_pago vp
      JOIN metodo_pago mp ON mp.idmetodo_pago = vp.metodo_pago_idmetodo_pago
      WHERE vp.ventas_idventas = $1
      ORDER BY vp.fecha ASC
    `, [ventaRows[0].idventas]);

    return res.json({ ...ventaRows[0], pagos });
  } catch (error: any) {
    console.error("❌ GET VENTA BY PEDIDO ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener venta" });
  }
};

// ============================================================
// REGISTRAR PAGO / ABONO
// ============================================================
export const registrarPago = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { metodoPagoId, monto, observacion = null } = req.body;

    if (!metodoPagoId) return res.status(400).json({ error: "Se requiere metodoPagoId" });
    if (!monto || Number(monto) <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0" });

    await client.query("BEGIN");

    const { rows: ventaRows } = await client.query(
      `SELECT v.idventas, v.total, v.anticipo, v.saldo, v.abono, v.solicitud_idsolicitud
       FROM ventas v WHERE v.idventas = $1`,
      [id]
    );

    if (ventaRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    const venta       = ventaRows[0];
    const solicitudId = venta.solicitud_idsolicitud;
    const montoNum    = Number(monto);
    const abonoAntes  = Number(venta.abono);
    const nuevoAbono  = Number((abonoAntes + montoNum).toFixed(2));
    const nuevoSaldo  = Number((Number(venta.total) - nuevoAbono).toFixed(2));
    const anticipo    = Number(venta.anticipo);

    const anticipoAntesNoCubierto = abonoAntes < anticipo;
    const anticipoAhoraCubierto   = nuevoAbono >= anticipo;
    const esAnticipoReal          = anticipoAntesNoCubierto && anticipoAhoraCubierto;
    const esLiquidacion           = nuevoSaldo <= 0;

    let nuevoEstado: number = ESTADO.PENDIENTE;
    if (nuevoSaldo <= 0)          nuevoEstado = ESTADO.PAGADO;
    else if (nuevoAbono >= anticipo) nuevoEstado = ESTADO.ANTICIPO_PAGADO;

    // 1️⃣ Insertar pago
    await client.query(
      `INSERT INTO venta_pago (
        ventas_idventas, metodo_pago_idmetodo_pago,
        monto, es_anticipo, observacion, fecha
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, metodoPagoId, montoNum, esAnticipoReal, observacion]
    );

    // 2️⃣ Actualizar ventas
    await client.query(
      `UPDATE ventas
       SET abono  = $1,
           saldo  = $2,
           estado_administrativo_cat_idestado_administrativo_cat = $3
           ${esLiquidacion ? ", fecha_liquidacion = NOW()" : ""}
       WHERE idventas = $4`,
      [nuevoAbono, nuevoSaldo, nuevoEstado, id]
    );

    // ✅ FIX: si este pago cubre el anticipo, generar órdenes para
    // productos con diseño aprobado que aún no tienen orden
    let ordenesGeneradas: string[] = [];
    if (anticipoAhoraCubierto) {
      ordenesGeneradas = await generarOrdenesPendientes(client, solicitudId);
    }

    await client.query("COMMIT");

    return res.json({
      message:            "Pago registrado exitosamente",
      abono_total:        nuevoAbono,
      saldo:              nuevoSaldo,
      estado_id:          nuevoEstado,
      pagado:             nuevoSaldo <= 0,
      anticipo_cubierto:  anticipoAhoraCubierto,
      es_anticipo:        esAnticipoReal,
      liquidado:          esLiquidacion,
      ordenes_generadas:  ordenesGeneradas, // ✅ nuevo — lista de folios creados
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ REGISTRAR PAGO ERROR:", error.message);
    return res.status(500).json({ error: "Error al registrar pago" });
  } finally {
    client.release();
  }
};

// ============================================================
// ELIMINAR PAGO
// ============================================================
export const eliminarPago = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const { rows: pagoRows } = await client.query(
      `SELECT idventa_pago, ventas_idventas, monto FROM venta_pago WHERE idventa_pago = $1`,
      [id]
    );

    if (pagoRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    const ventaId = pagoRows[0].ventas_idventas;

    await client.query(`DELETE FROM venta_pago WHERE idventa_pago = $1`, [id]);

    const { rows: sumaRows } = await client.query(
      `SELECT COALESCE(SUM(monto), 0) AS total_abonado FROM venta_pago WHERE ventas_idventas = $1`,
      [ventaId]
    );

    const nuevoAbono = Number(sumaRows[0].total_abonado);

    const { rows: ventaRows } = await client.query(
      `SELECT total, anticipo FROM ventas WHERE idventas = $1`,
      [ventaId]
    );

    const total      = Number(ventaRows[0].total);
    const anticipo   = Number(ventaRows[0].anticipo);
    const nuevoSaldo = Number((total - nuevoAbono).toFixed(2));

    let nuevoEstado: number = ESTADO.PENDIENTE;
    if (nuevoSaldo <= 0)             nuevoEstado = ESTADO.PAGADO;
    else if (nuevoAbono >= anticipo) nuevoEstado = ESTADO.ANTICIPO_PAGADO;

    const estaLiquidado = nuevoSaldo <= 0;

    await client.query(
      `UPDATE ventas
       SET abono = $1,
           saldo = $2,
           estado_administrativo_cat_idestado_administrativo_cat = $3,
           fecha_liquidacion = $4
       WHERE idventas = $5`,
      [nuevoAbono, nuevoSaldo, nuevoEstado, estaLiquidado ? new Date() : null, ventaId]
    );

    await client.query("COMMIT");

    return res.json({
      message:     "Pago eliminado y saldo recalculado",
      abono_total: nuevoAbono,
      saldo:       nuevoSaldo,
      estado_id:   nuevoEstado,
      liquidado:   estaLiquidado,
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ ELIMINAR PAGO ERROR:", error.message);
    return res.status(500).json({ error: "Error al eliminar pago" });
  } finally {
    client.release();
  }
};

// ============================================================
// OBTENER MÉTODOS DE PAGO
// ============================================================
export const getMetodosPago = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT idmetodo_pago, codigo, tipo_pago FROM metodo_pago ORDER BY idmetodo_pago`
    );
    return res.json(rows);
  } catch (error: any) {
    console.error("❌ GET MÉTODOS DE PAGO ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener métodos de pago" });
  }
};