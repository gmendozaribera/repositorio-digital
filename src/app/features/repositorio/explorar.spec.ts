import { HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideApi } from '../../core/api/api.providers';
import { visitanteGuard } from '../../core/auth/auth.guard';
import { jwtInterceptor } from '../../core/auth/jwt.interceptor';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../core/auth/testing';
import { pagina } from '../../core/services/testing';
import {
  DOCUMENTO_PDF,
  ENLACE_GITHUB,
  publicoDePrueba,
  resultadoRepositorioDePrueba,
} from '../../core/services/testing-trabajos';

const API = '/api/v1';
const ESTADO = `${API}/publico/estado`;

const FACULTADES = [
  { idFacultad: 1, nombre: 'Ciencias de la Computación', sigla: 'FICCT', estado: 1 },
  { idFacultad: 2, nombre: 'Ciencias Económicas', sigla: 'FCE', estado: 1 },
  { idFacultad: 3, nombre: 'Tecnología', sigla: 'FCET', estado: 1 },
];
const CARRERAS = [{ idCarrera: 2, idFacultad: 1, nombre: 'Informática', sigla: 'INF', estado: 1 }];
const MATERIAS = [
  { idMateria: 10, idFacultad: 1, nombre: 'Ingeniería de Software I', sigla: 'INF412', estado: 1 },
];
const SEMESTRES = [{ idSemestre: 5, idFacultad: 1, semestre: 2, anio: 2026, estado: 1 }];
const TIPOS = [{ idTipoTrabajo: 4, idFacultad: 1, nombre: 'Proyecto de materia', estado: 1 }];

/**
 * Repositorio publico (/explorar) de punta a punta: rutas reales (lazy), guard, interceptor y
 * componentes del repositorio en modo publico.
 */
