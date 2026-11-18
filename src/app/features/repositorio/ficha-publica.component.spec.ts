import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApi } from '../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../core/auth/testing';
import {
  DOCUMENTO_PDF,
  ENLACE_GITHUB,
  publicoDePrueba,
} from '../../core/services/testing-trabajos';
import { FichaPublicaComponent } from './ficha-publica.component';
import { UltimaBusquedaRepositorio } from './filtros-repositorio';

const API = '/api/v1';

describe('FichaPublicaComponent', () => {
  let fixture: ComponentFixture<FichaPublicaComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function abrir(id = '7'): Promise<void> {
    fixture = TestBed.createComponent(FichaPublicaComponent);
    vista = fixture.nativeElement;
    fixture.componentRef.setInput('id', id);
    await render();
  }

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba('DOCENTE')));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('muestra la ficha sin acciones, con hashtags que vuelven al buscador filtrado', async () => {
    TestBed.inject(UltimaBusquedaRepositorio).params.set({ q: 'redes', pagina: '2' });
    await abrir();
    http.expectOne(`${API}/repositorio/7`).flush(
      respuesta(
        publicoDePrueba({
          documentos: [
            { ...ENLACE_GITHUB, urlExterno: 'javascript:alert(1)', idDocumento: 50 },
            DOCUMENTO_PDF,
            ENLACE_GITHUB,
            { ...DOCUMENTO_PDF, idDocumento: 43, idFase: 1, nombreFase: 'Perfil' },
          ],
        }),
      ),
    );
    await render();

    expect(vista.querySelector('h1')?.textContent).toBe('Sistema de inventarios');
    expect(vista.textContent).toContain('Juan Perez, Ana Rojas');
    // Nada editable ni del ciclo de vida: sin estado, historial ni botones de accion.
    expect(vista.querySelector('app-estado-trabajo')).toBeNull();
    expect(vista.textContent).not.toContain('Historial');
    expect(vista.textContent).not.toContain('Editar');

    const hashtags = Array.from(vista.querySelectorAll<HTMLAnchorElement>('.chips a'));
    expect(hashtags.map((a) => a.textContent?.trim())).toEqual(['#springboot', '#inventarios']);
    expect(hashtags[0].getAttribute('href')).toBe('/repositorio?hashtag=springboot');
    expect(vista.querySelector('.volver a')?.getAttribute('href')).toBe(
      '/repositorio?q=redes&pagina=2',
    );

    // Documentos agrupados por fase (en orden de fase).
    const fases = Array.from(vista.querySelectorAll('.fase'));
    expect(fases.map((f) => f.querySelector('h3')?.textContent)).toEqual(['Perfil', 'Final']);
    expect(fases[1].querySelectorAll('.lista-documentos li')).toHaveLength(3);
    // Solo se abren enlaces https, en otra pestaña y sin acceso a esta (noopener).
    const enlaces = Array.from(vista.querySelectorAll<HTMLAnchorElement>('a[target=_blank]'));
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0].href).toBe('https://github.com/usuario/proyecto');
    expect(enlaces[0].rel).toBe('noopener noreferrer');
    expect(fases[1].textContent).toContain('Enlace no disponible');
  });

  it('descarga un archivo como blob con el nombre del servidor', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:prueba'), revokeObjectURL: vi.fn() });
    let descargado = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      descargado = this.download;
    });
    await abrir();
    http
      .expectOne(`${API}/repositorio/7`)
      .flush(respuesta(publicoDePrueba({ documentos: [DOCUMENTO_PDF] })));
    await render();

    vista.querySelector<HTMLButtonElement>('.lista-documentos button')!.click();
    await render();
    const req = http.expectOne(`${API}/documentos/41/descarga`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF']), {
      headers: new HttpHeaders({
        'Content-Disposition': 'attachment; filename="informe-publicado.pdf"',
      }),
    });
    await render();
    expect(descargado).toBe('informe-publicado.pdf');
    expect(vista.querySelector('.alert-danger')).toBeNull();
  });

  it('un 404 dice que el trabajo no existe o no está publicado', async () => {
    await abrir();
    http
      .expectOne(`${API}/repositorio/7`)
      .flush({ status: 404, title: 'No encontrado' }, { status: 404, statusText: 'Not Found' });
    await render();
    expect(vista.querySelector('.alert-danger')?.textContent).toContain(
      'El trabajo no existe o no está publicado.',
    );
    expect(vista.querySelector('h1')).toBeNull();
  });

  it('un id inválido no consulta al backend', async () => {
    await abrir('abc');
    http.expectNone(`${API}/repositorio/abc`);
    expect(vista.querySelector('.alert-danger')?.textContent).toContain('no está publicado');
  });
});
