import { Request, Response } from "express";
import { pool } from "../../config/db";

const ESTADO = {
  PENDIENTE:       1,
  EN_PROCESO:      2,
  APROBADO:        3,
  RECHAZADO:       4,
  ANTICIPO_PAGADO: 5, // "Enviado" en el catálogo — lo reutilizamos
  PAGADO:          6,
} as const;

// ============================================================
// OBTENER TODAS LAS VENTAS
// Incluye info del pedido, cliente y resumen de pagos
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
      JOIN solicitud s
          ON s.idsolicitud = v.solicitud_idsolicitud
      JOIN clientes cli
          ON cli.idclientes = s.clientes_idclientes
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
    const { id } = req.params; // idventas

    // Datos de la venta
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
      JOIN solicitud s
          ON s.idsolicitud = v.solicitud_idsolicitud
      JOIN clientes cli
          ON cli.idclientes = s.clientes_idclientes
      JOIN estado_administrativo_cat est
          ON est.idestado_administrativo_cat = v.estado_administrativo_cat_idestado_administrativo_cat

      WHERE v.idventas = $1
    `, [id]);

    if (ventaRows.length === 0)
      return res.status(404).json({ error: "Venta no encontrada" });

    // Historial de pagos
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

    return res.json({
      ...ventaRows[0],
      pagos,
    });

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
      JOIN solicitud s
          ON s.idsolicitud = v.solicitud_idsolicitud
      JOIN clientes cli
          ON cli.idclientes = s.clientes_idclientes
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

    return res.json({
      ...ventaRows[0],
      pagos,
    });

  } catch (error: any) {
    console.error("❌ GET VENTA BY PEDIDO ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener venta" });
  }
};

// ============================================================
// REGISTRAR PAGO / ABONO
// Actualiza abono acumulado, saldo y estado automáticamente
// ============================================================
export const registrarPago = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params; // idventas
    const { metodoPagoId, monto, esAnticipo = false, observacion = null } = req.body;

    if (!metodoPagoId) return res.status(400).json({ error: "Se requiere metodoPagoId" });
    if (!monto || Number(monto) <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0" });

    await client.query("BEGIN");

    // Obtener venta actual
    const { rows: ventaRows } = await client.query(
      `SELECT idventas, total, anticipo, saldo, abono
       FROM ventas WHERE idventas = $1`,
      [id]
    );

    if (ventaRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    const venta       = ventaRows[0];
    const montoNum    = Number(monto);
    const nuevoAbono  = Number((Number(venta.abono) + montoNum).toFixed(2));
    const nuevoSaldo  = Number((Number(venta.total) - nuevoAbono).toFixed(2));

    // Determinar nuevo estado
    let nuevoEstado: number = ESTADO.PENDIENTE;
    if (nuevoSaldo <= 0) {
      nuevoEstado = ESTADO.PAGADO;
    } else if (nuevoAbono >= Number(venta.anticipo)) {
      nuevoEstado = ESTADO.ANTICIPO_PAGADO; // "Enviado" en el catálogo
    }

    // 1️⃣ Insertar pago en historial
    await client.query(
      `INSERT INTO venta_pago (
        ventas_idventas, metodo_pago_idmetodo_pago,
        monto, es_anticipo, observacion, fecha
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, metodoPagoId, montoNum, esAnticipo, observacion]
    );

    // 2️⃣ Actualizar acumulados en ventas
    await client.query(
      `UPDATE ventas
       SET abono  = $1,
           saldo  = $2,
           estado_administrativo_cat_idestado_administrativo_cat = $3
       WHERE idventas = $4`,
      [nuevoAbono, nuevoSaldo, nuevoEstado, id]
    );

    await client.query("COMMIT");

    return res.json({
      message:      "Pago registrado exitosamente",
      abono_total:  nuevoAbono,
      saldo:        nuevoSaldo,
      estado_id:    nuevoEstado,
      pagado:       nuevoSaldo <= 0,
      anticipo_cubierto: nuevoAbono >= Number(venta.anticipo),
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
// ELIMINAR PAGO (solo el último si es necesario corregir)
// Recalcula abono y saldo automáticamente
// ============================================================
export const eliminarPago = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params; // idventa_pago

    await client.query("BEGIN");

    // Obtener el pago
    const { rows: pagoRows } = await client.query(
      `SELECT idventa_pago, ventas_idventas, monto FROM venta_pago WHERE idventa_pago = $1`,
      [id]
    );

    if (pagoRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    const pago    = pagoRows[0];
    const ventaId = pago.ventas_idventas;

    // Eliminar el pago
    await client.query(`DELETE FROM venta_pago WHERE idventa_pago = $1`, [id]);

    // Recalcular abono total desde el historial
    const { rows: sumaRows } = await client.query(
      `SELECT COALESCE(SUM(monto), 0) AS total_abonado
       FROM venta_pago WHERE ventas_idventas = $1`,
      [ventaId]
    );

    const nuevoAbono = Number(sumaRows[0].total_abonado);

    // Obtener total y anticipo de la venta
    const { rows: ventaRows } = await client.query(
      `SELECT total, anticipo FROM ventas WHERE idventas = $1`,
      [ventaId]
    );

    const total    = Number(ventaRows[0].total);
    const anticipo = Number(ventaRows[0].anticipo);
    const nuevoSaldo = Number((total - nuevoAbono).toFixed(2));

    let nuevoEstado: number = ESTADO.PENDIENTE;
    if (nuevoSaldo <= 0) {
      nuevoEstado = ESTADO.PAGADO;
    } else if (nuevoAbono >= anticipo) {
      nuevoEstado = ESTADO.ANTICIPO_PAGADO;
    }

    await client.query(
      `UPDATE ventas
       SET abono = $1, saldo = $2,
           estado_administrativo_cat_idestado_administrativo_cat = $3
       WHERE idventas = $4`,
      [nuevoAbono, nuevoSaldo, nuevoEstado, ventaId]
    );

    await client.query("COMMIT");

    return res.json({
      message:     "Pago eliminado y saldo recalculado",
      abono_total: nuevoAbono,
      saldo:       nuevoSaldo,
      estado_id:   nuevoEstado,
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
// OBTENER MÉTODOS DE PAGO (catálogo)
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