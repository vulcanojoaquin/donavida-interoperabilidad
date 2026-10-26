// TP3: distancia por calle con OpenRouteService. fetch está simulado: los tests nunca llaman a la API real.
process.env.JWT_SECRET = 'secreto_de_prueba_para_los_tests_de_rutas';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Base simulada, como en convocatorias.test.js
jest.mock('../src/lib/prisma', () => ({
  usuarioInstitucion: { findFirst: jest.fn() },
  necesidad: { findFirst: jest.fn(), updateMany: jest.fn() },
  donante: { findMany: jest.fn() },
  franjaHoraria: { count: jest.fn() },
  convocatoria: { create: jest.fn() },
  alerta: { createMany: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../src/lib/prisma');
const app = require('../src/app');
const { distanciasPorCalle } = require('../src/services/rutas');

const CLAVE = 'clave-de-prueba';
const ID_USUARIO = '11111111-1111-4111-8111-111111111111';
const ID_INSTITUCION = '44444444-4444-4444-8444-444444444444';
const ID_NECESIDAD = '77777777-7777-4777-8777-777777777777';
const ID_CERCA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_LEJOS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_COMPATIBLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// Hospital en el Obelisco y donantes en Plaza de Mayo y La Plata (los mismos lugares que convocatorias.test.js)
const OBELISCO = { lat: -34.603722, lon: -58.381592 };
const PLAZA_DE_MAYO = { lat: -34.608147, lon: -58.370226 };
const LA_PLATA = { lat: -34.92145, lon: -57.95453 };

// Una respuesta de fetch con el cuerpo y el estado indicados
const respuesta = (cuerpo, status = 200) => ({ ok: status === 200, status, json: async () => cuerpo });
// Lo que devuelve la matriz de ORS con un origen: una sola fila, un valor por destino
const matriz = (...km) => respuesta({ distances: [km] });

let fetchSimulado;

beforeEach(() => {
  process.env.ORS_API_KEY = CLAVE;
  // Si un test no dice qué responde fetch, falla: nunca sale una consulta real
  fetchSimulado = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch no simulado'));
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.ORS_API_KEY;
});

describe('distanciasPorCalle', () => {
  test('devuelve distancias para varios destinos en una sola llamada a la matriz', async () => {
    fetchSimulado.mockResolvedValue(matriz(1.534, 58.2));
    const km = await distanciasPorCalle(OBELISCO, [PLAZA_DE_MAYO, LA_PLATA]);

    expect(km).toEqual([1.53, 58.2]); // 2 decimales, como la distancia en línea recta
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchSimulado.mock.calls[0];
    expect(url).toBe('https://api.openrouteservice.org/v2/matrix/driving-car');
    expect(opciones.method).toBe('POST');
    expect(opciones.headers.Authorization).toBe(CLAVE);
    expect(opciones.signal).toBeInstanceOf(AbortSignal); // con tiempo máximo
  });

  test('manda las coordenadas como [lon, lat], con la institución como único origen', async () => {
    fetchSimulado.mockResolvedValue(matriz(1.5, 58.2));
    await distanciasPorCalle(OBELISCO, [PLAZA_DE_MAYO, LA_PLATA]);

    const cuerpo = JSON.parse(fetchSimulado.mock.calls[0][1].body);
    expect(cuerpo).toEqual({
      locations: [[-58.381592, -34.603722], [-58.370226, -34.608147], [-57.95453, -34.92145]],
      sources: [0],
      destinations: [1, 2],
      metrics: ['distance'],
      units: 'km',
    });
  });

  test('acepta las coordenadas como texto, como las devuelve Prisma', async () => {
    fetchSimulado.mockResolvedValue(matriz(1.5));
    await distanciasPorCalle({ lat: '-34.603722', lon: '-58.381592' }, [{ lat: '-34.608147', lon: '-58.370226' }]);

    const cuerpo = JSON.parse(fetchSimulado.mock.calls[0][1].body);
    expect(cuerpo.locations).toEqual([[-58.381592, -34.603722], [-58.370226, -34.608147]]);
  });

  test('un destino sin camino posible da null y los demás tienen su distancia', async () => {
    fetchSimulado.mockResolvedValue(matriz(1.5, null));
    expect(await distanciasPorCalle(OBELISCO, [PLAZA_DE_MAYO, LA_PLATA])).toEqual([1.5, null]);
  });

  test('si ORS está caído, devuelve un null por destino', async () => {
    fetchSimulado.mockRejectedValue(new TypeError('fetch failed'));
    expect(await distanciasPorCalle(OBELISCO, [PLAZA_DE_MAYO, LA_PLATA])).toEqual([null, null]);
  });

  test('si ORS tarda más del tiempo máximo, devuelve un null por destino', async () => {
    fetchSimulado.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    expect(await distanciasPorCalle(OBELISCO, [PLAZA_DE_MAYO, LA_PLATA])).toEqual([null, null]);
  });

  test('si ORS responde con un error HTTP (clave inválida, límite del plan), devuelve nulls', async () => {
    for (const status of [403, 429, 500]) {
      fetchSimulado.mockResolvedValueOnce(respuesta({ error: 'no' }, status));
      expect(await distanciasPorCalle(OBELISCO, [PLAZA_DE_MAYO])).toEqual([null]);
    }
  });

  test('si la respuesta no tiene un valor por destino, devuelve nulls', async () => {
    fetchSimulado.mockResolvedValue(matriz(1.5)); // pidió dos, vino uno
    expect(await distanciasPorCalle(OBELISCO, [PLAZA_DE_MAYO, LA_PLATA])).toEqual([null, null]);
  });

  test('sin ORS_API_KEY no consulta y devuelve nulls', async () => {
    delete process.env.ORS_API_KEY;
    expect(await distanciasPorCalle(OBELISCO, [PLAZA_DE_MAYO, LA_PLATA])).toEqual([null, null]);
    process.env.ORS_API_KEY = '   ';
    expect(await distanciasPorCalle(OBELISCO, [PLAZA_DE_MAYO])).toEqual([null]);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  test('sin destinos, o con más de los que admite el plan gratuito, no consulta', async () => {
    expect(await distanciasPorCalle(OBELISCO, [])).toEqual([]);
    const muchos = Array.from({ length: 3501 }, () => PLAZA_DE_MAYO);
    const km = await distanciasPorCalle(OBELISCO, muchos);
    expect(km).toHaveLength(3501);
    expect(km.every((valor) => valor === null)).toBe(true);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});

describe('Convocatoria con la distancia por calle', () => {
  const TOKEN = jwt.sign({ sub: ID_USUARIO, rol: 'institucion' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const NECESIDAD = {
    idNecesidad: ID_NECESIDAD,
    idInstitucion: ID_INSTITUCION,
    grupoSanguineo: 'A',
    factorRh: 'positivo',
    componente: 'globulos_rojos',
    unidadesSolicitadas: 10,
    unidadesCubiertas: 0,
    urgencia: 'normal',
    fechaLimite: new Date('2099-12-31'),
    estado: 'abierta',
    institucion: { latitud: '-34.603722', longitud: '-58.381592' },
  };
  const donante = (idDonante, datos) => ({
    idDonante,
    grupoSanguineo: 'A',
    factorRh: 'positivo',
    latitud: '-34.608147',
    longitud: '-58.370226',
    avisoPush: true,
    avisoEmail: true,
    avisoWhatsapp: false,
    _count: { alertas: 0 },
    topeAlertasMes: 4,
    usuario: { nombre: 'Ana', apellido: 'Paz' },
    ...datos,
  });
  // La base los devuelve en este orden; la lista tiene que salir: cerca, lejos (mismo grupo), compatible
  const DONANTES = [
    donante(ID_LEJOS, { latitud: '-34.921450', longitud: '-57.954530' }),
    donante(ID_COMPATIBLE, { grupoSanguineo: 'O' }),
    donante(ID_CERCA),
  ];
  const ORDEN_DE_HOY = [ID_CERCA, ID_LEJOS, ID_COMPATIBLE];

  const proponer = () =>
    request(app)
      .post(`/api/necesidades/${ID_NECESIDAD}/convocatoria/propuesta`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ radioKm: 100 });
  const lista = (res) => [...res.body.sugeridos, ...res.body.otrosCandidatos];

  beforeEach(() => {
    prisma.usuarioInstitucion.findFirst.mockResolvedValue({ idUsuario: ID_USUARIO, idInstitucion: ID_INSTITUCION });
    prisma.necesidad.findFirst.mockResolvedValue(NECESIDAD);
    prisma.necesidad.updateMany.mockResolvedValue({ count: 0 });
    prisma.franjaHoraria.count.mockResolvedValue(0); // sin agenda: cupo = unidades que faltan (10)
    prisma.donante.findMany.mockResolvedValue(DONANTES);
    prisma.$transaction.mockImplementation((operaciones) => operaciones(prisma));
    prisma.convocatoria.create.mockImplementation(async ({ data }) => ({ idConvocatoria: 'x', creadaEn: new Date(), ...data }));
    prisma.alerta.createMany.mockResolvedValue({ count: 0 });
    prisma.alerta.findMany.mockResolvedValue([]);
  });

  test('cada candidato trae su distancia por calle, con una sola consulta para todos', async () => {
    // En el orden en que la base devolvió a los donantes: lejos, compatible, cerca
    fetchSimulado.mockResolvedValue(matriz(57.31, 1.92, 1.48));
    const res = await proponer();

    expect(res.status).toBe(200);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const porId = Object.fromEntries(lista(res).map((c) => [c.idDonante, c.distanciaPorCalle]));
    expect(porId).toEqual({ [ID_CERCA]: 1.48, [ID_LEJOS]: 57.31, [ID_COMPATIBLE]: 1.92 });
  });

  test('el orden sigue siendo por línea recta, aunque por calle el más cercano sea otro', async () => {
    // Por calle, "cerca" queda a 80 km y "lejos" a 2 km: igual sale primero el más cercano en línea recta
    fetchSimulado.mockResolvedValue(matriz(2, 1.92, 80));
    const res = await proponer();

    expect(lista(res).map((c) => c.idDonante)).toEqual(ORDEN_DE_HOY);
  });

  test('con ORS caído, la lista se arma igual que sin la integración y la distancia por calle queda en null', async () => {
    delete process.env.ORS_API_KEY;
    const sinIntegracion = await proponer();

    process.env.ORS_API_KEY = CLAVE;
    fetchSimulado.mockRejectedValue(new TypeError('fetch failed'));
    const conOrsCaido = await proponer();

    expect(conOrsCaido.status).toBe(200);
    expect(conOrsCaido.body).toEqual(sinIntegracion.body);
    expect(lista(conOrsCaido).map((c) => c.idDonante)).toEqual(ORDEN_DE_HOY);
    expect(lista(conOrsCaido).every((c) => c.distanciaPorCalle === null)).toBe(true);
    expect(lista(conOrsCaido).every((c) => typeof c.distanciaKm === 'number')).toBe(true);
  });

  test('al confirmar la convocatoria no consulta a ORS', async () => {
    const res = await request(app)
      .post(`/api/necesidades/${ID_NECESIDAD}/convocatoria`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ radioKm: 100, idsDonantes: [ID_CERCA] });

    expect(res.status).toBe(201);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});
