# Tracker — cómo trabajar acá

## Lo que es público
El repo y el sitio son **públicos** (GitHub Pages). Nada que no pueda leer
cualquiera entra a un archivo versionado. Ninguna credencial, nunca.

Los tokens no pasan por el chat. Las claves viven en secretos de Supabase o
en el Llavero de macOS. Si necesitás una, pedime que la cargue yo.

**Los datos de los clientes viven en la base, nunca en git.** Ni nombres, ni
teléfonos, ni mails, ni un export "para probar". Si hace falta un SQL que los
toque, corrélo y no lo versiones: va en el scratchpad, no en el repo. El
`.gitignore` de la raíz bloquea los formatos en los que salen (csv, xlsx,
dumps), pero el cerco no te salva de pegarlos adentro de un `.sql` o un `.md`.

Y acordate de que **el historial no se olvida**: borrar el archivo después no
lo saca de los commits viejos. Se arregla antes de commitear, no después.

## La app
`index.html` y, desde el 17/10/2026, partes separadas en `js/`: `js/fathom.js`
(llamadas de Fathom), `js/meta.js` (Meta Ads: uso de la API, gasto, rango,
columnas de metricas y la sincronizacion de anuncios) y `js/bienvenida.js` (el
parte del dia nuevo, 19/10/2026: es la bienvenida de todo el equipo; con la llave localStorage
`evold-bienvenida-v2` = '0' vuelve la de antes; ahi mismo vive «Buenas noches», el cierre del dia: `buenasNochesMostrar()`, sale sola una vez al abrir la app despues de las 19:00 y con el boton de la luna del menu; la tarjeta «Lo que hiciste hoy» lee `maquina.eod`, que escribe la rutina de cierre con `rpc/set_eod`, migracion 043; el «buen dia» lee `maquina.carteraEstado` («Como van los clientes», la lectura de resultados del reporte de campañas, `rpc/set_cartera_estado`, migracion 044)). `js/avisos.js` pasa a ticket directo los cambios propuestos con `crear:'ticket'` (los que nacen de una llamada, a nombre de `responsable`) y a ticket del CSM (rolId 'csm') los cambios
propuestos con `para:'csm'` (avisos y tareas del cliente), con `tambien` = las
socias (personas con `socioId`). JS de navegador, sin build ni
framework: cada `js/*.js` es un `<script src>` clasico que se carga ANTES del
principal, con funciones globales (los `onclick=""` las siguen encontrando).
En `js/` solo van declaraciones: nada que al cargar use algo del principal
(lo controla `tests/modulos.test.js`, que carga cada modulo solo).
Se separa de a una parte por vez con `tools/separar.mjs` (mismo codigo, mismo
orden; se comprueba que no falte ni sobre ninguna declaracion).
**Nunca reescribas un archivo entero: solo el bloque que te pida.**

La app se publica SOLO si pasan los tests (`.github/workflows/tests.yml`
publica Pages despues de `npm test`). Al publicar, `?v=DEV` de los
`<script src>` se cambia por el commit.

`js/etapas-csm.js` (28/10/2026): las tareas del CSM por etapa (`CSM_ETAPAS`:
onboarding, estrategia, sistemas, lanzamiento, recurrente), arriba de las de la
plantilla en la ficha del Panel 360 (`_csmEtapaHtml`). Son del rol, valen para
todos los clientes sin cargar nada; lo tildado va en `datos.csmTareas[id]`
({ok, at, por}) y el bloqueante de cada etapa en `datos.etapaTraba[k]`
({t, quien, para, at, por}). La tarea «agendar» se tilda sola con una cita de
GHL o cargada a mano de esa etapa; una adivinada NO la tilda. Las rutinas y
Claude tildan una tarea mandando un hecho a `maquina.hechos` (agregar_hechos,
051) con `csmTarea:'<id>'`: `csmHechosAplicar()` (en el ciclo de js/avisos.js)
lo pasa a `csmTareas[id]` con `por:'claude'`, `evidencia` y la fecha del hecho,
una sola vez (`datos.csmHechosAplicados`) y nunca encima de una tildada a mano.

