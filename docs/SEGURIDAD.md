# Seguridad del frontend

Resumen, en lenguaje simple, de las medidas que protegen la aplicacion Angular. Las del backend
(JWT, Redis, limites de intentos, CORS) estan documentadas en el repo del backend.

## 1. Cabeceras HTTP (Nginx)

Archivos: `nginx.conf` y `nginx-cabeceras-seguridad.conf` (el Dockerfile lo copia a
`/etc/nginx/snippets/cabeceras-seguridad.conf`). Se aplican al HTML/JS/CSS que sirve Nginx; las
respuestas de la API (`/api/...`) llevan las cabeceras que pone el backend y Nginx no las duplica.

| Cabecera | Valor | Para que sirve (analogia) |
|---|---|---|
| `Content-Security-Policy` | ver abajo | Lista de invitados: el navegador solo ejecuta codigo que venga de nuestro propio sitio. |
| `X-Content-Type-Options` | `nosniff` | "Lo que dice la etiqueta es lo que hay": un archivo de texto nunca se ejecuta como programa. |
| `X-Frame-Options` | `DENY` | Nadie puede meter la app dentro de otra pagina (evita botones "disfrazados", clickjacking). |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Al ir a otro sitio solo se dice "vengo del repositorio", nunca la ruta exacta (p. ej. `/trabajos/15`). |
| `Permissions-Policy` | camara, microfono, ubicacion, pagos, USB y sensores apagados | Aunque alguien inyecte codigo, no puede pedir la camara ni la ubicacion. |
| `Cache-Control` | `index.html`: `no-cache`; JS/CSS con hash: 1 ano `immutable` | Tras un despliegue el usuario ve la version nueva al recargar, y los archivos pesados no se vuelven a bajar. |
| `server_tokens off` | — | Nginx no anuncia su version (no le regalamos pistas a un atacante). |

**Por que `no-referrer` no**: con esa politica el navegador manda `Origin: null` en los POST al
propio sitio y el filtro CORS del backend los rechazaria (romperia el login).

**HSTS** (`Strict-Transport-Security`, "usa siempre HTTPS") no esta en Nginx a proposito: el
contenedor habla HTTP detras del Ingress; lo pone el Ingress que tiene el certificado TLS.

**Herencia de `add_header`**: en Nginx, si una `location` declara un `add_header`, se pierden
todos los del `server`. Por eso las cabeceras viven en un snippet que se incluye en cada
`location` estatica (`= /index.html`, assets con hash y `/`).

### Content-Security-Policy

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'
```

- `script-src 'self'`: solo JS servido por nosotros; ni scripts inline, ni `eval`, ni CDNs. Es la
  defensa principal contra XSS: aunque alguien lograra inyectar un `<script>`, el navegador no lo
  ejecuta.
- **Script inline de Angular**: el build de produccion, por defecto, "inlinea" el CSS critico y
  agrega un pequeno `<script>` inline en `index.html` (cambia `media="print"` a `media="all"`
  cuando carga la hoja de estilos). Ese script lo bloquearia la CSP. Se desactivo con
  `optimization.styles.inlineCritical: false` en `angular.json` (configuracion `production`).
  Se eligio esto en vez de un hash o nonce porque: (a) un hash habria que recalcularlo en cada
  build si Angular cambia el script, y (b) un nonce exige que Nginx genere un valor aleatorio por
  peticion y lo reescriba en el HTML. El costo es minimo: la hoja de estilos (~pocos KB) se carga
  con un `<link>` normal. Verificado: `dist/repositorio-digital/browser/index.html` no tiene
  `<script>` ni `<style>` inline, y el bundle no usa `eval`/`new Function`.
- `style-src 'unsafe-inline'`: Angular inserta los estilos de cada componente como `<style>` en
  tiempo de ejecucion y usa `[style.width.%]`. Un estilo inyectado no puede ejecutar codigo, por
  eso el riesgo es bajo. Quitarlo exigiria configurar `ngCspNonce` con un nonce por peticion.
- `img-src data:`: el QR del 2FA llega como imagen `data:image/png;base64,...`.
- `connect-src 'self'`: la app solo llama a `/api/v1/...` en el mismo dominio (Nginx/Ingress
  reparte a los microservicios).
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`: sin
  plugins, sin cambiar la base de las URLs, formularios solo hacia nosotros y sin iframes ajenos.
