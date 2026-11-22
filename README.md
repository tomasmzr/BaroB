# BaroB

Web app (PWA) para llevar los gastos del hogar y repartirlos **en proporción a los ingresos** de cada integrante.
Reemplaza la planilla de Google Sheets: gastos del mes, gastos fijos, gastos en cuotas, cierre de mes con liquidación
("quién le da a quién") e historial con evolución por categoría.

## Cómo funciona

- **Ingresos**: cada mes cada miembro carga lo que ganó. Si tu ingreso es el 65% del total, te toca pagar el 65% de los gastos.
- **Gastos del mes**: descripción, monto (puede ser negativo: devoluciones/compensaciones), quién pagó, categoría, fecha.
- **Gastos fijos**: plantillas (Alquiler, Luz…) con descripción y categoría fijas. Cada mes solo se completa quién pagó y cuánto.
- **Cuotas**: se carga el total y la cantidad de cuotas; cada mes se imputa una cuota al pagador. Al cerrar el mes avanza el contador y cuando llega al final desaparece.
- **Cerrar mes**: solo se puede si **todos los miembros cargaron al menos un ingreso** y **todos los fijos están completos**.
  Guarda el resumen en el historial, arranca un mes nuevo vacío, reinicia los fijos y avanza las cuotas.
  Cada miembro recibe una notificación con lo que tiene que recuperar o poner, y la app muestra las transferencias mínimas.
- **Grupos**: sin administradores, todos pueden todo. Se invita con un link (vence a los 14 días). Cualquiera puede quitar a otro o salir.

### Ideas tomadas de Splitwise / Tricount

- Botón **+** central siempre a mano y la app **abre directo en "Nuevo gasto"** (configurable).
- Monto grande primero con teclado numérico, el pagador por defecto sos vos, categorías como chips de un toque.
- Autocompletado de descripciones ya usadas que además **sugiere la categoría**.
- Balance personal visible en la pantalla principal ("te tienen que devolver / te falta poner").
- Liquidación con **mínima cantidad de transferencias** al cerrar.
- Lista de gastos agrupada por día; tocar un gasto lo edita.

## Stack (todo en tiers gratuitos)

| Pieza | Uso |
|---|---|
| React + Vite + TypeScript | Frontend PWA (`vite-plugin-pwa`, service worker propio en `src/sw.ts`) |
| Supabase Auth | Login sin contraseña con **código por email** (OTP de 6 dígitos) |
| Supabase Postgres + RLS | Datos; cada grupo solo es visible para sus miembros |
| Supabase Realtime | Los cambios de un miembro aparecen al instante en los demás |
| Supabase Edge Function `notify` | Envía Web Push a los demás miembros |
| Hosting estático | GitHub Pages / Cloudflare Pages / Vercel |

La lógica sensible (resumen, liquidación, cierre) vive en Postgres (`supabase/migrations/…_init.sql`):
`period_summary`, `close_blockers`, `close_period`, `create_group`, `create_invite`, `join_group`.

## Puesta en marcha

### 1. Supabase

```bash
supabase login
```

```bash
supabase link --project-ref <ref-del-proyecto>
```

```bash
supabase db push
```

```bash
supabase config push
```

`config push` sube la plantilla de email con el código (`supabase/templates/magic_link.html`).
Alternativa manual: Dashboard → Authentication → Email Templates → "Magic Link", incluir `{{ .Token }}`.

> El SMTP incluido en Supabase permite pocos emails por hora. Para un grupo familiar alcanza
> (la sesión queda abierta), pero si molesta se puede configurar un SMTP gratuito (Resend, Brevo).

En Authentication → URL Configuration poné como **Site URL** la URL donde quede publicada la app.

### 2. Notificaciones (Web Push)

```bash
npx web-push generate-vapid-keys
```

```bash
supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:<tu-email>
```

```bash
supabase functions deploy notify
```

La clave **pública** también va en `VITE_VAPID_PUBLIC_KEY`.

En iPhone las notificaciones funcionan solo con iOS 16.4+ y con la app **agregada a la pantalla de inicio**
(Safari → Compartir → Agregar a inicio). Después se activan en Ajustes → Notificaciones.

### 3. Frontend

```bash
cp .env.example .env.local
```

```bash
npm install
```

```bash
npm run dev
```

### 4. Publicar

El workflow `.github/workflows/deploy.yml` publica en GitHub Pages en cada push a `main`.
Requiere los secrets del repo `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`
y en Settings → Pages elegir "GitHub Actions" como fuente.

## Credenciales

Nada sensible está en el repo. En la Mac de desarrollo quedan en el Llavero de macOS:

- `barob-supabase-db`: contraseña de la base de datos de Supabase.
- `barob-vapid-private`: clave privada VAPID (también cargada como secret en Supabase).

```bash
security find-generic-password -a barob -s barob-supabase-db -w
```

## Estructura

```
src/
  App.tsx              rutas y barra inferior
  screens/             Mes, Nuevo gasto, Fijos, Resumen y cierre, Historial, Ajustes, Login…
  components/          formulario de gasto, hojas modales, gráficos, UI base
  state/               sesión/grupo actual y consultas (TanStack Query + Realtime)
  lib/                 supabase, formato de montos, push
  sw.ts                service worker (cache offline + push)
supabase/
  migrations/          esquema, RLS y funciones
  functions/notify/    edge function de notificaciones
```
