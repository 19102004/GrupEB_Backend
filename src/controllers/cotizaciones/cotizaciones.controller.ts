import { Request, Response } from "express";
import { pool } from "../../config/db";

const ESTADO = {
  PENDIENTE:  1,
  EN_PROCESO: 2,
  APROBADO:   3,
  RECHAZADO:  4,
} as const;

function normalizarNombreEstado(nombre: string): string {
  if (!nombre) return "Pendiente";
  const n = nombre.toLowerCase().trim();
  if (n === "aprobado" || n === "aprobada")   return "Aprobada";
  if (n === "rechazado" || n === "rechazada") return "Rechazada";
  return "Pendiente";
}

// ============================================================
// CREAR COTIZACIÓN
// ============================================================
export const crearCotizacion = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { clienteId, productos } = req.body;

    if (!clienteId) return res.status(400).json({ error: "Se requiere clienteId" });
    if (!productos || productos.length === 0) return res.status(400).json({ error: "Se requiere al menos un producto" });

    await client.query("BEGIN");

    const { rows: cotRows } = await client.query(
      `INSERT INTO cotizacion (
        clientes_idclientes,
        estado_administrativo_cat_idestado_administrativo_cat
      ) VALUES ($1, $2)
      RETURNING idcotizacion, no_cotizacion`,
      [clienteId, ESTADO.PENDIENTE]
    );

    const cotizacionId = cotRows[0].idcotizacion;
    const noCotizacion = cotRows[0].no_cotizacion;

    for (const producto of productos) {
      const {
        productoId,
        tintasId,
        carasId,
        detalles,
        observacion = null,
        bk          = null,
        foil        = null,
        idsuaje     = null,
        altoRel     = null,
        laminado    = null,
        uvBr        = null,
        pigmentos   = null,
        pantones    = null,
        porKilo     = null,
      } = producto;

      if (!productoId) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Cada producto requiere productoId" });
      }

      const detallesValidos = (detalles ?? []).filter(
        (d: any) => d.cantidad > 0 && d.precio_total > 0
      );

      if (detallesValidos.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `El producto ID ${productoId} no tiene cantidades válidas` });
      }

      const pigmentosGuardar = typeof pigmentos === "string" && pigmentos.trim() !== ""
        ? pigmentos.trim() : null;
      const pantonesGuardar  = typeof pantones  === "string" && pantones.trim()  !== ""
        ? pantones.trim()  : null;

      // ✅ cotizacion_producto ya NO tiene modo_cantidad
      const { rows: prodRows } = await client.query(
        `INSERT INTO cotizacion_producto (
          cotizacion_idcotizacion,
          configuracion_plastico_idconfiguracion_plastico,
          tintas_idtintas,
          caras_idcaras,
          bk, foil, idsuaje, alto_rel, laminado, uv_br,
          pigmentos, pantones, observacion
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING idcotizacion_producto`,
        [
          cotizacionId, productoId, tintasId, carasId,
          bk, foil, idsuaje, altoRel, laminado, uvBr,
          pigmentosGuardar, pantonesGuardar, observacion,
        ]
      );

      const cotizacionProductoId = prodRows[0].idcotizacion_producto;
      const porKiloNum = porKilo ? Number(porKilo) : 0;

      for (const d of detallesValidos) {
        // ✅ modo_cantidad viene en cada detalle individual
        const modoDetalle = d.modo_cantidad === "kilo" ? "kilo" : "unidad";

        // ✅ Calcular kilogramos siempre
        let kilogramos: number | null = null;
        if (porKiloNum > 0) {
          if (modoDetalle === "kilo" && d.kilogramos_ingresados) {
            kilogramos = Number(Number(d.kilogramos_ingresados).toFixed(4));
          } else {
            kilogramos = Number((d.cantidad / porKiloNum).toFixed(4));
          }
        }

        await client.query(
          `INSERT INTO cotizacion_detalle (
            cotizacion_producto_id, cantidad, precio_total, aprobado,
            kilogramos, modo_cantidad
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [cotizacionProductoId, d.cantidad, d.precio_total, null, kilogramos, modoDetalle]
        );
      }
    }

    await client.query("COMMIT");
    return res.status(201).json({
      message:       "Cotización creada exitosamente",
      no_cotizacion: noCotizacion,
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ CREAR COTIZACIÓN ERROR:", error.message);
    return res.status(500).json({ error: "Error al crear cotización" });
  } finally {
    client.release();
  }
};

// ============================================================
// OBTENER COTIZACIONES
// ============================================================
export const getCotizaciones = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
          c.idcotizacion,
          c.no_cotizacion,
          c.fecha,
          c.clientes_idclientes,
          c.estado_administrativo_cat_idestado_administrativo_cat,

          cli.razon_social  AS cliente_nombre,
          cli.empresa       AS cliente_empresa,
          cli.telefono      AS cliente_telefono,
          cli.correo        AS cliente_correo,
          cli.impresion     AS cliente_impresion,

          est.nombre        AS estado_nombre,

          cp.idcotizacion_producto,
          cp.configuracion_plastico_idconfiguracion_plastico,
          cp.tintas_idtintas,
          cp.caras_idcaras,
          cp.bk,
          cp.foil,
          cp.idsuaje,
          cp.alto_rel,
          cp.laminado,
          cp.uv_br,
          cp.pigmentos,
          cp.pantones,
          cp.observacion,

          asz.tipo          AS suaje_tipo,

          cfg.medida                AS cfg_medida,
          cfg.altura                AS cfg_altura,
          cfg.ancho                 AS cfg_ancho,
          cfg.fuelle_fondo          AS cfg_fuelle_fondo,
          cfg.fuelle_latIz          AS cfg_fuelle_lat_iz,
          cfg.fuelle_latDe          AS cfg_fuelle_lat_de,
          cfg.refuerzo              AS cfg_refuerzo,
          cfg.por_kilo              AS cfg_por_kilo,

          tpp.material_plastico_producto  AS tipo_producto_nombre,
          mp.tipo_material                AS material_nombre,
          cal.calibre                     AS calibre_numero,
          cal.calibre_bopp                AS calibre_bopp,

          t.cantidad   AS tintas_cantidad,
          car.cantidad AS caras_cantidad,

          cd.idcotizacion_detalle,
          cd.cantidad,
          cd.precio_total,
          cd.aprobado,
          cd.kilogramos,
          -- ✅ modo_cantidad ahora vive en cotizacion_detalle
          cd.modo_cantidad

      FROM cotizacion c

      LEFT JOIN clientes cli
          ON cli.idclientes = c.clientes_idclientes
      LEFT JOIN estado_administrativo_cat est
          ON est.idestado_administrativo_cat = c.estado_administrativo_cat_idestado_administrativo_cat
      LEFT JOIN cotizacion_producto cp
          ON cp.cotizacion_idcotizacion = c.idcotizacion
      LEFT JOIN asa_suaje asz
          ON asz.idsuaje = cp.idsuaje
      LEFT JOIN configuracion_plastico cfg
          ON cfg.idconfiguracion_plastico = cp.configuracion_plastico_idconfiguracion_plastico
      LEFT JOIN tipo_producto_plastico tpp
          ON tpp.idtipo_producto_plastico = cfg.tipo_producto_plastico_plastico_idtipo_producto_plastico
      LEFT JOIN material_plastico mp
          ON mp.idmaterial_plastico = cfg.material_plastico_plastico_idmaterial_plastico
      LEFT JOIN calibre cal
          ON cal.idcalibre = cfg.calibre_idcalibre
      LEFT JOIN tintas t
          ON t.idtintas = cp.tintas_idtintas
      LEFT JOIN caras car
          ON car.idcaras = cp.caras_idcaras
      LEFT JOIN cotizacion_detalle cd
          ON cd.cotizacion_producto_id = cp.idcotizacion_producto

      ORDER BY c.no_cotizacion DESC, cp.idcotizacion_producto, cd.idcotizacion_detalle
    `);

    const agrupadas: Record<number, any> = {};

    for (const row of rows) {
      const noCot: number = row.no_cotizacion;

      if (!agrupadas[noCot]) {
        agrupadas[noCot] = {
          no_cotizacion: noCot,
          fecha:         row.fecha,
          estado_id:     row.estado_administrativo_cat_idestado_administrativo_cat,
          estado:        normalizarNombreEstado(row.estado_nombre || ""),
          cliente_id:    row.clientes_idclientes,
          cliente:       row.cliente_nombre   || "",
          telefono:      row.cliente_telefono || "",
          correo:        row.cliente_correo   || "",
          impresion:     row.cliente_impresion || null,
          empresa:       row.cliente_empresa  || "",
          productos:     [],
          total:         0,
        };
      }

      if (row.idcotizacion_producto) {
        let producto = agrupadas[noCot].productos.find(
          (p: any) => p.idcotizacion_producto === row.idcotizacion_producto
        );

        if (!producto) {
          const tipoNombre     = row.tipo_producto_nombre || "";
          const medida         = row.cfg_medida           || "";
          const material       = (row.material_nombre     || "").toLowerCase();
          const nombreCompleto =
            [tipoNombre, medida, material].filter(Boolean).join(" ") ||
            `Producto #${row.configuracion_plastico_idconfiguracion_plastico}`;

          const medidas = {
            altura:         row.cfg_altura        ? String(row.cfg_altura)        : "",
            ancho:          row.cfg_ancho         ? String(row.cfg_ancho)         : "",
            fuelleFondo:    row.cfg_fuelle_fondo  ? String(row.cfg_fuelle_fondo)  : "",
            fuelleLateral1: row.cfg_fuelle_lat_iz ? String(row.cfg_fuelle_lat_iz) : "",
            fuelleLateral2: row.cfg_fuelle_lat_de ? String(row.cfg_fuelle_lat_de) : "",
            refuerzo:       row.cfg_refuerzo      ? String(row.cfg_refuerzo)      : "",
            solapa:         "",
          };

          const materialUpper = (row.material_nombre || "").toUpperCase();
          const esBopp = materialUpper.includes("BOPP") ||
                         materialUpper.includes("CELOFAN") ||
                         materialUpper.includes("CELOFÁN");

          const calibreResuelto = (() => {
            if (esBopp) {
              const cb = row.calibre_bopp;
              if (cb !== null && cb !== undefined && String(cb).trim() !== "") return String(cb);
              return "";
            }
            const c = row.calibre_numero;
            if (c !== null && c !== undefined && Number(c) !== 0) return String(c);
            return "";
          })();

          producto = {
            idcotizacion:          row.idcotizacion,
            idcotizacion_producto: row.idcotizacion_producto,
            producto_id:           row.configuracion_plastico_idconfiguracion_plastico,
            nombre:                nombreCompleto,
            material:              row.material_nombre || "",
            calibre:               calibreResuelto,
            calibre_bopp:          row.calibre_bopp ? String(row.calibre_bopp) : null,
            medidasFormateadas:    row.cfg_medida    || "",
            medidas,
            tintas:                row.tintas_cantidad ?? row.tintas_idtintas,
            caras:                 row.caras_cantidad  ?? row.caras_idcaras,
            bk:                    row.bk,
            foil:                  row.foil,
            idsuaje:               row.idsuaje    ?? null,
            asa_suaje:             row.suaje_tipo ?? null,
            alto_rel:              row.alto_rel,
            laminado:              row.laminado,
            uv_br:                 row.uv_br,
            pigmentos:             row.pigmentos || null,
            pantones:              row.pantones
              ? row.pantones.split(",").map((p: string) => p.trim()).filter(Boolean)
              : null,
            observacion:           row.observacion,
            por_kilo:              row.cfg_por_kilo ? String(row.cfg_por_kilo) : null,
            detalles:              [],
            subtotal:              0,
          };
          agrupadas[noCot].productos.push(producto);
        }

        if (row.idcotizacion_detalle) {
          producto.detalles.push({
            iddetalle:    row.idcotizacion_detalle,
            cantidad:     Number(row.cantidad),
            precio_total: Number(row.precio_total),
            aprobado:     row.aprobado,
            kilogramos:   row.kilogramos  != null ? Number(row.kilogramos)  : null,
            // ✅ modo_cantidad por detalle
            modo_cantidad: row.modo_cantidad || "unidad",
          });
          producto.subtotal += Number(row.precio_total);
        }
      }
    }

    for (const noCot in agrupadas) {
      agrupadas[noCot].total = agrupadas[noCot].productos.reduce(
        (sum: number, p: any) => sum + p.subtotal, 0
      );
    }

    const resultado = Object.values(agrupadas);
    console.log(`✅ Cotizaciones obtenidas: ${resultado.length}`);
    return res.json(resultado);

  } catch (error: any) {
    console.error("❌ GET COTIZACIONES ERROR:", error.message);
    return res.status(500).json({ error: "Error al obtener cotizaciones" });
  }
};

