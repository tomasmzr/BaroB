# BaroB — contexto para continuar

PWA para registrar gastos del hogar (o personales) y repartirlos entre los miembros de un grupo.
Reemplaza una planilla de Google Sheets. Nombre y marca: **BaroB**, dos "B" espejadas.

- App publicada: https://tomasmzr.github.io/BaroB/
- Repo: https://github.com/tomasmzr/BaroB (público, rama `main`)
- Estado: en uso real. Cerrada tras la **3ª revisión** del usuario (ver "Historial de revisiones").

## Cómo trabajar con el usuario

- Escribe en **español rioplatense**: responder igual. La UI está en español (es-AR, moneda ARS).
- Manda las revisiones como archivos `.rtf` en la raíz (`first-revision.rtf`, …). Leerlos con
  `textutil -convert txt -stdout <archivo>`. El pedido original está en `initial-prompt.md.txt`.
- **Todo cambio se commitea y se pushea a GitHub** (es su backup). El push a `main` despliega solo.
- Delegó la operación de los servicios (GitHub, Supabase): se hacen con los CLIs ya logueados.
  Igual, **confirmar antes de borrar algo** que no sean datos de prueba propios.
- Hay datos reales en producción (otros usuarios además de él). No tocarlos.
- Le gusta: minimalista, rápido para cargar, poca fricción. Verde = marca (no usarlo en categorías).

## Servicios, accesos y secretos

| Qué | Dónde |
|---|---|
| GitHub CLI `gh` | logueado como `tomasmzr` (scopes repo, workflow, delete_repo) |
| Hosting | GitHub Pages vía `.github/workflows/deploy.yml` (build con `BASE_PATH=/BaroB/`) |
| Secrets del repo | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` |
| Supabase | proyecto `vdlllurzzgnkznnizrfi` (región sa-east-1, plan free). CLI logueado y `supabase link` hecho |
| Contraseña DB | Llavero de macOS: `security find-generic-password -a barob -s barob-supabase-db -w` |
| VAPID privada | Llavero (`-s barob-vapid-private`) y secret de Supabase `VAPID_PRIVATE_KEY` |
| Secrets de la función | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| `.env.local` | local, ignorado por git; mismas 3 variables `VITE_*` que el repo |
| Repo viejo | `tomasmzr/BaroB-ios-old` (intento anterior en Xcode), privado y archivado. No tocar |

Las keys se pueden sacar en el momento: `supabase projects api-keys --project-ref vdlllurzzgnkznnizrfi -o json`.
Nunca imprimir keys en el chat ni commitearlas.

Herramientas instaladas en la Mac: Node (brew), `gh`, `supabase` CLI, PostgreSQL 17 (brew, para tests).
No hay Docker → no hay `supabase start`; la base se prueba con el Postgres local (ver abajo).

## Stack y estructura

React 19 + Vite + TypeScript, TanStack Query, react-router (**HashRouter**), Recharts, vite-plugin-pwa
(`injectManifest`, service worker propio). Backend: Supabase (Auth, Postgres + RLS, Realtime, Edge Function).

```
src/
  App.tsx              rutas; <Shell> = barra de grupo + página + tutorial + barra inferior
  main.tsx             providers (QueryClient, HashRouter, Session, Toast) + registro del SW
  sw.ts                precache + push + click en notificación
  index.css            todo el estilo: tokens de color claro/oscuro en :root, componentes
  lib/
    supabase.ts        cliente + errorText() (traduce errores a español)
    format.ts          money, pct, fechas, periodName ("Noviembre 2026"), parseAmount,
                       formatAmountInput/amountToInput (campo "$ 1.234,56"), installmentAmount
    format.test.ts     vitest (npm test)
    push.ts            suscripción Web Push, notify() → edge function
    prefs.ts           preferencias locales (tema, abrir en nuevo gasto, tutorial visto)
    types.ts           tipos de las tablas y del resumen
  state/
    session.tsx        sesión, perfil, grupos, grupo actual (localStorage barob.group), useGroup()
    data.ts            hooks de datos (useExpenses, useSummary…) + realtime + modo demo
    demo.ts            datos ficticios del tutorial (grupo "Casa (ejemplo)")
  components/
    ui.tsx             íconos, logo, Sheet (portal + teclado iOS), Toast, chips, AmountInput, Stepper…
    ExpenseForm.tsx    alta/edición de gasto, cuotas y devoluciones
    IncomeSheet.tsx    alta/edición de ingreso (se elige de quién)
    CatalogSheets.tsx  CategorySheet, FixedTemplateSheet, PALETTE de colores de categorías
    GroupPicker.tsx    GroupBar (selector arriba en todas las pantallas) + NewGroupSheet
    SummaryView.tsx    resumen: liquidación, por persona, torta de categorías, devoluciones
    Tour.tsx           tutorial interactivo (activa el modo demo mientras corre)
  screens/             Month, AddExpense, Fixed, CloseMonth, History, HistoryDetail, Settings,
                       Login, ResetPassword, Onboarding, Join, Setup
