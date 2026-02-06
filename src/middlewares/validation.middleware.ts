import { Request, Response, NextFunction } from "express";
import validator from "validator";

// ==========================
// VALIDACIÓN DE LOGIN
// ==========================
export const validateLogin = (req: Request, res: Response, next: NextFunction) => {
  const { codigo } = req.body;

  // Validar que existe
  if (!codigo) {
    return res.status(400).json({ error: "El código es requerido" });
  }

  // Validar que es string
  if (typeof codigo !== "string") {
    return res.status(400).json({ error: "Datos de entrada inválidos" });
  }

  // Sanitizar y validar formato
  const codigoLimpio = codigo.trim().replace(/\D/g, "");
  
  if (!/^\d{5}$/.test(codigoLimpio)) {
    return res.status(400).json({ error: "Datos de entrada inválidos" });
  }

  // Reemplazar en el body
  req.body.codigo = codigoLimpio;

  next();
};

// ==========================
// VALIDACIÓN DE CREAR USUARIO
// ==========================
export const validateCreateUsuario = (req: Request, res: Response, next: NextFunction) => {
  let { nombre, apellido, correo, telefono, codigo, roles_idroles, privilegios } = req.body;

  // Validar campos requeridos
  if (!nombre || !apellido || !correo || !codigo) {
    return res.status(400).json({ 
      error: "Nombre, apellido, correo y código son requeridos" 
    });
  }

  // Validar tipos
  if (typeof nombre !== "string" || typeof apellido !== "string" || typeof correo !== "string") {
    return res.status(400).json({ error: "Datos de entrada inválidos" });
  }

  // Sanitizar nombre
  nombre = validator.escape(nombre.trim());
  if (nombre.length < 2 || nombre.length > 50) {
    return res.status(400).json({ 
      error: "El nombre debe tener entre 2 y 50 caracteres" 
    });
  }
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(nombre)) {
    return res.status(400).json({ 
      error: "El nombre solo puede contener letras" 
    });
  }

  // Sanitizar apellido
  apellido = validator.escape(apellido.trim());
  if (apellido.length < 2 || apellido.length > 50) {
    return res.status(400).json({ 
      error: "El apellido debe tener entre 2 y 50 caracteres" 
    });
  }
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(apellido)) {
    return res.status(400).json({ 
      error: "El apellido solo puede contener letras" 
    });
  }

  // Validar y sanitizar correo
  correo = correo.trim().toLowerCase();
  if (!validator.isEmail(correo)) {
    return res.status(400).json({ 
      error: "El formato del correo no es válido" 
    });
  }
  correo = validator.normalizeEmail(correo) || correo;

  // Validar teléfono (opcional)
  if (telefono) {
    telefono = telefono.toString().replace(/\D/g, "");
    if (!/^[0-9]{10}$/.test(telefono)) {
      return res.status(400).json({ 
        error: "El teléfono debe tener 10 dígitos" 
      });
    }
  }

  // Validar código
  if (typeof codigo !== "string") {
    return res.status(400).json({ error: "Datos de entrada inválidos" });
  }
  codigo = codigo.trim().replace(/\D/g, "");
  if (!/^\d{5}$/.test(codigo)) {
    return res.status(400).json({ error: "Datos de entrada inválidos" });
  }

  // Validar rol
  if (!roles_idroles || !Number.isInteger(Number(roles_idroles)) || Number(roles_idroles) < 1) {
    return res.status(400).json({ 
      error: "Debe seleccionar un rol válido" 
    });
  }

  // Validar privilegios (opcional)
  if (privilegios) {
    if (!Array.isArray(privilegios)) {
      return res.status(400).json({ 
        error: "Los privilegios deben ser un arreglo" 
      });
    }
    const privilegiosValidos = privilegios.every(
      (id: any) => Number.isInteger(Number(id)) && Number(id) > 0
    );
    if (!privilegiosValidos) {
      return res.status(400).json({ 
        error: "Los privilegios deben ser números válidos" 
      });
    }
  }

  // Actualizar body con datos sanitizados
  req.body = {
    nombre,
    apellido,
    correo,
    telefono: telefono || null,
    codigo,
    roles_idroles: Number(roles_idroles),
    privilegios: privilegios || []
  };

  next();
};

