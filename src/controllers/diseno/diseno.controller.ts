import { Request, Response } from "express";
import { pool } from "../../config/db";

const ESTADO = {
  PENDIENTE:  1,
  EN_PROCESO: 2,
  APROBADO:   3,
} as const;

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

async function anticipoPagado(client: any, solicitudId: number): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT anticipo, abono FROM ventas 
     WHERE solicitud_idsolicitud = $1`,
    [solicitudId]
  );
  if (rows.length === 0) return false;
  return Number(rows[0].abono) >= Number(rows[0].anticipo);
}

// ============================================================
// OBTENER DISEÑO POR no_pedido
// ============================================================
export const getDisenoByPedido = async (req: Request, res: Response) => {
  try {
    const { noPedido } = req.params;

    const { rows: solicitudRows } = await pool.query(
      `SELECT
        s.idsolicitud,
        s.no_pedido,
        s.no_cotizacion,
        d.iddiseno,
        d.fecha_aprobacion_general,
        COALESCE(v.anticipo, 0) AS anticipo,
        COALESCE(v.abono, 0)    AS abono
       FROM solicitud s
       JOIN diseno d ON d.solicitud_idsolicitud = s.idsolicitud
       LEFT JOIN ventas v ON v.solicitud_idsolicitud = s.idsolicitud
       WHERE s.no_pedido = $1`,
      [noPedido]
    );

    if (solicitudRows.length === 0)
      return res.status(404).json({ error: "Pedido no encontrado" });

    const solicitud        = solicitudRows[0];
    const solicitudId      = solicitud.idsolicitud;
    const disenoId         = solicitud.iddiseno;
    const anticupoCubierto = Number(solicitud.abono) >= Number(solicitud.anticipo);

    const { rows: productos } = await pool.query(`
      SELECT
        dp.iddiseno_producto,
        dp.diseno_iddiseno,
        dp.solicitud_producto_idsolicitud_producto AS idsolicitud_producto,
        dp.observaciones,
        dp.fecha,
        dp.fecha_aprobacion,
        dp.estado_administrativo_cat_idestado_administrativo_cat AS estado_id,
        est.nombre AS estado_nombre,

        cfg.medida  AS cfg_medida,
        tpp.material_plastico_producto AS tipo_producto_nombre,
        mp.tipo_material               AS material_nombre,

        sd.cantidad,
        sd.kilogramos,
        sd.modo_cantidad,
        sd.precio_total,

        op.no_produccion,
        op.idproduccion

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
      LEFT JOIN solicitud_detalle sd
          ON sd.solicitud_producto_id = sp.idsolicitud_producto
          AND sd.aprobado = true
      LEFT JOIN orden_produccion op
          ON op.idsolicitud_producto = dp.solicitud_producto_idsolicitud_producto
      WHERE dp.diseno_iddiseno = $1
      ORDER BY dp.iddiseno_producto
    `, [disenoId]);

    const productosFormateados = productos.map((p: any) => ({
      iddiseno_producto:    p.iddiseno_producto,
      diseno_iddiseno:      p.diseno_iddiseno,
      idsolicitud_producto: p.idsolicitud_producto,
      nombre: [p.tipo_producto_nombre, p.cfg_medida, p.material_nombre]
                .filter(Boolean).join(" ") ||
              `Producto #${p.idsolicitud_producto}`,
      estado_id:        p.estado_id,
      estado:           p.estado_nombre,
      observaciones:    p.observaciones,
      fecha:            p.fecha,
      fecha_aprobacion: p.fecha_aprobacion ?? null,
      cantidad:         p.cantidad    ? Number(p.cantidad)    : null,
      kilogramos:       p.kilogramos  ? Number(p.kilogramos)  : null,
      modo_cantidad:    p.modo_cantidad || "unidad",
      precio_total:     p.precio_total ? Number(p.precio_total) : null,
      no_produccion:    p.no_produccion ?? null,
      idproduccion:     p.idproduccion  ?? null,
      orden_generada:   !!p.no_produccion,
    }));

    const total     = productosFormateados.length;
    const aprobados = productosFormateados.filter((p: any) => p.estado_id === ESTADO.APROBADO).length;
    const enProceso = productosFormateados.filter((p: any) => p.estado_id === ESTADO.EN_PROCESO).length;
    const conOrden  = productosFormateados.filter((p: any) => p.orden_generada).length;

    const estadoGlobal =
      aprobados === total && total > 0 ? ESTADO.APROBADO  :
      aprobados > 0 || enProceso > 0  ? ESTADO.EN_PROCESO :
                                         ESTADO.PENDIENTE;

    return res.json({
      no_pedido:                Number(noPedido),
      no_cotizacion:            solicitud.no_cotizacion ?? null,
      solicitud_id:             solicitudId,
      diseno_id:                disenoId,
      fecha_aprobacion_general: solicitud.fecha_aprobacion_general ?? null,
      anticipo_cubierto:        anticupoCubierto,
      anticipo:                 Number(solicitud.anticipo),
      abono:                    Number(solicitud.abono),
      estado_id:                estadoGlobal,
      total_productos:          total,
      aprobados,
      pendientes:               total - aprobados - enProceso,
      en_proceso:               enProceso,
      con_orden:                conOrden,
      diseno_completado:        estadoGlobal === ESTADO.APROBADO,
      productos:                productosFormateados,
    });

  } catch (error: any) {
    console.error("❌ GET DISEÑO BY PEDIDO ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener diseño" });
  }
};

