# Ultravioleta DAO - Backend

## Descripción del Proyecto

Este proyecto contiene el backend para Ultravioleta DAO, una plataforma que permite gestionar solicitudes de nuevos aplicantes que desean unirse a la comunidad. El sistema está construido utilizando:

- AWS Lambda para el procesamiento serverless
- API Gateway para exponer endpoints REST
- MongoDB para almacenamiento de datos
- Terraform para la infraestructura como código

La arquitectura está diseñada para ser completamente serverless, lo que permite una alta escalabilidad y bajo costo de mantenimiento.

## Arquitectura y Servicios AWS

### Diagrama de Arquitectura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│   Cliente   │────▶│ API Gateway │────▶│   Lambda    │────▶│   MongoDB   │
│             │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ CloudWatch  │     │     S3      │
                    │    Logs     │     │  (Artifacts)│
                    └─────────────┘     └─────────────┘
```

### Servicios AWS Utilizados

1. **AWS Lambda**
   - Servicio: Computación serverless
   - Uso: Ejecuta el código de la API sin necesidad de servidores
   - Configuración: Runtime Node.js 18.x, 256MB de memoria, timeout de 30 segundos
   - Ventajas: Escalado automático, pago por uso, sin mantenimiento de servidores

2. **Amazon API Gateway**
   - Servicio: Gestión de APIs
   - Uso: Expone los endpoints HTTP y gestiona el enrutamiento a las funciones Lambda
   - Configuración: REST API con soporte CORS, dominio personalizado
   - Ventajas: Gestión de tráfico, autenticación, monitoreo

3. **Amazon S3**
   - Servicio: Almacenamiento de objetos
   - Uso: Almacena los artefactos de despliegue (paquetes zip de Lambda)
   - Configuración: Bucket privado con versionado habilitado
   - Ventajas: Durabilidad, disponibilidad, seguridad

4. **Amazon CloudWatch**
   - Servicio: Monitoreo y observabilidad
   - Uso: Almacena logs de ejecución de Lambda y API Gateway
   - Configuración: Retención de logs de 30 días
   - Ventajas: Diagnóstico de problemas, análisis de rendimiento

5. **AWS IAM**
   - Servicio: Gestión de identidad y acceso
   - Uso: Define permisos para que Lambda acceda a otros servicios AWS
   - Configuración: Roles con principio de mínimo privilegio
   - Ventajas: Seguridad, control de acceso granular

6. **Amazon Route 53**
   - Servicio: DNS y registro de dominios
   - Uso: Gestiona el dominio personalizado para la API
   - Configuración: Registros A para el dominio api.ultravioletadao.xyz
   - Ventajas: Alta disponibilidad, baja latencia

7. **AWS Certificate Manager (ACM)**
   - Servicio: Gestión de certificados SSL/TLS
   - Uso: Proporciona certificados para el dominio personalizado
   - Configuración: Certificado para *.ultravioletadao.xyz
   - Ventajas: Renovación automática, integración con servicios AWS

### Flujo de Datos

1. El cliente realiza una solicitud HTTP a la API (api.ultravioletadao.xyz)
2. API Gateway recibe la solicitud y la enruta a la función Lambda correspondiente
3. Lambda ejecuta el código, conectándose a MongoDB Atlas para operaciones de datos
4. La respuesta se devuelve al cliente a través de API Gateway
5. Los logs se almacenan en CloudWatch para monitoreo y depuración

### Consideraciones de Seguridad

- Todos los datos en tránsito están cifrados mediante HTTPS
- El acceso a la base de datos MongoDB está restringido por IP y credenciales
- Las políticas IAM siguen el principio de mínimo privilegio
- No se almacenan secretos en el código (se utilizan variables de entorno)
- El bucket S3 tiene bloqueado el acceso público

## Funcionalidades Principales

- **API REST**: Expone endpoints para recibir y procesar solicitudes de nuevos aplicantes
- **Almacenamiento en MongoDB**: Guarda los datos de los aplicantes en una base de datos MongoDB
- **Infraestructura como Código**: Toda la infraestructura está definida usando Terraform
- **Despliegue Automatizado**: Scripts de despliegue para facilitar las actualizaciones

## Estructura del Proyecto

```
.
├── services/                  # Servicios Lambda
│   ├── common/                # Capa común compartida entre servicios
│   └── new-applicants/        # Servicio para gestionar nuevos aplicantes
├── modules/                   # Módulos de Terraform
│   ├── lambda-api/            # Módulo para crear APIs con Lambda
│   ├── lambda-layer/          # Módulo para crear capas Lambda
│   ├── artifact-gen/          # Módulo para generar artefactos
│   └── state/                 # Módulo para gestionar el estado de Terraform
├── environments/              # Configuraciones de entorno
│   └── prod/                  # Entorno de producción
└── bootstrap/                 # Scripts de inicialización
```

## Cómo Desplegar

### Requisitos Previos

- AWS CLI configurado con credenciales adecuadas
- Terraform v1.0.0 o superior
- Node.js v18.x o superior
- PowerShell 7.0 o superior (para Windows)

### Pasos para Desplegar

1. **Configurar las credenciales de AWS**:
   ```
   aws configure
   ```

2. **Desplegar la infraestructura base**:
   ```
   cd environments/prod
   terraform init
   terraform apply
   ```

3. **Desplegar el servicio de nuevos aplicantes**:
   ```
   cd services/new-applicants
   ./deploy.ps1    # En Windows
   ./deploy.sh     # En Linux/Mac
   ```

4. **Verificar el despliegue**:
   Accede a la URL de la API generada por Terraform (disponible en la salida del comando `terraform apply`) y verifica que el endpoint `/test` responde correctamente.

## Endpoints Disponibles

- **GET /test**: Verifica que la API está funcionando correctamente
- **POST /apply**: Recibe solicitudes de nuevos aplicantes

## Mantenimiento

Para actualizar el código de la función Lambda:

1. Modifica el código en `services/new-applicants/app.js`
2. Ejecuta el script de despliegue:
   ```
   cd services/new-applicants
   ./deploy.ps1    # En Windows
   ./deploy.sh     # En Linux/Mac
   ```

Para modificar la infraestructura:

1. Edita los archivos de Terraform según sea necesario
2. Aplica los cambios:
   ```
   cd environments/prod
   terraform apply
   ```

## Guía para Agregar Nuevos Servicios (Endpoints) - Para Novatos

Esta guía te ayudará a crear nuevos endpoints en la API existente paso a paso.

### 1. Entender la Estructura Actual

Antes de agregar un nuevo endpoint, familiarízate con el código existente:

- El archivo principal es `services/new-applicants/app.js`
- Los endpoints se definen dentro de la función `handler` en este archivo

### 2. Modificar el Archivo app.js

Para agregar un nuevo endpoint (por ejemplo, `/users`):

1. **Abre el archivo app.js**:
   ```
   cd services/new-applicants
   # Abre app.js con tu editor preferido
   ```

2. **Localiza la sección de rutas**:
   Busca la sección donde se definen las rutas existentes (como `/test` y `/apply`).

3. **Agrega tu nuevo endpoint**:
   Copia este ejemplo y modifícalo según tus necesidades:

   ```javascript
   // Ruta /users - Para obtener usuarios
   if ((normalizedPath === '/users' || normalizedPath === 'users') && method === 'GET') {
     console.log("[ROUTE_MATCH] Ruta /users coincide");
     try {
       const db = dbClient.db();
       const collection = db.collection('users'); // Colección en MongoDB
       
       // Obtener datos de MongoDB
       const users = await collection.find({}).limit(50).toArray();
       
       const response = {
         statusCode: 200,
         body: JSON.stringify({ 
           success: true,
           data: users
         }),
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         }
       };
       
       console.log(`[LAMBDA_RESULT_EXPLICIT] Respuesta: \nStatus ${response.statusCode}`);
       return response;
     } catch (error) {
       console.error(`[DB_ERROR] Error al obtener usuarios: ${error.message}`);
       const response = {
         statusCode: 500,
         body: JSON.stringify({ error: 'Error al procesar la solicitud' }),
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         }
       };
       return response;
     }
   }
   ```

4. **Actualiza la lista de rutas disponibles**:
   Busca la sección donde se define la respuesta para rutas no encontradas y agrega tu nueva ruta:

   ```javascript
   // Si llegamos aquí, no se encontró la ruta
   console.log(`[ROUTE_NOT_FOUND] No se encontró manejador para: ${normalizedPath}`);
   const response = {
     statusCode: 404,
     body: JSON.stringify({ 
       error: 'Ruta no encontrada',
       path: path,
       normalizedPath: normalizedPath,
       availableRoutes: ['/apply', '/test', '/users', '/'] // Agrega tu nueva ruta aquí
     }),
     // ...resto del código...
   ```

5. **Actualiza la respuesta del endpoint `/test`**:
   Agrega tu nuevo endpoint a la lista de endpoints disponibles:

   ```javascript
   // En la sección de la ruta /test
   availableEndpoints: [
     {
       path: '/apply',
       method: 'POST',
       description: 'Enviar una nueva aplicación'
     },
     {
       path: '/test',
       method: 'GET',
       description: 'Verificar que la API está funcionando'
     },
     {
       path: '/users',
       method: 'GET',
       description: 'Obtener lista de usuarios'
     }
   ]
   ```

### 3. Crear una Nueva Colección en MongoDB (si es necesario)

Si tu endpoint necesita una nueva colección en MongoDB:

1. La primera vez que se use el endpoint, la colección se creará automáticamente
2. No es necesario crear la colección manualmente

### 4. Desplegar los Cambios

1. **Guarda los cambios en app.js**

2. **Ejecuta el script de despliegue**:
   ```
   cd services/new-applicants
   ./deploy.ps1    # En Windows
   ./deploy.sh     # En Linux/Mac
   ```

3. **Espera a que termine el despliegue**

### 5. Probar el Nuevo Endpoint

1. **Obtén la URL de la API**:
   ```
   cd environments/prod
   terraform output new_applicants_stage_url
   ```

2. **Prueba tu endpoint con curl o Postman**:
   ```
   curl https://tu-api-url.amazonaws.com/prod/users
   ```

### 6. Solución de Problemas Comunes

- **Error 404**: Verifica que la ruta esté correctamente definida en app.js
- **Error 500**: Revisa los logs en AWS CloudWatch para ver el error específico
- **Problemas de CORS**: Asegúrate de incluir los headers CORS en tu respuesta
- **Problemas de MongoDB**: Verifica la conexión y los permisos de la base de datos

### 7. Ejemplo Completo: Endpoint para Crear Usuarios

```javascript
// Ruta /users - Para crear un nuevo usuario
if ((normalizedPath === '/users' || normalizedPath === 'users') && method === 'POST') {
  console.log("[ROUTE_MATCH] Ruta /users POST coincide");
  try {
    const db = dbClient.db();
    const collection = db.collection('users');
    
    // Extraer datos del cuerpo
    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
        console.log(`[BODY_PARSE_SUCCESS] Datos recibidos: ${JSON.stringify(body)}`);
      } catch (e) {
        console.error(`[BODY_PARSE_ERROR] Error al parsear JSON: ${e.message}`);
      }
    }

    // Validar datos mínimos
    if (!body.name || !body.email) {
      console.log("[VALIDATION_ERROR] Nombre y email requeridos");
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Nombre y email son requeridos' }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    // Agregar campos adicionales
    body.createdAt = new Date();
    body.status = 'active';
    
    // Guardar en la base de datos
    const result = await collection.insertOne(body);
    
    return {
      statusCode: 201,
      body: JSON.stringify({ 
        message: 'Usuario creado correctamente',
        id: result.insertedId,
        success: true
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  } catch (error) {
    console.error(`[DB_ERROR] Error al crear usuario: ${error.message}`);
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
```

## Contacto

Para más información sobre Ultravioleta DAO, visita [ultravioletadao.xyz](https://ultravioletadao.xyz).
