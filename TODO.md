# TODO - Ultravioleta DAO Backend

## Arquitectura de Servicios

### 🔄 Separar servicios en APIs independientes (Prioridad: Media)

**Contexto:** Actualmente `new-applicants` y potencialmente otros servicios comparten el mismo API Gateway en `api.ultravioletadao.xyz`. La decisión arquitectónica es que cada servicio debe tener su propio API Gateway independiente para mejor aislamiento y escalabilidad.

**Estado actual:**
- ✅ `stream-summaries` - Ya tiene su propio API Gateway independiente (correcto)
- ❌ `new-applicants` - Debería tener su propio API Gateway
- ❓ Futuros servicios - Cada uno con su propio API Gateway

**Tareas:**
1. [ ] Crear módulo `lambda-api-isolated` para servicios con API Gateway propio
2. [ ] Migrar `new-applicants` a usar API Gateway independiente
3. [ ] Actualizar DNS/routing si es necesario
4. [ ] Documentar patrón de arquitectura para futuros servicios

**Beneficios:**
- Mejor aislamiento entre servicios
- Escalado independiente por servicio
- Despliegues sin afectar otros servicios
- Límites de rate-limiting independientes

**Notas:**
- No es urgente, funciona bien compartido por ahora
- Considerar al agregar nuevos servicios
- Mantener backward compatibility durante migración

---

_Última actualización: 2025-11-07_
