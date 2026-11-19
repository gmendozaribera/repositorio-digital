import { DEMO, passwordDemo } from '../support/datos-demo';

/**
 * Ciclo completo de un trabajo, en orden (cada test parte del estado que dejo el anterior):
 * CU6 crear y enviar -> CU10 revisar y aprobar -> CU18 calificar -> CU11 buscar.
 *
 * El titulo lleva una palabra unica por corrida (`e2e<timestamp>`): las corridas no chocan entre
 * si y la busqueda full-text encuentra exactamente este trabajo. Si un test falla, los siguientes
 * fallan tambien (no tiene sentido aprobar un trabajo que no se envio).
 */
describe('Ciclo de un trabajo: crear, revisar, calificar y buscar', () => {
  const palabraUnica = `e2e${Date.now().toString(36)}`;
  const titulo = `Sistema de inventarios ${palabraUnica}`;
  const resumen =
    'Trabajo creado por las pruebas E2E con Cypress: sistema web de control de inventarios ' +
    'para la materia de Ingeniería de Software.';
  let idTrabajo: number;

  function abrirTrabajoComo(usuario: string): void {
    expect(idTrabajo, 'trabajo creado en CU6').to.be.a('number');
    cy.login(usuario, passwordDemo(), `/trabajos/${idTrabajo}`);
    cy.dataCy('detalle-titulo').should('have.text', titulo);
  }

  it('CU6: Juan crea el trabajo en INF412-SA, sube el PDF y lo envía (PENDIENTE)', () => {
    cy.intercept('GET', '/api/v1/documentos/reglas*').as('reglas');
    cy.login(DEMO.usuarios.juan, passwordDemo(), '/estudiante/trabajos/nuevo');

    cy.dataCy('trabajo-titulo').type(titulo);
    cy.dataCy('trabajo-resumen').type(resumen, { delay: 0 });
    cy.seleccionarOpcion('trabajo-facultad', DEMO.facultad);
    cy.seleccionarOpcion('trabajo-materia', DEMO.materia);
    cy.seleccionarOpcion('trabajo-semestre', DEMO.semestre);
    cy.seleccionarOpcion('trabajo-grupo', DEMO.grupo);
    cy.seleccionarOpcion('trabajo-tipo', DEMO.tipoTrabajo);
    cy.dataCy('trabajo-guardar').click();

    // Se crea como BORRADOR y se abre su detalle.
    cy.location('pathname')
      .should('match', /^\/trabajos\/\d+$/)
      .then((ruta) => {
        idTrabajo = Number(ruta.split('/').pop());
      });
    cy.dataCy('detalle-titulo').should('have.text', titulo);
    cy.dataCy('detalle-estado').should('contain', 'Borrador');
    // Sin PDF no se puede enviar.
    cy.dataCy('accion-enviar').should('be.disabled');

    // Las reglas de la facultad deciden la categoria sugerida del archivo.
    cy.wait('@reglas');
    cy.dataCy('abrir-subida').first().click();
    cy.dataCy('subida-archivos').selectFile('cypress/fixtures/informe.pdf');
    cy.contains('informe.pdf');
    cy.dataCy('subida-subir').should('be.enabled').and('contain', 'Subir 1 archivo').click();
    cy.dataCy('detalle-mensaje').should('contain', 'Se subió 1 archivo.');

    // window.confirm lo acepta Cypress automaticamente.
    cy.dataCy('accion-enviar').should('be.enabled').click();
    cy.dataCy('detalle-mensaje').should('contain', 'Trabajo enviado a revisión.');
    cy.dataCy('detalle-estado').should('contain', 'Pendiente');
  });

  it('CU10: doc.maria lo ve en su bandeja, lo toma en revisión y lo aprueba', () => {
    expect(idTrabajo, 'trabajo creado en CU6').to.be.a('number');
    cy.login(DEMO.usuarios.maria, passwordDemo(), '/docente/revision');
    cy.contains('[data-cy="trabajo-enlace"]', titulo).click();
    cy.location('pathname').should('eq', `/trabajos/${idTrabajo}`);
    cy.dataCy('detalle-estado').should('contain', 'Pendiente');

    cy.dataCy('accion-tomar').click();
    cy.dataCy('detalle-mensaje').should('contain', 'Tomaste el trabajo en revisión');
    cy.dataCy('detalle-estado').should('contain', 'En revisión');

    cy.dataCy('accion-aprobar').click();
    // Sin observaciones -> APROBADO (con observaciones seria APROBADO_CON_OBSERVACIONES).
    cy.dataCy('aprobar-confirmar').should('contain', 'Aprobar').and('not.contain', 'observaciones');
    cy.dataCy('aprobar-confirmar').click();
    cy.dataCy('detalle-mensaje').should('contain', 'Trabajo aprobado.');
    cy.dataCy('detalle-estado').should('have.text', 'Aprobado');
  });

  it('CU18: doc.jose (docente del grupo sin rol de Admin de Curso) NO puede calificar', () => {
    abrirTrabajoComo(DEMO.usuarios.jose);
    cy.dataCy('detalle-estado').should('have.text', 'Aprobado');
    cy.dataCy('accion-calificar').should('not.exist');
  });

  it('CU18: doc.maria (Admin de Curso) lo califica con 85 y queda EVALUADO', () => {
    abrirTrabajoComo(DEMO.usuarios.maria);
    cy.dataCy('accion-calificar').click();
    cy.dataCy('calificar-nota').type('85');
    cy.dataCy('calificar-confirmar').click();
    cy.dataCy('detalle-mensaje').should('contain', 'Trabajo calificado y publicado');
    cy.dataCy('detalle-estado').should('have.text', 'Evaluado');
    cy.dataCy('detalle-calificacion').should('contain', '85 /');
    cy.dataCy('accion-calificar').should('not.exist');
  });

  it('CU11: aparece en /repositorio al buscar una palabra del título', () => {
    expect(idTrabajo, 'trabajo creado en CU6').to.be.a('number');
    cy.login(DEMO.usuarios.ana, passwordDemo(), '/repositorio');
    cy.dataCy('repositorio-buscar').type(`${palabraUnica}{enter}`);
    cy.location('search').should('contain', `q=${palabraUnica}`);
    cy.dataCy('repositorio-resultado').should('have.length', 1).and('have.text', titulo);
  });

  it('CU11: aparece en /explorar sin iniciar sesión', () => {
    expect(idTrabajo, 'trabajo creado en CU6').to.be.a('number');
    cy.visit('/explorar');
    cy.location('pathname').should('eq', '/explorar');
    cy.dataCy('repositorio-buscar').type(`${palabraUnica}{enter}`);
    cy.dataCy('repositorio-resultado').should('have.length', 1).and('have.text', titulo);
    // La ficha publica se abre sin sesion (la calificacion nunca se publica).
    cy.dataCy('repositorio-resultado').click();
    cy.location('pathname').should('eq', `/explorar/${idTrabajo}`);
    cy.contains('h1', titulo);
    cy.dataCy('detalle-calificacion').should('not.exist');
  });
});
