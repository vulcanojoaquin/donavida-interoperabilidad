// TP3: feriados de Argentina con Nager.Date. Los usa la agenda del hospital para avisar cuando
// se abre una franja en un día feriado. Es pública: son datos públicos y no dependen del usuario.
const { Router } = require('express');
const { feriadosDelAnio, consultarFecha } = require('../services/feriados');
const { datosInvalidos } = require('../utils/validaciones');

const router = Router();

const ANIO_MINIMO = 2000;
const ANIO_MAXIMO = 2100;

function esAnioValido(texto) {
  if (typeof texto !== 'string' || !/^\d{4}$/.test(texto)) return false;
  const anio = Number(texto);
  return anio >= ANIO_MINIMO && anio <= ANIO_MAXIMO;
}

// YYYY-MM-DD y una fecha que existe (2026-02-30 no)
function esFechaValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T12:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto && esAnioValido(texto.slice(0, 4));
}

// GET /api/feriados?anio=2026
router.get('/', async (req, res) => {
  if (!esAnioValido(req.query.anio)) {
    return datosInvalidos(res, `Falta el año (?anio=), entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}`);
  }

  const feriados = await feriadosDelAnio(Number(req.query.anio));
  // Que Nager.Date no responda no es un error del sistema: 200 con disponible: false
  res.json(feriados ? { disponible: true, feriados } : { disponible: false, feriados: [] });
});

// GET /api/feriados/es-feriado?fecha=2026-12-25
router.get('/es-feriado', async (req, res) => {
  if (!esFechaValida(req.query.fecha)) {
    return datosInvalidos(res, 'Falta la fecha (?fecha=) en formato AAAA-MM-DD');
  }

  // esFeriado: null significa "no se pudo verificar"; siempre 200
  res.json(await consultarFecha(req.query.fecha));
});

module.exports = router;