## Base de datos
- Leer: `sbq`, libre.
- Escribir: `sbw` / `sbsql`, **solo avisándome antes**.
- Las tablas tienen RLS prendida (`agente_pedidos`, la cola de «Mandar al agente», se sumó el 14/10/2026 con la 039; desde el 16/10 también lleva los pedidos de cambios a la app, con `cambio_id` «sistema-…» a nombre del cliente interno, que revisa la rutina `cambios-sistema`). `anon` no puede leer ninguna; lo único
  que puede es INSERT en `lp_eventos`, que es el tracking de las landings.
  **Ese estado no se toca**, y no se "desactiva un momento" para destrabar
  nada. Si algo falla por permisos, avisame: el problema es otro.
- `fathom_keys` y `gcal_cuentas` tienen RLS y cero policies **a propósito**:
  guardan credenciales. No les agregues policies. Lo mismo `mcp_claves` y
  `mcp_registro` (040): las claves del conector «Evolve OS · consulta»
  (función `evolve-mcp`, solo lectura, para el Claude de cada persona del
  equipo). Una clave se apaga con `activa=false`; la clave en sí vive en el
  Llavero (`evolve-mcp-<persona>`), en la tabla solo su sha256. Y
  `tokens_clientes` (041): los tokens de Meta y GHL de cada cliente. Por
  ahora es una COPIA que mantiene un disparador desde `clientes.datos`; los
  que usan tokens pasan de a uno a leer de ahi (con la ficha de respaldo) y
  al final se sacan de las fichas.
- `llamadas_grupales` (042): las capacitaciones con varios clientes, una fila
  por cliente que estuvo, con los minutos y tramos de SU caso. La escribe solo
  la rutina `pendientes-de-llamadas` (service key); el equipo la lee. Un tramo
  dudoso no se carga: se le pregunta a Angie.
- `errores_agenda` (046): cada falla de la función `agendar` que vio alguien
  del equipo (quién, acción, código, error tal cual, dispositivo). La escribe
  `agLlamar` desde la app de cada uno, solo a su nombre; se lee para no
  depender de capturas.
- `formularios_onboarding` y `formularios_respuestas` (047): el formulario de
  onboarding de cada cliente (portal/formulario.html). El cliente entra sin
  cuenta con un código de 40 caracteres en el link; en la base solo está su
  sha256. Lee y escribe SOLO la función `formulario` (service key); el equipo
  lee. Audios y archivos en el bucket privado `formularios`. Cero policies
  para `anon`.
- `set_vigilancia` (048): las rutinas «Leads sin mensaje 1 y conversaciones
  del día» (8:35 y 18:35) y «Parte de WhatsApp» (18:45) dejan su resumen en
  `maquina.vigilancia.{leads,whatsapp}` del cliente interno (Evolve); el buen
  día y el buenas noches lo muestran (js/bienvenida.js).
- `set_mensajes_dia` (049): esas mismas rutinas redactan los mensajes que hay
  que mandarles a los clientes ese día y los dejan en
  `maquina.mensajesDia.{leads,whatsapp}`; el buen día los muestra con un
  botón para copiar. La app no manda nada.
- Las policies de `clientes`, `config` y `llamadas_fathom` exigen **rol
  agencia**. Toda cuenta nueva nace como `cliente` sin acceso: para darle
  acceso a alguien hay que agregarle el perfil.
- `perfiles` tiene **dos candados**: sin grant de escritura para
  `authenticated`, y sin policy de escritura. Así nadie puede ascenderse a
  `agencia` desde la app. El día que exista la pantalla de Personas hay que
  agregar **los dos**, en el mismo commit que la pantalla.

## Verificar antes de decir que está hecho
1. Extraer el `<script>` y `node --check`, y `node --check js/*.js`.
2. Diff de la lista de funciones contra `git show HEAD:index.html` (sumando
   las de `js/*.js` de los dos lados).
