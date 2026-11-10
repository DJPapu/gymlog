# CLAUDE.md — GymLog (app de seguimiento de gimnasio)

> Archivo de contexto para Claude Code. Léelo entero al empezar cada sesión.
> Mantén actualizada la sección **Estado actual** al terminar cada fase.

---

## 1. Qué es este proyecto

App personal/familiar para planificar y registrar sesiones de gimnasio desde el iPhone:

1. **Configurar** ejercicios (catálogo de máquinas del gimnasio) y rutinas por días (split: Día A, B, C…) con series, rango de repeticiones, peso objetivo y RPE objetivo.
2. **Registrar** cada sesión en el gimnasio: reps y peso reales por serie, RPE y notas de texto (sensaciones, técnica, ajustes de la máquina).
3. **Ver progreso**: gráficos por ejercicio (peso máximo, volumen, 1RM estimado).
4. **Sugerir progresión**: proponer el peso/reps de la próxima sesión según el historial.
5. **Funcionar sin conexión** en el gimnasio y sincronizar después.

**Usuarios:** Valentin y su familia/pareja. Cada usuario tiene sus propias rutinas e historial; el catálogo de ejercicios del gimnasio es compartido.

**Fuera de alcance (v1):** análisis de imagen dentro de la app, notas de voz, vídeo de técnica, temporizador de descanso, notificaciones push, app nativa.

---

## 2. Decisiones de arquitectura (cerradas)

| Tema | Decisión | Motivo |
|---|---|---|
| Cliente | **PWA** instalable en iPhone ("Añadir a pantalla de inicio") | Sin Mac/Xcode, desarrollo en VS Code, un solo código |
| Frontend | React + Vite + TypeScript + `vite-plugin-pwa` + Tailwind | Ecosistema PWA maduro |
| Datos offline | **IndexedDB vía Dexie.js** como fuente de verdad local (`useLiveQuery`) | Offline-first real |
| Backend | **Python 3.12 + FastAPI** + SQLAlchemy 2 + Alembic + Pydantic v2 | Stack habitual de Valentin |
| Base de datos | **Supabase Postgres** (plan gratuito) | Postgres gestionado + Auth incluidos |
| Auth | **Supabase Auth** (magic link por email). FastAPI valida el JWT | Multiusuario sin construir login propio |
| Hosting backend | Render (free web service) | Gratis; ver limitaciones en §9 |
| Hosting frontend | Cloudflare Pages (o Vercel/Netlify) — estático | Gratis, HTTPS (obligatorio para PWA) |
| Gráficos | Recharts | Simple en React |
| Gestión deps Python | `uv` | Rápido, lockfile |
| Catálogo de ejercicios | Valentin deja las fotos en `catalog/photos/inbox/`; **Claude Code las analiza en VS Code** → genera `catalog/exercises.json` → se importa con script | Sin IA en runtime: el análisis ocurre solo durante el desarrollo |

**Principio clave:** el frontend escribe SIEMPRE primero en IndexedDB; la sincronización con el servidor es un proceso en segundo plano. Así, ni la falta de cobertura ni el arranque en frío del backend afectan al registro en el gimnasio.

FastAPI se conecta directamente a Postgres (no se usa la Data API/PostgREST de Supabase), así que no dependemos de sus grants de PostgREST.

---

## 3. Estructura del repositorio

```
gymlog/
├── CLAUDE.md
├── README.md
├── .gitignore                 # incluye .env*, node_modules, .venv
├── backend/
│   ├── pyproject.toml         # uv
│   ├── .env.example
│   ├── alembic/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, routers
│   │   ├── config.py          # pydantic-settings
│   │   ├── db.py              # engine/session
│   │   ├── auth.py            # verificación JWT Supabase -> user_id
│   │   ├── models/            # SQLAlchemy
│   │   ├── schemas/           # Pydantic
│   │   ├── routers/           # exercises, routines, sync, stats
│   │   ├── services/
│   │   │   ├── progression.py # lógica pura de sugerencias
│   │   │   └── metrics.py     # e1RM, volumen, top set
│   │   └── scripts/
│   │       └── import_catalog.py
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts         # vite-plugin-pwa
│   ├── public/                # iconos PWA (180x180 apple-touch-icon incluido)
│   └── src/
│       ├── db/                # Dexie: esquema, tablas, outbox
│       ├── sync/              # push/pull, reintentos
│       ├── lib/               # api client, auth (supabase-js), progression (espejo)
│       ├── pages/             # Hoy, Sesión, Rutinas, Ejercicios, Progreso, Ajustes
│       └── components/
└── catalog/
    ├── README.md              # instrucciones para subir fotos (ver §10)
    ├── exercises.json         # catálogo generado desde las fotos
    └── photos/
        ├── inbox/             # AQUÍ suelta Valentin las fotos nuevas (sin procesar)
        └── processed/         # fotos ya analizadas e incluidas en exercises.json
```

