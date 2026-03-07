import { Request, Response } from "express";
import { pool } from "../../config/db";

// ============================================================
// GET /api/seguimiento/:noPedido/orden-produccion
// Devuelve todos los productos del pedido con su orden individual
// ============================================================
export const getOrdenProduccion = async (req: Request, res: Response) => {
  try {
    const { noPedido } = req.params;

    // Info base del pedido y cliente
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

    // Todos los productos con su orden de producción individual
    const { rows: productos } = await pool.query(`
      SELECT
        sp.idsolicitud_producto,

        -- Orden de producción vinculada a este producto específico
        op.idproduccion,
        op.no_produccion,
        op.fecha          AS fecha_produccion,

        -- Producto
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

        -- Características
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

        -- Asa/Suaje
        asz.tipo AS asa_suaje,

        -- Cantidad aprobada por el cliente
        sd.cantidad,
        sd.kilogramos,
        sd.modo_cantidad

      FROM solicitud_producto sp
      LEFT JOIN orden_produccion op
          ON op.idsolicitud_producto = sp.idsolicitud_producto
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
        idsolicitud_producto: r.idsolicitud_producto,

        // Orden de producción
        no_produccion:    r.no_produccion    ?? null,
        idproduccion:     r.idproduccion     ?? null,
        fecha_produccion: r.fecha_produccion ?? null,
        tiene_orden:      !!r.no_produccion,

        // Producto
        nombre_producto: r.nombre_producto || "",
        categoria:       r.categoria       || "",
        material:        r.material        || "",
        calibre,
        medida:          r.medida          || "",

        // Medidas individuales
        altura,
        ancho,
        fuelle_fondo:  fuelleFondo,
        fuelle_lat_iz: fuelleLat,
        fuelle_lat_de: r.fuelle_lat_de ? String(r.fuelle_lat_de) : "",
        refuerzo,
        por_kilo:      r.por_kilo ? String(r.por_kilo) : null,

        // Medidas para cálculo de rodillo
        medidas: {
          altura,
          ancho,
          fuelleFondo,
          fuelleLateral1: fuelleLat,
          fuelleLateral2: fuelleLat,
          refuerzo,
          solapa: "",
        },

        // Características
        tintas:     r.tintas   ?? null,
        caras:      r.caras    ?? null,
        bk:         r.bk       ?? null,
        foil:       r.foil     ?? null,
        alto_rel:   r.alto_rel ?? null,
        laminado:   r.laminado ?? null,
        uv_br:      r.uv_br    ?? null,
        pigmentos:  r.pigmentos || null,
        pantones:   r.pantones
          ? r.pantones.split(",").map((p: string) => p.trim()).filter(Boolean)
          : null,
        asa_suaje:   r.asa_suaje   || null,
        observacion: r.observacion || null,

        // Cantidad aprobada
        cantidad:      r.cantidad   ? Number(r.cantidad)   : null,
        kilogramos:    r.kilogramos ? Number(r.kilogramos) : null,
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