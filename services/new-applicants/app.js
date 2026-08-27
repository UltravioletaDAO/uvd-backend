// VERSIÓN FINAL ULTRA SIMPLE - 25 FEBRERO 2025
console.log('[ARRANQUE] ===== VERSIÓN FINAL ULTRAVIOLETA - 25 FEBRERO 2025 =====');

// Importaciones básicas
const { MongoClient } = require('mongodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const validator = require('validator');
const sanitize = require('mongo-sanitize');
const { name: SERVICE_NAME, version: SERVICE_VERSION } = require('./package.json');

// ── Ruleta /wallets: auth del streamer + hygiene de logs (audit 2026-08-27, W-08/W-09) ──
// Solo un token de Twitch (implicit flow del SPA) cuyo `login` esté en la allowlist puede
// registrar/verificar wallets. El token se valida contra Twitch y NUNCA se persiste ni se logea.
const TWITCH_VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
const WHEEL_BROADCASTER_LOGINS = String(process.env.WHEEL_BROADCASTER_LOGINS || '0xultravioleta')
  .split(',')
  .map((l) => l.trim().toLowerCase())
  .filter(Boolean);
// Opcional: si está definido, el token además debe haber sido emitido para esta app de Twitch
const WHEEL_TWITCH_CLIENT_ID = process.env.WHEEL_TWITCH_CLIENT_ID || null;
const TWITCH_VALIDATION_CACHE_MS = 60 * 1000;
const twitchTokenCache = new Map(); // token -> { login, expiresAt }

const getHeader = (event, name) => {
  const headers = event?.headers || {};
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find((k) => k.toLowerCase() === wanted);
  return key ? headers[key] : undefined;
};

// Copia del evento sin credenciales para los logs [EVENT_FULL]/[EVENT_DEBUG]
const redactEvent = (event) => {
  if (!event || typeof event !== 'object') return event;
  const headers = event.headers && typeof event.headers === 'object' ? { ...event.headers } : event.headers;
  if (headers) {
    Object.keys(headers).forEach((k) => {
      if (['authorization', 'cookie', 'x-api-key'].includes(k.toLowerCase())) headers[k] = '[REDACTED]';
    });
  }
  return { ...event, headers };
};

async function validateTwitchBroadcaster(authHeader) {
  if (!authHeader || !/^Bearer\s+\S+/i.test(String(authHeader))) {
    return { ok: false, status: 401, error: 'Se requiere Authorization: Bearer <token de Twitch del streamer>' };
  }
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();

  const cached = twitchTokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, login: cached.login };
  }

  let response;
  try {
    response = await fetch(TWITCH_VALIDATE_URL, { headers: { Authorization: `OAuth ${token}` } });
  } catch (error) {
    console.error(`[TWITCH_VALIDATE_ERROR] ${error.message}`);
    return { ok: false, status: 503, error: 'No se pudo validar el token con Twitch. Intenta de nuevo' };
  }
  if (!response.ok) {
    return { ok: false, status: 401, error: 'Token de Twitch inválido o expirado' };
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    return { ok: false, status: 401, error: 'Token de Twitch inválido o expirado' };
  }
  const login = String(data.login || '').toLowerCase();
  if (WHEEL_TWITCH_CLIENT_ID && data.client_id !== WHEEL_TWITCH_CLIENT_ID) {
    return { ok: false, status: 403, error: 'El token no pertenece a la aplicación de la ruleta' };
  }
  if (!login || !WHEEL_BROADCASTER_LOGINS.includes(login)) {
    console.warn(`[TWITCH_VALIDATE_DENIED] login='${login}' no está en la allowlist`);
    return { ok: false, status: 403, error: 'El token no pertenece a un streamer autorizado' };
  }

  const ttl = Math.min(TWITCH_VALIDATION_CACHE_MS, Number(data.expires_in || 0) * 1000 || TWITCH_VALIDATION_CACHE_MS);
  twitchTokenCache.set(token, { login, expiresAt: Date.now() + ttl });
  return { ok: true, login };
}

// Función para normalizar la ruta (eliminar prefijo /prod si existe)
const normalizePath = (path) => {
  console.log(`[PATH_NORMALIZE_DEBUG] Normalizando ruta: '${path}'`);
  
  // Eliminar posibles prefijos de stage como /prod
  if (path.startsWith('/prod/')) {
    const normalized = path.substring(5); // Quitar '/prod/'
    console.log(`[PATH_NORMALIZE_DEBUG] Detectado prefijo '/prod/', resultado: '${normalized}'`);
    return normalized;
  } else if (path.startsWith('/prod')) {
    const normalized = path.substring(4); // Corregido: Quitar '/prod' (4 caracteres, no 5)
    console.log(`[PATH_NORMALIZE_DEBUG] Detectado prefijo '/prod', resultado: '${normalized}'`);
    return normalized;
  }
  
  // Si ya está sin prefijo, devolver como está
  console.log(`[PATH_NORMALIZE_DEBUG] Sin prefijo detectado, manteniendo: '${path}'`);
  return path;
};

