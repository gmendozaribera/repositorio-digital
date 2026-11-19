import { admin, DEMO } from '../support/datos-demo';

/**
 * CU-REG Auto-registro de estudiante.
 *
 * DATO CONSUMIBLE: la fila 219000003 del padron solo puede registrarse UNA vez por BD limpia.
 * El `before` pregunta (como ADMIN, por API) si la cuenta ya existe:
 * - no existe -> se prueba el registro por la UI;
 * - ya existe (corrida anterior) -> el test de registro se marca como pendiente (skip) y solo se
 *   prueba el primer login. Para volver a probarlo, resetear la BD demo (docs/E2E.md).
 * El primer login obliga a cambiar la contrasena; el test NO la cambia, asi la cuenta sigue
 * sirviendo para este caso en las corridas siguientes.
 */
describe('CU-REG Auto-registro de estudiante', () => {
  const { registro, ci, passwordDefault } = DEMO.padronSinCuenta;
  let cuentaYaExiste = false;

  before(() => {
    const { usuario, password } = admin();
    cy.request('POST', '/api/v1/auth/login', { usuario, password })
      .its('body.data.tokens.accessToken')
      .then((token: string) =>
        cy.request({
          url: '/api/v1/usuarios',
          qs: { q: registro, incluirInactivos: true },
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      .its('body.data.totalElementos')
      .then((total: number) => {
        cuentaYaExiste = total > 0;
        if (cuentaYaExiste) {
          cy.log(`La cuenta ${registro} ya existe: el registro se omite (resetear la BD demo).`);
        }
      });
  });

  it('con CI y registro del padrón crea la cuenta', function () {
    if (cuentaYaExiste) {
      this.skip();
    }
    cy.visit('/registro');
    cy.dataCy('registro-ci').type(ci);
    cy.dataCy('registro-registro').type(registro);
    cy.dataCy('registro-submit').click();
    cy.dataCy('registro-exito').should('contain', 'Cuenta creada').and('contain', registro);

    // El enlace lleva al login con el usuario ya escrito.
    cy.dataCy('registro-ir-login').click();
    cy.location('pathname').should('eq', '/login');
    cy.dataCy('login-usuario').should('have.value', registro);
  });

  it('el primer login con la contraseña por defecto obliga a cambiarla', () => {
    cy.visit(`/login?usuario=${registro}`);
    cy.dataCy('login-usuario').should('have.value', registro);
    cy.dataCy('login-password').type(passwordDefault, { log: false });
    cy.dataCy('login-submit').click();
    cy.location('pathname').should('eq', '/change-password');
    cy.dataCy('change-password-titulo').should('be.visible');
    cy.contains('debes reemplazar tu contraseña temporal');

    // Mientras no la cambie, cualquier otra ruta lo devuelve al cambio de contrasena.
    cy.visit('/estudiante');
    cy.location('pathname').should('eq', '/change-password');
  });
});
