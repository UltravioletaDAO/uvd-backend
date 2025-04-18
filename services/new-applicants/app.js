// VERSIÓN FINAL ULTRA SIMPLE - 25 FEBRERO 2025
console.log('[ARRANQUE] ===== VERSIÓN FINAL ULTRAVIOLETA - 25 FEBRERO 2025 =====');

// Importaciones básicas
const { MongoClient } = require('mongodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const validator = require('validator');
const sanitize = require('mongo-sanitize');

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
    console.log(`[EVENT_FULL] Evento completo: ${JSON.stringify(event)}`);
    
    const path = event.rawPath || event.path || '';
    const normalizedPath = normalizePath(path);
    const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
    
    console.log(`[REQUEST_EXPLICIT] ${method} ${path} \n- ${new Date().toISOString()}`);
    console.log(`[PATH_DEBUG] Original: '${path}', Normalizado: '${normalizedPath}', Método: '${method}'`);
    console.log(`[EVENT_DEBUG] Estructura del evento: ${JSON.stringify(event, null, 2).substring(0, 500)}...`);

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
              path: '/wallets',
              method: 'POST',
              description: 'Registrar wallet de usuario'
            },
            {
              path: '/wallets',
              method: 'GET',
              description: 'Obtener wallets de usuarios'
            },
            {
              path: '/test',
              method: 'GET',
              description: 'Verificar que la API está funcionando'
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

    // Ruta /wallets - Registrar wallet de usuario
    if ((normalizedPath === '/wallets' || normalizedPath === 'wallets' || path === '/wallets' || path === '/prod/wallets')) {
      console.log("[ROUTE_MATCH] Ruta /wallets coincide");
      
      // GET /wallets - Obtener todos los usuarios y wallets
      if (method === 'GET') {
        try {
          const db = dbClient.db();
          const collection = db.collection('wallets');
          
          console.log("[DB_OPERATION] Obteniendo todos los usuarios y wallets");
          const wallets = await collection.find({}).toArray();
          
          return {
            statusCode: 200,
            body: JSON.stringify({ 
              message: 'Wallets obtenidas correctamente',
              count: wallets.length,
              wallets: wallets
            }),
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          };
        } catch (error) {
          console.error(`[DB_ERROR] Error al obtener wallets: ${error.message}`);
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error al obtener las wallets' }),
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          };
        }
      }
      
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

          // Validar formato de wallet (dirección de Avalanche C-Chain)
          const walletRegex = /^0x[a-fA-F0-9]{40}$/;
          if (!walletRegex.test(body.wallet)) {
            return {
              statusCode: 400,
              body: JSON.stringify({ error: 'Formato de wallet inválido' }),
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            };
          }

          // Buscar si el usuario ya existe
          const existingUser = await collection.findOne({ username: body.username });
          
          // Buscar si la wallet ya está registrada para otro usuario
          const existingWallet = await collection.findOne({ 
            wallet: body.wallet,
            username: { $ne: body.username }
          });

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
            // Si el usuario existe, verificar si la wallet coincide
            if (existingUser.wallet === body.wallet) {
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
          // Insertar nuevo registro
          const result = await collection.insertOne({
            username: body.username,
            wallet: body.wallet,
            createdAt: new Date()
          });

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
        availableRoutes: ['/apply', '/test', '/']
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