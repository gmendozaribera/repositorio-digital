// Genera los modelos y el cliente HTTP de cada servicio desde los contratos OpenAPI del backend
// (contract-first: el YAML del backend es la fuente de verdad; nunca escribir interfaces a mano).
//
//   npm run api:gen                 -> todos los contratos
//   npm run api:gen -- catalog      -> solo uno
//
// Por defecto lee el repo del backend como carpeta hermana; se puede cambiar con
// OPENAPI_DIR=/ruta/a/openapi npm run api:gen
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const OPENAPI_DIR = resolve(
  process.env.OPENAPI_DIR ?? '../repositorio-backend/source/spec/src/main/resources/openapi',
);

/** Servicio -> carpeta de salida en src/app/api. */
const SERVICIOS = ['auth', 'catalog', 'user', 'work', 'plagio'];

const pedidos = process.argv.slice(2);
const servicios = pedidos.length ? pedidos : SERVICIOS;
let fallos = 0;

for (const servicio of servicios) {
  const input = resolve(OPENAPI_DIR, `${servicio}-api.yaml`);
  if (!existsSync(input)) {
    console.error(`[api:gen] No existe ${input}`);
    fallos++;
    continue;
  }
  console.log(`[api:gen] ${servicio} <- ${input}`);
  const r = spawnSync(
    'npx',
    ['ng-openapi-gen', '-c', 'ng-openapi-gen.json', '-i', input, '-o', `src/app/api/${servicio}`],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (r.status !== 0) {
    fallos++;
    continue;
  }
  // Mismo formato que el resto del codigo, para que los diffs del codigo generado sean legibles.
  spawnSync('npx', ['prettier', '--write', '--log-level', 'warn', `src/app/api/${servicio}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

process.exit(fallos ? 1 : 0);