supabase/
  migrations/          esquema + funciones (orden cronológico, ver abajo)
  functions/notify/    Edge Function de notificaciones push
  config.toml          config de auth (site_url = la URL de Pages)
scripts/               test-session.py, pg-test-stub.sql (herramientas de prueba)
public/                logo.svg + íconos generados (npx pwa-assets-generator)
```

Rutas (hash): `#/` Mes, `#/add`, `#/fixed`, `#/close`, `#/history`, `#/history/:id`, `#/settings`,
`#/join/:code`, `#/start` (start_url del manifest: va a `/add` o `/` según preferencia).

## Modelo de datos (Postgres, schema public)

- `profiles` (1 por usuario, se crea por trigger en auth.users) · `groups` · `group_members`
  (`split_pct` para modo % fijos) · `invites` (código de 8, vence en 14 días)
- `categories` (archivado lógico: `archived`) · `fixed_expenses` (plantillas; baja lógica: `active=false`)
- `periods`: un solo período abierto por grupo (`closed_at is null`). `month` = primer día del mes
  que lo nombra; arranca en el mes calendario de creación y **avanza +1 mes en cada cierre**,
  sin importar la fecha real del cierre. Al cerrar se guarda `summary` (jsonb, snapshot).
- `incomes` (monto > 0) · `expenses` (monto con signo; **negativo = devolución/reintegro**,
  columna generada `is_refund`; `fixed_expense_id` si es un fijo, único por período)
- `installment_plans`: total + cantidad de cuotas; `installments_paid` sube en cada cierre;
  la cuota vigente se suma al período abierto; al llegar al total se marca `finished_at`.
  La última cuota absorbe el redondeo (`installment_amount()` en SQL = `installmentAmount()` en TS).
- `push_subscriptions` (por dispositivo)

RLS: todo se filtra por `is_member(group_id)`. Movimientos solo editables si el período está abierto.
No hay admins: cualquier miembro puede todo, incluso cargar ingresos de otro.

### Funciones (RPC) — la lógica de negocio vive acá
- `period_summary(period)`: totales, por persona (income, paid, ratio, share, balance), categorías
  (netas), `refunds`/`refunds_total` aparte, cuotas, `settlements` (transferencias mínimas, greedy).
- `split_ratios(...)`: reparto según `groups.split_mode`:
  `proportional` (a ingresos) · `proportional_capped` (con `split_min`/`split_max`, fracciones 0..1;
  si los topes son imposibles → proporcional puro) · `fixed` (% por miembro, normalizado) ·
  `equal` · `none` (no dividir: a cada uno le toca lo que pagó, solo se informa su %).
- `close_blockers` / `close_period`: no se cierra sin todos los fijos activos completos y, en modos
  `proportional*`, sin un ingreso de cada miembro. `close_period` guarda el snapshot, avanza cuotas
  y abre el período siguiente.
