# Sistema de diseño — Minuto a Minuto CAMPUS FIMLM

Referencia de línea gráfica, animaciones y patrones de navegación usados en esta app, para mantener consistencia en cualquier trabajo futuro sobre ella (o sobre otras herramientas del ecosistema FIMLM que quieran compartir identidad visual). Todos los valores aquí son los reales, extraídos de `app/css/styles.css` — no inventar variantes nuevas sin necesidad; reutilizar los tokens existentes.

## Identidad visual

**Paleta institucional** — tres familias de color, cada una en 3 tonos (claro/medio/oscuro), definidas como custom properties en `:root`:

| Familia | Uso | Tonos |
|---|---|---|
| Navy (`--color-navy-*`) | Color primario: header, títulos, marca | 900 `#0d1f3c` · 800 `#122a52` · 700 `#163868` · 600 `#1c4884` · 500 `#23579c` |
| Orange (`--color-orange-*`) | Acento de acción: CTA principal, marca "CAMPUS" | 600 `#e88a1a` · 500 `#f5a623` · 400 `#f9b84a` |
| Cyan (`--color-cyan-*`) | Acento secundario: enlaces, focus, hover interactivo | 600 `#0d6ea8` · 500 `#2196d6` · 400 `#4db3e8` |

Semánticos: `--color-success: #1f9d55`, `--color-danger: #d64545` (+ `--color-danger-dark: #b53535`), `--color-warning: #e8a317`.

**Regla de oro**: el header y el footer institucional **siempre mantienen fondo blanco fijo**, sin seguir el modo oscuro — el logo de CAMPUS tiene relleno blanco sólido y solo se ve limpio sobre superficie clara. Es la única zona de la UI exenta del theming.

**Superficies y texto** (light, con contraparte dark ya resuelta vía `:root[data-theme="dark"]` + `@media (prefers-color-scheme: dark)`):
- Fondo de página `--bg-app: #f4f7fb`, tarjetas `--bg-surface: #fff`, superficie alterna `--bg-surface-alt: #eef2f8`.
- Texto: primario `--text-primary: #14213d`, secundario `--text-secondary: #52607a`, apagado `--text-muted: #8894ab`.
- Bordes: `--border-color: #e1e7f0` (sutil), `--border-color-strong: #c9d3e3` (inputs/tarjetas interactivas).

**Tipografía**: `--font-display: 'Poppins'` (títulos, `h1`-`h4`, números destacados) + `--font-body: 'Inter'` (todo lo demás), ambas de Google Fonts, con `'Segoe UI', sans-serif` como fallback.

**Espaciado**: escala de 8 pasos `--space-1` (4px) a `--space-8` (64px), siempre en potencias de 4. **Nunca usar valores de padding/margin sueltos** — usar la variable de la escala más cercana.

**Radios**: `--radius-sm: 8px` (inputs, botones pequeños) · `--radius-md: 14px` (tarjetas internas, bloques) · `--radius-lg: 20px` (cards de sección) · `--radius-pill: 999px` (badges, toggles tipo pill).

**Sombras**: `--shadow-sm` (reposo), `--shadow-md` (elevado), `--shadow-lg` (modales/dropdowns), `--shadow-focus: 0 0 0 3px rgba(33,150,214,.35)` (anillo de foco, siempre cian).

## Animaciones y transiciones

Dos duraciones base, nunca improvisar otras:
- `--transition-fast: 150ms ease` — hover/focus de botones, iconos, toggles.
- `--transition-base: 220ms cubic-bezier(0.4, 0, 0.2, 1)` — cambios de tema (`background`/`color` en `body`).

**Patrones de entrada** (todo lo que aparece en pantalla usa una de estas dos):
- `fadeInUp` (`opacity 0→1` + `translateY(10px→0)`) — el default para casi todo: cards al cargar (`0.35s`), bloques nuevos (`0.3s`/`0.25s`), dropdowns/modales (`0.15s`). Duración más corta = elemento más "ligero"/transitorio (dropdown) vs. más larga = contenido de página (card).
- `toastIn`/`toastOut` — exclusivo de notificaciones: entra con fade+slight lift, sale con `opacity→0` + `translateX(30px)` (se desliza hacia la derecha al desaparecer).

**Micro-interacciones**:
- Botones: `:active { transform: scale(0.97) }` (feedback táctil de clic), `.btn-primary:hover` eleva con `translateY(-1px)` + sombra más intensa.
- Iconos circulares (`.icon-btn`): hover sube `translateY(-1px)` + cambia fondo.
- Spinner de guardado/carga: `@keyframes spin { to { transform: rotate(360deg) } }`, `1s linear infinite`, aplicado a un ícono `fa-circle-notch`.
- Chevrons de acordeón: `transform: rotate(180deg)` cuando `[aria-expanded="true"]`, con `transition: transform var(--transition-fast)` — nunca instantáneo.