---

## 4. Modelo de datos

Todas las tablas con datos de usuario llevan `user_id` (uuid de Supabase Auth). IDs = **UUID generados en el cliente** (necesario para offline). Todas las tablas sincronizables llevan `updated_at` (timestamptz) y `deleted_at` (borrado lógico).

**Catálogo (compartido)**
- `exercises`: `id, name, machine_name, equipment` (`machine|cable|barbell|dumbbell|bodyweight|smith|plate_loaded`), `primary_muscle, secondary_muscles[]`, `movement_pattern` (`push|pull|squat|hinge|lunge|carry|isolation|core`), `unilateral bool`, `weight_increment_kg` (p.ej. 2.5 / 5), `default_rep_range` (p.ej. "8-12"), `setup_tips`, `photo_ref`, `created_by` (null = catálogo base), `updated_at, deleted_at`.

**Por usuario**
- `profiles`: `user_id, display_name, units='kg', created_at`.
- `user_exercise_settings`: `user_id, exercise_id, machine_settings` (texto libre: altura de asiento, agarre…), `updated_at`.
- `routines`: `id, user_id, name, is_active, updated_at, deleted_at`.
- `routine_days`: `id, routine_id, name` ("Día A – Empuje"), `position, updated_at, deleted_at`.
- `routine_day_exercises`: `id, routine_day_id, exercise_id, position, target_sets, rep_min, rep_max, target_weight_kg, target_rpe, notes, updated_at, deleted_at`.
- `sessions`: `id, user_id, routine_day_id (nullable), started_at, ended_at, notes, updated_at, deleted_at`.
- `session_exercises`: `id, session_id, exercise_id, position, notes, updated_at, deleted_at`.
- `sets`: `id, session_exercise_id, set_index, is_warmup, planned_reps, planned_weight_kg, reps, weight_kg, rpe (numeric 1–10, pasos 0.5), completed bool, notes, updated_at, deleted_at`.

La sesión **copia** lo planificado (planned_*) al empezar, para que cambiar la rutina después no altere el historial.

---

## 5. Sincronización offline

- **Dexie** replica las tablas de usuario + catálogo.
- Cada escritura local añade una entrada a la tabla `outbox` (`table, id, op, payload, ts`).
- `POST /sync/push` — lote de cambios; upsert **idempotente** por `id`; resolución **last-write-wins** por `updated_at`.
- `GET /sync/pull?since=<timestamp>` — devuelve todo lo modificado después de `since` (incluido catálogo y borrados lógicos).
- Disparadores de sync: al abrir la app, al volver a estar online (`online` event), al terminar una sesión y cada N minutos con la app abierta. Reintento con backoff exponencial.
- Indicador discreto en la UI: "Sincronizado / Pendiente (n) / Sin conexión".
- El servidor **siempre** filtra por el `user_id` del JWT; nunca confía en el `user_id` del payload.

---

## 6. Lógica de negocio

**Métricas** (`services/metrics.py`, espejo en TS si hace falta en offline):
- 1RM estimado (Epley): `w * (1 + reps/30)`; ignorar series de calentamiento y reps > 12 para el gráfico de e1RM.
- Volumen por ejercicio/sesión: `Σ weight_kg * reps` (series no-calentamiento completadas).
- Top set por sesión: serie con mayor e1RM.