// ============================================================
// ACTUALIZAR ESTADO DE UN PRODUCTO EN DISEÑO
// ============================================================
export const actualizarEstadoProducto = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id }                      = req.params;
    const { estadoId, observaciones } = req.body;

    if (!estadoId) return res.status(400).json({ error: "Se requiere estadoId" });

    const estadoNum = Number(estadoId);
    if (![ESTADO.PENDIENTE, ESTADO.EN_PROCESO, ESTADO.APROBADO].includes(estadoNum as any))
      return res.status(400).json({ error: "Estado inválido. Use: 1, 2 o 3" });

    await client.query("BEGIN");

    // ✅ FIX: separar en 2 queries para evitar el error de tipo inconsistente en $1
    const { rowCount } = await client.query(
      `UPDATE diseno_producto
       SET estado_administrativo_cat_idestado_administrativo_cat = $1,
           observaciones = $2,
           fecha         = NOW()
       WHERE iddiseno_producto = $3`,
      [estadoNum, observaciones || null, id]
    );

    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Producto de diseño no encontrado" });
    }

    // ✅ FIX: fecha_aprobacion en query separado
    if (estadoNum === ESTADO.APROBADO) {
      await client.query(
        `UPDATE diseno_producto SET fecha_aprobacion = NOW() WHERE iddiseno_producto = $1`,
        [id]
      );
    } else {
      await client.query(
        `UPDATE diseno_producto SET fecha_aprobacion = NULL WHERE iddiseno_producto = $1`,
        [id]
      );
    }

    // Obtener diseno padre y solicitud
    const { rows: dpRows } = await client.query(
      `SELECT dp.diseno_iddiseno,
              dp.solicitud_producto_idsolicitud_producto AS idsolicitud_producto,
              d.solicitud_idsolicitud
       FROM diseno_producto dp
       JOIN diseno d ON d.iddiseno = dp.diseno_iddiseno
       WHERE dp.iddiseno_producto = $1`,
      [id]
    );

    const disenoId            = dpRows[0].diseno_iddiseno;
    const idsolicitudProducto = dpRows[0].idsolicitud_producto;
    const solicitudId         = dpRows[0].solicitud_idsolicitud;

    // Recalcular estado del diseno padre según TODOS sus productos
    const { rows: todosProductos } = await client.query(
      `SELECT estado_administrativo_cat_idestado_administrativo_cat AS estado_id
       FROM diseno_producto
       WHERE diseno_iddiseno = $1`,
      [disenoId]
    );

    const estadosPadre = todosProductos.map((p: any) => Number(p.estado_id));
    const nuevoEstadoPadre =
      estadosPadre.every(e => e === ESTADO.APROBADO)                             ? ESTADO.APROBADO   :
      estadosPadre.some(e  => e === ESTADO.EN_PROCESO || e === ESTADO.APROBADO)  ? ESTADO.EN_PROCESO :
                                                                                    ESTADO.PENDIENTE;

    // ✅ FIX: separar en 2 queries para evitar el mismo error en diseno
    await client.query(
      `UPDATE diseno
       SET estado_administrativo_cat_idestado_administrativo_cat = $1
       WHERE iddiseno = $2`,
      [nuevoEstadoPadre, disenoId]
    );

    if (nuevoEstadoPadre === ESTADO.APROBADO) {
      await client.query(
        `UPDATE diseno SET fecha_aprobacion_general = NOW() WHERE iddiseno = $1`,
        [disenoId]
      );
    } else {
      await client.query(
        `UPDATE diseno SET fecha_aprobacion_general = NULL WHERE iddiseno = $1`,
        [disenoId]
      );
    }

    // Generar orden de producción si se aprueba y anticipo cubierto
    let ordenGenerada = false;
    let noProduccion: string | null = null;

    if (estadoNum === ESTADO.APROBADO) {
      const cubierto = await anticipoPagado(client, solicitudId);

      if (cubierto) {
        const { rows: ordenExistente } = await client.query(
          `SELECT idproduccion FROM orden_produccion 
           WHERE idsolicitud_producto = $1`,
          [idsolicitudProducto]
        );

        if (ordenExistente.length === 0) {
          noProduccion = await generarNoProduccion(client);

          await client.query(
            `INSERT INTO orden_produccion (
              estado_administrativo_cat_idestado_administrativo_cat,
              no_produccion,
              fecha,
              idsolicitud,
              idsolicitud_producto,
              idestado_produccion_cat
            ) VALUES ($1, $2, NOW(), $3, $4, $5)`,
            [ESTADO.PENDIENTE, noProduccion, solicitudId, idsolicitudProducto, ESTADO.PENDIENTE]
          );

          ordenGenerada = true;
          console.log(`✅ Orden ${noProduccion} creada para producto ${idsolicitudProducto}`);
        } else {
          ordenGenerada = true;
        }
      }
    }

    await client.query("COMMIT");

    return res.json({
      message:            "Estado de diseño actualizado",
      iddiseno_producto:  Number(id),
      estado_id:          estadoNum,
      estado_cabecera_id: nuevoEstadoPadre,
      diseno_completado:  nuevoEstadoPadre === ESTADO.APROBADO,
      orden_generada:     ordenGenerada,
      no_produccion:      noProduccion,
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
// VERIFICAR CONDICIONES PARA PRODUCCIÓN
// ============================================================
export const verificarCondicionesProduccion = async (req: Request, res: Response) => {
  try {
    const { noPedido } = req.params;

    const { rows: ventaRows } = await pool.query(`
      SELECT v.anticipo, v.abono
      FROM ventas v
      JOIN solicitud s ON s.idsolicitud = v.solicitud_idsolicitud
      WHERE s.no_pedido = $1
    `, [noPedido]);

    const { rows: disenoRows } = await pool.query(`
      SELECT
        COUNT(dp.iddiseno_producto) AS total_productos,
        COUNT(*) FILTER (
          WHERE dp.estado_administrativo_cat_idestado_administrativo_cat = $1
        ) AS aprobados
      FROM diseno d
      JOIN solicitud s ON s.idsolicitud = d.solicitud_idsolicitud
      LEFT JOIN diseno_producto dp ON dp.diseno_iddiseno = d.iddiseno
      WHERE s.no_pedido = $2
    `, [ESTADO.APROBADO, noPedido]);

    if (ventaRows.length === 0 || disenoRows.length === 0)
      return res.status(404).json({ error: "Pedido no encontrado" });

    const venta  = ventaRows[0];
    const diseno = disenoRows[0];

    const anticipo_cubierto = Number(venta.abono)      >= Number(venta.anticipo);
    const diseno_completado = Number(diseno.aprobados) === Number(diseno.total_productos)
                              && Number(diseno.total_productos) > 0;

    return res.json({
      no_pedido:        Number(noPedido),
      puede_produccion: anticipo_cubierto && diseno_completado,
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
    console.error("❌ VERIFICAR CONDICIONES ERROR:", error.message);
    return res.status(500).json({ error: "Error al verificar condiciones" });
  }
};