// Configuración para Secrets Manager
const SECRETS_MANAGER_REGION = 'us-east-2';
const MONGODB_SECRET_NAME = 'ultravioletadao-atlas-mongodb-prod';
let dbClient = null;
let mongoUri = null;

// Función para obtener el secreto de MongoDB
async function getMongoDBUri() {
  console.log('[SECRETS_MANAGER] Obteniendo URI de MongoDB desde Secrets Manager');
  
  try {
    const secretsClient = new SecretsManagerClient({ 
      region: SECRETS_MANAGER_REGION 
    });
    
    const command = new GetSecretValueCommand({
      SecretId: MONGODB_SECRET_NAME
    });
    
    const response = await secretsClient.send(command);
    const secretValue = JSON.parse(response.SecretString);
    
    console.log('[SECRETS_MANAGER] Secreto obtenido correctamente');
    
    // Obtener la URI del secreto
    const uri = secretValue.MONGO_URI;
    
    // Verificar que la URI existe
    if (!uri) {
      console.error('[SECRETS_MANAGER_ERROR] La URI de MongoDB no se encontró en el secreto');
      throw new Error('URI de MongoDB no encontrada en el secreto');
    }
    
    // Sanitizar la URI para los logs (ocultar contraseña)
    const sanitizedUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
    console.log(`[MONGODB_URI_DEBUG] Formato de URI obtenida: ${sanitizedUri}`);
    
    // Verificar formato básico de la URI
    if (!uri.startsWith('mongodb') && !uri.startsWith('mongodb+srv')) {
      console.error(`[MONGODB_URI_ERROR] Formato de URI inválido: ${sanitizedUri}`);
      throw new Error('Formato de URI de MongoDB inválido');
    }
    
    // Imprimir estructura del secreto (sin valores sensibles)
    console.log(`[SECRETS_MANAGER_DEBUG] Claves disponibles en el secreto: ${Object.keys(secretValue).join(', ')}`);
    
    return uri;
  } catch (error) {
    console.error(`[SECRETS_MANAGER_ERROR] Error al obtener secreto: ${error.message}`);
    throw error;
  }
}

// Iniciamos conexión al arrancar
console.log("[ARRANQUE] ===== VERSIÓN ULTRA SIMPLE FEBRERO 2025 CORREGIDA =====");

