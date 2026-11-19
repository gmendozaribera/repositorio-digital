# Pruebas E2E (Cypress)

Las pruebas E2E recorren la aplicación en un navegador real contra el **stack real**: los cinco
microservicios con los datos del perfil `demo` y el frontend con `ng serve` (el proxy
`proxy.conf.json` reparte `/api/v1/**` entre los servicios). No hay mocks.

- Cypress **16.2.1** (devDependency), configuración en `cypress.config.ts`.
- Specs en `cypress/e2e/*.cy.ts`, comandos en `cypress/support/commands.ts`, datos del seed demo en
  `cypress/support/datos-demo.ts` (si el seed cambia, solo se toca ese archivo).
- Selectores estables: atributos `data-cy` en los componentes (no cambian comportamiento).

## Flujos cubiertos

| Spec | Caso de uso | Qué verifica |
| --- | --- | --- |
| `cu01-login.cy.ts` | CU1 Login | Credenciales válidas → dashboard de DOCENTE, ESTUDIANTE y ADMIN; inválidas → el mismo mensaje para usuario inexistente y contraseña errónea (no revela el campo); cerrar sesión borra la sesión y protege las rutas. |
| `cu-reg-auto-registro.cy.ts` | CU-REG | 219000003 + CI 7000003 → cuenta creada; el login con `Uagrm2026` obliga a cambiar la contraseña. |
| `ciclo-trabajo.cy.ts` | CU6 → CU10 → CU18 → CU11 | Juan crea un trabajo en INF412-SA, sube `cypress/fixtures/informe.pdf` y lo envía (Pendiente); doc.maria lo toma en revisión y lo aprueba; doc.jose no ve «Calificar»; doc.maria califica 85 (Evaluado); el trabajo aparece al buscar una palabra del título en `/repositorio` y en `/explorar` sin sesión. |

`ciclo-trabajo.cy.ts` es **secuencial**: cada test parte del estado que dejó el anterior. El título
lleva una palabra única por corrida (`e2e<timestamp>`), así las corridas no chocan entre sí.

## 1. Levantar el backend con datos demo

En el repo del backend (`repositorio-backend`), con el JDK 25:

```bash
export JAVA_HOME="$HOME/.jdks/openjdk-25.0.2"
docker compose -f docker-compose/dev/docker-compose.yml up -d postgres redis minio

# Una terminal por servicio, en este orden (auth-service aplica Flyway y el seed demo):
SPRING_PROFILES_ACTIVE=dev,demo ./gradlew :auth-service:bootRun        # :8081 — esperar a que arranque
SPRING_PROFILES_ACTIVE=dev,demo ./gradlew :catalog-service:bootRun     # :8082
SPRING_PROFILES_ACTIVE=dev,demo ./gradlew :user-service:bootRun        # :8083
SPRING_PROFILES_ACTIVE=dev,demo ./gradlew :work-service:bootRun        # :8084 (MinIO)
SPRING_PROFILES_ACTIVE=dev,demo ./gradlew :plagiarism-service:bootRun  # :8085 (motor SIMULADO)
```

Datos del perfil demo que usan las pruebas (contraseña `Demo2026!`, sin cambio obligatorio):

- Facultad FICCT con acceso externo activado; materias INF412/INF422/INF312; semestre 2-2026;
  grupos INF412-SA/SB e INF312-SA; fases Perfil/Avance/Final; tipos «Proyecto de materia» y «Monografía».
- `doc.maria` (DOCENTE, Admin de Curso de INF412-SA e INF312-SA), `doc.jose` (DOCENTE de INF412-SA, no
  admin), `219000001` Juan Pérez López y `219000002` Ana Gutiérrez Ríos (ESTUDIANTE), `admin` / `Admin2026.`.
- Padrón: 219000003 (CI 7000003, contraseña por defecto `Uagrm2026`) **sin cuenta**.

## 2. Levantar el frontend

```bash
npm start            # ng serve en http://localhost:4200 con el proxy
```

## 3. Ejecutar las pruebas

```bash
npm run e2e          # headless (cypress run), todos los specs
npm run e2e:open     # interfaz de Cypress para ver/depurar un spec

npx cypress run --spec cypress/e2e/ciclo-trabajo.cy.ts   # un solo spec
```

Otra URL del frontend: `CYPRESS_baseUrl=http://localhost:8080 npm run e2e`. Otras credenciales demo:
`npx cypress run --expose PASSWORD_DEMO=...` (también `ADMIN_USUARIO`, `ADMIN_PASSWORD`).

Comprobar que los specs compilan (sin backend): `npx tsc -p cypress/tsconfig.json --noEmit`.

## Datos consumibles y reseteo de la BD demo

- **Auto-registro (CU-REG):** la fila 219000003 del padrón solo se registra **una vez por BD limpia**.
  El `before` del spec pregunta como ADMIN si la cuenta ya existe; si existe, el test de registro
  queda como *pending* (skip) y solo se prueba el primer login. El spec no cambia la contraseña, así
  ese test sigue sirviendo en las corridas siguientes.
- **Ciclo del trabajo:** cada corrida deja un trabajo EVALUADO más (título `Sistema de inventarios e2e…`).
  No molesta a las siguientes corridas, pero se acumula en el repositorio.
- **Límite de intentos de login:** cada intento fallido suma al contador por IP
  (`AUTH_GROUP.LOGIN_INTENTOS`, 10 por ventana de `LOGIN_WAITING` minutos). `cu01-login` gasta 2 por
  corrida; tras ~5 corridas seguidas el login responde 429. Para limpiarlo sin esperar:

  ```bash
  docker compose -f docker-compose/dev/docker-compose.yml exec redis \
    sh -c 'redis-cli --scan --pattern "auth:rate:*" | xargs -r redis-cli del'
  ```

Para volver a la BD demo limpia (borra PostgreSQL, Redis y MinIO):

```bash
# Detener los 5 servicios (Ctrl+C en cada terminal) y luego:
docker compose -f docker-compose/dev/docker-compose.yml down -v
docker compose -f docker-compose/dev/docker-compose.yml up -d postgres redis minio
# Arrancar de nuevo los servicios con SPRING_PROFILES_ACTIVE=dev,demo (auth-service primero).
```

## Problemas frecuentes

- *Cypress could not verify that this server is running*: falta `npm start`.
- Un test del ciclo falla y los siguientes también: es lo esperado (son secuenciales). Mirar el
  primero que falló; la captura queda en `cypress/screenshots/` (ignorada por git).
- El binario de Cypress se descarga en `npm install` a la caché del usuario
  (`%LOCALAPPDATA%\Cypress\Cache` en Windows). Con la descarga bloqueada: `CYPRESS_INSTALL_BINARY`
  apuntando a un zip local, y `npx cypress verify` para comprobarlo.
