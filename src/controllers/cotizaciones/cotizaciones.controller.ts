import { Request, Response } from "express";
import { pool } from "../../config/db";

// ============================================================
// CREAR COTIZACIÓN
//
// Body esperado:
// {
//   clienteId: number,
//   productos: [{
//     productoId: number,   ← configuracion_plastico_idconfiguracion_plastico
//     tintasId:   number,
//     carasId:    number,
//     detalles: [{
//       cantidad:    number,
//       precio_total: number   ← cantidad * precio_unitario calculado en frontend
//     }]
//   }]
// }
// ============================================================
export const crearCotizacion = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { clienteId, productos } = req.body;

    if (!clienteId) {
      return res.status(400).json({ error: "Se requiere clienteId" });
    }

    if (!productos || productos.length === 0) {
      return res.status(400).json({ error: "Se requiere al menos un producto" });
    }

    await client.query("BEGIN");

    const ESTADO_PENDIENTE = 1;

    // 🔥 1️⃣ Crear cabecera UNA sola vez
    const { rows: cotRows } = await client.query(
      `INSERT INTO cotizacion (
        clientes_idclientes,
        estado_administrativo_cat_idestado_administrativo_cat
      )
      VALUES ($1,$2)
      RETURNING idcotizacion, no_cotizacion`,
      [clienteId, ESTADO_PENDIENTE]
    );

    const cotizacionId = cotRows[0].idcotizacion;
    const noCotizacion = cotRows[0].no_cotizacion;

    // 🔥 2️⃣ Insertar productos
    for (const producto of productos) {
      const {
        productoId,
        tintasId,
        carasId,
        detalles,
        bk = null,
        foil = null,
        asaSuaje = null,
        altoRel = null,
        laminado = null,
        uvBr = null,
        pigmentos = null,
        pantones = null,
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
        return res.status(400).json({
          error: `El producto ID ${productoId} no tiene cantidades válidas`,
        });
      }

      // 🔥 Insertar producto
      const { rows: prodRows } = await client.query(
        `INSERT INTO cotizacion_producto (
          cotizacion_idcotizacion,
          configuracion_plastico_idconfiguracion_plastico,
          tintas_idtintas,
          caras_idcaras,
          bk,
          foil,
          asa_suaje,
          alto_rel,
          laminado,
          uv_br,
          pigmentos,
          pantones
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING idcotizacion_producto`,
        [
          cotizacionId,
          productoId,
          tintasId,
          carasId,
          bk,
          foil,
          asaSuaje,
          altoRel,
          laminado,
          uvBr,
          pigmentos,
          pantones,
        ]
      );

      const cotizacionProductoId = prodRows[0].idcotizacion_producto;

      // 🔥 Insertar detalles
      for (const d of detallesValidos) {
        await client.query(
          `INSERT INTO cotizacion_detalle (
            cotizacion_producto_id,
            cantidad,
            precio_total
          )
          VALUES ($1,$2,$3)`,
          [cotizacionProductoId, d.cantidad, d.precio_total]
        );
      }
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Cotización creada exitosamente",
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
// Agrupadas por no_cotizacion con sus productos y detalles.
// ============================================================
export const getCotizaciones = async (req: Request, res: Response) => {
  try {
    // 🔥 Query SIMPLE usando solo los campos que existen en tu BD
    const { rows } = await pool.query(`
      SELECT
          c.idcotizacion,
          c.no_cotizacion,
          c.fecha,
          c.clientes_idclientes,
          c.estado_administrativo_cat_idestado_administrativo_cat,

          cli.razon_social AS cliente_nombre,
          cli.empresa AS cliente_empresa,
          cli.telefono AS cliente_telefono,
          cli.correo AS cliente_correo,

          est.nombre AS estado_nombre,

          cp.idcotizacion_producto,
          cp.configuracion_plastico_idconfiguracion_plastico,
          cp.tintas_idtintas,
          cp.caras_idcaras,
          cp.bk,
          cp.foil,
          cp.asa_suaje,
          cp.alto_rel,
          cp.laminado,
          cp.uv_br,
          cp.pigmentos,
          cp.pantones,
          cp.observacion,

          cd.idcotizacion_detalle,
          cd.cantidad,
          cd.precio_total

      FROM cotizacion c

      LEFT JOIN clientes cli
          ON cli.idclientes = c.clientes_idclientes

      LEFT JOIN estado_administrativo_cat est
          ON est.idestado_administrativo_cat = c.estado_administrativo_cat_idestado_administrativo_cat

      LEFT JOIN cotizacion_producto cp
          ON cp.cotizacion_idcotizacion = c.idcotizacion

      LEFT JOIN cotizacion_detalle cd
          ON cd.cotizacion_producto_id = cp.idcotizacion_producto

      ORDER BY c.no_cotizacion DESC, cp.idcotizacion_producto, cd.idcotizacion_detalle
    `);

    // 🔥 Agrupar por no_cotizacion
    const agrupadas: Record<number, any> = {};

    for (const row of rows) {
      const noCot: number = row.no_cotizacion;

      // 🔥 Crear cotización si no existe
      if (!agrupadas[noCot]) {
        agrupadas[noCot] = {
          no_cotizacion: noCot,
          fecha:         row.fecha,
          estado_id:     row.estado_administrativo_cat_idestado_administrativo_cat,
          estado:        row.estado_nombre || "Sin estado",
          cliente_id:    row.clientes_idclientes,
          cliente:       row.cliente_nombre   || "",
          telefono:      row.cliente_telefono || "",
          correo:        row.cliente_correo   || "",
          empresa:       row.cliente_empresa  || "",
          productos:     [],
          total:         0,
        };
      }

      // 🔥 Si hay producto, agregarlo o actualizarlo
      if (row.idcotizacion_producto) {
        // Buscar si el producto ya existe en el array
        let producto = agrupadas[noCot].productos.find(
          (p: any) => p.idcotizacion_producto === row.idcotizacion_producto
        );

        // Si no existe, crearlo
        if (!producto) {
          producto = {
            idcotizacion: row.idcotizacion,
            idcotizacion_producto: row.idcotizacion_producto,
            producto_id:  row.configuracion_plastico_idconfiguracion_plastico,
            nombre: `Producto #${row.configuracion_plastico_idconfiguracion_plastico}`, // 🔥 Nombre genérico
            tintas:       row.tintas_idtintas,
            caras:        row.caras_idcaras,
            bk:           row.bk,
            foil:         row.foil,
            asa_suaje:    row.asa_suaje,
            alto_rel:     row.alto_rel,
            laminado:     row.laminado,
            uv_br:        row.uv_br,
            pigmentos:    row.pigmentos,
            pantones:     row.pantones,
            observacion:  row.observacion,
            detalles:     [],
            subtotal:     0,
          };
          agrupadas[noCot].productos.push(producto);
        }

        // 🔥 Si hay detalle, agregarlo
        if (row.idcotizacion_detalle) {
          const detalle = {
            iddetalle: row.idcotizacion_detalle,
            cantidad: Number(row.cantidad),
            precio_total: Number(row.precio_total),
          };
          producto.detalles.push(detalle);
          producto.subtotal += detalle.precio_total;
        }
      }
    }

    // 🔥 Calcular total de cada cotización
    for (const noCot in agrupadas) {
      agrupadas[noCot].total = agrupadas[noCot].productos.reduce(
        (sum: number, p: any) => sum + p.subtotal,
        0
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
// ACTUALIZAR ESTADO (por no_cotizacion)
// Body: { estadoId: number }
// ============================================================
export const actualizarEstadoCotizacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estadoId } = req.body;

    if (!estadoId) {
      return res.status(400).json({ error: "Se requiere estadoId" });
    }

    const { rowCount } = await pool.query(
      `UPDATE cotizacion
       SET estado_administrativo_cat_idestado_administrativo_cat = $1
       WHERE no_cotizacion = $2`,
      [estadoId, id]
    );

    if (!rowCount || rowCount === 0) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    console.log(`✅ Estado cotización #${id} → estadoId ${estadoId}`);
    return res.json({ message: "Estado actualizado exitosamente" });
  } catch (error: any) {
    console.error("❌ ACTUALIZAR ESTADO ERROR:", error.message);
    return res.status(500).json({ error: "Error al actualizar estado" });
  }
};

// ============================================================
// ELIMINAR COTIZACIÓN (por no_cotizacion)
// Elimina detalles primero (FK), luego productos, luego cabecera.
// ============================================================
export const eliminarCotizacion = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    // Obtener IDs de cotizaciones con ese número
    const { rows: cotRows } = await client.query(
      `SELECT idcotizacion FROM cotizacion WHERE no_cotizacion = $1`,
      [id]
    );

    if (cotRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    const cotizacionIds: number[] = cotRows.map((r: any) => r.idcotizacion);

    // Obtener IDs de productos
    const { rows: prodRows } = await client.query(
      `SELECT idcotizacion_producto 
       FROM cotizacion_producto 
       WHERE cotizacion_idcotizacion = ANY($1::int[])`,
      [cotizacionIds]
    );

    const productoIds: number[] = prodRows.map((r: any) => r.idcotizacion_producto);

    // 🔥 Eliminar detalles
    if (productoIds.length > 0) {
      await client.query(
        `DELETE FROM cotizacion_detalle 
         WHERE cotizacion_producto_id = ANY($1::int[])`,
        [productoIds]
      );
    }

    // 🔥 Eliminar productos
    await client.query(
      `DELETE FROM cotizacion_producto 
       WHERE cotizacion_idcotizacion = ANY($1::int[])`,
      [cotizacionIds]
    );

    // 🔥 Eliminar cotización
    await client.query(
      `DELETE FROM cotizacion WHERE no_cotizacion = $1`,
      [id]
    );

    await client.query("COMMIT");
    console.log(`✅ Cotización #${id} eliminada`);
    return res.json({ message: "Cotización eliminada exitosamente" });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ ELIMINAR COTIZACIÓN ERROR:", error.message);
    return res.status(500).json({ error: "Error al eliminar cotización" });
  } finally {
    client.release();
  }
};