// ==========================
// VALIDACIÓN DE ACTUALIZAR USUARIO
// ==========================
export const validateUsuario = (req: Request, res: Response, next: NextFunction) => {
  let { nombre, apellido, correo, telefono, codigo, roles_idroles, privilegios } = req.body;

  // Validar campos requeridos (código es opcional en update)
  if (!nombre || !apellido || !correo) {
    return res.status(400).json({ 
      error: "Nombre, apellido y correo son requeridos" 
    });
  }

  // Validar tipos
  if (typeof nombre !== "string" || typeof apellido !== "string" || typeof correo !== "string") {
    return res.status(400).json({ error: "Datos de entrada inválidos" });
  }

  // Sanitizar nombre
  nombre = validator.escape(nombre.trim());
  if (nombre.length < 2 || nombre.length > 50) {
    return res.status(400).json({ 
      error: "El nombre debe tener entre 2 y 50 caracteres" 
    });
  }
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(nombre)) {
    return res.status(400).json({ 
      error: "El nombre solo puede contener letras" 
    });
  }

  // Sanitizar apellido
  apellido = validator.escape(apellido.trim());
  if (apellido.length < 2 || apellido.length > 50) {
    return res.status(400).json({ 
      error: "El apellido debe tener entre 2 y 50 caracteres" 
    });
  }
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(apellido)) {
    return res.status(400).json({ 
      error: "El apellido solo puede contener letras" 
    });
  }

  // Validar y sanitizar correo
  correo = correo.trim().toLowerCase();
  if (!validator.isEmail(correo)) {
    return res.status(400).json({ 
      error: "El formato del correo no es válido" 
    });
  }
  correo = validator.normalizeEmail(correo) || correo;

  // Validar teléfono (opcional)
  if (telefono) {
    telefono = telefono.toString().replace(/\D/g, "");
    if (!/^[0-9]{10}$/.test(telefono)) {
      return res.status(400).json({ 
        error: "El teléfono debe tener 10 dígitos" 
      });
    }
  }

  // Validar código (opcional en update)
  if (codigo && codigo.trim() !== "") {
    if (typeof codigo !== "string") {
      return res.status(400).json({ error: "Datos de entrada inválidos" });
    }
    codigo = codigo.trim().replace(/\D/g, "");
    if (!/^\d{5}$/.test(codigo)) {
      return res.status(400).json({ error: "Datos de entrada inválidos" });
    }
  }

  // Validar rol
  if (!roles_idroles || !Number.isInteger(Number(roles_idroles)) || Number(roles_idroles) < 1) {
    return res.status(400).json({ 
      error: "Debe seleccionar un rol válido" 
    });
  }

  // Validar privilegios (opcional)
  if (privilegios) {
    if (!Array.isArray(privilegios)) {
      return res.status(400).json({ 
        error: "Los privilegios deben ser un arreglo" 
      });
    }
    const privilegiosValidos = privilegios.every(
      (id: any) => Number.isInteger(Number(id)) && Number(id) > 0
    );
    if (!privilegiosValidos) {
      return res.status(400).json({ 
        error: "Los privilegios deben ser números válidos" 
      });
    }
  }

  // Actualizar body con datos sanitizados
  req.body = {
    nombre,
    apellido,
    correo,
    telefono: telefono || null,
    codigo: codigo || undefined,
    roles_idroles: Number(roles_idroles),
    privilegios: privilegios || []
  };

  next();
};