describe('Repositorio público (/explorar)', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
  }

  async function navegar(url: string): Promise<void> {
    harness ??= await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    vista = harness.fixture.nativeElement;
    await render();
  }

  /** Responde el estado del acceso anonimo (sin token). */
  async function estado(habilitado: boolean, facultades = habilitado ? [1] : []): Promise<void> {
    const req = http.expectOne(ESTADO);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(respuesta({ habilitado, facultades }));
    await render();
  }

  /** Peticion a un catalogo: siempre sin token (lectura anonima, catalog-api 1.3.0). */
  function catalogo(ruta: string, idFacultad: number | null): TestRequest {
    const req = http.expectOne(
      (r) =>
        r.url === `${API}/${ruta}` &&
        r.params.get('idFacultad') === (idFacultad === null ? null : String(idFacultad)),
    );
    expect(req.request.headers.has('Authorization')).toBe(false);
    return req;
  }

  /** Facultades + catalogos dependientes de la facultad (o solo los tipos, sin facultad). */
  function catalogos(idFacultad: number | null): void {
    catalogo('facultades', null).flush(respuesta(FACULTADES));
    catalogo('tipos-trabajo', idFacultad).flush(respuesta(TIPOS));
    if (idFacultad !== null) {
      catalogo('carreras', idFacultad).flush(respuesta(CARRERAS));
      catalogo('materias', idFacultad).flush(respuesta(MATERIAS));
      catalogo('semestres', idFacultad).flush(respuesta(SEMESTRES));
    }
  }

  function busqueda(): TestRequest {
    const req = http.expectOne((r) => r.url === `${API}/publico/repositorio`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    return req;
  }

  function select(nombre: string): HTMLSelectElement {
    return vista.querySelector<HTMLSelectElement>(`select[formcontrolname=${nombre}]`)!;
  }

  function opciones(nombre: string): string[] {
    return Array.from(select(nombre).options).map((o) => o.textContent!.trim());
  }

  async function elegir(nombre: string, indice: number): Promise<void> {
    const s = select(nombre);
    s.selectedIndex = indice;
    s.dispatchEvent(new Event('change'));
    await render();
  }

  function demasiadas(req: TestRequest, retryAfter?: string): void {
    req.flush(
      { status: 429, title: 'Demasiadas consultas', detail: 'Supero el limite por minuto.' },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: retryAfter ? new HttpHeaders({ 'Retry-After': retryAfter }) : undefined,
      },
    );
  }

  function buscador(): HTMLInputElement {
    return vista.querySelector<HTMLInputElement>('input[formcontrolname=q]')!;
  }

  function url(): string {
    return decodeURIComponent(TestBed.inject(Router).url);
  }

  function configurar(conSesion: boolean): void {
    sessionStorage.clear();
    if (conSesion) {
      sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba('ESTUDIANTE')));
    }
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        provideApi(),
        provideLocationMocks(),
        provideRouter(
          [
            {
              path: 'explorar',
              canActivate: [visitanteGuard],
              loadChildren: () => import('./explorar.routes').then((m) => m.routes),
            },
            { path: 'login', component: PaginaVacia },
            { path: 'repositorio', component: PaginaVacia },
            { path: 'repositorio/:id', component: PaginaVacia },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
    harness = undefined!;
  });

  describe('sin sesión', () => {
    beforeEach(() => configurar(false));

    it('con una sola facultad habilitada la preselecciona y carga sus catálogos sin token', async () => {
      await navegar('/explorar?q=redes');
      await estado(true, [1]);
      catalogos(1);

      // Una sola busqueda, ya con la facultad preseleccionada (no se busca primero sin ella).
      const req = busqueda();
      expect(req.request.params.get('q')).toBe('redes');
      expect(req.request.params.get('idFacultad')).toBe('1');
      req.flush(respuesta(pagina([resultadoRepositorioDePrueba()], 0, 10)));
      await render();

      expect(vista.querySelector('h1')?.textContent).toBe('Explorar el repositorio');
      // Solo la facultad habilitada y sin "Todas las facultades"; la URL no se ensucia.
      expect(opciones('idFacultad')).toEqual(['FICCT — Ciencias de la Computación']);
      expect(select('idFacultad').value).not.toBe('');
      expect(url()).toBe('/explorar?q=redes');
      expect(select('idMateria').disabled).toBe(false);
      expect(opciones('idMateria')).toEqual([
        'Todas las materias',
        'INF412 — Ingeniería de Software I',
      ]);
      expect(opciones('idTipoTrabajo')).toEqual(['Todos los tipos', 'Proyecto de materia']);
      expect(vista.querySelector('input[formcontrolname=hashtag]')).not.toBeNull();
      // Ya no se pide iniciar sesion para filtrar (solo para descargar).
      expect(vista.querySelector('.muted')?.textContent).not.toContain('filtrar por facultad,');
      expect(vista.querySelector('.muted')?.textContent).toContain('Para descargar');
      expect(vista.querySelector('#ayuda-sintaxis')?.textContent).toContain('frase exacta');
      expect(vista.querySelector('.orden-resultados')?.textContent).toContain(
        'Ordenado por relevancia',
      );
      // La ficha se abre dentro de /explorar.
      expect(vista.querySelector('.tarjeta-titulo a')?.getAttribute('href')).toBe('/explorar/7');
      expect(vista.querySelector('.topbar a.btn')?.getAttribute('href')).toBe('/login');
    });

    it('con acceso deshabilitado muestra "Acceso restringido" con botón al login', async () => {
      await navegar('/explorar');
      await estado(false);

      expect(vista.querySelector('h1')?.textContent).toBe('Acceso restringido');
      expect(vista.textContent).toContain(
        'El repositorio no está disponible para visitantes. Inicia sesión para consultarlo.',
      );
      expect(vista.querySelector('.acceso-restringido a.btn')?.getAttribute('href')).toBe('/login');
      // No se busca nada (http.verify lo confirma) ni se muestra el buscador.
      expect(vista.querySelector('form[role=search]')).toBeNull();
    });

    it('si /publico/estado falla ofrece reintentar', async () => {
      await navegar('/explorar');
      http.expectOne(ESTADO).flush(null, { status: 503, statusText: 'Service Unavailable' });
      await render();
      expect(vista.querySelector('.alert-danger')?.textContent).toContain(
        'No se pudo consultar el repositorio',
      );

      Array.from(vista.querySelectorAll('button'))
        .find((b) => b.textContent?.includes('Reintentar'))!
        .click();
      await render();
      await estado(false);
      expect(vista.querySelector('h1')?.textContent).toBe('Acceso restringido');
    });

    it('la ficha pública lista documentos, pero descargar lleva al login con returnUrl', async () => {
      await navegar('/explorar/7');
      await estado(true);
      const req = http.expectOne(`${API}/publico/repositorio/7`);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush(respuesta(publicoDePrueba({ documentos: [DOCUMENTO_PDF, ENLACE_GITHUB] })));
      await render();

      expect(vista.querySelector('h1')?.textContent).toBe('Sistema de inventarios');
      expect(vista.querySelector('.volver a')?.getAttribute('href')).toBe('/explorar');
      expect(vista.querySelector('.chips a')?.getAttribute('href')).toBe(
        '/explorar?hashtag=springboot',
      );
      // Los enlaces externos se pueden abrir; los archivos piden iniciar sesion.
      expect(vista.querySelector('a[target=_blank]')).not.toBeNull();
      expect(vista.querySelector('.lista-documentos button')).toBeNull();
      const descargar = Array.from(
        vista.querySelectorAll<HTMLAnchorElement>('.lista-documentos a'),
      ).find((a) => a.textContent?.includes('Inicia sesión para descargar'))!;
      expect(descargar.getAttribute('href')).toBe('/login?returnUrl=%2Frepositorio%2F7');

      descargar.click();
      await render();
      expect(url()).toBe('/login?returnUrl=/repositorio/7');
      http.expectNone(`${API}/documentos/41/descarga`);
    });
  });

  describe('sin sesión: filtros y límite de consultas', () => {
    beforeEach(() => configurar(false));

    it('con varias facultades habilitadas solo ofrece esas e ignora un enlace con otra', async () => {
      await navegar('/explorar?idFacultad=2&idMateria=10');
      await estado(true, [1, 3]);
      catalogos(null);

      // La facultad 2 no tiene acceso externo: se descarta junto con sus filtros dependientes.
      const req = busqueda();
      expect(req.request.params.has('idFacultad')).toBe(false);
      expect(req.request.params.has('idMateria')).toBe(false);
      req.flush(respuesta(pagina([], 0, 10)));
      await render();

      expect(opciones('idFacultad')).toEqual([
        'Todas las facultades',
        'FICCT — Ciencias de la Computación',
        'FCET — Tecnología',
      ]);
      expect(select('idMateria').disabled).toBe(true);
      expect(vista.querySelector('#ayuda-facultad')).not.toBeNull();

      // Elegir FICCT: una sola busqueda (los dependientes se limpian sin disparar otras).
      await elegir('idFacultad', 1);
      catalogo('tipos-trabajo', 1).flush(respuesta(TIPOS));
      catalogo('carreras', 1).flush(respuesta(CARRERAS));
      catalogo('materias', 1).flush(respuesta(MATERIAS));
      catalogo('semestres', 1).flush(respuesta(SEMESTRES));
      const conFacultad = busqueda();
      expect(conFacultad.request.params.get('idFacultad')).toBe('1');
      conFacultad.flush(respuesta(pagina([], 0, 10)));
      await render();
      expect(url()).toBe('/explorar?idFacultad=1');
    });

    it('con la facultad preseleccionada, filtrar y limpiar no la quitan ni duplican búsquedas', async () => {
      await navegar('/explorar');
      await estado(true, [1]);
      catalogos(1);
      busqueda().flush(respuesta(pagina([], 0, 10)));
      await render();
      // La facultad preseleccionada no cuenta como filtro: "Todavía no hay trabajos publicados".
      expect(vista.querySelector('.estado-vacio')?.textContent).toContain('Todavía no hay');
      expect(vista.querySelector('.filtros-activos')).toBeNull();

      await elegir('idMateria', 1);
      const req = busqueda();
      expect(req.request.params.get('idFacultad')).toBe('1');
      expect(req.request.params.get('idMateria')).toBe('10');
      req.flush(respuesta(pagina([], 0, 10)));
      await render();
      expect(url()).toBe('/explorar?idMateria=10');

      Array.from(vista.querySelectorAll('button'))
        .find((b) => b.textContent?.includes('Limpiar filtros'))!
        .click();
      await render();
      const limpia = busqueda();
      expect(limpia.request.params.get('idFacultad')).toBe('1');
      expect(limpia.request.params.has('idMateria')).toBe(false);
      limpia.flush(respuesta(pagina([], 0, 10)));
      await render();
      expect(url()).toBe('/explorar');
      expect(select('idFacultad').selectedIndex).toBe(0);
    });

    it('un 429 deshabilita el buscador con cuenta regresiva y al terminar repite la búsqueda', async () => {
      await navegar('/explorar?q=redes');
      await estado(true, [1]);
      catalogos(1);
      busqueda().flush(respuesta(pagina([resultadoRepositorioDePrueba()], 0, 10)));
      await render();

      // Solo se simulan el intervalo y el reloj (el scheduler de Angular sigue con timers reales).
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      buscador().value = 'redes neuronales';
      buscador().dispatchEvent(new Event('input'));
      vista.querySelector('form')!.dispatchEvent(new Event('submit'));
      await render();
      const bloqueada = busqueda();
      expect(bloqueada.request.params.get('q')).toBe('redes neuronales');
      demasiadas(bloqueada, '3');
      await render();

      const aviso = () => vista.querySelector('.aviso-espera')?.textContent?.trim();
      expect(aviso()).toBe('Demasiadas consultas seguidas. Podrás buscar de nuevo en 3 segundos.');
      expect(buscador().matches(':disabled')).toBe(true);
      expect(select('idMateria').matches(':disabled')).toBe(true);
      // Se conservan los resultados anteriores mientras dura la espera.
      expect(vista.querySelectorAll('.tarjeta-trabajo').length).toBe(1);

      vi.advanceTimersByTime(1000);
      await render();
      expect(aviso()).toBe('Demasiadas consultas seguidas. Podrás buscar de nuevo en 2 segundos.');
      vi.advanceTimersByTime(1000);
      await render();
      expect(aviso()).toBe('Demasiadas consultas seguidas. Podrás buscar de nuevo en 1 segundo.');
      http.expectNone((r) => r.url === `${API}/publico/repositorio`);

      vi.advanceTimersByTime(1000);
      await render();
      // Termino la espera: se habilita y se repite sola la busqueda pendiente (una sola vez).
      expect(vista.querySelector('.aviso-espera')).toBeNull();
      expect(buscador().matches(':disabled')).toBe(false);
      const reintento = busqueda();
      expect(reintento.request.params.get('q')).toBe('redes neuronales');
      reintento.flush(respuesta(pagina([], 0, 10)));
      await render();
      expect(vista.querySelector('.estado-vacio')?.textContent).toContain('Sin resultados');
    });

    it('un 429 sin Retry-After avisa sin bloquear y Enter reintenta la misma búsqueda', async () => {
      await navegar('/explorar?q=redes');
      await estado(true, [1]);
      catalogos(1);
      demasiadas(busqueda());
      await render();

      expect(vista.querySelector('.aviso-espera')?.textContent).toContain(
        'Supero el limite por minuto.',
      );
      expect(buscador().matches(':disabled')).toBe(false);

      vista.querySelector('form')!.dispatchEvent(new Event('submit'));
      await render();
      busqueda().flush(respuesta(pagina([], 0, 10)));
      await render();
      expect(vista.querySelector('.aviso-espera')).toBeNull();
    });

    it('la ficha pública con 429 explica que hay que esperar', async () => {
      await navegar('/explorar/7');
      await estado(true);
      demasiadas(http.expectOne(`${API}/publico/repositorio/7`), '20');
      await render();
      expect(vista.querySelector('.alert-danger')?.textContent).toContain(
        'Demasiadas consultas seguidas.',
      );
    });
  });

  describe('con sesión', () => {
    beforeEach(() => configurar(true));

    it('/explorar redirige a /repositorio conservando la búsqueda', async () => {
      await navegar('/explorar?q=redes&pagina=2');
      expect(url()).toBe('/repositorio?q=redes&pagina=2');
      http.expectNone(ESTADO);
    });

    it('/explorar/:id redirige a la ficha autenticada /repositorio/:id', async () => {
      await navegar('/explorar/7');
      expect(url()).toBe('/repositorio/7');
      http.expectNone(ESTADO);
    });
  });
});
