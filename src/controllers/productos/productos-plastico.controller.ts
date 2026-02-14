import { Request, Response } from "express";
import { pool } from "../../config/db";

// ==========================
// CREAR PRODUCTO PLÁSTICO
// ==========================
export const createProductoPlastico = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const {
      tipo_producto_plastico_id,
      material_plastico_id,
      calibre_id,
      altura,
      ancho,
      fuelle_fondo,
      fuelle_latIz,
      fuelle_latDe,
      refuerzo,
      medida,
      por_kilo,
    } = req.body;

    console.log("📝 Creando nuevo producto plástico:", { medida, por_kilo });

    await client.query("BEGIN");

    // Verificar que existan los IDs de catálogos
    const [tipoProducto, material, calibre] = await Promise.all([
      client.query(
        "SELECT 1 FROM tipo_producto_plastico WHERE idtipo_producto_plastico = $1",
        [tipo_producto_plastico_id]
      ),
      client.query(
        "SELECT 1 FROM material_plastico WHERE idmaterial_plastico = $1",
        [material_plastico_id]
      ),
      client.query("SELECT 1 FROM calibre WHERE idcalibre = $1", [calibre_id]),
    ]);

    if ((tipoProducto.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El tipo de producto seleccionado no existe",
      });
    }

    if ((material.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El material seleccionado no existe",
      });
    }

    if ((calibre.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El calibre seleccionado no existe",
      });
    }

    // Insertar producto
    const result = await client.query(
      `INSERT INTO configuracion_plastico (
        material_plastico_plastico_idmaterial_plastico,
        tipo_producto_plastico_plastico_idtipo_producto_plastico,
        calibre_idcalibre,
        altura,
        fuelle_fondo,
        refuerzo,
        ancho,
        fuelle_latIz,
        fuelle_latDe,
        medida,
        por_kilo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING idconfiguracion_plastico, medida, por_kilo`,
      [
        material_plastico_id,
        tipo_producto_plastico_id,
        calibre_id,
        altura,
        fuelle_fondo || 0,
        refuerzo || 0,
        ancho,
        fuelle_latIz || 0,
        fuelle_latDe || 0,
        medida,
        por_kilo,
      ]
    );

    const nuevoProducto = result.rows[0];

    await client.query("COMMIT");

    console.log("✅ Producto plástico creado:", nuevoProducto.idconfiguracion_plastico);

    res.status(201).json({
      message: "Producto creado exitosamente",
      producto: {
        id: nuevoProducto.idconfiguracion_plastico,
        medida: nuevoProducto.medida,
        por_kilo: nuevoProducto.por_kilo,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ CREATE PRODUCTO PLÁSTICO ERROR:", error.message);
    res.status(500).json({
      error: "Error al procesar la solicitud",
    });
  } finally {
    client.release();
  }
};

// ==========================
// OBTENER TODOS LOS PRODUCTOS
// ==========================
export const getProductosPlastico = async (req: Request, res: Response) => {
  try {
    console.log("📋 Obteniendo todos los productos plástico");

    const result = await pool.query(`
      SELECT 
        cp.idconfiguracion_plastico as id,
        cp.altura,
        cp.fuelle_fondo,
        cp.refuerzo,
        cp.ancho,
        cp.fuelle_latIz as fuelle_lateral_izquierdo,
        cp.fuelle_latDe as fuelle_lateral_derecho,
        cp.medida,
        cp.por_kilo,
        tpp.material_plastico_producto as tipo_producto,
        mp.tipo_material as material,
        c.calibre
      FROM configuracion_plastico cp
      INNER JOIN tipo_producto_plastico tpp 
        ON cp.tipo_producto_plastico_plastico_idtipo_producto_plastico = tpp.idtipo_producto_plastico
      INNER JOIN material_plastico mp 
        ON cp.material_plastico_plastico_idmaterial_plastico = mp.idmaterial_plastico
      INNER JOIN calibre c 
        ON cp.calibre_idcalibre = c.idcalibre
      ORDER BY cp.idconfiguracion_plastico DESC
      LIMIT 1000
    `);

    console.log(`✅ ${result.rows.length} productos obtenidos`);

    res.json(result.rows);
  } catch (error: any) {
    console.error("❌ GET PRODUCTOS PLÁSTICO ERROR:", error.message);
    res.status(500).json({
      error: "Error al obtener productos",
    });
  }
};

// ==========================
// OBTENER PRODUCTO POR ID
// ==========================
export const getProductoPlasticoById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log("🔍 Obteniendo producto plástico:", id);

    const result = await pool.query(
      `
      SELECT 
        cp.idconfiguracion_plastico as id,
        cp.altura,
        cp.fuelle_fondo,
        cp.refuerzo,
        cp.ancho,
        cp.fuelle_latIz as fuelle_lateral_izquierdo,
        cp.fuelle_latDe as fuelle_lateral_derecho,
        cp.medida,
        cp.por_kilo,
        cp.tipo_producto_plastico_plastico_idtipo_producto_plastico as tipo_producto_id,
        cp.material_plastico_plastico_idmaterial_plastico as material_id,
        cp.calibre_idcalibre as calibre_id,
        tpp.material_plastico_producto as tipo_producto,
        mp.tipo_material as material,
        c.calibre
      FROM configuracion_plastico cp
      INNER JOIN tipo_producto_plastico tpp 
        ON cp.tipo_producto_plastico_plastico_idtipo_producto_plastico = tpp.idtipo_producto_plastico
      INNER JOIN material_plastico mp 
        ON cp.material_plastico_plastico_idmaterial_plastico = mp.idmaterial_plastico
      INNER JOIN calibre c 
        ON cp.calibre_idcalibre = c.idcalibre
      WHERE cp.idconfiguracion_plastico = $1
      LIMIT 1
    `,
      [id]
    );

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({
        error: "Producto no encontrado",
      });
    }

    console.log("✅ Producto obtenido:", result.rows[0].medida);

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error("❌ GET PRODUCTO BY ID ERROR:", error.message);
    res.status(500).json({
      error: "Error al obtener producto",
    });
  }
};