**Sugerencia de progresión** — doble progresión, función pura y testeada:
- Entrada: objetivo del `routine_day_exercise` (rep_min, rep_max, target_rpe, increment) + últimas 1–3 sesiones del ejercicio.
- Si en la última sesión **todas** las series efectivas llegaron a `rep_max` con RPE ≤ objetivo → sugerir `peso + increment`, reps a `rep_min`.
- Si se llegó al rango pero no al máximo → mismo peso, intentar +1 rep por serie.
- Si alguna serie quedó por debajo de `rep_min` o RPE > objetivo + 1 → mantener peso; si ocurre 2 sesiones seguidas → sugerir bajar ~5–10 %.
- Mostrar la sugerencia como texto + valores precargados editables al empezar la sesión, con el motivo ("La semana pasada: 3×12 @ RPE 8 → sube a 42,5 kg").
- Implementar en TypeScript en el cliente (para que funcione offline) **y** en Python (tests/endpoint `/stats`), con los mismos casos de test.

---

## 7. UX (móvil primero, iPhone)

- Pantallas: **Hoy** (siguiente día de la rutina + botón Empezar) · **Sesión** (registro) · **Rutinas** · **Ejercicios** · **Progreso** · **Ajustes** (usuario, exportar datos, cerrar sesión).
- Registro en sesión: una tarjeta por ejercicio; filas de series con peso y reps precargados; botones grandes (≥ 44 px) para ✓ completar, +/– peso por `weight_increment_kg`, ±1 rep; selector rápido de RPE (6–10 en pasos de 0,5); nota por serie y por ejercicio.
- Inputs numéricos con `inputmode="decimal"`; nada de teclados completos para números.
- Mostrar al lado de cada ejercicio "Última vez: 3×10 @ 40 kg" y los ajustes de máquina guardados.
- Interfaz en **español**, coma decimal en la UI, kg, zona horaria Europe/Madrid.
- PWA: `display: standalone`, `apple-touch-icon`, `theme-color`, respetar `safe-area-inset`. Modo oscuro por defecto.
- Exportar datos a CSV/JSON (copia de seguridad personal).

---

## 8. Plan de fases

Cada fase termina con: tests pasando, app ejecutable en local y actualización de **Estado actual**.

**Fase 0 — Andamiaje**
- Repo, `.gitignore`, backend con `uv` + FastAPI "hello", frontend Vite+React+TS+Tailwind, `vite-plugin-pwa` con manifest e iconos.
- Proyecto Supabase creado; `.env.example` en ambos lados. Ruff + mypy (backend), ESLint + Prettier (frontend).
- Crear `catalog/photos/inbox/` y `catalog/photos/processed/` (con `.gitkeep`), `catalog/exercises.json` vacío (`[]`) y `catalog/README.md` con las instrucciones de §10 para subir fotos.
- ✅ Hecho cuando: `uvicorn` y `npm run dev` arrancan; la PWA se puede abrir en el iPhone en la red local.

**Fase 1 — Backend: modelo y auth**
- Modelos SQLAlchemy + migración Alembic inicial; verificación JWT de Supabase en `auth.py`.
- CRUD de exercises, routines, routine_days, routine_day_exercises.
- `import_catalog.py` que lee `catalog/exercises.json` (upsert por `id`).
- ✅ Tests de auth (rechaza tokens inválidos, aislamiento entre usuarios) y CRUD.

**Fase 2 — Frontend: login, catálogo y rutinas**
- Login con magic link (supabase-js). Esquema Dexie. Pantallas Ejercicios y Rutinas (crear días, añadir ejercicios con series/rango/peso/RPE, reordenar).
- Todo escribe en Dexie (aún sin sync real).

**Fase 3 — Registro de sesión (núcleo)**
- Pantalla Hoy + Sesión completa (§7). Copia de lo planificado, "última vez", ajustes de máquina, notas, RPE.
- ✅ Hecho cuando: se puede hacer una sesión entera en modo avión.

**Fase 4 — Sincronización**
- Outbox, `/sync/push`, `/sync/pull`, indicador de estado, reintentos.
- ✅ Tests: idempotencia, LWW, borrado lógico, dos dispositivos del mismo usuario, aislamiento entre usuarios.

**Fase 5 — Progreso**
- Pantalla Progreso: por ejercicio, gráfico de e1RM, top set y volumen; histórico de sesiones con notas.

**Fase 6 — Sugerencia de progresión**
- `progression.ts` + `progression.py` con la misma batería de tests; integración al empezar sesión.

**Fase 7 — Despliegue y familia**
- Backend en Render, frontend en Cloudflare Pages, CORS restringido al dominio del frontend, variables de entorno.
- Instalar en el iPhone desde Safari → Compartir → "Añadir a pantalla de inicio". Dar de alta a los demás usuarios.
- Backup: script/acción programada que exporte la BD (pg_dump) periódicamente.

