import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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
  async function estado(habilitado: boolean): Promise<void> {
    const req = http.expectOne(ESTADO);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(respuesta({ habilitado, facultades: habilitado ? [1] : [] }));
    await render();
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
    http.verify();
    harness = undefined!;
  });

  describe('sin sesión', () => {
    beforeEach(() => configurar(false));

    it('con acceso habilitado busca en /publico/repositorio sin token ni catálogos', async () => {
      await navegar('/explorar?q=redes');
      await estado(true);

      const req = http.expectOne((r) => r.url === `${API}/publico/repositorio`);
      expect(req.request.headers.has('Authorization')).toBe(false);
      expect(req.request.params.get('q')).toBe('redes');
      req.flush(respuesta(pagina([resultadoRepositorioDePrueba()], 0, 10)));
      await render();

      expect(vista.querySelector('h1')?.textContent).toBe('Explorar el repositorio');
      // Los catalogos exigen sesion: no se piden ni se muestran sus filtros.
      expect(vista.querySelector('select[formcontrolname=idFacultad]')).toBeNull();
      expect(vista.querySelector('input[formcontrolname=hashtag]')).not.toBeNull();
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
