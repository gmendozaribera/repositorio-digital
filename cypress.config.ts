import { defineConfig } from 'cypress';

/**
 * Pruebas E2E contra el stack real: backend con el perfil `demo` (datos de prueba sembrados) y el
 * frontend con `ng serve` (proxy.conf.json reparte /api/v1/** entre los microservicios).
 * Ver docs/E2E.md para levantar todo y resetear la BD.
 *
 * Se sobrescribe sin tocar este archivo:
 * - baseUrl (por defecto http://localhost:4200): variable de entorno CYPRESS_baseUrl o
 *   `--config baseUrl=...`.
 * - PASSWORD_DEMO, ADMIN_USUARIO, ADMIN_PASSWORD: `--expose PASSWORD_DEMO=...`.
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: 'cypress/fixtures',
    // El backend real (BCrypt, MinIO, full-text) tarda mas que un mock.
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    viewportWidth: 1280,
    viewportHeight: 800,
    video: false,
    screenshotOnRunFailure: true,
    // El ciclo del trabajo depende del orden (crear -> revisar -> calificar -> buscar): sin
    // reintentos que repitan un paso que ya cambio el estado del trabajo.
    retries: { runMode: 0, openMode: 0 },
    // Valores publicos para los specs (Cypress.expose). Son las credenciales del seed demo, no
    // secretos reales; los secretos irian en `env` y se leerian con cy.env().
    expose: {
      PASSWORD_DEMO: 'Demo2026!',
      ADMIN_USUARIO: 'admin',
      ADMIN_PASSWORD: 'Admin2026.',
    },
  },
});
