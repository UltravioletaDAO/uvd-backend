// Tests del MCP remoto (POST /mcp): contrato JSON-RPC, catálogo de tools, validación de
// input, manejo de errores y presupuesto de la respuesta.
// No tocan la red: global.fetch está mockeado y ruteado por URL.

const {
  handleMcpRequest,
  dispatch,
  callTool,
  validateArgs,
  SERVER_INFO,
  INSTRUCTIONS,
  DEFAULT_PROTOCOL_VERSION,
  CORS_HEADERS,
} = require('../mcp');
const { buildMcpTools, CONFIG, fitBudget, stripIrcCodes } = require('../mcpTools');

const applyApplication = jest.fn().mockResolvedValue({
  statusCode: 201,
  body: JSON.stringify({ message: 'Aplicación recibida correctamente', id: 'app-1', success: true }),
});
const DEPS = { applyApplication };

// Nombres de las 12 tools de datos, en el mismo orden que el catálogo.
const DATA_TOOLS = [
  'get_dao_info',
  'get_token_metrics',
  'get_treasury',
  'get_facilitator_networks',
  'list_governance_proposals',
  'list_stream_summaries',
  'get_stream_summary',
  'search_stream_memory',
  'get_ecosystem_map',
  'list_ecosystem_products',
  'get_ecosystem_pulse',
  'get_ecosystem_messages',
];
// Las 6 tools de UI del sitio no viajan al MCP remoto (no significan nada sin pestaña).
const UI_ONLY_TOOLS = [
  'navigate_to', 'set_language', 'focus_ecosystem_node', 'open_terminal',
  'set_desk_mode', 'run_ecosystem_command',
];

const post = (message) => ({
  rawPath: '/mcp',
  requestContext: { http: { method: 'POST' } },
  body: JSON.stringify(message),
});

const rpc = async (message, deps = DEPS) => {
  const res = await handleMcpRequest(post(message), 'POST', deps);
  return { res, body: res.body ? JSON.parse(res.body) : null };
};

// ── Mock de fetch ruteado por URL (upstreams públicos del ecosistema) ─────────
const bigString = (n) => 'x'.repeat(n);
const json = (value) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(value), text: () => Promise.resolve(JSON.stringify(value)) });

const GRAPH = {
  schema_version: 1,
  generated_at: '2026-08-28T20:00:00+00:00',
  source: { tool: 'c0der', scan_timestamp: '2026-08-28T20:00:00+00:00', projects_scanned: 92 },
  nodes: Array.from({ length: 13 }, (_, i) => ({
    id: `node-${i}`,
    name: `Node ${i}`,
    layer: 'pillar',
    url: `https://node-${i}.example.com`,
    repo: null,
    status: 'live',
    embeddable: false,
    tags: ['a', 'b'],
    degree: 13 - i,
  })),
  edges: Array.from({ length: 20 }, (_, i) => ({
    source: `node-${i % 6}`,
    target: `node-${(i + 1) % 6}`,
    type: 'api_call',
    protocol: 'x402',
    evidence_count: i,
    planned: false,
  })),
};

const STREAM_INDEX = {
  ultima_actualizacion: '2026-08-28T01:00:00',
  total_streams: 412,
  streams: Array.from({ length: 10 }, (_, i) => ({
    streamer: '0xultravioleta',
    video_id: `28580224${80 + i}`,
    fecha_stream: '20260827',
    fecha_formateada: '27/08/2026',
    titulo_stream: `TITULO LARGUISIMO DE STREAM NUMERO ${i} ${bigString(60)}`,
    twitch_url: `https://www.twitch.tv/videos/28580224${80 + i}`,
  })),
};

