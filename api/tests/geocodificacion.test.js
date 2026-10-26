// TP3: búsqueda de coordenadas con Nominatim. fetch está simulado: los tests nunca llaman a la API real.
const request = require('supertest');

jest.mock('../src/lib/prisma', () => ({}));

// Lo que devuelve Nominatim (formato jsonv2), recortado a los campos que se usan
const HOSPITAL = {
  lat: '-38.9502031',
  lon: '-68.0569109',
  display_name: 'Hospital Provincial Neuquén "Doctor Eduardo Castro Rendón", 450, Buenos Aires, Neuquén, Argentina',
  place_rank: 30, // un lugar puntual: precisión exacta
};
const SOLO_CALLE = {
  lat: '-38.9523725',
  lon: '-68.0589942',
  display_name: 'Avenida Argentina, Neuquén, Argentina',
  place_rank: 26, // solo la calle: precisión aproximada
};

// Una respuesta de fetch con el cuerpo y el estado indicados
const respuesta = (cuerpo, status = 200) => ({ ok: status === 200, status, json: async () => cuerpo });

let app;
let geocodificar;
let fetchSimulado;

beforeEach(() => {
  // Módulos recién cargados en cada test: la caché y la fila de consultas arrancan vacías
  jest.resetModules();
  app = require('../src/app');
  ({ geocodificar } = require('../src/services/geocodificacion'));
  // Si un test no dice qué responde fetch, falla: nunca sale una consulta real
  fetchSimulado = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch no simulado'));
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GEOCODIFICACION_DESACTIVADA;
});

const buscar = (direccion) => request(app).get('/api/geocodificar').query({ direccion });

describe('GET /api/geocodificar', () => {
  test('encuentra un hospital: coordenadas con 6 decimales y precisión exacta', async () => {
    fetchSimulado.mockResolvedValue(respuesta([HOSPITAL]));
    const res = await buscar('Hospital Castro Rendón, Neuquén');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      encontrado: true,
      lat: -38.950203,
      lon: -68.056911,
      direccionNormalizada: HOSPITAL.display_name,
      precision: 'exacta',
    });
  });

  test('le pide a Nominatim un resultado, solo de Argentina, con el User-Agent de DonaVida', async () => {
    fetchSimulado.mockResolvedValue(respuesta([HOSPITAL]));
    await buscar('Hospital Castro Rendón, Neuquén');

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchSimulado.mock.calls[0];
    const parametros = new URL(url).searchParams;
    expect(parametros.get('q')).toBe('Hospital Castro Rendón, Neuquén');
    expect(parametros.get('countrycodes')).toBe('ar');
    expect(parametros.get('limit')).toBe('1');
    expect(opciones.headers['User-Agent']).toMatch(/^DonaVida\//);
    expect(opciones.signal).toBeInstanceOf(AbortSignal); // con tiempo máximo
  });

  test('si solo encuentra la calle, la precisión es aproximada', async () => {
    fetchSimulado.mockResolvedValue(respuesta([SOLO_CALLE]));
    const res = await buscar('Av. Argentina 1200, Neuquén');

    expect(res.body).toMatchObject({ encontrado: true, precision: 'aproximada' });
  });

  test('si Nominatim no encuentra nada, responde 200 con encontrado: false', async () => {
    fetchSimulado.mockResolvedValue(respuesta([]));
    const res = await buscar('Calle que no existe 123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ encontrado: false });
  });

  test('si Nominatim está caído, responde 200 con encontrado: false (no es un error del sistema)', async () => {
    fetchSimulado.mockRejectedValue(new TypeError('fetch failed'));
    const res = await buscar('Hospital Castro Rendón, Neuquén');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ encontrado: false });
  });

  test('si Nominatim responde con un error HTTP, también encontrado: false', async () => {
    fetchSimulado.mockResolvedValue(respuesta({ error: 'Servicio no disponible' }, 503));
    const res = await buscar('Hospital Castro Rendón, Neuquén');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ encontrado: false });
  });

  test('sin dirección, vacía o demasiado larga responde 400 y no consulta a Nominatim', async () => {
    const sinDireccion = await request(app).get('/api/geocodificar');
    const vacia = await buscar('   ');
    const larga = await buscar('a'.repeat(201));

    for (const res of [sinDireccion, vacia, larga]) {
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    }
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  test('con GEOCODIFICACION_DESACTIVADA=true no consulta a Nominatim', async () => {
    process.env.GEOCODIFICACION_DESACTIVADA = 'true';
    const res = await buscar('Hospital Castro Rendón, Neuquén');

    expect(res.body).toEqual({ encontrado: false });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});

describe('Política de uso de Nominatim', () => {
  test('caché: la misma dirección, aunque cambien mayúsculas o espacios, se consulta una sola vez', async () => {
    fetchSimulado.mockResolvedValue(respuesta([HOSPITAL]));
    const primera = await geocodificar('Hospital Castro Rendón, Neuquén');
    const segunda = await geocodificar('  hospital castro rendón,   neuquén ');

    expect(segunda).toEqual(primera);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  test('un fallo no queda en la caché: la vez siguiente vuelve a consultar', async () => {
    fetchSimulado.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(respuesta([HOSPITAL]));

    expect(await geocodificar('Hospital Castro Rendón, Neuquén')).toBeNull();
    expect(await geocodificar('Hospital Castro Rendón, Neuquén')).toMatchObject({ precision: 'exacta' });
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  test('como máximo una consulta por segundo, aunque lleguen dos juntas', async () => {
    const momentos = [];
    fetchSimulado.mockImplementation(async () => {
      momentos.push(Date.now());
      return respuesta([HOSPITAL]);
    });
    await Promise.all([geocodificar('Sede Cipolletti'), geocodificar('Sede Plottier')]);

    expect(momentos).toHaveLength(2);
    expect(momentos[1] - momentos[0]).toBeGreaterThanOrEqual(1000);
  });
});
