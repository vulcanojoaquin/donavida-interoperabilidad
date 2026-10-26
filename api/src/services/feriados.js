// TP3: feriados nacionales de Argentina con Nager.Date (https://date.nager.at), gratis y sin clave.
// Lo usa la agenda del hospital para avisar cuando se abre una franja en un día feriado.
// - Los feriados de un año no cambian: se guardan en memoria por año y la API se consulta una sola vez.
// - Un fallo no se guarda: la próxima consulta vuelve a intentar.
// - esFeriado distingue false ("verifiqué y no es feriado") de null ("no pude verificar").
const URL_NAGER = 'https://date.nager.at/api/v3/PublicHolidays';
const PAIS = 'AR';
const TIEMPO_MAXIMO = 5000;

// Año → promesa con la lista de feriados. Se guarda la promesa y no la lista para que dos pedidos
// simultáneos del mismo año compartan una sola consulta.
const cache = new Map();

// Lo que devuelve Nager.Date, en el formato de DonaVida (localName es el nombre en español)
function convertir(feriado) {
  return { fecha: feriado.date, nombre: feriado.localName };
}

async function consultar(anio) {
  try {
    const respuesta = await fetch(`${URL_NAGER}/${anio}/${PAIS}`, { signal: AbortSignal.timeout(TIEMPO_MAXIMO) });
    if (!respuesta.ok) return null;

    const feriados = await respuesta.json();
    if (!Array.isArray(feriados)) return null; // respuesta inesperada
    return feriados.map(convertir);
  } catch {
    return null; // sin conexión, tiempo agotado o JSON inválido
  }
}

// Lista de feriados del año [{ fecha: 'YYYY-MM-DD', nombre }], o null si Nager.Date no respondió
async function feriadosDelAnio(anio) {
  if (!cache.has(anio)) {
    const consulta = consultar(anio).then((feriados) => {
      if (feriados === null) cache.delete(anio); // solo se guarda lo que respondió Nager.Date, nunca un fallo
      return feriados;
    });
    cache.set(anio, consulta);
  }
  return cache.get(anio);
}

// fecha en formato YYYY-MM-DD → { esFeriado: true, nombre } | { esFeriado: false } | { esFeriado: null }
async function consultarFecha(fecha) {
  const feriados = await feriadosDelAnio(Number(fecha.slice(0, 4)));
  if (feriados === null) return { esFeriado: null };

  const feriado = feriados.find((f) => f.fecha === fecha);
  return feriado ? { esFeriado: true, nombre: feriado.nombre } : { esFeriado: false };
}

// true si es feriado, false si no lo es, null si no se pudo verificar
async function esFeriado(fecha) {
  return (await consultarFecha(fecha)).esFeriado;
}

module.exports = { feriadosDelAnio, esFeriado, consultarFecha };