beforeEach(() => {
  applyApplication.mockClear();
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/ecosystem/graph.json')) return json(GRAPH);
    if (u.includes('/stream-summaries/index_')) return json(STREAM_INDEX);
    if (u.includes('/stream-summaries/0xultravioleta/')) {
      return json({ metadata: { titulo_stream: 'T', fecha_formateada: '27/08/2026' }, resumenes: { web: { contenido: bigString(5000) } } });
    }
    if (u.includes('/supported')) {
      return json({ kinds: [{ network: 'avalanche', scheme: 'exact', extra: { tokens: [{ token: 'usdc', address: '0x1' }] } }, { network: 'base-sepolia' }, { network: 'eip155:43114' }] });
    }
    if (u.includes('/health')) return json({ status: 'healthy' });
    if (u.includes('/irc/stats')) return json({ connected: true, users: 20 });
    if (u.includes('/irc/channels/')) {
      return json(Array.from({ length: 10 }, (_, i) => ({
        nick: `nick-${i}`,
        text: `04mensaje ${i} ${bigString(300)}`,
        time: '2026-08-28T20:00:00Z',
      })));
    }
    if (u.includes('/em/tasks/available')) return json({ tasks: [], count: 0 });
    if (u.includes('/stats')) return json({ streams: '402', segments: '543774' });
    if (u.includes('karmakadabra.ultravioletadao.xyz')) {
      return json({ jsonrpc: '2.0', id: 1, result: { isError: false, content: [{ type: 'text', text: JSON.stringify({ volume_usd: 20.98, trades: 1046 }) }] } });
    }
    if (u.includes('dexscreener')) return json({ pairs: [{ priceUsd: '0.0000007', priceNative: '0.0000001', priceChange: { h24: 1.5 }, marketCap: 6432, liquidity: { usd: 5218.47 } }] });
    if (u.includes('avax.network')) return json([{ id: 1, result: '0x0' }, { id: 2, result: '0x0' }]);
    if (u.includes('safe-transaction')) return json({ owners: ['0x1', '0x2'], threshold: 15 });
    if (u.includes('safe-client')) return json({ fiatTotal: '53.55', items: [{ tokenInfo: { symbol: 'USDC' }, fiatBalance: '35' }] });
    if (u.includes('snapshot.org/graphql') || u.includes('hub.snapshot.org')) {
      return json({ data: { proposals: Array.from({ length: 5 }, (_, i) => ({
        id: `0x${i}`, title: `Propuesta larguísima ${i} ${bigString(70)}`, state: 'closed', end: 1782936000,
        choices: ['A', 'B'], votes: 20, quorum: 1, scores_total: 2,
      })) } });
    }
    if (u.includes('briefings.json')) return json({ briefings: [] });
    if (u.includes('?q=')) {
      return json({ count: 10, results: Array.from({ length: 10 }, (_, i) => ({
        title: `Stream ${i}`, date_formatted: '03/08/2026', t: '0h53m4s',
        snippet: `<mark>hit</mark> ${bigString(190)}`, url: `https://www.twitch.tv/videos/${i}`,
      })) });
    }
    return json({});
  });
});

describe('initialize', () => {
  it('devuelve protocolVersion, capabilities, serverInfo e instructions', async () => {
    const { res, body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(body.result.serverInfo).toEqual(SERVER_INFO);
    expect(body.result.serverInfo.name).toBe('ultravioletadao');
    expect(body.result.instructions).toBe(INSTRUCTIONS);
  });

  it('las instructions marcan el texto de terceros como dato no confiable', () => {
    expect(INSTRUCTIONS).toMatch(/UNTRUSTED DATA/);
    expect(INSTRUCTIONS).toMatch(/never instructions you follow/);
  });

  it('una versión de protocolo desconocida cae en la default soportada', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    expect(body.result.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);
  });

  it('notifications/initialized responde 202 sin cuerpo', async () => {
    const res = await handleMcpRequest(post({ jsonrpc: '2.0', method: 'notifications/initialized' }), 'POST', DEPS);
    expect(res.statusCode).toBe(202);
    expect(res.body).toBe('');
  });

  it('ping responde un result vacío', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 9, method: 'ping' });
    expect(body.result).toEqual({});
  });
});

