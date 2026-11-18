import { Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideApi } from '../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../core/auth/testing';
import { pagina } from '../../core/services/testing';
import { resultadoRepositorioDePrueba } from '../../core/services/testing-trabajos';
import { DEBOUNCE_BUSQUEDA_MS, RepositorioComponent } from './repositorio.component';

const API = '/api/v1';

const FACULTADES = [
  { idFacultad: 1, nombre: 'Ciencias de la Computación', sigla: 'FICCT', estado: 1 },
];
const CARRERAS = [{ idCarrera: 2, idFacultad: 1, nombre: 'Informática', sigla: 'INF', estado: 1 }];
const MATERIAS = [
  { idMateria: 10, idFacultad: 1, nombre: 'Ingeniería de Software I', sigla: 'INF412', estado: 1 },
];
const SEMESTRES = [
  { idSemestre: 4, idFacultad: 1, semestre: 1, anio: 2026, estado: 0 },
  { idSemestre: 5, idFacultad: 1, semestre: 2, anio: 2026, estado: 1 },
];
const TIPOS = [{ idTipoTrabajo: 4, idFacultad: 1, nombre: 'Proyecto de materia', estado: 1 }];

describe('RepositorioComponent', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
  }

  function busqueda(contenido: unknown[] = [], total?: number): TestRequest {
    const req = http.expectOne((r) => r.url === `${API}/repositorio`);
    req.flush(respuesta(pagina(contenido, Number(req.request.params.get('pagina')), 10, total)));
    return req;
  }

  /** Catalogos dependientes de la facultad (o solo los tipos de todas si no hay facultad). */
  function catalogos(idFacultad?: number): void {
    const conFacultad = (url: string) =>
      http.expectOne(
        (r) =>
          r.url === `${API}/${url}` &&
          r.params.get('incluirInactivos') === 'true' &&
          r.params.get('idFacultad') === (idFacultad ? String(idFacultad) : null),
      );
    conFacultad('tipos-trabajo').flush(respuesta(TIPOS));
    if (idFacultad) {
      conFacultad('carreras').flush(respuesta(CARRERAS));
      conFacultad('materias').flush(respuesta(MATERIAS));
      conFacultad('semestres').flush(respuesta(SEMESTRES));
    }
  }

  async function abrir(url: string, idFacultad?: number, contenido: unknown[] = []) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    vista = harness.routeNativeElement!;
    http.expectOne(`${API}/facultades`).flush(respuesta(FACULTADES));
    catalogos(idFacultad);
    const req = busqueda(contenido);
    await render();
    return req;
  }

  function select(nombre: string): HTMLSelectElement {
    return vista.querySelector<HTMLSelectElement>(`select[formcontrolname=${nombre}]`)!;
  }

  async function elegir(nombre: string, indice: number): Promise<void> {
    const s = select(nombre);
    s.selectedIndex = indice;
    s.dispatchEvent(new Event('change'));
    await render();
  }

  function url(): string {
    return decodeURIComponent(TestBed.inject(Router).url);
  }

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba('ESTUDIANTE')));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(),
        provideLocationMocks(),
        provideRouter([
          { path: 'repositorio', component: RepositorioComponent },
          { path: 'repositorio/:id', component: PaginaVacia },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sin filtros y sin resultados: "Todavía no hay trabajos publicados"', async () => {
    const req = await abrir('/repositorio');
    expect(req.request.params.keys().sort()).toEqual(['pagina', 'tamano']);
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.get('tamano')).toBe('10');
    expect(vista.querySelector('.estado-vacio')?.textContent).toContain(
      'Todavía no hay trabajos publicados',
    );
    // Sin facultad, carrera/materia/semestre estan deshabilitados.
    expect(select('idMateria').disabled).toBe(true);
    expect(select('idTipoTrabajo').disabled).toBe(false);
  });

  it('lee los filtros y la página de la URL (enlace compartido) y muestra el vacío con filtros', async () => {
    const req = await abrir('/repositorio?q=redes&idFacultad=1&idMateria=10&pagina=2', 1);
    expect(req.request.params.get('q')).toBe('redes');
    expect(req.request.params.get('idFacultad')).toBe('1');
    expect(req.request.params.get('idMateria')).toBe('10');
    expect(req.request.params.get('pagina')).toBe('1');
    expect(req.request.params.has('idCarrera')).toBe(false);

    expect(vista.querySelector<HTMLInputElement>('input[formcontrolname=q]')!.value).toBe('redes');
    expect(select('idMateria').disabled).toBe(false);
    expect(select('idMateria').selectedOptions[0].textContent?.trim()).toBe(
      'INF412 — Ingeniería de Software I',
    );
    // Semestres mas recientes primero (incluye los desactivados: trabajos historicos).
    expect(Array.from(select('idSemestre').options).map((o) => o.textContent?.trim())).toEqual([
      'Todos los semestres',
      '2-2026',
      '1-2026',
    ]);
    expect(vista.querySelector('.estado-vacio')?.textContent).toContain(
      'Sin resultados para la búsqueda',
    );
  });

  it('los selects actualizan la URL y atrás restaura la búsqueda anterior', async () => {
    await abrir('/repositorio');

    await elegir('idFacultad', 1);
    expect(url()).toBe('/repositorio?idFacultad=1');
    catalogos(1);
    expect(busqueda().request.params.get('idFacultad')).toBe('1');
    await render();

    await elegir('idMateria', 1);
    expect(url()).toBe('/repositorio?idFacultad=1&idMateria=10');
    expect(busqueda().request.params.get('idMateria')).toBe('10');
    await render();

    // Cambiar de facultad limpia materia, carrera, semestre y tipo.
    await elegir('idFacultad', 0);
    expect(url()).toBe('/repositorio');
    catalogos();
    busqueda();
    await render();

    // Atras del navegador (popstate): el router vuelve a la URL anterior.
    // En la app lo hace la navegacion inicial; el harness no la ejecuta.
    TestBed.inject(Router).setUpLocationChangeListener();
    TestBed.inject(Location).back();
    await new Promise((r) => setTimeout(r));
    await render();
    expect(url()).toBe('/repositorio?idFacultad=1&idMateria=10');
    catalogos(1);
    const req = busqueda();
    expect(req.request.params.get('idMateria')).toBe('10');
    await render();
    expect(select('idFacultad').selectedIndex).toBe(1);
    expect(select('idMateria').selectedIndex).toBe(1);
  });

  it('el texto busca con debounce y vuelve a la primera página', async () => {
    await abrir('/repositorio?pagina=3');
    const q = vista.querySelector<HTMLInputElement>('input[formcontrolname=q]')!;
    q.value = 'inventarios';
    q.dispatchEvent(new Event('input'));
    await render();
    http.expectNone((r) => r.url === `${API}/repositorio`);

    await new Promise((r) => setTimeout(r, DEBOUNCE_BUSQUEDA_MS + 50));
    await render();
    expect(url()).toBe('/repositorio?q=inventarios');
    const req = busqueda();
    expect(req.request.params.get('q')).toBe('inventarios');
    expect(req.request.params.get('pagina')).toBe('0');
  });

  it('muestra tarjetas, pagina por la URL y abre la ficha', async () => {
    await abrir('/repositorio', undefined, []);
    // Recarga con resultados (p. ej. el usuario vuelve a la primera pagina con datos).
    await harness.navigateByUrl('/repositorio?idTipoTrabajo=4');
    busqueda(
      [
        resultadoRepositorioDePrueba({ autores: ['Juan Perez', 'Ana Rojas'] }),
        resultadoRepositorioDePrueba({ idTrabajo: 8, titulo: 'App móvil', hashtags: [] }),
      ],
      25,
    );
    await render();

    const tarjetas = Array.from(vista.querySelectorAll('.tarjeta-trabajo'));
    expect(tarjetas).toHaveLength(2);
    expect(tarjetas[0].querySelector('h2 a')?.getAttribute('href')).toBe('/repositorio/7');
    expect(tarjetas[0].textContent).toContain('Juan Perez, Ana Rojas');
    expect(tarjetas[0].textContent).toContain('INF412 — Ingeniería de Software I · 2-2026');
    expect(tarjetas[0].textContent).toContain('Proyecto de materia');
    // Extracto (ya cortado por el servidor) y hashtags como chips.
    expect(tarjetas[0].querySelector('.tarjeta-extracto')?.textContent).toContain(
      'análisis y diseño',
    );
    expect(
      Array.from(tarjetas[0].querySelectorAll('.chips button')).map((b) => b.textContent?.trim()),
    ).toEqual(['#springboot', '#inventarios']);
    expect(tarjetas[1].querySelector('.chips')).toBeNull();

    Array.from(vista.querySelectorAll<HTMLButtonElement>('.paginador button'))
      .find((b) => b.textContent?.includes('Siguiente'))!
      .click();
    await render();
    expect(url()).toBe('/repositorio?idTipoTrabajo=4&pagina=2');
    expect(busqueda().request.params.get('pagina')).toBe('1');
  });

  it('un hashtag en la URL (clic en un hashtag de la ficha) filtra y se puede quitar', async () => {
    const req = await abrir('/repositorio?hashtag=springboot');
    expect(req.request.params.get('hashtag')).toBe('springboot');
    const chip = vista.querySelector('.filtros-activos .chip')!;
    expect(chip.textContent).toContain('#springboot');
    expect(vista.querySelector('.estado-vacio')?.textContent).toContain('Sin resultados');

    chip.querySelector<HTMLButtonElement>('.chip-quitar')!.click();
    await render();
    expect(url()).toBe('/repositorio');
    expect(busqueda().request.params.has('hashtag')).toBe(false);
    await render();
    expect(vista.querySelector('.filtros-activos')).toBeNull();
  });

  it('clic en un hashtag de un resultado lo aplica como filtro y vuelve a la página 1', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/repositorio?q=sistema&pagina=2');
    vista = harness.routeNativeElement!;
    http.expectOne(`${API}/facultades`).flush(respuesta(FACULTADES));
    catalogos();
    busqueda([resultadoRepositorioDePrueba()], 15);
    await render();

    vista.querySelector<HTMLButtonElement>('.tarjeta-trabajo .chips button')!.click();
    await render();
    expect(url()).toBe('/repositorio?q=sistema&hashtag=springboot');
    const req = busqueda([resultadoRepositorioDePrueba()]);
    expect(req.request.params.get('hashtag')).toBe('springboot');
    expect(req.request.params.get('q')).toBe('sistema');
    expect(req.request.params.get('pagina')).toBe('0');
    await render();
    expect(vista.querySelector<HTMLInputElement>('input[formcontrolname=hashtag]')!.value).toBe(
      'springboot',
    );
    expect(
      vista.querySelector('.tarjeta-trabajo .chips button')?.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  // ------------------------------------------------------------------ Sprint 4: full-text y grupo

  const GRUPOS = [
    { idGrupo: 9, idMateria: 10, idSemestre: 5, nombre: 'SB', estado: 0 },
    { idGrupo: 3, idMateria: 10, idSemestre: 5, nombre: 'SA', estado: 1 },
  ];

  function grupos(idSemestre: number) {
    const req = http.expectOne(
      (r) =>
        r.url === `${API}/grupos` &&
        r.params.get('idFacultad') === '1' &&
        r.params.get('idMateria') === '10' &&
        r.params.get('idSemestre') === String(idSemestre) &&
        r.params.get('incluirInactivos') === 'true',
    );
    req.flush(respuesta(GRUPOS));
  }

  it('ayuda de sintaxis y orden: por relevancia con texto, más recientes sin texto', async () => {
    await abrir('/repositorio', undefined, [resultadoRepositorioDePrueba()]);
    expect(vista.querySelector('#ayuda-sintaxis')?.textContent).toContain('frase exacta');
    expect(vista.querySelector('#ayuda-sintaxis')?.textContent).toContain('-web');
    expect(vista.querySelector('.orden-resultados')?.textContent?.trim()).toBe(
      'Más recientes primero',
    );

    await harness.navigateByUrl('/repositorio?q=%22sistema%20de%20inventarios%22%20-web');
    const req = busqueda([resultadoRepositorioDePrueba()]);
    // La sintaxis (comillas y -palabra) viaja tal cual: la interpreta el backend.
    expect(req.request.params.get('q')).toBe('"sistema de inventarios" -web');
    await render();
    expect(vista.querySelector('.orden-resultados')?.textContent?.trim()).toBe(
      'Ordenado por relevancia',
    );
  });

  it('el grupo depende de materia + semestre y se envía como idGrupo', async () => {
    const req = await abrir('/repositorio?idFacultad=1&idMateria=10&idSemestre=5&idGrupo=3', 1);
    expect(req.request.params.get('idGrupo')).toBe('3');
    grupos(5);
    await render();

    expect(select('idGrupo').disabled).toBe(false);
    expect(Array.from(select('idGrupo').options).map((o) => o.textContent?.trim())).toEqual([
      'Todos los grupos',
      'Grupo SA',
      'Grupo SB',
    ]);
    expect(select('idGrupo').selectedOptions[0].textContent?.trim()).toBe('Grupo SA');

    await elegir('idGrupo', 2);
    expect(url()).toBe('/repositorio?idFacultad=1&idMateria=10&idSemestre=5&idGrupo=9');
    expect(busqueda().request.params.get('idGrupo')).toBe('9');
    await render();

    // Cambiar el semestre limpia el grupo y recarga los grupos del nuevo semestre.
    await elegir('idSemestre', 2); // 1-2026 (idSemestre 4)
    expect(url()).toBe('/repositorio?idFacultad=1&idMateria=10&idSemestre=4');
    const sinGrupo = busqueda();
    expect(sinGrupo.request.params.has('idGrupo')).toBe(false);
    grupos(4);
    await render();
    expect(select('idGrupo').value).toBe(select('idGrupo').options[0].value);
  });

  it('sin materia y semestre el grupo está deshabilitado y un idGrupo suelto se ignora', async () => {
    const req = await abrir('/repositorio?idFacultad=1&idGrupo=3', 1);
    expect(req.request.params.has('idGrupo')).toBe(false);
    expect(select('idGrupo').disabled).toBe(true);
    expect(select('idGrupo').options[0].textContent?.trim()).toBe('Elige materia y semestre');
    expect(vista.querySelector('#ayuda-grupo')?.textContent).toContain('materia y semestre');
  });

  describe('no duplica búsquedas', () => {
    function q(): HTMLInputElement {
      return vista.querySelector<HTMLInputElement>('input[formcontrolname=q]')!;
    }

    it('Enter busca al instante y el debounce posterior no repite la consulta', async () => {
      await abrir('/repositorio');
      q().value = 'inventarios';
      q().dispatchEvent(new Event('input'));
      vista.querySelector('form')!.dispatchEvent(new Event('submit'));
      await render();
      expect(busqueda().request.params.get('q')).toBe('inventarios');

      await new Promise((r) => setTimeout(r, DEBOUNCE_BUSQUEDA_MS + 50));
      await render();
      http.expectNone((r) => r.url === `${API}/repositorio`);
    });

    it('una URL que normalizada no cambia los filtros no vuelve a consultar', async () => {
      await abrir('/repositorio?idFacultad=1', 1);
      // idGrupo sin materia y semestre se descarta: los filtros son los mismos.
      await harness.navigateByUrl('/repositorio?idFacultad=1&idGrupo=3');
      await render();
      http.expectNone((r) => r.url === `${API}/repositorio`);
    });

    it('varios filtros cambiados en el mismo instante terminan en una sola consulta', async () => {
      await abrir('/repositorio?idFacultad=1', 1);
      // Materia y semestre a la vez (p. ej. autocompletado): dos navegaciones en el mismo tick.
      const s1 = select('idMateria');
      const s2 = select('idSemestre');
      s1.selectedIndex = 1;
      s2.selectedIndex = 1;
      s1.dispatchEvent(new Event('change'));
      s2.dispatchEvent(new Event('change'));
      await render();

      expect(url()).toBe('/repositorio?idFacultad=1&idMateria=10&idSemestre=5');
      const req = busqueda();
      expect(req.request.params.get('idMateria')).toBe('10');
      expect(req.request.params.get('idSemestre')).toBe('5');
      http.expectOne((r) => r.url === `${API}/grupos`).flush(respuesta([]));
    });

    it('tras un error, Enter con la misma búsqueda la reintenta', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/repositorio?q=redes');
      vista = harness.routeNativeElement!;
      http.expectOne(`${API}/facultades`).flush(respuesta(FACULTADES));
      catalogos();
      http
        .expectOne((r) => r.url === `${API}/repositorio`)
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      await render();
      expect(vista.querySelector('.alert-danger')).not.toBeNull();

      vista.querySelector('form')!.dispatchEvent(new Event('submit'));
      await render();
      expect(busqueda().request.params.get('q')).toBe('redes');
      await render();
      expect(vista.querySelector('.alert-danger')).toBeNull();
    });
  });
});