- Las descargas de archivos usan `URL.createObjectURL` + enlace con `download`; es una navegacion,
  la CSP no la bloquea.

Desarrollo (`ng serve`) no usa Nginx ni esta CSP (Vite inyecta scripts propios).

## 2. Tokens de sesion

- El access token y el refresh token se guardan **solo en `sessionStorage`**
  (`core/auth/token-storage.service.ts`), nunca en `localStorage` ni en cookies. Se borran al
  cerrar la pestana (importante en PCs compartidas de laboratorio) y al cerrar sesion
  (`AuthService.cerrarSesionLocal`, aunque el backend falle). Test:
  `auth.service.spec.ts` ("los tokens viven solo en sessionStorage...").
- El token temporal del 2FA solo vive en memoria (signal).
- `sessionStorage` lo puede leer cualquier script de la pagina: por eso la CSP y no usar
  `innerHTML` son la defensa real.

## 3. Codigo

- No se usa `innerHTML`, `bypassSecurityTrust*`, `DomSanitizer`, `eval` ni `document.write`
  (revisado en `src/`). Angular escapa todo lo que se interpola con `{{ }}`.
- **Enlaces externos** (enlaces de documentos tipo ENLACE y fuentes de Internet del informe de
  plagio): se muestran solo si `esEnlaceSeguro()` (`shared/archivos.ts`) confirma que son `https:`
  (descarta `javascript:`, `data:`, `http:`), y abren con `target="_blank" rel="noopener noreferrer"`
  (la pestana nueva no puede controlar la nuestra ni sabe de donde viene).
- **Redireccion tras el login** (`returnUrl`) y enlaces de notificaciones: solo rutas internas,
  con `esRutaInterna()` (`shared/ruta-interna.ts`). Rechaza `https://...`, `//sitio`, `/\sitio`,
  `javascript:` y caracteres de control (`/\t/sitio` el navegador lo leeria como `//sitio`).
  Tests en `auth.service.spec.ts`.
- `console.*`: el codigo de la app solo tiene un `console.error` en `main.ts` si Angular no
  arranca (no imprime tokens ni datos personales).

## 4. Dependencias (`npm audit`)

Antes (Sprint 5): **11 vulnerabilidades** (1 baja, 3 moderadas, 7 altas):

| Paquete | Donde se usa | Afecta a produccion |
|---|---|---|
| `@angular/router` 22.2.0 | app (va al bundle) | No: ambas fallas son de SSR (renderizado en servidor), que no usamos. Igual se actualizo. |
| `@angular/build` / `vite` 8.3.1 | build y `ng serve` | No (solo servidor de desarrollo). |
| `@angular/cli`, `@modelcontextprotocol/server`, `zod` | CLI de Angular | No. |
| `vitest`, `@vitest/mocker` | tests | No. |
| `undici`, `fast-uri`, `source-map-js` | herramientas de build/test | No. |

Arreglo: solo versiones compatibles (patch/minor, sin `--force`) y publicadas hace mas de 2
semanas (`npm install --before=2026-11-04`):

- Angular (framework) `22.2.0 -> 22.2.4`; `@angular/build` y `@angular/cli` `22.2.0 -> 22.2.5`;
  `vitest 5.0.2 -> 5.1.0`.
- Transitivas: `vite 8.3.5`, `undici 8.12.3`, `zod 4.6.6`, `fast-uri 3.1.9`, `source-map-js 1.2.2`,
  `@modelcontextprotocol/server 2.3.1`.

Despues: **0 vulnerabilidades**. No quedaron pendientes sin arreglo compatible.

Para repetir la revision: `npm audit`. Antes de actualizar, preferir versiones con mas de 2
semanas publicadas (`npm install --before=<fecha>`), y correr `npm run build` + `npx ng test --watch=false`.

## 5. Como verificar

```bash
docker build -t repositorio-frontend:prueba .
docker run -d --rm -p 8099:80 --name front-prueba repositorio-frontend:prueba
curl -I http://localhost:8099/                     # CSP, nosniff, DENY, Cache-Control: no-cache
curl -I http://localhost:8099/main-XXXX.js         # + Cache-Control: public, max-age=31536000, immutable
docker stop front-prueba
```

En el navegador (DevTools > Consola) no debe aparecer ningun error `Content-Security-Policy`.