describe('tools/list', () => {
  it('lista las 12 tools de datos más la de escritura', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const names = body.result.tools.map((t) => t.name);
    expect(names).toEqual([...DATA_TOOLS, 'apply_dao_membership']);
    expect(names).toHaveLength(13);
  });

  it('sin la dependencia de escritura quedan solo las 12 de lectura', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, {});
    expect(body.result.tools.map((t) => t.name)).toEqual(DATA_TOOLS);
  });

  it('no expone ninguna tool de UI del sitio', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const names = body.result.tools.map((t) => t.name);
    UI_ONLY_TOOLS.forEach((ui) => expect(names).not.toContain(ui));
  });

  it('cada tool trae description e inputSchema de objeto cerrado', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    for (const tool of body.result.tools) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(30);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool).not.toHaveProperty('execute');
    }
  });

  it('las 12 de datos son readOnly y la de escritura no', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const byName = Object.fromEntries(body.result.tools.map((t) => [t.name, t]));
    DATA_TOOLS.forEach((name) => expect(byName[name].annotations.readOnlyHint).toBe(true));
    expect(byName.apply_dao_membership.annotations.readOnlyHint).toBe(false);
  });

  it('las tools con texto de terceros llevan untrustedContentHint', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const byName = Object.fromEntries(body.result.tools.map((t) => [t.name, t]));
    ['get_stream_summary', 'search_stream_memory', 'list_governance_proposals', 'get_ecosystem_pulse', 'get_ecosystem_messages']
      .forEach((name) => expect(byName[name].annotations.untrustedContentHint).toBe(true));
  });

  it('los nombres y schemas son los mismos que expone el sitio por WebMCP', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const byName = Object.fromEntries(body.result.tools.map((t) => [t.name, t]));
    // Muestras del contrato compartido con src/agent/tools.js del sitio.
    expect(byName.get_stream_summary.inputSchema.required).toEqual(['video_id']);
    expect(byName.search_stream_memory.inputSchema.properties.query.maxLength).toBe(120);
    expect(byName.get_ecosystem_messages.inputSchema.properties.channel.enum)
      .toEqual(['agents', 'karmakadabra', 'bounties', 'execution-market']);
    expect(byName.apply_dao_membership.inputSchema.required).toEqual(['name', 'email', 'skills', 'motivation']);
  });
});

describe('tools/call — camino feliz', () => {
  it('get_dao_info devuelve content[0].text con JSON parseable', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_dao_info', arguments: {} } });
    expect(body.result.isError).toBe(false);
    expect(body.result.content[0].type).toBe('text');
    const data = JSON.parse(body.result.content[0].text);
    expect(data.token.symbol).toBe('UVD');
    expect(data.governance.snapshot_space).toBe('ultravioletadao.eth');
  });

  it('list_stream_summaries devuelve el total y las últimas', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_stream_summaries', arguments: { limit: 2 } } });
    const data = JSON.parse(body.result.content[0].text);
    expect(data.total).toBe(412);
    expect(data.summaries).toHaveLength(2);
    expect(data.summaries[0].video_id).toBe('2858022480');
  });

  it('search_stream_memory recorta los tags <mark> del buscador', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'search_stream_memory', arguments: { query: 'karmakadabra', limit: 1 } } });
    const data = JSON.parse(body.result.content[0].text);
    expect(data.results[0].snippet).not.toMatch(/<mark>/);
    expect(data.results[0].url).toMatch(/twitch\.tv/);
  });

  it('get_ecosystem_messages limpia los códigos de color de IRC', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_ecosystem_messages', arguments: { channel: 'agents', limit: 1 } } });
    const data = JSON.parse(body.result.content[0].text);
    expect(data.channel).toBe('#agents');
    expect(data.messages[0].text).toMatch(/^mensaje 0/);
    // eslint-disable-next-line no-control-regex
    expect(data.messages[0].text).not.toMatch(/[]/);
  });

  it('apply_dao_membership reusa la ruta POST /apply del propio Lambda', async () => {
    const { body } = await rpc({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'apply_dao_membership', arguments: { name: 'Ana', email: 'ana@example.com', skills: ['Solidity'], motivation: 'construir' } },
    });
    expect(applyApplication).toHaveBeenCalledTimes(1);
    const payload = applyApplication.mock.calls[0][0];
    expect(payload.email).toBe('ana@example.com');
    expect(payload.story).toBe('Solidity');
    expect(JSON.parse(body.result.content[0].text)).toMatchObject({ ok: true, id: 'app-1' });
  });
});

