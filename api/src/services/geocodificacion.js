// TP3: coordenadas (latitud y longitud) a partir de una dirección, con Nominatim, el buscador de OpenStreetMap.
// Cumple la política de uso de Nominatim (https://operations.osmfoundation.org/policies/nominatim/):
// - como máximo 1 consulta por segundo para toda la aplicación (una fila de consultas),
// - un User-Agent que identifica a DonaVida (el que manda Node por defecto no se acepta),
// - guarda en caché lo que ya buscó, para no repetir la misma consulta,
// - se puede apagar sin tocar el código: GEOCODIFICACION_DESACTIVADA=true en api/.env.
// Si Nominatim no responde, tarda o contesta algo inesperado, devuelve null y las coordenadas se cargan a mano.
const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'DonaVida/1.0 (proyecto academico UNCo; https://github.com/vulcanojoaquin/donavida-interoperabilidad)';
const ESPERA_ENTRE_CONSULTAS = 1100; // un poco más de 1 segundo, para no quedar justo en el límite
const TIEMPO_MAXIMO = 5000;

// Direcciones ya buscadas → lo que respondió Nominatim (null si no la encontró)
const cache = new Map();

// Fila de consultas: cada una espera a que termine el turno de la anterior y a que pase el tiempo mínimo
let fila = Promise.resolve();
let ultimaConsulta = 0;

function esperarTurno() {
  fila = fila.then(async () => {
    const espera = ultimaConsulta + ESPERA_ENTRE_CONSULTAS - Date.now();
    if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
    ultimaConsulta = Date.now();
  });
  return fila;
}

// Lo que devuelve Nominatim, en el formato de DonaVida.
// place_rank dice qué encontró: de 28 a 30, un número de calle o un lugar puntual (como un hospital);
// menos de 28, solo la calle o la zona, así que la ubicación es aproximada.
function convertir(lugar) {
  return {
    lat: Number(Number(lugar.lat).toFixed(6)), // 6 decimales, como las guarda la base
    lon: Number(Number(lugar.lon).toFixed(6)),
    direccionNormalizada: lugar.display_name,
    precision: lugar.place_rank >= 28 ? 'exacta' : 'aproximada',
  };
}

async function geocodificar(direccion) {
  const texto = String(direccion ?? '').trim();
  if (!texto || process.env.GEOCODIFICACION_DESACTIVADA === 'true') return null;

  // La misma dirección aunque cambien mayúsculas o espacios
  const clave = texto.toLowerCase().replace(/\s+/g, ' ');
  if (cache.has(clave)) return cache.get(clave);

  await esperarTurno();
  try {
    const parametros = new URLSearchParams({ q: texto, format: 'jsonv2', limit: '1', countrycodes: 'ar' });
    const respuesta = await fetch(`${URL_NOMINATIM}?${parametros}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIEMPO_MAXIMO),
    });
    if (!respuesta.ok) return null;

    const lugares = await respuesta.json();
    if (!Array.isArray(lugares)) return null; // respuesta inesperada

    const resultado = lugares.length > 0 ? convertir(lugares[0]) : null;
    cache.set(clave, resultado); // solo se guarda lo que respondió Nominatim, nunca un fallo
    return resultado;
  } catch {
    return null; // sin conexión, tiempo agotado o JSON inválido
  }
}

module.exports = { geocodificar };
