/**
 * Comandos personalizados de los E2E.
 *
 * - `cy.login(usuario, password, ruta?)`: inicia sesion por API (sin pasar por la pantalla de login)
 *   y abre `ruta` ya autenticado. Se usa en los flujos que no prueban el login en si.
 * - `cy.dataCy(nombre)`: atajo de `cy.get('[data-cy="nombre"]')` (selectores estables).
 * - `cy.seleccionarOpcion(nombre, texto)`: elige en el <select data-cy="nombre"> la opcion cuyo
 *   texto contiene `texto` (o cumple la expresion regular). Espera a que la opcion exista: las
 *   listas en cascada (facultad -> materia -> semestre -> grupo) se cargan por HTTP.
 */

/** Clave de sessionStorage donde el frontend guarda la sesion (TokenStorageService). */
const CLAVE_SESION = 'repositorio.sesion';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      login(usuario: string, password: string, ruta?: string): Chainable<void>;
      dataCy(nombre: string): Chainable<JQuery<HTMLElement>>;
      seleccionarOpcion(nombre: string, texto: string | RegExp): Chainable<void>;
    }
  }
}

Cypress.Commands.add('login', (usuario: string, password: string, ruta = '/') => {
  cy.request({
    method: 'POST',
    url: '/api/v1/auth/login',
    body: { usuario, password },
  }).then(({ body }) => {
    const tokens = body?.data?.tokens;
    // Los usuarios demo no tienen 2FA: el login devuelve los tokens directamente.
    expect(tokens, `tokens de ${usuario}`).to.be.an('object');
    cy.visit(ruta, {
      onBeforeLoad(win) {
        win.sessionStorage.setItem(CLAVE_SESION, JSON.stringify(tokens));
      },
    });
  });
});

Cypress.Commands.add('dataCy', (nombre: string) => cy.get(`[data-cy="${nombre}"]`));

Cypress.Commands.add('seleccionarOpcion', (nombre: string, texto: string | RegExp) => {
  cy.dataCy(nombre)
    .contains('option', texto)
    .then(($opcion) => {
      // Con [ngValue] Angular pone value="<indice>: <valor>"; elegir por value evita depender
      // de espacios o del texto completo de la opcion.
      cy.dataCy(nombre).should('be.enabled').select(String($opcion.val()));
    });
});

export {};