// ==========================
// VALIDACIÓN DE CREAR CLIENTE
// ==========================
export const validateCreateCliente = (req: Request, res: Response, next: NextFunction) => {
  let {
    empresa,
    correo,
    telefono,
    atencion,
    razon_social,
    impresion,
    celular,
    regimen_fiscal_idregimen_fiscal,
    metodo_pago_idmetodo_pago,
    forma_pago_idforma_pago,
    rfc,
    correo_facturacion,
    uso_cfdi,
    moneda,
    domicilio,
    numero,
    colonia,
    codigo_postal,
    poblacion,
    estado,
  } = req.body;

  // Validar campos requeridos
  if (!empresa || !correo) {
    return res.status(400).json({
      error: "Empresa y correo son requeridos",
    });
  }

  // Validar tipos
  if (typeof empresa !== "string" || typeof correo !== "string") {
    return res.status(400).json({ error: "Datos de entrada inválidos" });
  }

  // Sanitizar y validar empresa
  empresa = validator.escape(empresa.trim());
  if (empresa.length < 2 || empresa.length > 128) {
    return res.status(400).json({
      error: "La empresa debe tener entre 2 y 128 caracteres",
    });
  }

  // Validar y sanitizar correo
  correo = correo.trim().toLowerCase();
  if (!validator.isEmail(correo)) {
    return res.status(400).json({
      error: "El formato del correo no es válido",
    });
  }
  correo = validator.normalizeEmail(correo) || correo;

  // Validar teléfono (opcional)
  if (telefono) {
    telefono = telefono.toString().replace(/\D/g, "");
    if (telefono.length > 0 && (telefono.length < 10 || telefono.length > 15)) {
      return res.status(400).json({
        error: "El teléfono debe tener entre 10 y 15 dígitos",
      });
    }
  }

  // Validar celular (opcional)
  if (celular) {
    celular = celular.toString().replace(/\D/g, "");
    if (celular.length > 0 && (celular.length < 10 || celular.length > 15)) {
      return res.status(400).json({
        error: "El celular debe tener entre 10 y 15 dígitos",
      });
    }
  }

  // Validar atención (opcional)
  if (atencion) {
    atencion = validator.escape(atencion.trim());
    if (atencion.length > 128) {
      return res.status(400).json({
        error: "El campo atención no puede exceder 128 caracteres",
      });
    }
  }

  // Validar razón social (opcional)
  if (razon_social) {
    razon_social = validator.escape(razon_social.trim());
    if (razon_social.length > 128) {
      return res.status(400).json({
        error: "La razón social no puede exceder 128 caracteres",
      });
    }
  }

  // Validar impresión (opcional)
  if (impresion) {
    impresion = validator.escape(impresion.trim());
    if (impresion.length > 128) {
      return res.status(400).json({
        error: "El campo impresión no puede exceder 128 caracteres",
      });
    }
  }

  // Validar régimen fiscal (requerido)
  if (
    !regimen_fiscal_idregimen_fiscal ||
    !Number.isInteger(Number(regimen_fiscal_idregimen_fiscal)) ||
    Number(regimen_fiscal_idregimen_fiscal) < 1
  ) {
    return res.status(400).json({
      error: "Debe seleccionar un régimen fiscal válido",
    });
  }

  // Validar método de pago (requerido)
  if (
    !metodo_pago_idmetodo_pago ||
    !Number.isInteger(Number(metodo_pago_idmetodo_pago)) ||
    Number(metodo_pago_idmetodo_pago) < 1
  ) {
    return res.status(400).json({
      error: "Debe seleccionar un método de pago válido",
    });
  }

  // Validar forma de pago (requerido)
  if (
    !forma_pago_idforma_pago ||
    !Number.isInteger(Number(forma_pago_idforma_pago)) ||
    Number(forma_pago_idforma_pago) < 1
  ) {
    return res.status(400).json({
      error: "Debe seleccionar una forma de pago válida",
    });
  }

  // Validar RFC (opcional)
  if (rfc) {
    rfc = validator.escape(rfc.trim().toUpperCase());
    // RFC genérico: 12-13 caracteres alfanuméricos
    if (!/^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(rfc)) {
      return res.status(400).json({
        error: "El formato del RFC no es válido",
      });
    }
  }

  // Validar correo de facturación (opcional)
  if (correo_facturacion) {
    correo_facturacion = correo_facturacion.trim().toLowerCase();
    if (!validator.isEmail(correo_facturacion)) {
      return res.status(400).json({
        error: "El formato del correo de facturación no es válido",
      });
    }
    correo_facturacion = validator.normalizeEmail(correo_facturacion) || correo_facturacion;
  }

  // Validar uso CFDI (opcional)
  if (uso_cfdi) {
    uso_cfdi = validator.escape(uso_cfdi.trim());
    if (uso_cfdi.length > 128) {
      return res.status(400).json({
        error: "El uso de CFDI no puede exceder 128 caracteres",
      });
    }
  }

  // Validar moneda (opcional)
  if (moneda) {
    moneda = validator.escape(moneda.trim().toUpperCase());
    if (moneda.length > 128) {
      return res.status(400).json({
        error: "La moneda no puede exceder 128 caracteres",
      });
    }
  }

  // Validar moneda (opcional)
  if (moneda) {
    moneda = validator.escape(moneda.trim().toUpperCase());
    if (moneda.length > 128) {
      return res.status(400).json({
        error: "La moneda no puede exceder 128 caracteres",
      });
    }
  }

  // Validar moneda (opcional)
  if (moneda) {
    moneda = validator.escape(moneda.trim().toUpperCase());
    if (moneda.length > 128) {
      return res.status(400).json({
        error: "La moneda no puede exceder 128 caracteres",
      });
    }
  }

  // Validar datos de domicilio (opcionales)
  if (domicilio) {
    domicilio = validator.escape(domicilio.trim());
    if (domicilio.length > 128) {
      return res.status(400).json({
        error: "El domicilio no puede exceder 128 caracteres",
      });
    }
  }

  if (numero) {
    numero = validator.escape(numero.trim());
    if (numero.length > 128) {
      return res.status(400).json({
        error: "El número no puede exceder 128 caracteres",
      });
    }
  }

  if (colonia) {
    colonia = validator.escape(colonia.trim());
    if (colonia.length > 128) {
      return res.status(400).json({
        error: "La colonia no puede exceder 128 caracteres",
      });
    }
  }

  if (codigo_postal) {
    codigo_postal = validator.escape(codigo_postal.trim());
    if (!/^\d{5}$/.test(codigo_postal)) {
      return res.status(400).json({
        error: "El código postal debe tener 5 dígitos",
      });
    }
  }

  if (poblacion) {
    poblacion = validator.escape(poblacion.trim());
    if (poblacion.length > 128) {
      return res.status(400).json({
        error: "La población no puede exceder 128 caracteres",
      });
    }
  }

  if (estado) {
    estado = validator.escape(estado.trim());
    if (estado.length > 128) {
      return res.status(400).json({
        error: "El estado no puede exceder 128 caracteres",
      });
    }
  }

  // Actualizar body con datos sanitizados
  req.body = {
    empresa,
    correo,
    telefono: telefono || null,
    atencion: atencion || null,
    razon_social: razon_social || null,
    impresion: impresion || null,
    celular: celular || null,
    regimen_fiscal_idregimen_fiscal: Number(regimen_fiscal_idregimen_fiscal),
    metodo_pago_idmetodo_pago: Number(metodo_pago_idmetodo_pago),
    forma_pago_idforma_pago: Number(forma_pago_idforma_pago),
    rfc: rfc || null,
    correo_facturacion: correo_facturacion || null,
    uso_cfdi: uso_cfdi || null,
    moneda: moneda || null,
    domicilio: domicilio || null,
    numero: numero || null,
    colonia: colonia || null,
    codigo_postal: codigo_postal || null,
    poblacion: poblacion || null,
    estado: estado || null,
  };

  next();
};

