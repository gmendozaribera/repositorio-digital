import { admin, DEMO, passwordDemo } from '../support/datos-demo';

/**
 * CU1 Iniciar sesion (UI real del login).
 * Nota: cada intento fallido suma al limite por IP (AUTH_GROUP.LOGIN_INTENTOS, 10 por ventana de
 * LOGIN_WAITING minutos). Este spec gasta 2 por corrida; ver docs/E2E.md si aparece el 429.
 */
describe('CU1 Iniciar sesión', () => {
  function ingresar(usuario: string, password: string): void {
    cy.visit('/login');
    cy.dataCy('login-usuario').clear().type(usuario);
    cy.dataCy('login-password').type(password, { log: false });
    cy.dataCy('login-submit').click();
  }

  // Las credenciales se leen dentro del test (Cypress.expose solo existe en tiempo de ejecucion).
  const casos = [
    {
      rol: 'DOCENTE',
      ruta: '/docente',
      credenciales: () => ({ usuario: DEMO.usuarios.maria, password: passwordDemo() }),
    },
    {
      rol: 'ESTUDIANTE',
      ruta: '/estudiante',
      credenciales: () => ({ usuario: DEMO.usuarios.juan, password: passwordDemo() }),
    },
    { rol: 'ADMIN', ruta: '/admin', credenciales: admin },
  ];

  for (const caso of casos) {
    it(`con credenciales válidas lleva al dashboard de ${caso.rol}`, () => {
      const { usuario, password } = caso.credenciales();
      ingresar(usuario, password);
      cy.location('pathname').should('eq', caso.ruta);
      cy.dataCy('rol-usuario').should('have.text', caso.rol);
      cy.contains('h1', 'Bienvenido');
    });
  }

  it('con credenciales inválidas muestra el mismo mensaje sin revelar qué campo falló', () => {
    // Contrasena incorrecta de un usuario que existe...
    ingresar(DEMO.usuarios.juan, 'Incorrecta123');
    cy.location('pathname').should('eq', '/login');
    cy.dataCy('login-error')
      .should('be.visible')
      .invoke('text')
      .then((mensajeUsuarioExistente) => {
        // ...y un usuario que no existe: el mensaje debe ser identico.
        ingresar(`no.existe.${Date.now()}`, 'Incorrecta123');
        cy.dataCy('login-error').should('have.text', mensajeUsuarioExistente);
      });
    cy.dataCy('login-error')
      .invoke('text')
      .should('match', /usuario o contrase(ñ|n)a/i)
      .and('not.match', /no existe|inexistente|contrase(ñ|n)a incorrecta\b/i);
    // El campo contrasena se limpia tras el error.
    cy.dataCy('login-password').should('have.value', '');
  });

  it('cerrar sesión vuelve al login y protege las páginas', () => {
    cy.login(DEMO.usuarios.maria, passwordDemo(), '/docente');
    cy.dataCy('rol-usuario').should('have.text', 'DOCENTE');
    cy.dataCy('logout').click();
    cy.location('pathname').should('eq', '/login');
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem('repositorio.sesion')).to.equal(null);
    });
    // Sin sesion, una ruta protegida redirige al login.
    cy.visit('/docente');
    cy.location('pathname').should('eq', '/login');
  });
});