**Fase 8 — Catálogo desde fotos** (cuando Valentin tenga las fotos; puede hacerse en cualquier momento tras la Fase 1)
- Valentin arrastra las fotos a `catalog/photos/inbox/` en VS Code y pide: «Procesa las fotos del inbox».
- Claude Code sigue el procedimiento de §10 y luego ejecuta `python -m app.scripts.import_catalog`.
- Para máquinas nuevas más adelante: mismo flujo, o alta manual en la pantalla Ejercicios.

**Fase 9 — Panel de administración (escritorio)**
- Ruta `/admin` en el mismo frontend React, protegida por email de admin (variable de entorno `VITE_ADMIN_EMAIL`).
- UI optimizada para pantalla ancha: tablas en lugar de tarjetas móviles.
- Secciones:
  - **Catálogo**: tabla de ejercicios con edición inline de todos los campos + botón importar desde `exercises.json`.
  - **Estadísticas globales**: volumen total por semana, e1RM por ejercicio, sesiones en los últimos 30 días.
- Nuevo endpoint FastAPI necesario: `GET /admin/stats` (requiere `admin_user_id` en config).
- No requiere despliegue separado: se sirve desde Cloudflare Pages en la misma URL.
- ✅ Hecho cuando: Valentin puede editar el catálogo y ver estadísticas desde el navegador del PC.

---

## 9. Limitaciones conocidas del hosting gratuito

- **Supabase Free pausa el proyecto tras 7 días sin actividad**; los datos se conservan pero hay que reactivarlo desde el panel. Mitigación: tarea programada (GitHub Actions cron, cada 3 días) que haga una consulta ligera a la BD. Si molesta, pasar a Pro.
- **Render Free duerme el servicio tras 15 min sin peticiones**; la primera petición tarda ~30–60 s. Mitigación: la arquitectura offline-first lo hace invisible (la sync va en segundo plano). Opcional: ping al abrir la app para "despertar" el backend.
- **iOS Safari / PWA:** usar siempre la app instalada en pantalla de inicio (el almacenamiento de las PWAs instaladas es más estable que el de pestañas de Safari); aun así, el servidor es la copia de seguridad y la exportación CSV/JSON es el plan B.
- Límites de Supabase Free (500 MB BD) sobrados para este uso.

---

## 10. Catálogo desde fotos

### Cómo sube Valentin las fotos
- Arrastrar las fotos (JPG, PNG o HEIC del iPhone) a `catalog/photos/inbox/` desde el explorador de VS Code.
- Mejor 1–2 fotos por máquina: una general y, si la hay, una de la placa/pegatina con el nombre o los dibujos de uso.
- Si Valentin ya sabe para qué la usa, puede ponerlo en el nombre del archivo (`curl_femoral_tumbado.jpg`); si no, el nombre da igual.

### Procedimiento para Claude Code («Procesa las fotos del inbox»)
1. Si hay HEIC, convertirlas a JPG (p.ej. `pillow-heif`) y redimensionar a ≤ 1600 px de lado largo para que pesen poco.
2. Ver cada foto con la herramienta de lectura de imágenes. Agrupar las fotos que sean de la misma máquina.
3. Por cada máquina, identificar: ejercicio, nombre/marca de la máquina si se lee, equipo, músculos, patrón de movimiento, unilateral o no, incremento de peso (mirar la pila de placas), rango de reps por defecto y consejos de ajuste.
4. Si una máquina permite varios ejercicios (p.ej. polea), crear una entrada por ejercicio con el mismo `photo_ref`.
5. Añadir las entradas a `catalog/exercises.json` con un UUID nuevo, **sin duplicar** las que ya existan (comparar `name` + `machine_name`).
6. Mover las fotos procesadas a `catalog/photos/processed/` renombradas en `snake_case` según el ejercicio.
7. Mostrar a Valentin una tabla resumen (foto → ejercicio, músculo principal, incremento) y marcar con ⚠️ las que no estén claras para que las confirme **antes** de importar.
8. Tras su confirmación, ejecutar `python -m app.scripts.import_catalog`.

### Formato de `catalog/exercises.json`