// ==========================
// VALIDACIÓN DE ACTUALIZAR CLIENTE
// ==========================
export const validateUpdateCliente = (req: Request, res: Response, next: NextFunction) => {
  // Usa la misma validación que crear cliente
  validateCreateCliente(req, res, next);
};

// ==========================
// VALIDACIÓN DE ID EN PARAMS
// ==========================
export const validateId = (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;

  if (!id || !Number.isInteger(Number(id)) || Number(id) < 1) {
    return res.status(400).json({ error: "ID inválido" });
  }

  next();
};

// ==========================
// PROTECCIÓN CONTRA SQL INJECTION
// ==========================
export const preventSQLInjection = (req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    /(\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\bunion\b|\bexec\b)/gi,
    /('|"|\b(or|and)\b.*=)/gi,
    /(--|;|\/\*|\*\/)/g,
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === "string") {
      return suspiciousPatterns.some((pattern) => pattern.test(value));
    }
    if (typeof value === "object" && value !== null) {
      return Object.values(value).some((v) => checkValue(v));
    }
    return false;
  };

  if (checkValue(req.body) || checkValue(req.query) || checkValue(req.params)) {
    return res.status(400).json({ 
      error: "Entrada no permitida" 
    });
  }

  next();
};

// ==========================
// SANITIZACIÓN GENERAL
// ==========================
export const sanitizeInput = (input: string): string => {
  if (typeof input !== "string") return "";
  
  let sanitized = validator.escape(input);
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  
  return sanitized;
};