// ============================================================
// ACTUALIZAR ESTADO
// ============================================================
export const actualizarEstadoCotizacion = async (req: Request, res: Response) => {
  try {
    const { id }       = req.params;
    const { estadoId } = req.body;

    if (!estadoId) return res.status(400).json({ error: "Se requiere estadoId" });

    const { rowCount } = await pool.query(
      `UPDATE cotizacion
       SET estado_administrativo_cat_idestado_administrativo_cat = $1
       WHERE no_cotizacion = $2`,
      [estadoId, id]
    );

    if (!rowCount || rowCount === 0) return res.status(404).json({ error: "Cotización no encontrada" });
    return res.json({ message: "Estado actualizado exitosamente" });

  } catch (error: any) {
    console.error("❌ ACTUALIZAR ESTADO ERROR:", error.message);
    return res.status(500).json({ error: "Error al actualizar estado" });
  }
};

// ============================================================
// ELIMINAR COTIZACIÓN
// ============================================================
export const eliminarCotizacion = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");

    const { rows: cotRows } = await client.query(
      `SELECT idcotizacion FROM cotizacion WHERE no_cotizacion = $1`, [id]
    );
    if (cotRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    const cotizacionIds: number[] = cotRows.map((r: any) => r.idcotizacion);

    const { rows: prodRows } = await client.query(
      `SELECT idcotizacion_producto FROM cotizacion_producto
       WHERE cotizacion_idcotizacion = ANY($1::int[])`,
      [cotizacionIds]
    );

    const productoIds: number[] = prodRows.map((r: any) => r.idcotizacion_producto);

    if (productoIds.length > 0) {
      await client.query(
        `DELETE FROM cotizacion_detalle WHERE cotizacion_producto_id = ANY($1::int[])`,
        [productoIds]
      );
    }

    await client.query(
      `DELETE FROM cotizacion_producto WHERE cotizacion_idcotizacion = ANY($1::int[])`,
      [cotizacionIds]
    );
    await client.query(`DELETE FROM cotizacion WHERE no_cotizacion = $1`, [id]);

    await client.query("COMMIT");
    return res.json({ message: "Cotización eliminada exitosamente" });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ ELIMINAR COTIZACIÓN ERROR:", error.message);
    return res.status(500).json({ error: "Error al eliminar cotización" });
  } finally {
    client.release();
  }
};

