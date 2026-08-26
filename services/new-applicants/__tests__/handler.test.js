// Tests del handler Lambda new-applicants.
// Mockean Secrets Manager + MongoDB porque el handler conecta a la DB
// ANTES de rutear (toda request pasa por getMongoDBUri + MongoClient.connect).
// validator y mongo-sanitize se usan reales (funciones puras).

// ── Mock AWS Secrets Manager ──────────────────────────────────────
// Debe devolver un MONGO_URI que empiece con "mongodb" (lo valida app.js).
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      SecretString: JSON.stringify({ MONGO_URI: 'mongodb://localhost:27017/test' }),
    }),
  })),
  GetSecretValueCommand: jest.fn(),
}));

// ── Mock MongoDB ──────────────────────────────────────────────────
// db().command({ping}) para el health check, y collection() con los
// métodos que usa el handler. findOne→null deja pasar /apply al insert.
const insertOneMock = jest.fn().mockResolvedValue({ insertedId: 'test-id-123' });
const findOneMock = jest.fn().mockResolvedValue(null);
const toArrayMock = jest.fn().mockResolvedValue([]);

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    db: jest.fn().mockReturnValue({
      command: jest.fn().mockResolvedValue({ ok: 1 }),
      collection: jest.fn().mockReturnValue({
        findOne: findOneMock,
        insertOne: insertOneMock,
        // Cursor encadenable: el handler usa find({}).skip(skip).limit(50).toArray()
        // tras el fix de paginacion. mockReturnThis hace que skip/limit retornen el
        // mismo cursor, asi cualquier orden de chain funciona.
        find: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          toArray: toArrayMock,
        }),
      }),
    }),
  })),
}));

const { handler } = require('../app');
const mockContext = { awsRequestId: 'test-request-id' };

const event = (method, rawPath, body) => ({
  rawPath,
  requestContext: { http: { method } },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

beforeEach(() => {
  findOneMock.mockResolvedValue(null);
  insertOneMock.mockResolvedValue({ insertedId: 'test-id-123' });
  toArrayMock.mockResolvedValue([]);
});

describe('GET /test', () => {
  it('responde 200 con el mensaje de salud', async () => {
    const res = await handler(event('GET', '/test'), mockContext);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe('API funcionando correctamente');
  });

  it('la raíz / también responde 200', async () => {
    const res = await handler(event('GET', '/'), mockContext);
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /health', () => {
  it('responde 200 con status/service/version/timestamp', async () => {
    const res = await handler(event('GET', '/health'), mockContext);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('ultravioleta-api');
    expect(typeof body.version).toBe('string');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('acepta el prefijo de stage /prod/health', async () => {
    const res = await handler(event('GET', '/prod/health'), mockContext);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });

  it('POST /health no existe (404)', async () => {
    const res = await handler(event('POST', '/health'), mockContext);
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /apply', () => {
  it('rechaza email inválido con 400', async () => {
    const res = await handler(event('POST', '/apply', { email: 'no-es-email', name: 'Test' }), mockContext);
    expect(res.statusCode).toBe(400);
  });

  it('rechaza body ausente con 400', async () => {
    const res = await handler(event('POST', '/apply'), mockContext);
    expect(res.statusCode).toBe(400);
  });

  it('acepta email válido con 201 e id', async () => {
    const res = await handler(event('POST', '/apply', { email: 'test@example.com', name: 'Test' }), mockContext);
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('bloquea aplicación duplicada en 24h con 429', async () => {
    findOneMock.mockResolvedValueOnce({ email: 'dup@example.com', createdAt: new Date() });
    const res = await handler(event('POST', '/apply', { email: 'dup@example.com' }), mockContext);
    expect(res.statusCode).toBe(429);
  });
});

describe('GET /apply/status/:email', () => {
  it('devuelve 200 con {data:{status, createdAt, updatedAt}} y sin datos personales', async () => {
    const createdAt = new Date('2026-08-01T10:00:00.000Z');
    findOneMock.mockResolvedValueOnce({
      _id: 'x', email: 'Ana@Example.com', name: 'Ana', twitter: '@ana',
      status: 'review', createdAt,
    });
    const res = await handler(event('GET', '/apply/status/ana@example.com'), mockContext);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('review');
    expect(body.data.createdAt).toBe(createdAt.toISOString());
    expect(body.data.updatedAt).toBe(createdAt.toISOString()); // sin updatedAt cae a createdAt
    expect(body.data).not.toHaveProperty('email');
    expect(body.data).not.toHaveProperty('name');
    expect(body.data).not.toHaveProperty('twitter');
    expect(body.data).not.toHaveProperty('_id');
  });

  it('busca por email case-insensitive (collation strength 2) y la más reciente', async () => {
    findOneMock.mockResolvedValueOnce({ status: 'pending', createdAt: new Date() });
    await handler(event('GET', '/apply/status/ANA%40Example.com'), mockContext);
    expect(findOneMock).toHaveBeenLastCalledWith(
      { email: 'ANA@Example.com' },
      expect.objectContaining({
        collation: { locale: 'en', strength: 2 },
        sort: { createdAt: -1 },
      })
    );
  });

  it('responde 404 JSON si no existe', async () => {
    const res = await handler(event('GET', '/apply/status/noexiste@example.com'), mockContext);
    expect(res.statusCode).toBe(404);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(res.body).error).toBeDefined();
  });

  it('rechaza email inválido con 400', async () => {
    findOneMock.mockClear();
    const res = await handler(event('GET', '/apply/status/no-es-email'), mockContext);
    expect(res.statusCode).toBe(400);
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('rechaza email vacío con 400', async () => {
    const res = await handler(event('GET', '/apply/status/'), mockContext);
    expect(res.statusCode).toBe(400);
  });

  it('acepta el prefijo de stage /prod/apply/status/:email', async () => {
    findOneMock.mockResolvedValueOnce({ status: 'approved', createdAt: new Date() });
    const res = await handler(event('GET', '/prod/apply/status/ana@example.com'), mockContext);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe('approved');
  });
});

describe('POST /wallets', () => {
  it('exige username y wallet (400 si falta)', async () => {
    const res = await handler(event('POST', '/wallets', { username: 'u' }), mockContext);
    expect(res.statusCode).toBe(400);
  });

  it('valida formato de wallet (400 si inválido)', async () => {
    const res = await handler(event('POST', '/wallets', { username: 'u', wallet: 'no-wallet' }), mockContext);
    expect(res.statusCode).toBe(400);
  });

  it('registra wallet válida con 201', async () => {
    const res = await handler(
      event('POST', '/wallets', { username: 'u', wallet: '0x' + 'a'.repeat(40) }),
      mockContext
    );
    expect(res.statusCode).toBe(201);
  });
});

describe('GET /wallets', () => {
  it('responde 200 con el listado', async () => {
    const res = await handler(event('GET', '/wallets'), mockContext);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('count');
  });
});

describe('CORS y rutas', () => {
  it('OPTIONS responde 200 con headers CORS', async () => {
    const res = await handler(event('OPTIONS', '/apply'), mockContext);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBeDefined();
  });

  it('ruta inexistente responde 404', async () => {
    const res = await handler(event('GET', '/no-existe'), mockContext);
    expect(res.statusCode).toBe(404);
  });
});
