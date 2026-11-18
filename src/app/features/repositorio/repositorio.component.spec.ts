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
import { resumenDePrueba } from '../../core/services/testing-trabajos';
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
        resumenDePrueba({ estado: 'EVALUADO', autores: ['Juan Perez', 'Ana Rojas'] }),
        resumenDePrueba({ idTrabajo: 8, titulo: 'App móvil', estado: 'EVALUADO' }),
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
});
