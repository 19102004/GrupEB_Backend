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
        CASE WHEN v.abono >= v.total
             THEN true ELSE false END                 AS pago_completo,

        dp.estado_administrativo_cat_idestado_administrativo_cat AS producto_diseno_estado_id,
        CASE WHEN dp.estado_administrativo_cat_idestado_administrativo_cat = 3
             THEN true ELSE false END                 AS producto_diseno_aprobado,

        op.no_produccion,
        op.idproduccion,

        CASE WHEN v.abono >= v.anticipo
              AND dp.estado_administrativo_cat_idestado_administrativo_cat = 3
              AND op.no_produccion IS NOT NULL
             THEN true ELSE false END                 AS puede_pdf,

        -- estados de procesos
        ext.estado_produccion_cat_idestado_produccion_cat  AS extrusion_estado_id,
        imp.estado_produccion_cat_idestado_produccion_cat  AS impresion_estado_id,
        bol.estado_produccion_cat_idestado_produccion_cat  AS bolseo_estado_id,
        asa.estado_produccion_cat_idestado_produccion_cat  AS asa_flexible_estado_id,

        -- qué procesos aplican
        EXISTS (
          SELECT 1 FROM tipo_producto_plastico_proceso tppp2
          WHERE tppp2.idtipo_producto_plastico = cfg.tipo_producto_plastico_plastico_idtipo_producto_plastico
          AND tppp2.idproceso_cat = 1
        ) AS lleva_extrusion,
        EXISTS (
          SELECT 1 FROM tipo_producto_plastico_proceso tppp2
          WHERE tppp2.idtipo_producto_plastico = cfg.tipo_producto_plastico_plastico_idtipo_producto_plastico
          AND tppp2.idproceso_cat = 2
        ) AS lleva_impresion,
        EXISTS (
          SELECT 1 FROM tipo_producto_plastico_proceso tppp2
          WHERE tppp2.idtipo_producto_plastico = cfg.tipo_producto_plastico_plastico_idtipo_producto_plastico
          AND tppp2.idproceso_cat = 5
        ) AS lleva_bolseo,
        EXISTS (
          SELECT 1 FROM tipo_producto_plastico_proceso tppp2
          WHERE tppp2.idtipo_producto_plastico = cfg.tipo_producto_plastico_plastico_idtipo_producto_plastico
          AND tppp2.idproceso_cat = 3
        ) AS lleva_asa_flexible,

        -- datos del producto para el operador
        cfg.medida,
        cfg.altura,
        cfg.ancho,
        cfg.fuelle_fondo,
        cfg.fuelle_latIz  AS fuelle_lat_iz,
        cfg.fuelle_latDe  AS fuelle_lat_de,
        cfg.refuerzo,
        cfg.por_kilo,
        tpp.material_plastico_producto  AS nombre_producto,
        mp.tipo_material                AS material,
        cal.calibre                     AS calibre_numero,
        cal.calibre_bopp                AS calibre_bopp,
        t.cantidad                      AS tintas,
        car.cantidad                    AS caras,
        sp.pigmentos,
        sp.pantones,
        sp.observacion,
        sp.bk,
        sp.foil,
        asz.tipo                        AS asa_suaje,
        sd.cantidad                     AS cantidad_orden,
        sd.kilogramos                   AS kilogramos_orden,
        sd.modo_cantidad

      FROM solicitud s
      LEFT JOIN clientes cli
          ON cli.idclientes = s.clientes_idclientes
      LEFT JOIN solicitud_producto sp
          ON sp.solicitud_idsolicitud = s.idsolicitud
      LEFT JOIN configuracion_plastico cfg
          ON cfg.idconfiguracion_plastico = sp.configuracion_plastico_idconfiguracion_plastico
      LEFT JOIN tipo_producto_plastico tpp
          ON tpp.idtipo_producto_plastico = cfg.tipo_producto_plastico_plastico_idtipo_producto_plastico
      LEFT JOIN productos pr
          ON pr.idproductos = tpp.productos_idproductos
      LEFT JOIN ventas v
          ON v.solicitud_idsolicitud = s.idsolicitud
      LEFT JOIN diseno d
          ON d.solicitud_idsolicitud = s.idsolicitud
      LEFT JOIN diseno_producto dp
          ON dp.diseno_iddiseno = d.iddiseno
          AND dp.solicitud_producto_idsolicitud_producto = sp.idsolicitud_producto
      LEFT JOIN orden_produccion op
          ON op.idsolicitud_producto = sp.idsolicitud_producto
      LEFT JOIN extrusion ext
          ON ext.orden_produccion_idproduccion = op.idproduccion
      LEFT JOIN impresion imp
          ON imp.orden_produccion_idproduccion = op.idproduccion
      LEFT JOIN bolseo bol
          ON bol.orden_produccion_idproduccion = op.idproduccion
      LEFT JOIN asa_flexible asa
          ON asa.orden_produccion_idproduccion = op.idproduccion
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

      WHERE s.estado = 'pedido'
        AND s.no_pedido IS NOT NULL

      ORDER BY s.no_pedido DESC, sp.idsolicitud_producto ASC
    `);

    const mapEstadoProceso = (estadoId: number | null): string => {
      if (estadoId === null || estadoId === undefined) return "pendiente";
      switch (estadoId) {
        case 3:  return "finalizado";
        case 2:  return "proceso";
        case 4:  return "resagado";
        case 5:  return "no-aplica";
        default: return "pendiente";
      }
    };

    const resultado = rows.map((row: any) => {
      const mat    = (row.material || "").toUpperCase();
      const esBopp = mat.includes("BOPP") || mat.includes("CELOFAN") || mat.includes("CELOFÁN");
      const calibre = esBopp
        ? (row.calibre_bopp ? String(row.calibre_bopp) : "")
        : (row.calibre_numero && Number(row.calibre_numero) !== 0 ? String(row.calibre_numero) : "");

      return {
        no_pedido:           Number(row.no_pedido),
        fecha:               row.fecha,
        cliente:             row.cliente       || "",
        tipo_producto:       row.tipo_producto || "Plástico",
        anticipo_requerido:  Number(row.anticipo_requerido ?? 0),
        anticipo_pagado:     Number(row.anticipo_pagado    ?? 0),
        anticipo_cubierto:   Boolean(row.anticipo_cubierto),
        pago_completo:       Boolean(row.pago_completo),
        diseno_estado_id:    Number(row.producto_diseno_estado_id ?? 1),
        diseno_aprobado:     Boolean(row.producto_diseno_aprobado),
        no_produccion:       row.no_produccion ?? null,
        idproduccion:        row.idproduccion  ?? null,
        puede_pdf:           Boolean(row.puede_pdf),
        extrusion_estado:    row.lleva_extrusion    ? mapEstadoProceso(row.extrusion_estado_id)    : "no-aplica",
        impresion_estado:    row.lleva_impresion    ? mapEstadoProceso(row.impresion_estado_id)    : "no-aplica",
        bolseo_estado:       row.lleva_bolseo       ? mapEstadoProceso(row.bolseo_estado_id)       : "no-aplica",
        asa_flexible_estado: row.lleva_asa_flexible ? mapEstadoProceso(row.asa_flexible_estado_id) : "no-aplica",
        // datos del producto
        nombre_producto:  row.nombre_producto || "",
        medida:           row.medida          || "",
        altura:           row.altura          ? String(row.altura)          : "",
        ancho:            row.ancho           ? String(row.ancho)           : "",
        fuelle_fondo:     row.fuelle_fondo    ? String(row.fuelle_fondo)    : "",
        fuelle_lat_iz:    row.fuelle_lat_iz   ? String(row.fuelle_lat_iz)   : "",
        fuelle_lat_de:    row.fuelle_lat_de   ? String(row.fuelle_lat_de)   : "",
        refuerzo:         row.refuerzo        ? String(row.refuerzo)        : "",
        material:         row.material        || "",
        calibre,
        tintas:           row.tintas    != null ? Number(row.tintas)    : null,
        caras:            row.caras     != null ? Number(row.caras)     : null,
        pigmentos:        row.pigmentos || null,
        pantones:         row.pantones  || null,
        observacion:      row.observacion || null,
        bk:               row.bk   != null ? Boolean(row.bk)   : null,
        foil:             row.foil != null ? Boolean(row.foil) : null,
        asa_suaje:        row.asa_suaje || null,
        cantidad_orden:   row.cantidad_orden   ? Number(row.cantidad_orden)   : null,
        kilogramos_orden: row.kilogramos_orden ? Number(row.kilogramos_orden) : null,
        modo_cantidad:    row.modo_cantidad    || "unidad",
      };
    });

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
        sd.modo_cantidad,
        -- ✅ kilos y metros calculados desde extrusión
        ext.kilos_extruir,
        ext.metros_extruir
      FROM solicitud_producto sp
      LEFT JOIN orden_produccion op
          ON op.idsolicitud_producto = sp.idsolicitud_producto
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
      LEFT JOIN extrusion ext
          ON ext.orden_produccion_idproduccion = op.idproduccion
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

      const altura      = r.altura       ? String(r.altura)       : "";
      const ancho       = r.ancho        ? String(r.ancho)        : "";
      const fuelleFondo = r.fuelle_fondo ? String(r.fuelle_fondo) : "";
      const fuelleLat   = r.fuelle_lat_iz ? String(r.fuelle_lat_iz) : "";
      const refuerzo    = r.refuerzo     ? String(r.refuerzo)     : "";

      return {
        idsolicitud_producto:    r.idsolicitud_producto,
        no_produccion:           r.no_produccion           ?? null,
        idproduccion:            r.idproduccion            ?? null,
        fecha_produccion:        r.fecha_produccion        ?? null,
        fecha_aprobacion_diseno: r.fecha_aprobacion_diseno ?? null,
        tiene_orden:             !!r.no_produccion,
        nombre_producto:         r.nombre_producto || "",
        categoria:               r.categoria       || "",
        material:                r.material        || "",
        calibre,
        medida:                  r.medida          || "",
        altura,
        ancho,
        fuelle_fondo:            fuelleFondo,
        fuelle_lat_iz:           fuelleLat,
        fuelle_lat_de:           r.fuelle_lat_de ? String(r.fuelle_lat_de) : "",
        refuerzo,
        por_kilo:                r.por_kilo ? String(r.por_kilo) : null,
        medidas: {
          altura,
          ancho,
          fuelleFondo,
          fuelleLateral1: fuelleLat,
          fuelleLateral2: fuelleLat,
          refuerzo,
          solapa: "",
        },
        tintas:        r.tintas   ?? null,
        caras:         r.caras    ?? null,
        bk:            r.bk       ?? null,
        foil:          r.foil     ?? null,
        alto_rel:      r.alto_rel ?? null,
        laminado:      r.laminado ?? null,
        uv_br:         r.uv_br    ?? null,
        pigmentos:     r.pigmentos || null,
        pantones:      r.pantones
          ? r.pantones.split(",").map((p: string) => p.trim()).filter(Boolean)
          : null,
        asa_suaje:     r.asa_suaje   || null,
        observacion:   r.observacion || null,
        cantidad:      r.cantidad   ? Number(r.cantidad)   : null,
        kilogramos:    r.kilogramos ? Number(r.kilogramos) : null,
        modo_cantidad: r.modo_cantidad || "unidad",
        // ✅ calculados automáticamente
        kilos_extruir:  r.kilos_extruir  ? Number(r.kilos_extruir)  : null,
        metros_extruir: r.metros_extruir ? Number(r.metros_extruir) : null,
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