3. Probar en `http://localhost:8731` entrando con "Entrar sin sincronizar".
4. Recién ahí commit y push.

Los scripts de Python con `assert` que falla **no escriben nada**: si el ancla
no matchea, corregila y volvé a correr. Y al insertar código, revisá que no
te comiste la función de al lado.

## Este archivo
Cuando cambiemos algo que este archivo describe, **se actualiza en el mismo
commit**. Un CLAUDE.md desactualizado miente, y se le cree.

## Cosas que ya me equivoqué acá
- **Agendada ≠ hecha.** Que exista una cita no prueba que la reunión ocurrió.
  Nunca desbloquees un cobro ni muevas una reunión por una cita *adivinada*.
- **No afirmes un diagnóstico sin medirlo.** Si no lo podés medir, decí que no
  lo podés medir y poné el dato en pantalla para que lo vea yo.
- **Caché.** GitHub Pages cachea 10 min. Para probar en vivo, URL con `?v=`.
- Los comentarios del código explican **por qué**, no qué hace la línea.
  En español, como el resto del archivo.

## Las tres zonas

Cada archivo de este repo pertenece a una zona. **La zona se deduce de la ruta,
no del criterio.**

| Ruta | Zona |
|---|---|
| `index.html`, `editor-ia/` | **LIBRE** |
| `portal/` | **CLIENTE** |
| `supabase/`, y cualquier SQL | **COMPARTIDA** |

Reglas que valen para las tres:

- **Al empezar cualquier tarea, decime en qué zona vas a trabajar, antes de
  tocar nada.** Una línea alcanza.
- **Si no podés ubicar un archivo, tratalo como COMPARTIDA y preguntame.**
- **Un cambio no puede tocar dos zonas en el mismo commit.** Si la tarea
  necesita las dos, son dos commits, y el de la zona COMPARTIDA va primero.

### Zona LIBRE — el tracker de la agencia

`index.html`, `editor-ia/`. Lo usamos Martín y Angie. Si se rompe, nos rompe a
nosotros y lo arreglamos mañana.

- Editá directo. Mostrame el diff como siempre, pero no hace falta que pidas
  permiso antes de cada cambio.
- Igual vale la regla de siempre: nunca reescribas `index.html` entero.

### Zona CLIENTE — la pantalla del portal

`portal/`. La ven clientes. Si se rompe, lo ve gente de afuera de la agencia.

- Antes de editar: decime en una línea **qué va a ver distinto el cliente**.
- Después de editar: probalo y contame **cómo** lo comprobaste.
- Nunca publiques sin que yo te lo diga.
- **Ninguna clave ni token acá, de ningún tipo.** El portal no habla con
  Anthropic, ni con Meta, ni con GHL. Solo lee y escribe filas de Supabase.
- Todo lo que agregues tiene que funcionar en un teléfono.

### Zona COMPARTIDA — base de datos y funciones

`supabase/`, y cualquier SQL en cualquier lado. Afecta al tracker y al portal a
la vez, y el cliente se entera antes que yo.

- **Solo cambios que suman:** agregar tabla, columna, policy o función.
  **Nada de `drop`, `rename`, ni cambiar el tipo de una columna que ya existe.**
  Si te parece que hay que borrar algo, proponémelo y esperá; no lo hagas.
- Cada cambio va en un archivo numerado en `supabase/migraciones/`, aunque lo
  corras a mano. En el mismo archivo, escribí **cómo se vuelve atrás**.
- Después de aplicar: comprobá que **el tracker Y el portal** siguen andando, y
  decime cómo lo comprobaste.

### Estructura

```
/
├── CLAUDE.md
├── index.html              ← LIBRE      el tracker
├── editor-ia/              ← LIBRE
├── portal/                 ← CLIENTE    la pantalla de leads
└── supabase/
    ├── migraciones/        ← COMPARTIDA el SQL, numerado
    └── functions/          ← COMPARTIDA
```
