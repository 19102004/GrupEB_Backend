import { Request, Response } from "express";
import { pool } from "../../config/db";

const ESTADO: Record<string, number> = {
  PENDIENTE:  1,
  EN_PROCESO: 2,
  APROBADO:   3,
  RECHAZADO:  4,
};

// ============================================================
// OBTENER DISEÑO POR no_pedido
// Incluye cabecera + estado por producto
// ============================================================
export const getDisenoByPedido = async (req: Request, res: Response) => {
  try {
    const { noPedido } = req.params;

    // Cabecera del diseño
    const { rows: disenoRows } = await pool.query(`
      SELECT
        d.iddiseno,
        d.solicitud_idsolicitud,
        d.estado_administrativo_cat_idestado_administrativo_cat AS estado_id,
        d.estado_diseno,
        d.fecha,
        est.nombre  AS estado_nombre,
        s.no_pedido,
        s.no_cotizacion
      FROM diseno d
      JOIN solicitud s
          ON s.idsolicitud = d.solicitud_idsolicitud
      JOIN estado_administrativo_cat est
          ON est.idestado_administrativo_cat = d.estado_administrativo_cat_idestado_administrativo_cat
      WHERE s.no_pedido = $1
    `, [noPedido]);

    if (disenoRows.length === 0)
      return res.status(404).json({ error: "Diseño no encontrado para este pedido" });

    const diseno   = disenoRows[0];
    const disenoId = diseno.iddiseno;

    // Productos con su estado de diseño individual
    const { rows: productos } = await pool.query(`
      SELECT
        dp.iddiseno_producto,
        dp.solicitud_producto_idsolicitud_producto,
        dp.observaciones,
        dp.fecha,
        dp.estado_administrativo_cat_idestado_administrativo_cat AS estado_id,
        est.nombre  AS estado_nombre,

        cfg.medida  AS cfg_medida,
        tpp.material_plastico_producto AS tipo_producto_nombre,
        mp.tipo_material               AS material_nombre

      FROM diseno_producto dp
      JOIN estado_administrativo_cat est
          ON est.idestado_administrativo_cat = dp.estado_administrativo_cat_idestado_administrativo_cat
      JOIN solicitud_producto sp
          ON sp.idsolicitud_producto = dp.solicitud_producto_idsolicitud_producto
      JOIN configuracion_plastico cfg
          ON cfg.idconfiguracion_plastico = sp.configuracion_plastico_idconfiguracion_plastico
      LEFT JOIN tipo_producto_plastico tpp
          ON tpp.idtipo_producto_plastico = cfg.tipo_producto_plastico_plastico_idtipo_producto_plastico
      LEFT JOIN material_plastico mp
          ON mp.idmaterial_plastico = cfg.material_plastico_plastico_idmaterial_plastico

      WHERE dp.diseno_iddiseno = $1
      ORDER BY dp.iddiseno_producto
    `, [disenoId]);

    // Construir nombre legible por producto
    const productosFormateados = productos.map((p: any) => ({
      iddiseno_producto:    p.iddiseno_producto,
      idsolicitud_producto: p.solicitud_producto_idsolicitud_producto,
      nombre:               [p.tipo_producto_nombre, p.cfg_medida, p.material_nombre]
                              .filter(Boolean).join(" ") ||
                            `Producto #${p.solicitud_producto_idsolicitud_producto}`,
      estado_id:            p.estado_id,
      estado:               p.estado_nombre,
      observaciones:        p.observaciones,
      fecha:                p.fecha,
    }));

    // ✅ Estado general: todos aprobados = aprobado, alguno rechazado = rechazado, si no pendiente
    const todosAprobados = productosFormateados.every((p: any) => p.estado_id === ESTADO.APROBADO);
    const algunoRechazado = productosFormateados.some((p: any) => p.estado_id === ESTADO.RECHAZADO);

    return res.json({
      ...diseno,
      productos:          productosFormateados,
      total_productos:    productosFormateados.length,
      aprobados:          productosFormateados.filter((p: any) => p.estado_id === ESTADO.APROBADO).length,
      rechazados:         productosFormateados.filter((p: any) => p.estado_id === ESTADO.RECHAZADO).length,
      pendientes:         productosFormateados.filter((p: any) => p.estado_id === ESTADO.PENDIENTE).length,
      diseno_completado:  todosAprobados,
      tiene_rechazados:   algunoRechazado,
    });

  } catch (error: any) {
    console.error("❌ GET DISEÑO BY PEDIDO ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener diseño" });
  }
};

