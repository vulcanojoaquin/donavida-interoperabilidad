// TP3: coordenadas de una dirección, con Nominatim (OpenStreetMap). Lo usa el botón "Buscar coordenadas"
// del formulario de alta de institución. Es pública porque ese formulario no recibe el token;
// el límite de 1 consulta por segundo del servicio la protege igual.
const { Router } = require('express');
const { geocodificar } = require('../services/geocodificacion');
const { datosInvalidos } = require('../utils/validaciones');

const router = Router();

const LARGO_MAXIMO = 200;

// GET /api/geocodificar?direccion=Av. Argentina 1200, Neuquén
router.get('/', async (req, res) => {
  const direccion = typeof req.query.direccion === 'string' ? req.query.direccion.trim() : '';
  if (!direccion || direccion.length > LARGO_MAXIMO) {
    return datosInvalidos(res, `Falta la dirección a buscar (?direccion=), de hasta ${LARGO_MAXIMO} caracteres`);
  }

  const resultado = await geocodificar(direccion);
  // No encontrar una dirección, o que Nominatim no responda, no es un error del sistema: siempre 200
  res.json(resultado ? { encontrado: true, ...resultado } : { encontrado: false });
});

module.exports = router;