// Función principal del handler
exports.handler = async (event, context) => {
  console.log("---------------------------------------------------");
  console.log(`[LAMBDA_START_EXPLICIT] Evento recibido: ${JSON.stringify({
    requestId: context.awsRequestId,
    timestamp: new Date().toISOString()
  })}`);
  console.log("---------------------------------------------------");

  // Obtener la URI de MongoDB si aún no la tenemos
  if (!mongoUri) {
    try {
      mongoUri = await getMongoDBUri();
      console.log('[MONGODB_URI] URI obtenida correctamente desde Secrets Manager');
    } catch (error) {
      console.error(`[MONGODB_URI_ERROR] Error al obtener URI: ${error.message}`);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Error al obtener configuración de la base de datos' }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }
  }

  // Conectar a MongoDB si no está conectado
  if (!dbClient) {
    console.log("[MONGODB_EXPLICIT] Iniciando conexión directa a MongoDB");
    try {
      // Verificar que mongoUri no sea undefined o null
      if (!mongoUri) {
        console.error("[MONGODB_ERROR] La URI de MongoDB es undefined o null");
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Error de configuración de la base de datos: URI no disponible' }),
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        };
      }
      
      console.log(`[MONGODB_DEBUG] Intentando conectar con URI de longitud: ${mongoUri.length} caracteres`);
      
      // Crear cliente MongoDB
      dbClient = new MongoClient(mongoUri);
      
      // Intentar conectar
      console.log("[MONGODB_DEBUG] Ejecutando dbClient.connect()...");
      await dbClient.connect();
      
      // Verificar conexión
      console.log("[MONGODB_DEBUG] Verificando conexión...");
      await dbClient.db().command({ ping: 1 });
      
      console.log("[MONGODB_EXPLICIT] Conexión exitosa ");
    } catch (error) {
      console.error(`[MONGODB_ERROR] Error al conectar: ${error.message}`);
      console.error(`[MONGODB_ERROR_STACK] ${error.stack}`);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Error de conexión a la base de datos' }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }
  }

  try {
    // Extraer información de la solicitud
    console.log(`[EVENT_FULL] Evento completo: ${JSON.stringify(redactEvent(event))}`);
    
    const path = event.rawPath || event.path || '';
    const normalizedPath = normalizePath(path);
    const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
    
    console.log(`[REQUEST_EXPLICIT] ${method} ${path} \n- ${new Date().toISOString()}`);
    console.log(`[PATH_DEBUG] Original: '${path}', Normalizado: '${normalizedPath}', Método: '${method}'`);
    console.log(`[EVENT_DEBUG] Estructura del evento: ${JSON.stringify(redactEvent(event), null, 2).substring(0, 500)}...`);

    // RUTAS ESPECÍFICAS
    // Ruta /apply - Crear nueva aplicación
    console.log(`[ROUTE_CHECK] Verificando si coincide con /apply: normalizedPath='${normalizedPath}', method='${method}'`);
    console.log(`[ROUTE_CHECK] Condición: ${(normalizedPath === '/apply' || normalizedPath === 'apply')} && ${method === 'POST'}`);
    
    // Manejar solicitudes OPTIONS (CORS preflight)
    if (method === 'OPTIONS') {
      console.log("[CORS_PREFLIGHT] Respondiendo a solicitud OPTIONS");
      const response = {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Origin',
          'Access-Control-Max-Age': '86400'
        },
        body: ''
      };
      console.log(`[LAMBDA_RESULT_EXPLICIT] Respuesta CORS: Status ${response.statusCode}`);
      return response;
    }
    
    // Ruta /apply/status/:email - Consultar estado de una aplicación (lo usa /status en el frontend)
    const statusPrefix = '/apply/status/';
    if (normalizedPath.startsWith(statusPrefix) && method === 'GET') {
      console.log("[ROUTE_MATCH] Ruta /apply/status/:email coincide");
      try {
        let email = '';
        try {
          email = decodeURIComponent(normalizedPath.substring(statusPrefix.length)).trim();
        } catch (e) {
          email = '';
        }

        if (!email || !validator.isEmail(email)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Email inválido o no proporcionado' }),
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          };
        }

        const db = dbClient.db();
        const collection = db.collection('applicants');

        // Case-insensitive vía collation (sin regex construido desde input); la aplicación más reciente
        const application = await collection.findOne(
          { email: email },
          {
            collation: { locale: 'en', strength: 2 },
            sort: { createdAt: -1 },
            projection: { status: 1, createdAt: 1, updatedAt: 1 }
          }
        );

        if (!application) {
          return {
            statusCode: 404,
            body: JSON.stringify({ error: 'No se encontró una aplicación con ese email' }),
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          };
        }

        // Solo status y fechas: nada personal
        const response = {
          statusCode: 200,
          body: JSON.stringify({
            data: {
              status: application.status || 'pending',
              createdAt: application.createdAt,
              updatedAt: application.updatedAt || application.createdAt
            }
          }),
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        };
        console.log(`[LAMBDA_RESULT_EXPLICIT] Respuesta: \nStatus ${response.statusCode}\nBody: ${response.body}`);
        return response;
      } catch (error) {
        console.error(`[DB_ERROR] Error al consultar estado de aplicación: ${error.message}`);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Error al procesar la solicitud' }),
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        };
      }
    }

    // Verificar si la ruta es /apply o /prod/apply (sin normalizar)
    if ((normalizedPath === '/apply' || normalizedPath === 'apply' || path === '/apply' || path === '/prod/apply') && method === 'POST') {
      console.log("[ROUTE_MATCH] Ruta /apply coincide");
      try {
        const db = dbClient.db();
        const collection = db.collection('applicants');
        
        let body = {};
        if (event.body) {
          try {
            body = JSON.parse(event.body);
            // Sanitizar input
            body = sanitize(body);
            console.log(`[BODY_PARSE_SUCCESS] Datos recibidos: ${JSON.stringify(body)}`);
          } catch (e) {
            console.error(`[BODY_PARSE_ERROR] Error al parsear JSON: ${e.message}`);
          }
        }

        // Validación mejorada de email
        if (!body.email || !validator.isEmail(body.email)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ 
              error: 'Email inválido o no proporcionado' 
            }),
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          };
        }

        // Verificar duplicados recientes
        const recentApplication = await collection.findOne({
          email: body.email,
          createdAt: { 
            $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) // últimas 24h
          }
        });

        if (recentApplication) {
          return {
            statusCode: 429,
            body: JSON.stringify({ 
              error: 'Ya existe una aplicación reciente con este email' 
            }),
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          };
        }

        // Guardar en la base de datos
        body.createdAt = new Date();
        body.status = 'pending';
        
        console.log("[DB_OPERATION] Guardando aplicación en MongoDB");
        const result = await collection.insertOne(body);
        
        const response = {
          statusCode: 201,
          body: JSON.stringify({ 
            message: 'Aplicación recibida correctamente',
            id: result.insertedId,
            success: true
          }),
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        };
        
        console.log(`[LAMBDA_RESULT_EXPLICIT] Respuesta: \nStatus ${response.statusCode}\nBody: ${response.body}`);
        return response;
      } catch (error) {
        console.error(`[DB_ERROR] Error al guardar aplicación: ${error.message}`);
        const response = {
          statusCode: 500,
          body: JSON.stringify({ error: 'Error al procesar la solicitud' }),
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        };
        console.log(`[LAMBDA_RESULT_EXPLICIT] Respuesta: \nStatus ${response.statusCode}\nBody: ${response.body}`);
        return response;
      }
    }

    // Ruta /health - Health check para api-catalog y agentes (llega aquí solo si la DB respondió al ping)
    if ((normalizedPath === '/health' || normalizedPath === 'health') && method === 'GET') {
      console.log("[ROUTE_MATCH] Ruta /health coincide");
      const response = {
        statusCode: 200,
        body: JSON.stringify({
          status: 'ok',
          service: SERVICE_NAME,
          version: SERVICE_VERSION,
          timestamp: new Date().toISOString()
        }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
      console.log(`[LAMBDA_RESULT_EXPLICIT] Respuesta: \nStatus ${response.statusCode}\nBody: ${response.body}`);
      return response;
    }

    // Ruta /test - Para verificar que el API funciona
    if ((normalizedPath === '/test' || normalizedPath === 'test' || normalizedPath === '/') && (method === 'GET' || method === 'POST')) {
      console.log("[ROUTE_MATCH] Ruta /test o / coincide");
      const response = {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'API funcionando correctamente',
          timestamp: new Date().toISOString(),
          path: path,
          normalizedPath: normalizedPath,
          method: method,
          availableEndpoints: [
            {
              path: '/apply',
              method: 'POST',
              description: 'Enviar una nueva aplicación'
            },
            {
              path: '/apply/status/{email}',
              method: 'GET',
              description: 'Consultar el estado de una aplicación (solo status y fechas)'
            },
            {
              path: '/wallets',
              method: 'POST',
              description: 'Registrar wallet de usuario'
            },
            {
              path: '/test',
              method: 'GET',
              description: 'Verificar que la API está funcionando'
            },
            {
              path: '/health',
              method: 'GET',
              description: 'Health check (status, service, version, timestamp)'
            }
          ]
        }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
      console.log(`[LAMBDA_RESULT_EXPLICIT] Respuesta: \nStatus ${response.statusCode}\nBody: ${response.body}`);
      return response;
    }

    // Ruta /wallets - Registrar wallet de usuario (solo POST; el GET público sin auth se retiró)
    if ((normalizedPath === '/wallets' || normalizedPath === 'wallets' || path === '/wallets' || path === '/prod/wallets')) {
      console.log("[ROUTE_MATCH] Ruta /wallets coincide");

      // POST /wallets - Registrar wallet de usuario
      if (method === 'POST') {
        try {
          const db = dbClient.db();
          const collection = db.collection('wallets');
          
          let body = {};
          if (event.body) {
            try {
              body = JSON.parse(event.body);
              // Sanitizar input
              body = sanitize(body);
              console.log(`[BODY_PARSE_SUCCESS] Datos recibidos: ${JSON.stringify(body)}`);
            } catch (e) {
              console.error(`[BODY_PARSE_ERROR] Error al parsear JSON: ${e.message}`);
              return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Error al procesar el JSON del body' }),
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                }
              };
            }
          }

          // Auth del streamer (W-09): sin token válido del canal autorizado no se toca la DB
          const auth = await validateTwitchBroadcaster(getHeader(event, 'authorization'));
          if (!auth.ok) {
            return {
              statusCode: auth.status,
              body: JSON.stringify({ error: auth.error }),
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            };
          }

          // Validar que se proporcionaron los campos requeridos
          if (!body.username || !body.wallet) {
            return {
              statusCode: 400,
              body: JSON.stringify({ error: 'Se requieren username y wallet' }),
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            };
          }

          // Normalización (W-08): username y wallet se comparan y guardan en minúsculas;
          // twitch_id (opcional) es la clave estable aunque el viewer cambie de nombre.
          const username = String(body.username).trim().toLowerCase();
          const wallet = String(body.wallet).trim().toLowerCase();
          const twitchId = body.twitch_id ? String(body.twitch_id).trim() : null;

          // Validar formato de wallet (dirección EVM, ya en minúsculas)
          const walletRegex = /^0x[a-f0-9]{40}$/;
          if (!walletRegex.test(wallet)) {
            return {
              statusCode: 400,
              body: JSON.stringify({ error: 'Formato de wallet inválido' }),
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            };
          }

          // Registros viejos pueden tener mayúsculas: comparar sin distinguir casing
          const caseInsensitive = { collation: { locale: 'en', strength: 2 } };

          // Buscar si el usuario ya existe: primero por twitch_id (estable), luego por username
          let existingUser = twitchId ? await collection.findOne({ twitch_id: twitchId }) : null;
          if (!existingUser) {
            existingUser = await collection.findOne({ username }, caseInsensitive);
          }

          // Buscar si la wallet ya está registrada para OTRO usuario
          const walletFilter = existingUser ? { wallet, _id: { $ne: existingUser._id } } : { wallet };
          const existingWallet = await collection.findOne(walletFilter, caseInsensitive);

          if (existingWallet) {
            return {
              statusCode: 400,
              body: JSON.stringify({
                error: 'Abre un ticket en discord para soporte',
                details: 'Wallet ya registrada para otro usuario'
              }),
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            };
          }

          if (existingUser) {
            // Si el usuario existe, verificar si la wallet coincide (sin distinguir casing)
            if (String(existingUser.wallet || '').toLowerCase() === wallet) {
              // Backfill de la clave estable si el registro viejo no la tenía
              if (twitchId && !existingUser.twitch_id) {
                try {
                  await collection.updateOne({ _id: existingUser._id }, { $set: { twitch_id: twitchId } });
                } catch (error) {
                  console.warn(`[WALLETS_BACKFILL_WARN] No se pudo guardar twitch_id: ${error.message}`);
                }
              }
              return {
                statusCode: 200,
                body: JSON.stringify({
                  message: 'OK',
                  details: 'Usuario y wallet ya registrados'
                }),
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                }
              };
            } else {
              return {
                statusCode: 400,
                body: JSON.stringify({
                  error: 'Abre un ticket en discord para soporte',
                  details: 'Wallet no coincide con el registro existente'
                }),
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                }
              };
            }
          }

          // Si llegamos aquí, el usuario no existe y la wallet no está registrada
          // Insertar nuevo registro (normalizado)
          const newWalletDoc = {
            username,
            wallet,
            createdAt: new Date()
          };
          if (twitchId) newWalletDoc.twitch_id = twitchId;
          const result = await collection.insertOne(newWalletDoc);

          return {
            statusCode: 201,
            body: JSON.stringify({ 
              message: 'Wallet registrada correctamente',
              id: result.insertedId
            }),
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          };

        } catch (error) {
          console.error(`[DB_ERROR] Error al procesar wallet: ${error.message}`);
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error al procesar la solicitud' }),
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          };
        }
      }
    }

    // Si llegamos aquí, no se encontró la ruta
    console.log(`[ROUTE_NOT_FOUND] No se encontró manejador para: ${normalizedPath}`);
    const response = {
      statusCode: 404,
      body: JSON.stringify({ 
        error: 'Ruta no encontrada',
        path: path,
        normalizedPath: normalizedPath,
        availableRoutes: ['/apply', '/apply/status/{email}', '/test', '/health', '/']
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
    console.log(`[LAMBDA_RESULT_EXPLICIT] Respuesta: \nStatus ${response.statusCode}`);
    return response;
  } catch (error) {
    console.error(`[GENERAL_ERROR] Error no manejado: ${error.message}`);
    const response = {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
    console.log(`[LAMBDA_RESULT_EXPLICIT] Respuesta: \nStatus ${response.statusCode}`);
    return response;
  } finally {
    console.log("---------------------------------------------------");
    console.log(`[LAMBDA_END_EXPLICIT] Ejecución finalizada: ${new Date().toISOString()}`);
    console.log("---------------------------------------------------");
  }
}; 