// ==========================
// ACTUALIZAR PRODUCTO
// ==========================
export const updateProductoPlastico = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const {
      tipo_producto_plastico_id,
      material_plastico_id,
      calibre_id,
      altura,
      ancho,
      fuelle_fondo,
      fuelle_latIz,
      fuelle_latDe,
      refuerzo,
      medida,
      por_kilo,
    } = req.body;

    console.log("📝 Actualizando producto plástico:", id);

    await client.query("BEGIN");

    // Verificar que el producto existe
    const productoExiste = await client.query(
      "SELECT 1 FROM configuracion_plastico WHERE idconfiguracion_plastico = $1",
      [id]
    );

    if ((productoExiste.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Producto no encontrado",
      });
    }

    // Verificar que existan los IDs de catálogos
    const [tipoProducto, material, calibre] = await Promise.all([
      client.query(
        "SELECT 1 FROM tipo_producto_plastico WHERE idtipo_producto_plastico = $1",
        [tipo_producto_plastico_id]
      ),
      client.query(
        "SELECT 1 FROM material_plastico WHERE idmaterial_plastico = $1",
        [material_plastico_id]
      ),
      client.query("SELECT 1 FROM calibre WHERE idcalibre = $1", [calibre_id]),
    ]);

    if ((tipoProducto.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El tipo de producto seleccionado no existe",
      });
    }

    if ((material.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El material seleccionado no existe",
      });
    }

    if ((calibre.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El calibre seleccionado no existe",
      });
    }

    // Actualizar producto
    const result = await client.query(
      `UPDATE configuracion_plastico 
       SET 
         material_plastico_plastico_idmaterial_plastico = $1,
         tipo_producto_plastico_plastico_idtipo_producto_plastico = $2,
         calibre_idcalibre = $3,
         altura = $4,
         fuelle_fondo = $5,
         refuerzo = $6,
         ancho = $7,
         fuelle_latIz = $8,
         fuelle_latDe = $9,
         medida = $10,
         por_kilo = $11
       WHERE idconfiguracion_plastico = $12
       RETURNING idconfiguracion_plastico, medida, por_kilo`,
      [
        material_plastico_id,
        tipo_producto_plastico_id,
        calibre_id,
        altura,
        fuelle_fondo || 0,
        refuerzo || 0,
        ancho,
        fuelle_latIz || 0,
        fuelle_latDe || 0,
        medida,
        por_kilo,
        id,
      ]
    );

    const productoActualizado = result.rows[0];

    await client.query("COMMIT");

    console.log("✅ Producto actualizado:", productoActualizado.idconfiguracion_plastico);

    res.json({
      message: "Producto actualizado exitosamente",
      producto: {
        id: productoActualizado.idconfiguracion_plastico,
        medida: productoActualizado.medida,
        por_kilo: productoActualizado.por_kilo,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ UPDATE PRODUCTO PLÁSTICO ERROR:", error.message);
    res.status(500).json({
      error: "Error al procesar la solicitud",
    });
  } finally {
    client.release();
  }
};

// ==========================
// ELIMINAR PRODUCTO
// ==========================
export const deleteProductoPlastico = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    console.log("🗑️ Eliminando producto plástico:", id);

    await client.query("BEGIN");

    // Verificar que el producto existe
    const productoExiste = await client.query(
      "SELECT medida FROM configuracion_plastico WHERE idconfiguracion_plastico = $1",
      [id]
    );

    if ((productoExiste.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Producto no encontrado",
      });
    }

    const medida = productoExiste.rows[0].medida;

    // Eliminar producto
    await client.query(
      "DELETE FROM configuracion_plastico WHERE idconfiguracion_plastico = $1",
      [id]
    );

    await client.query("COMMIT");

    console.log("✅ Producto eliminado:", medida);

    res.json({
      message: "Producto eliminado exitosamente",
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ DELETE PRODUCTO PLÁSTICO ERROR:", error.message);
    res.status(500).json({
      error: "Error al procesar la solicitud",
    });
  } finally {
    client.release();
  }
};