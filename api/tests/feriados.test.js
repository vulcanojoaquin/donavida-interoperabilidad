// TP3: feriados de Argentina con Nager.Date. fetch está simulado: los tests nunca llaman a la API real.
const request = require('supertest');

jest.mock('../src/lib/prisma', () => ({}));

// Lo que devuelve Nager.Date para AR, recortado a dos feriados y a los campos que importan
const FERIADOS_2026 = [
  { date: '2026-07-09', localName: 'Día de la Independencia', name: 'Independence Day', countryCode: 'AR' },
  { date: '2026-12-25', localName: 'Navidad', name: 'Christmas Day', countryCode: 'AR' },
];

// Una respuesta de fetch con el cuerpo y el estado indicados
const respuesta = (cuerpo, status = 200) => ({ ok: status === 200, status, json: async () => cuerpo });

let app;
let esFeriado;
let fetchSimulado;

beforeEach(() => {
  // Módulos recién cargados en cada test: la caché arranca vacía
  jest.resetModules();
  app = require('../src/app');
  ({ esFeriado } = require('../src/services/feriados'));
  // Si un test no dice qué responde fetch, falla: nunca sale una consulta real
  fetchSimulado = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch no simulado'));
});

afterEach(() => {
  jest.restoreAllMocks();
});

const consultar = (fecha) => request(app).get('/api/feriados/es-feriado').query({ fecha });

describe('GET /api/feriados/es-feriado', () => {
  test('una fecha feriada devuelve true y el nombre en español', async () => {
    fetchSimulado.mockResolvedValue(respuesta(FERIADOS_2026));
    const res = await consultar('2026-12-25');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ esFeriado: true, nombre: 'Navidad' });
  });

  test('le pide a Nager.Date los feriados de Argentina del año de la fecha, con tiempo máximo', async () => {
    fetchSimulado.mockResolvedValue(respuesta(FERIADOS_2026));
    await consultar('2026-12-25');

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchSimulado.mock.calls[0];
    expect(url).toBe('https://date.nager.at/api/v3/PublicHolidays/2026/AR');
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  test('una fecha común devuelve false', async () => {
    fetchSimulado.mockResolvedValue(respuesta(FERIADOS_2026));
    const res = await consultar('2026-12-23');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ esFeriado: false });
  });

  test('con Nager.Date caído responde 200 con esFeriado: null (no pudo verificar)', async () => {
    fetchSimulado.mockRejectedValue(new TypeError('fetch failed'));
    const res = await consultar('2026-12-25');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ esFeriado: null });
  });

  test('si Nager.Date responde un error HTTP, también es null', async () => {
    fetchSimulado.mockResolvedValue(respuesta({ mensaje: 'error' }, 500));
    expect(await esFeriado('2026-12-25')).toBeNull();
  });

  test.each(['', '25/12/2026', '2026-13-01', '2026-02-30', 'hoy'])('fecha inválida "%s": 400 sin consultar afuera', async (fecha) => {
    const res = await consultar(fecha);

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});

describe('GET /api/feriados', () => {
  test('devuelve la lista del año con fecha y nombre en español', async () => {
    fetchSimulado.mockResolvedValue(respuesta(FERIADOS_2026));
    const res = await request(app).get('/api/feriados').query({ anio: '2026' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      disponible: true,
      feriados: [
        { fecha: '2026-07-09', nombre: 'Día de la Independencia' },
        { fecha: '2026-12-25', nombre: 'Navidad' },
      ],
    });
  });

  test('con Nager.Date caído responde 200 con disponible: false', async () => {
    const res = await request(app).get('/api/feriados').query({ anio: '2026' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ disponible: false, feriados: [] });
  });

  test.each(['', '26', 'dosmil', '1800'])('año inválido "%s": 400', async (anio) => {
    const res = await request(app).get('/api/feriados').query({ anio });

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('caché por año', () => {
  test('dos consultas del mismo año llaman a Nager.Date una sola vez', async () => {
    fetchSimulado.mockResolvedValue(respuesta(FERIADOS_2026));

    expect(await esFeriado('2026-12-25')).toBe(true);
    expect(await esFeriado('2026-07-10')).toBe(false);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  test('dos consultas simultáneas del mismo año comparten la misma llamada', async () => {
    fetchSimulado.mockResolvedValue(respuesta(FERIADOS_2026));

    await Promise.all([consultar('2026-12-25'), consultar('2026-07-09')]);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  test('cada año se consulta por separado', async () => {
    fetchSimulado.mockResolvedValue(respuesta([]));

    await esFeriado('2026-12-25');
    await esFeriado('2027-12-25');
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  test('un fallo no se guarda: la próxima consulta vuelve a intentar', async () => {
    fetchSimulado.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(respuesta(FERIADOS_2026));

    expect(await esFeriado('2026-12-25')).toBeNull();
    expect(await esFeriado('2026-12-25')).toBe(true);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });
});