```json
[
  {
    "id": "b3f1c6e2-...-uuid",
    "name": "Press de pecho en máquina",
    "machine_name": "Chest Press (marca/modelo si se ve)",
    "equipment": "machine",
    "primary_muscle": "pectoral",
    "secondary_muscles": ["tríceps", "deltoides anterior"],
    "movement_pattern": "push",
    "unilateral": false,
    "weight_increment_kg": 5,
    "default_rep_range": "8-12",
    "setup_tips": "Asiento con las asas a la altura media del pecho.",
    "photo_ref": "photos/processed/press_pecho_maquina.jpg"
  }
]
```

Músculos en español y en minúsculas, de esta lista cerrada: pectoral, dorsal, trapecio, romboides, deltoides anterior, deltoides lateral, deltoides posterior, bíceps, tríceps, antebrazo, cuádriceps, isquiotibiales, glúteo, aductores, abductores, gemelos, abdominales, oblicuos, lumbares.

---

## 11. Convenciones de trabajo

- Código, nombres de variables y commits en **inglés**; UI y comentarios de dominio en **español**.
- Backend: type hints en todo, Pydantic para entrada/salida, `pytest` (+ `httpx` TestClient), Postgres de test en Docker o esquema temporal.
- Frontend: TypeScript estricto, componentes funcionales, sin librerías de estado global innecesarias (Dexie + `useLiveQuery` + React Query para llamadas a la API).
- Nunca commitear `.env`, claves de Supabase ni la `service_role` key. La `service_role` key **jamás** en el frontend.
- Antes de dar una fase por terminada: `ruff check`, `mypy`, `pytest`, `npm run lint`, `npm run build`.
- Cambios de esquema siempre por migración Alembic + versión del esquema Dexie.
- Pregunta antes de: cambiar una decisión de §2, añadir dependencias pesadas o servicios de pago.

---

## 12. Variables de entorno

**backend/.env**
```
DATABASE_URL=postgresql+psycopg://...   # cadena del pooler de Supabase
SUPABASE_URL=https://<proyecto>.supabase.co
SUPABASE_JWT_SECRET=...                  # o validar con JWKS si el proyecto usa claves asimétricas
CORS_ORIGINS=http://localhost:5173,https://<frontend>.pages.dev
```

**frontend/.env**
```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:8000
```

---

## 13. Decisiones abiertas

- Nombre definitivo de la app (provisional: **GymLog**).
- ¿Compartir rutinas entre usuarios de la familia (copiar la rutina de otro)? — de momento no.
- ¿Añadir más adelante temporizador de descanso, notas de voz o análisis de fotos en la app?

---

## Estado actual

- Fase: **7 + 8 completas + mejoras post-deploy + Perfil**
- Último cambio (2026-11-10):
  - **Perfil**: pantalla nueva (tab 👤) con datos personales (nombre, altura, fecha nacimiento, sexo, objetivo) y mediciones corporales con historial y mini gráfico de peso.
  - `body_metrics` table (backend + Dexie v3) con sync LWW completo.
  - Migración Alembic `c3e7a1f2d4b8` aplicada automáticamente al arrancar el backend (FastAPI lifespan).
  - Start Command de Render: `uv run --active python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Pendientes (por orden de prioridad):**
  1. **Fase 6** — Sugerencia de progresión al empezar sesión.
  2. **Calculador de calorías** por sesión (MET × peso × duración), visible en Progreso.
  3. **Gráficos de métricas corporales en Progreso** (peso, % grasa, cintura a lo largo del tiempo).
  4. **Fase 9 Admin** — estadísticas globales (`GET /admin/stats`); catálogo ya funciona.

### Notas de la Fase 0
- En Windows, uvicorn y pytest deben lanzarse como módulo Python: `uv run python -m uvicorn ...` / `uv run python -m pytest`
  (los scripts `.venv/Scripts/*.exe` dan "Access is denied" en este entorno)
- `npm run build` genera PWA con service worker y precache correctamente.

### Notas de la Fase 1
- `secondary_muscles` usa `JSON` (no `ARRAY`) para compatibilidad con SQLite en tests.
- Tests usan SQLite en memoria con una única conexión + savepoints para aislamiento.
- Para crear la migración inicial (cuando haya BD configurada): `uv run python -m alembic revision --autogenerate -m "initial"` y luego `uv run python -m alembic upgrade head`.