- `create_group(name, currency, timezone)`: crea período, 8 categorías y 5 fijos por defecto.
- `create_invite`, `invite_info`, `join_group`, `set_split`, `remove_member` (borra lo del miembro
  en el mes abierto y sus cuotas pendientes; el historial queda), `member_removal_preview`,
  `delete_my_data(delete_account)`.

### Edge Function `notify`
El cliente la llama después de guardar: `{type: expense|fixed|installment|income|period_closed|test, id}`.
Verifica que el que llama sea miembro y manda Web Push a los **demás** (en `test`, solo a uno mismo).
Borra suscripciones vencidas (404/410). Deploy: `supabase functions deploy notify --use-api`.

## Decisiones y trampas conocidas (leer antes de cambiar algo)

- **Login con email + contraseña.** El plan free de Supabase no deja personalizar los mails con el
  SMTP incluido (no hay OTP por código) y el link mágico en iPhone abre Safari, no la PWA.
  "Olvidé mi contraseña": el link trae `#access_token…&type=recovery`; `session.tsx` lo lee **antes**
  de que el router toque el hash y muestra `ResetPassword`.
- **HashRouter** para que funcione en GitHub Pages sin rewrites.
- Supabase aplica **pg_safeupdate** en la API: todo `UPDATE`/`DELETE` dentro de funciones necesita `WHERE`
  (usar `where true`). El Postgres local NO lo tiene: revisarlo a mano.
- **Nunca editar una migración ya aplicada**: crear una nueva (`supabase/migrations/2026MMDD000000_*.sql`)
  con `create or replace`. Para cambiar `period_summary` copiar la última versión (revision3) y modificarla.
- Las `Sheet` se renderizan con **portal** (si no, quedaban formularios anidados). Siguen al viewport
  visible (teclado de iOS) y dejan libre la barra inferior.
- Pantallas centradas: alto = `100dvh - safe-area-top` (con 100dvh sobraban px y iOS "vibraba").
- iOS: Web Push solo con la app instalada en inicio (iOS 16.4+); sin botones de acción en notificaciones;
  el "from BaroB" lo agrega iOS. Una página no puede instalarse sola en iPhone (en Android sí, con
  `beforeinstallprompt`, ya implementado en el tutorial).
- `navigator.serviceWorker.ready` no resuelve en dev (no hay SW): `push.ts` usa un timeout.
- **Modo demo** (`state/demo.ts`): mientras corre el tutorial, `useGroup()` devuelve el grupo ficticio
  y los hooks de `data.ts` devuelven datos de ejemplo (id de grupo `demo`). No escribe en la base.
  El overlay del tutorial bloquea clics, así que no hay mutaciones en demo.
- Historial: barras apiladas, % de **ingresos** (puede pasar 100%), sin "Restante", eje de a 25%,
  categorías apiladas en el orden de `categories.sort`. La barra roja de excedente es solo de Mes.
  En el resumen del mes en curso sí aparece "Restante"; en el historial no se menciona.
- Colores: verdes = marca (tokens `--green*`); categorías con colores variados (`PALETTE`), nunca verdes.
- Montos: el campo nunca acepta negativos; las devoluciones se marcan con su interruptor y se guardan
  en negativo.

## Flujo de trabajo

**Desarrollo local:** `.claude/launch.json` tiene `barob-dev` (Vite en :5173) para el panel Browser.
`npm run build` (tsc + vite), `npm test` (vitest), `npx oxlint`.

**Cambios en la base:**
1. Escribir la migración nueva.
2. Probarla en el Postgres local (abajo).
3. `supabase db push -p "$(security find-generic-password -a barob -s barob-supabase-db -w)" --yes`
4. Consultas rápidas a producción: `supabase db query --linked "select …"` (solo lectura salvo pedido).

