// TP3: distancia por calle entre la institución y cada donante, con OpenRouteService (ORS).
// La distancia en línea recta (distancia.js, Haversine) sigue siendo la que ordena la convocatoria:
// esta se muestra al lado, como dato extra para el hospital.
// Cumple el plan gratuito de ORS (https://openrouteservice.org/plans/):
// - una sola consulta al endpoint de matriz para todos los candidatos, nunca una por donante,
// - como máximo 3500 pares origen-destino por consulta (con un origen, 3500 donantes),
// - la clave va en api/.env (ORS_API_KEY). Sin clave no consulta nada.
// Si ORS no responde, tarda o contesta algo inesperado, devuelve null para cada destino y la convocatoria
// muestra solo la distancia en línea recta, como antes del TP3.
const URL_MATRIZ = 'https://api.openrouteservice.org/v2/matrix/driving-car';
const TIEMPO_MAXIMO = 6000;
const MAXIMO_DESTINOS = 3500;

// { lat, lon } → [lon, lat]: ORS pide primero la longitud
const aCoordenadaOrs = (punto) => [Number(punto.lon), Number(punto.lat)];

// Kilómetros por calle desde el origen hasta cada destino, en el mismo orden que los destinos.
// origen y cada destino: { lat, lon }. Un destino sin camino posible (por ejemplo, del otro lado del mar) da null.
async function distanciasPorCalle(origen, destinos) {
  const sinDatos = destinos.map(() => null);
  const clave = process.env.ORS_API_KEY?.trim();
  if (!clave || destinos.length === 0 || destinos.length > MAXIMO_DESTINOS) return sinDatos;

  try {
    const respuesta = await fetch(URL_MATRIZ, {
      method: 'POST',
      headers: { Authorization: clave, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        locations: [aCoordenadaOrs(origen), ...destinos.map(aCoordenadaOrs)],
        sources: [0], // la institución
        destinations: destinos.map((_, i) => i + 1), // los donantes
        metrics: ['distance'],
        units: 'km',
      }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO),
    });
    if (!respuesta.ok) return sinDatos;

    const { distances } = await respuesta.json();
    const fila = distances?.[0]; // una fila por origen: acá hay uno solo
    if (!Array.isArray(fila) || fila.length !== destinos.length) return sinDatos; // respuesta inesperada

    // 2 decimales, como la distancia en línea recta
    return fila.map((km) => (typeof km === 'number' ? Math.round(km * 100) / 100 : null));
  } catch {
    return sinDatos; // sin conexión, tiempo agotado o JSON inválido
  }
}

module.exports = { distanciasPorCalle };
