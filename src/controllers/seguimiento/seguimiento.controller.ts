import { Request, Response } from "express";
import { pool } from "../../config/db";

export const getSeguimiento = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.no_pedido,
        s.fecha,
        cli.razon_social                              AS cliente,
        pr.tipo_producto                              AS tipo_producto,
        v.anticipo                                    AS anticipo_requerido,
        v.abono                                       AS anticipo_pagado,
        CASE WHEN v.abono >= v.anticipo
             THEN true ELSE false END                 AS anticipo_cubierto,

        -- ✅ FIX: join directo a diseno (1 por pedido garantizado)
        d.estado_administrativo_cat_idestado_administrativo_cat AS diseno_estado_id,
        CASE WHEN d.estado_administrativo_cat_idestado_administrativo_cat = 3
             THEN true ELSE false END                 AS diseno_aprobado,

        p.no_produccion

      FROM solicitud s
      LEFT JOIN clientes cli
          ON cli.idclientes = s.clientes_idclientes
      LEFT JOIN solicitud_producto sp
          ON sp.idsolicitud_producto = (
              SELECT MIN(sp2.idsolicitud_producto)
              FROM solicitud_producto sp2
              WHERE sp2.solicitud_idsolicitud = s.idsolicitud
          )
      LEFT JOIN configuracion_plastico cfg
          ON cfg.idconfiguracion_plastico = sp.configuracion_plastico_idconfiguracion_plastico
      LEFT JOIN tipo_producto_plastico tpp
          ON tpp.idtipo_producto_plastico = cfg.tipo_producto_plastico_plastico_idtipo_producto_plastico
      LEFT JOIN productos pr
          ON pr.idproductos = tpp.productos_idproductos
      LEFT JOIN ventas v
          ON v.solicitud_idsolicitud = s.idsolicitud

      -- ✅ FIX: join directo, ya no hay duplicados en diseno
      LEFT JOIN diseno d
          ON d.solicitud_idsolicitud = s.idsolicitud

      -- Una fila por orden de producción
      LEFT JOIN orden_produccion p
          ON p.idsolicitud = s.idsolicitud

      WHERE s.estado = 'pedido'
        AND s.no_pedido IS NOT NULL

      ORDER BY s.no_pedido DESC, p.no_produccion ASC
    `);

    const resultado = rows.map((row: any) => ({
      no_pedido:          Number(row.no_pedido),
      fecha:              row.fecha,
      cliente:            row.cliente        || "",
      tipo_producto:      row.tipo_producto  || "Plástico",
      anticipo_requerido: Number(row.anticipo_requerido ?? 0),
      anticipo_pagado:    Number(row.anticipo_pagado    ?? 0),
      anticipo_cubierto:  Boolean(row.anticipo_cubierto),
      diseno_estado_id:   Number(row.diseno_estado_id ?? 1),
      diseno_aprobado:    Boolean(row.diseno_aprobado),
      no_produccion:      row.no_produccion ?? null,
      puede_pdf:          Boolean(row.anticipo_cubierto) && Boolean(row.diseno_aprobado) && !!row.no_produccion,
    }));

    console.log(`✅ Seguimiento obtenido: ${resultado.length} filas`);
    return res.json(resultado);

  } catch (error: any) {
    console.error("❌ GET SEGUIMIENTO ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener seguimiento" });
  }
};

export const getOrdenProduccion = async (req: Request, res: Response) => {
  try {
    const { noPedido } = req.params;

    const { rows: pedidoRows } = await pool.query(`
      SELECT
        s.idsolicitud,
        s.no_pedido,
        s.no_cotizacion,
        s.fecha,
        cli.razon_social AS cliente,
        cli.empresa,
        cli.telefono,
        cli.correo,
        cli.impresion
      FROM solicitud s
      LEFT JOIN clientes cli ON cli.idclientes = s.clientes_idclientes
      WHERE s.no_pedido = $1 AND s.estado = 'pedido'
    `, [noPedido]);

    if (pedidoRows.length === 0)
      return res.status(404).json({ error: "Pedido no encontrado" });

    const pedido = pedidoRows[0];

    const { rows: productos } = await pool.query(`
      SELECT
        sp.idsolicitud_producto,
        op.idproduccion,
        op.no_produccion,
        op.fecha          AS fecha_produccion,

        -- ✅ fecha de aprobacion individual del diseño de este producto
        dp.fecha_aprobacion AS fecha_aprobacion_diseno,

        tpp.material_plastico_producto  AS nombre_producto,
        pr.tipo_producto                AS categoria,
        mp.tipo_material                AS material,
        cal.calibre                     AS calibre_numero,
        cal.calibre_bopp,
        cfg.medida,
        cfg.altura,
        cfg.ancho,
        cfg.fuelle_fondo,
        cfg.fuelle_latIz                AS fuelle_lat_iz,
        cfg.fuelle_latDe                AS fuelle_lat_de,
        cfg.refuerzo,
        cfg.por_kilo,

        t.cantidad   AS tintas,
        car.cantidad AS caras,
        sp.bk,
        sp.foil,
        sp.alto_rel,
        sp.laminado,
        sp.uv_br,
        sp.pigmentos,
        sp.pantones,
        sp.observacion,
        asz.tipo AS asa_suaje,

        sd.cantidad,
        sd.kilogramos,
        sd.modo_cantidad

      FROM solicitud_producto sp
      LEFT JOIN orden_produccion op
          ON op.idsolicitud_producto = sp.idsolicitud_producto
      -- ✅ join a diseno_producto para traer fecha_aprobacion individual
      LEFT JOIN diseno_producto dp
          ON dp.solicitud_producto_idsolicitud_producto = sp.idsolicitud_producto
      LEFT JOIN configuracion_plastico cfg
          ON cfg.idconfiguracion_plastico = sp.configuracion_plastico_idconfiguracion_plastico
      LEFT JOIN tipo_producto_plastico tpp
          ON tpp.idtipo_producto_plastico = cfg.tipo_producto_plastico_plastico_idtipo_producto_plastico
      LEFT JOIN productos pr
          ON pr.idproductos = tpp.productos_idproductos
      LEFT JOIN material_plastico mp
          ON mp.idmaterial_plastico = cfg.material_plastico_plastico_idmaterial_plastico
      LEFT JOIN calibre cal
          ON cal.idcalibre = cfg.calibre_idcalibre
      LEFT JOIN tintas t
          ON t.idtintas = sp.tintas_idtintas
      LEFT JOIN caras car
          ON car.idcaras = sp.caras_idcaras
      LEFT JOIN asa_suaje asz
          ON asz.idsuaje = sp.idsuaje
      LEFT JOIN solicitud_detalle sd
          ON sd.solicitud_producto_id = sp.idsolicitud_producto
          AND sd.aprobado = true
      WHERE sp.solicitud_idsolicitud = $1
      ORDER BY sp.idsolicitud_producto
    `, [pedido.idsolicitud]);

    const productosFormateados = productos.map((r: any) => {
      const materialUpper = (r.material || "").toUpperCase();
      const esBopp = materialUpper.includes("BOPP") ||
                     materialUpper.includes("CELOFAN") ||
                     materialUpper.includes("CELOFÁN");

      const calibre = esBopp
        ? (r.calibre_bopp ? String(r.calibre_bopp) : "")
        : (r.calibre_numero && Number(r.calibre_numero) !== 0 ? String(r.calibre_numero) : "");

      const altura      = r.altura        ? String(r.altura)        : "";
      const ancho       = r.ancho         ? String(r.ancho)         : "";
      const fuelleFondo = r.fuelle_fondo  ? String(r.fuelle_fondo)  : "";
      const fuelleLat   = r.fuelle_lat_iz ? String(r.fuelle_lat_iz) : "";
      const refuerzo    = r.refuerzo      ? String(r.refuerzo)      : "";

      return {
        idsolicitud_producto:   r.idsolicitud_producto,
        no_produccion:          r.no_produccion          ?? null,
        idproduccion:           r.idproduccion           ?? null,
        fecha_produccion:       r.fecha_produccion       ?? null,
        fecha_aprobacion_diseno: r.fecha_aprobacion_diseno ?? null, // ✅ nuevo
        tiene_orden:            !!r.no_produccion,
        nombre_producto:        r.nombre_producto || "",
        categoria:              r.categoria       || "",
        material:               r.material        || "",
        calibre,
        medida:                 r.medida          || "",
        altura,
        ancho,
        fuelle_fondo:           fuelleFondo,
        fuelle_lat_iz:          fuelleLat,
        fuelle_lat_de:          r.fuelle_lat_de ? String(r.fuelle_lat_de) : "",
        refuerzo,
        por_kilo:               r.por_kilo ? String(r.por_kilo) : null,
        medidas: {
          altura,
          ancho,
          fuelleFondo,
          fuelleLateral1: fuelleLat,
          fuelleLateral2: fuelleLat,
          refuerzo,
          solapa: "",
        },
        tintas:      r.tintas   ?? null,
        caras:       r.caras    ?? null,
        bk:          r.bk       ?? null,
        foil:        r.foil     ?? null,
        alto_rel:    r.alto_rel ?? null,
        laminado:    r.laminado ?? null,
        uv_br:       r.uv_br    ?? null,
        pigmentos:   r.pigmentos || null,
        pantones:    r.pantones
          ? r.pantones.split(",").map((p: string) => p.trim()).filter(Boolean)
          : null,
        asa_suaje:   r.asa_suaje   || null,
        observacion: r.observacion || null,
        cantidad:    r.cantidad   ? Number(r.cantidad)   : null,
        kilogramos:  r.kilogramos ? Number(r.kilogramos) : null,
        modo_cantidad: r.modo_cantidad || "unidad",
      };
    });

    return res.json({
      no_pedido:       Number(pedido.no_pedido),
      no_cotizacion:   pedido.no_cotizacion ?? null,
      fecha:           pedido.fecha,
      cliente:         pedido.cliente   || "",
      empresa:         pedido.empresa   || "",
      telefono:        pedido.telefono  || "",
      correo:          pedido.correo    || "",
      impresion:       pedido.impresion ?? null,
      productos:       productosFormateados,
      total_productos: productosFormateados.length,
      con_orden:       productosFormateados.filter((p: any) => p.tiene_orden).length,
    });

  } catch (error: any) {
    console.error("❌ GET ORDEN PRODUCCION ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener orden de producción" });
  }
};