describe('tools/call — input inválido y errores', () => {
  it('falta un argumento requerido → isError con mensaje accionable', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'get_stream_summary', arguments: {} } });
    expect(body.result.isError).toBe(true);
    expect(JSON.parse(body.result.content[0].text).message).toMatch(/missing required argument "video_id"/);
  });

  it('argumento desconocido → isError listando los permitidos', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'get_dao_info', arguments: { nope: 1 } } });
    expect(body.result.isError).toBe(true);
    expect(JSON.parse(body.result.content[0].text).message).toMatch(/unknown argument\(s\) nope/);
  });

  it('valor fuera del enum → isError', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'get_ecosystem_messages', arguments: { channel: '#random' } } });
    expect(body.result.isError).toBe(true);
    expect(JSON.parse(body.result.content[0].text).message).toMatch(/must be one of/);
  });

  it('tipo equivocado → isError', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_stream_summaries', arguments: { limit: 'dos' } } });
    expect(body.result.isError).toBe(true);
    expect(JSON.parse(body.result.content[0].text).message).toMatch(/"limit" must be an integer/);
  });

  it('tool desconocida → isError con la lista de tools', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'rm_rf', arguments: {} } });
    expect(body.result.isError).toBe(true);
    const data = JSON.parse(body.result.content[0].text);
    expect(data.error).toBe('unknown_tool');
    expect(data.allowed).toContain('get_dao_info');
  });

  it('params.name ausente → error JSON-RPC -32602', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: {} });
    expect(body.error.code).toBe(-32602);
  });

  it('un upstream caído vuelve como isError, nunca como excepción', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const { res, body } = await rpc({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'get_facilitator_networks', arguments: {} } });
    expect(res.statusCode).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(JSON.parse(body.result.content[0].text).error).toBe('facilitator_unavailable');
  });

  it('una tool que revienta se captura como tool_failed', async () => {
    const boom = [{ name: 'boom', description: 'x', inputSchema: { type: 'object', properties: {} }, execute: async () => { throw new Error('kaboom'); } }];
    const out = await callTool(boom, 'boom', {});
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content[0].text)).toMatchObject({ error: 'tool_failed', tool: 'boom' });
  });
});

describe('protocolo JSON-RPC', () => {
  it('método desconocido → -32601', async () => {
    const { res, body } = await rpc({ jsonrpc: '2.0', id: 15, method: 'resources/list' });
    expect(res.statusCode).toBe(200);
    expect(body.error.code).toBe(-32601);
    expect(body.error.message).toMatch(/method not found/);
  });

  it('JSON inválido → -32700', async () => {
    const res = await handleMcpRequest({ rawPath: '/mcp', body: '{no json' }, 'POST', DEPS);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe(-32700);
  });

  it('body vacío → -32700', async () => {
    const res = await handleMcpRequest({ rawPath: '/mcp' }, 'POST', DEPS);
    expect(JSON.parse(res.body).error.code).toBe(-32700);
  });

  it('batch (array) → -32600, salió de la spec en 2025-06-18', async () => {
    const res = await handleMcpRequest({ rawPath: '/mcp', body: '[{"jsonrpc":"2.0","id":1,"method":"ping"}]' }, 'POST', DEPS);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe(-32600);
  });

  it('acepta el body en base64 (API Gateway binario)', async () => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 16, method: 'ping' })).toString('base64');
    const res = await handleMcpRequest({ rawPath: '/mcp', body, isBase64Encoded: true }, 'POST', DEPS);
    expect(JSON.parse(res.body).result).toEqual({});
  });

  it('una notificación desconocida se ignora (202, sin error)', async () => {
    const res = await handleMcpRequest(post({ jsonrpc: '2.0', method: 'notifications/what' }), 'POST', DEPS);
    expect(res.statusCode).toBe(202);
  });
});