// ============================================================
// APROBAR / RECHAZAR DETALLE
// ============================================================
export const aprobarDetalle = async (req: Request, res: Response) => {
  try {
    const { id }       = req.params;
    const { aprobado } = req.body;

    if (typeof aprobado !== "boolean")
      return res.status(400).json({ error: "El campo aprobado debe ser true o false" });

    const { rowCount } = await pool.query(
      `UPDATE cotizacion_detalle SET aprobado = $1 WHERE idcotizacion_detalle = $2`,
      [aprobado, id]
    );

    if (rowCount === 0) return res.status(404).json({ error: "Detalle no encontrado" });
    return res.json({ message: aprobado ? "Aprobado" : "Rechazado", aprobado });

  } catch (error: any) {
    console.error("❌ Error al aprobar/rechazar detalle:", error.message);
    return res.status(500).json({ error: "Error al actualizar aprobación" });
  }
};

// ============================================================
// ACTUALIZAR OBSERVACIÓN
// ============================================================
export const actualizarObservacion = async (req: Request, res: Response) => {
  try {
    const { id }          = req.params;
    const { observacion } = req.body;

    const { rowCount } = await pool.query(
      `UPDATE cotizacion_producto SET observacion = $1 WHERE idcotizacion_producto = $2`,
      [observacion || null, id]
    );

    if (rowCount === 0) return res.status(404).json({ error: "Producto no encontrado" });
    return res.json({ message: "Observación actualizada", observacion });

  } catch (error: any) {
    console.error("❌ Error al actualizar observación:", error.message);
    return res.status(500).json({ error: "Error al actualizar observación" });
  }
};