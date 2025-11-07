# Stream Summaries API with x402 Payment Protection

API serverless para servir resúmenes de streams con protección de pago mediante x402.

## 📋 Descripción

Este servicio Lambda proporciona acceso a los resúmenes de streams almacenados en S3, con un sistema de micropagos implementado usando el protocolo x402. El servicio permite:

- **Último resumen gratis**: El resumen más reciente siempre está disponible sin pago
- **Micropagos multi-red**: Soporta pagos en 7 redes blockchain diferentes
- **Precio fijo**: 0.05 USDC por resumen antiguo

## 🌐 Redes Soportadas

- Optimism
- Base
- Polygon
- Avalanche
- Celo
- HyperEVM
- Solana

## 🔑 Endpoints

### Públicos (sin pago requerido)

#### `GET /health`
Health check del servicio.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-07T...",
  "service": "stream-summaries",
  "version": "1.0.0"
}
```

#### `GET /networks`
Obtiene información sobre las redes soportadas y configuración de pagos.

**Response:**
```json
{
  "success": true,
  "networks": ["optimism", "base", "polygon", ...],
  "facilitator": "https://facilitator.ultravioletadao.xyz",
  "receivingWallet": "0x52110a2Cc8B6bBf846101265edAAe34E753f3389",
  "price": "$0.05"
}
```

#### `GET /summaries?lang=es`
Obtiene el índice de todos los resúmenes (solo metadata, sin contenido completo).

**Query Parameters:**
- `lang` (opcional): Idioma (es, en, pt, fr). Default: es

**Response:**
```json
{
  "success": true,
  "data": {
    "ultima_actualizacion": "2025-11-07",
    "total_streams": 150,
    "streams": [
      {
        "video_id": "123456",
        "streamer": "0xultravioleta",
        "titulo": "Building a DAO",
        "fecha_stream": "20251107",
        "duracion": "PT2H30M",
        "thumbnail_url": "https://..."
      }
    ]
  }
}
```

#### `GET /summaries/latest?lang=es`
Obtiene el resumen más reciente (SIEMPRE GRATIS).

**Query Parameters:**
- `lang` (opcional): Idioma (es, en, pt, fr). Default: es

**Response:**
```json
{
  "success": true,
  "data": { /* resumen completo */ },
  "message": "This is the latest summary - always free!"
}
```

### Protegidos (requieren pago)

#### `GET /summaries/:id?lang=es`
Obtiene un resumen específico por video ID. Requiere pago de 0.05 USDC.

**Headers requeridos:**
- `X-PAYMENT`: Token de pago firmado de x402

**Response (con pago válido):**
```json
{
  "success": true,
  "data": { /* resumen completo */ },
  "message": "Thank you for your payment!"
}
```

**Response (sin pago - HTTP 402):**
```json
{
  "error": "Payment Required",
  "price": "$0.05",
  "networks": ["optimism", "base", ...],
  "facilitator": "https://facilitator.ultravioletadao.xyz"
}
```

## 🚀 Despliegue

### Prerequisitos
- AWS CLI configurado
- Terraform instalado
- Node.js 18.x
- PowerShell 7.0+

### Pasos

1. **Instalar dependencias localmente (opcional, para testing):**
   ```bash
   cd services/stream-summaries
   npm install
   ```

2. **Desplegar usando Terraform:**
   ```bash
   cd environments/prod
   terraform init
   terraform apply
   ```

   Esto creará:
   - Lambda function con permisos S3
   - API Gateway con CORS
   - Roles y políticas IAM
   - CloudWatch logs

3. **O desplegar solo la Lambda (actualización rápida):**
   ```powershell
   cd services/stream-summaries
   ./deploy.ps1
   ```

## 🔧 Configuración

### Variables de entorno (configuradas en Terraform)

- `NODE_ENV`: Environment (production/development)
- `S3_BUCKET`: ultravioletadao
- `S3_REGION`: us-east-1
- `FACILITATOR_URL`: https://facilitator.ultravioletadao.xyz
- `RECEIVING_WALLET`: 0x52110a2Cc8B6bBf846101265edAAe34E753f3389

### Permisos IAM

La Lambda tiene permisos para:
- ✅ Leer objetos del bucket `ultravioletadao`
- ✅ Listar contenidos del bucket
- ✅ Escribir logs a CloudWatch

## 📦 Estructura de archivos en S3

```
s3://ultravioletadao/
└── stream-summaries/
    ├── index_es.json
    ├── index_en.json
    ├── index_pt.json
    ├── index_fr.json
    └── {streamer}/
        └── {fecha_stream}/
            └── {video_id}.{lang}.json
```

## 🧪 Testing Local

```bash
# Instalar dependencias
npm install

# Ejecutar localmente (sin Lambda)
node app.js

# El servidor corre en http://localhost:3000
curl http://localhost:3000/health
```

## 📊 Monitoreo

Los logs están disponibles en CloudWatch:
- Lambda logs: `/aws/lambda/ultravioleta-stream-summaries`
- API Gateway logs: `/aws/apigateway/ultravioleta-stream-summaries-api`

## 🔐 Seguridad

- Bucket S3 configurado como **privado**
- Solo Lambda puede acceder a los resúmenes
- x402 verifica pagos on-chain antes de servir contenido
- CORS habilitado para frontend
- Rate limiting a nivel de API Gateway

## 💡 Modelo de Negocio

- **Freemium**: Último resumen siempre gratis
- **Micropagos**: Resúmenes antiguos cuestan 0.05 USDC
- **Multi-blockchain**: Usuarios eligen su red preferida
- **Instant access**: Pago y acceso inmediato

## 🤝 Contribuir

Este servicio es parte del ecosistema UltraVioleta DAO.

## 📄 Licencia

ISC