**Probar la base localmente** (PostgreSQL 17 de brew, sin Docker; el socket debe ir por TCP porque
la ruta del scratchpad es demasiado larga):
```bash
export LC_ALL=en_US.UTF-8
/opt/homebrew/opt/postgresql@17/bin/initdb -D <dir>/data -U postgres
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D <dir>/data -o "-p 54329 -k '' -h localhost" -l <dir>/log start
psql -h localhost -p 54329 -U postgres -c "create database t"
psql -h localhost -p 54329 -U postgres -d t -v ON_ERROR_STOP=1 -f scripts/pg-test-stub.sql \
  $(for f in supabase/migrations/*.sql; do echo -f $f; done)
```
Después escribir un `.sql` de escenario (usuarios en auth.users, `set role authenticated`,
`set test.uid = …`, llamar RPCs). Ver comentarios en `scripts/pg-test-stub.sql`.

**Probar la app contra Supabase real:** crear usuarios `ana@barob.test` / `beto@barob.test` con
`scripts/test-session.py`, copiar el JSON a `node_modules/.tmp/` (Vite lo sirve), y en el navegador:
`(await import('/src/lib/supabase.ts')).supabase.auth.setSession(...)`. Armar datos con el cliente
desde la consola. **Al terminar borrar** los grupos creados por esos usuarios y los usuarios
(admin API con la service key), los archivos de sesión y `localStorage`. Poner
`localStorage['barob.tourDone']='true'` para saltear el tutorial.
El navegador del panel no deja abrir `*.supabase.co`: para links de auth, resolver la redirección con curl.

**Publicar:** `git push` a `main` → GitHub Actions despliega Pages (~1–2 min;
`gh run watch <id> -R tomasmzr/BaroB`). Edge function: deploy aparte. En el celular hay que cerrar y
reabrir la app (a veces dos veces) para que tome la versión nueva.

Commits en español, con el trailer `Co-Authored-By` que indique el sistema.

## Historial de revisiones

- **Inicial:** gastos del mes, fijos, cuotas, ingresos, cierre con liquidación, historial, grupos
  con invitación, push, tema claro/oscuro, ícono.
- **Revisión 1:** nombres de mes, modos de división (proporcional / con topes / iguales), quitar
  miembro con aviso, varios grupos, tutorial, fecha en cuotas, ingresos con sub-lista, barra
  inferior siempre visible, notificación de prueba, excedente en rojo, hojas con contraste y teclado.
- **Revisión 2:** modo % fijos, selector de grupo global, tutorial con datos de ejemplo + botón
  instalar, fijos por defecto, colores de categorías, borrar mis datos, historial apilado con mes
  en curso. Cambios menores: texto de bienvenida, rebote de scroll iOS, "Ahorro y vida" → "Restante".
- **Revisión 3:** devoluciones con interruptor y agrupadas aparte, modo "no dividir", monto con "$"
  y separador de miles, "+ Nueva categoría" en el formulario, "+ Agregar gasto fijo" en Fijos,
  ingresos de otra persona, historial sin "Restante" y con orden fijo.

## Pendientes e ideas

- **Automatizar la carga de gastos** (conversado, no empezado). Plan recomendado:
  1. Atajo de iPhone con la automatización "Transacción" de Wallet (Apple Pay en posnet, trae monto y
     comercio) → POST a una edge function nueva con token por usuario → tabla `pending_expenses` →
     push "¿Agregar $X en Y?" → abre BaroB con el gasto precargado; bandeja "Por confirmar" en Mes;
     deduplicar. Sumar atajo de Siri para carga por voz.
  2. Después: casilla de mail (p. ej. Cloudflare Email Routing) + filtro de Gmail que reenvía avisos
     de Mercado Pago/MODO/banco/tarjeta; parsear monto y comercio por emisor (pedir mails de ejemplo).
  No viable: leer Apple Pay/QR/notificaciones desde la PWA, APIs de MP como pagador, open banking AR.
- Sin verificar en iPhone real: hojas de fijos sobre el teclado, notificación de prueba,
  comportamiento del campo de monto con el teclado numérico, tutorial nuevo.
- Detalle abierto: en modo "no dividir", alguien que solo cargó devoluciones muestra % negativo.
- Datos en producción (23/11/2026): cuentas "Tomy" (el usuario) y "Kevu", cada una con un grupo "Casa".
  El grupo "Pipochos" original ya no existe (el usuario usó "borrar todo").