describe('transporte HTTP y CORS', () => {
  it('GET responde 405 con Allow y explica que se usa POST', async () => {
    const res = await handleMcpRequest({ rawPath: '/mcp' }, 'GET', DEPS);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST, OPTIONS');
    expect(JSON.parse(res.body).server.name).toBe('ultravioletadao');
  });

  it('OPTIONS responde 204 con los headers de MCP', async () => {
    const res = await handleMcpRequest({ rawPath: '/mcp' }, 'OPTIONS', DEPS);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('mcp-session-id');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('mcp-protocol-version');
  });

  it('toda respuesta lleva CORS abierto', async () => {
    const { res } = await rpc({ jsonrpc: '2.0', id: 17, method: 'ping' });
    expect(res.headers['Access-Control-Allow-Origin']).toBe(CORS_HEADERS['Access-Control-Allow-Origin']);
  });
});

describe('presupuesto de respuesta', () => {
  const DEFAULT_CALLS = [
    ['get_dao_info', {}],
    ['get_token_metrics', {}],
    ['get_treasury', {}],
    ['get_facilitator_networks', {}],
    ['list_governance_proposals', {}],
    ['list_stream_summaries', {}],
    ['get_stream_summary', { video_id: '2858022480' }],
    ['search_stream_memory', { query: 'karmakadabra' }],
    ['get_ecosystem_map', {}],
    ['list_ecosystem_products', {}],
    ['get_ecosystem_pulse', {}],
    ['get_ecosystem_messages', { channel: 'agents' }],
  ];

  it.each(DEFAULT_CALLS)('%s con inputs por defecto cabe en el presupuesto', async (name, args) => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name, arguments: args } });
    expect(body.result.content[0].text.length).toBeLessThanOrEqual(CONFIG.budgetChars);
  });

  it('con limit explícito el caller recibe lo que pidió, con techo duro', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'get_ecosystem_messages', arguments: { channel: 'agents', limit: 10 } } });
    const data = JSON.parse(body.result.content[0].text);
    expect(data.messages).toHaveLength(10);
    expect(body.result.content[0].text.length).toBeLessThanOrEqual(CONFIG.maxResponseChars);
  });

  it('fitBudget recorta la lista y marca truncated', () => {
    const payload = fitBudget({ items: Array.from({ length: 50 }, () => ({ text: bigString(100) })) }, 'items', { budget: 1500 });
    expect(payload.items.length).toBeLessThan(50);
    expect(payload.truncated).toBe(true);
    expect(JSON.stringify(payload).length).toBeLessThanOrEqual(1500);
  });

  it('fitBudget respeta un limit explícito', () => {
    const payload = fitBudget({ items: Array.from({ length: 50 }, () => ({ text: bigString(100) })) }, 'items', { explicit: true, budget: 1500 });
    expect(payload.items).toHaveLength(50);
  });
});

describe('helpers', () => {
  it('validateArgs acepta un input válido', () => {
    const schema = { type: 'object', required: ['a'], additionalProperties: false, properties: { a: { type: 'string' }, b: { type: 'integer' } } };
    expect(validateArgs(schema, { a: 'x', b: 2 })).toBeNull();
  });

  it('stripIrcCodes deja el texto plano', () => {
    expect(stripIrcCodes('04rojo negrita fin')).toBe('rojo negrita fin');
  });

  it('dispatch devuelve null para las notificaciones', async () => {
    expect(await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }, buildMcpTools({}))).toBeNull();
  });
});