## Componentes clave

- **Botones**: `.btn-primary` (degradado naranja + sombra cálida, para la acción principal de cada pantalla — "Enviar", "Descargar") · `.btn-ghost` (secundario, transparente con borde) · `.btn-danger` (rojo sólido, solo para eliminar) · `.btn-dashed` (borde punteado, para "agregar algo nuevo": bloques, sub-bloques, notas) · `.btn-icon` (rectangular con ícono+texto) · `.icon-btn` (circular, solo ícono).
- **Cards de sección** (`.card`): contenedor blanco redondeado (`--radius-lg`) con `.card-header` (ícono circular numerado + título + descripción) y `.card-body`. Cuando la card es colapsable, el header entero es un `<button>` (`.card-header-toggle`) con chevron a la derecha — nunca un ícono de expandir suelto sin que toda la franja sea clicable.
- **Badges tipo pill**: fondo `--bg-surface-alt`, `--radius-pill`, texto pequeño y bold — usado para identidad de usuario, estado de guardado, contadores.
- **Bloques con color cíclico**: en listas largas (ej. bloques del Minuto a Minuto), cada ítem toma un acento de color distinto por posición vía `:nth-child(6n+N)`, recorriendo navy→orange→cyan→success→warning→danger — ayuda a distinguir ítems de un vistazo sin depender del texto.
- **Toggle tipo pill de 2 opciones** (Sí/No, AM/PM): fondo `--bg-surface-alt` con padding, botones internos sin borde que ganan color sólido + texto blanco al estar `.active`.
- **Patrón "texto fijo + lápiz para editar"**: en vez de un input siempre editable, el valor se muestra como texto plano con un botón de lápiz al lado; un clic revela el input real. Reduce ruido visual en listas largas donde la mayoría de campos no se tocan a cada rato.

## Navegación y estructura de página

- **Header sticky** (`position: sticky; top: 0; z-index: 40`), siempre visible al hacer scroll, fondo blanco fijo.
- **Toolbar de acciones sticky** (`.editor-toolbar`) pegada justo debajo del header (`top: var(--header-height)`, `z-index: 30`) — capas de sticky anidadas, cada una con su propio `z-index` para no pisarse.
- **Una sola página (SPA sin router)**: todo vive en `index.html`; "navegar" entre secciones es scroll + acordeones, no cambios de URL. Modales y overlays (`.modal-overlay`, `position: fixed; inset: 0`) se usan para flujos que deben bloquear el resto de la interfaz (login de identidad, panel admin, confirmaciones) — nunca páginas nuevas.
- **Acordeones como patrón de "profundidad progresiva"**: contenido secundario u opcional (ejemplo de referencia, recomendaciones detalladas, bloques con muchos sub-campos) arranca colapsado o parcialmente oculto y se revela con un toggle — mantiene la vista inicial compacta sin perder la información.
- **Revelado progresivo por flujo, no por navegación**: cuando una etapa depende de que la anterior se complete (ej. "Retroalimentación" solo aparece tras enviar el Minuto a Minuto), la sección siguiente permanece con `hidden` hasta que la condición se cumple — se anima con `fadeInUp` al aparecer, igual que cualquier otro contenido nuevo.
- **Accesibilidad de la navegación**: todo toggle expandible usa `aria-expanded` + `aria-controls` apuntando al `id` del contenido que controla; el estado visual (chevron rotado) siempre deriva del atributo ARIA, nunca de una clase paralela desincronizable. Hay un `.skip-link` al inicio del `<body>` que salta al contenido principal.
- **Toasts** (`#toast-container`, esquina inferior derecha, `position: fixed`) para feedback de acciones (guardado, error, éxito) — nunca `alert()` nativo. Modal de confirmación propio (`ConfirmModal`) reemplaza `confirm()` nativo para mantener la misma línea visual.

## Modo claro / oscuro

Activado por `[data-theme="dark"]` en `<html>` (toggle manual) o `prefers-color-scheme: dark` (automático si no hay preferencia explícita guardada). Todas las superficies/texto/sombras están tokenizadas — al crear un componente nuevo, usar siempre las variables (`var(--bg-surface)`, etc.), nunca colores hex hardcodeados, para que el modo oscuro funcione sin trabajo extra. Excepción: header/footer, que se mantienen claros a propósito (ver arriba).