// ============================================================
// ACTUALIZAR ESTADO DE UN PRODUCTO EN DISEÑO
// La diseñadora aprueba o rechaza (con observaciones) producto por producto
// ============================================================
export const actualizarEstadoProducto = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id }                        = req.params; // iddiseno_producto
    const { estadoId, observaciones }   = req.body;

    if (!estadoId) return res.status(400).json({ error: "Se requiere estadoId" });

    const estadoNum = Number(estadoId);
    if (![ESTADO.PENDIENTE, ESTADO.APROBADO, ESTADO.RECHAZADO].includes(estadoNum as any)) {
      return res.status(400).json({ error: "Estado inválido. Use: 1 (Pendiente), 3 (Aprobado), 4 (Rechazado)" });
    }

    await client.query("BEGIN");

    // Actualizar producto
    const { rowCount } = await client.query(
      `UPDATE diseno_producto
       SET estado_administrativo_cat_idestado_administrativo_cat = $1,
           observaciones = $2,
           fecha         = NOW()
       WHERE iddiseno_producto = $3`,
      [estadoId, observaciones || null, id]
    );

    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Producto de diseño no encontrado" });
    }

    // Obtener iddiseno para recalcular estado general
    const { rows: dpRows } = await client.query(
      `SELECT diseno_iddiseno FROM diseno_producto WHERE iddiseno_producto = $1`, [id]
    );
    const disenoId = dpRows[0].diseno_iddiseno;

    // Recalcular estado general de la cabecera
    const { rows: resumen } = await client.query(
      `SELECT
        COUNT(*) FILTER (WHERE estado_administrativo_cat_idestado_administrativo_cat = $1) AS aprobados,
        COUNT(*) FILTER (WHERE estado_administrativo_cat_idestado_administrativo_cat = $2) AS rechazados,
        COUNT(*) AS total
       FROM diseno_producto
       WHERE diseno_iddiseno = $3`,
      [ESTADO.APROBADO, ESTADO.RECHAZADO, disenoId]
    );

    const { aprobados, rechazados, total } = resumen[0];
    let nuevoEstadoCabecera = ESTADO.PENDIENTE;
    let nuevoEstadoTexto    = "Pendiente";

    if (Number(aprobados) === Number(total)) {
      nuevoEstadoCabecera = ESTADO.APROBADO;
      nuevoEstadoTexto    = "Aprobado";
    } else if (Number(rechazados) > 0) {
      nuevoEstadoCabecera = ESTADO.EN_PROCESO;
      nuevoEstadoTexto    = "En proceso";
    } else if (Number(aprobados) > 0) {
      nuevoEstadoCabecera = ESTADO.EN_PROCESO;
      nuevoEstadoTexto    = "En proceso";
    }

    // Actualizar cabecera
    await client.query(
      `UPDATE diseno
       SET estado_administrativo_cat_idestado_administrativo_cat = $1,
           estado_diseno = $2
       WHERE iddiseno = $3`,
      [nuevoEstadoCabecera, nuevoEstadoTexto, disenoId]
    );

    await client.query("COMMIT");

    return res.json({
      message:               "Estado de diseño actualizado",
      iddiseno_producto:     Number(id),
      estado_id:             estadoNum,
      estado_cabecera_id:    nuevoEstadoCabecera,
      estado_cabecera:       nuevoEstadoTexto,
      diseno_completado:     nuevoEstadoCabecera === ESTADO.APROBADO,
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ ACTUALIZAR ESTADO DISEÑO PRODUCTO ERROR:", error.message);
    return res.status(500).json({ error: "Error al actualizar estado de diseño" });
  } finally {
    client.release();
  }
};

// ============================================================
// VERIFICAR SI EL PEDIDO PUEDE PASAR A PRODUCCIÓN
// Condiciones: anticipo pagado + todos los diseños aprobados
// ============================================================
export const verificarCondicionesProduccion = async (req: Request, res: Response) => {
  try {
    const { noPedido } = req.params;

    // Estado de venta
    const { rows: ventaRows } = await pool.query(`
      SELECT
        v.idventas,
        v.anticipo,
        v.abono,
        v.saldo,
        v.estado_administrativo_cat_idestado_administrativo_cat AS estado_id,
        est.nombre AS estado_nombre
      FROM ventas v
      JOIN solicitud s ON s.idsolicitud = v.solicitud_idsolicitud
      JOIN estado_administrativo_cat est
          ON est.idestado_administrativo_cat = v.estado_administrativo_cat_idestado_administrativo_cat
      WHERE s.no_pedido = $1
    `, [noPedido]);

    // Estado de diseño
    const { rows: disenoRows } = await pool.query(`
      SELECT
        d.iddiseno,
        d.estado_administrativo_cat_idestado_administrativo_cat AS estado_id,
        d.estado_diseno,
        COUNT(dp.iddiseno_producto)                                              AS total_productos,
        COUNT(*) FILTER (WHERE dp.estado_administrativo_cat_idestado_administrativo_cat = $1) AS aprobados
      FROM diseno d
      JOIN solicitud s ON s.idsolicitud = d.solicitud_idsolicitud
      LEFT JOIN diseno_producto dp ON dp.diseno_iddiseno = d.iddiseno
      WHERE s.no_pedido = $2
      GROUP BY d.iddiseno, d.estado_administrativo_cat_idestado_administrativo_cat, d.estado_diseno
    `, [ESTADO.APROBADO, noPedido]);

    if (ventaRows.length === 0 || disenoRows.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado o sin venta/diseño registrado" });
    }

    const venta  = ventaRows[0];
    const diseno = disenoRows[0];

    const anticipo_cubierto   = Number(venta.abono) >= Number(venta.anticipo);
    const diseno_completado   = Number(diseno.aprobados) === Number(diseno.total_productos)
                                && Number(diseno.total_productos) > 0;
    const puede_produccion    = anticipo_cubierto && diseno_completado;

    return res.json({
      no_pedido:          Number(noPedido),
      puede_produccion,
      condiciones: {
        anticipo_cubierto,
        anticipo_requerido:  Number(venta.anticipo),
        anticipo_pagado:     Number(venta.abono),
        diseno_completado,
        productos_total:     Number(diseno.total_productos),
        productos_aprobados: Number(diseno.aprobados),
      },
    });

  } catch (error: any) {
    console.error("❌ VERIFICAR CONDICIONES PRODUCCIÓN ERROR:", error.message);
    return res.status(500).json({ error: "Error al verificar condiciones" });
  }
};