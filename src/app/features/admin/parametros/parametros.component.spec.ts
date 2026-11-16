import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Dominio } from '../../../api/user';
import { provideApi } from '../../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../../core/auth/testing';
import { DOMINIO_LOGIN_INTENTOS } from '../../../core/services/testing';
import { formatearFechaHora, ParametrosComponent } from './parametros.component';

const API = '/api/v1/dominios';
const LOGIN_ESPERA: Dominio = {
  ...DOMINIO_LOGIN_INTENTOS,
  domainId: 2,
  domainName: 'LOGIN_WAITING',
  domainValue: '15',
  description: 'Minutos de bloqueo tras superar los intentos.',
};
const PROPIO: Dominio = {
  domainId: 3,
  domainGroup: 'REPO_GROUP',
  domainName: 'BIENVENIDA',
  domainValue: 'Hola',
  description: 'Texto de bienvenida',
  lastUser: 'admin',
  lastTime: '2026-11-15T10:30:00Z',
  sistema: false,
};

describe('ParametrosComponent', () => {
  let fixture: ComponentFixture<ParametrosComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function boton(texto: string, raiz: ParentNode = vista): HTMLButtonElement {
    const b = Array.from(raiz.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  function control<T extends HTMLElement = HTMLInputElement>(nombre: string): T {
    return vista.querySelector<T>(`form [formcontrolname=${nombre}]`)!;
  }

  function escribir(nombre: string, valor: string): void {
    const input = control(nombre);
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  }

  function fila(nombre: string): HTMLTableRowElement {
    const f = Array.from(vista.querySelectorAll<HTMLTableRowElement>('tbody tr')).find((x) =>
      x.textContent?.includes(nombre),
    );
    if (!f) throw new Error(`No hay fila ${nombre}`);
    return f;
  }

  function listado(lista: Dominio[]): void {
    http.expectOne((r) => r.url === API && r.method === 'GET').flush(respuesta(lista));
  }

  beforeEach(async () => {
    sessionStorage.clear();
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba('ADMIN')));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ParametrosComponent);
    vista = fixture.nativeElement;
    await render();
    // Desordenados a proposito: la vista agrupa y ordena.
    listado([PROPIO, LOGIN_ESPERA, DOMINIO_LOGIN_INTENTOS]);
    await render();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('agrupa por grupo, muestra el último cambio y explica que el cambio es inmediato', () => {
    expect(
      Array.from(vista.querySelectorAll('.grupo-parametros h2')).map((h) => h.textContent),
    ).toEqual(['AUTH_GROUP', 'REPO_GROUP']);
    const nombres = Array.from(
      vista.querySelectorAll('.grupo-parametros')[0].querySelectorAll('tbody td:first-child code'),
    ).map((c) => c.textContent);
    expect(nombres).toEqual(['LOGIN_INTENTOS', 'LOGIN_WAITING']);

    const propia = fila('BIENVENIDA');
    expect(propia.textContent).toContain('admin');
    expect(propia.textContent).toContain(formatearFechaHora(PROPIO.lastTime));
    expect(propia.querySelector('time')?.getAttribute('datetime')).toBe(PROPIO.lastTime);
    expect(vista.querySelector('.alert-info')?.textContent).toContain('al instante');
  });

  it('los parámetros del sistema llevan el badge y no se pueden eliminar', () => {
    const sistema = fila('LOGIN_INTENTOS');
    expect(sistema.querySelector('.badge')?.textContent).toBe('Sistema');
    expect(sistema.textContent).not.toContain('Eliminar');
    expect(fila('BIENVENIDA').textContent).toContain('Eliminar');
    expect(fila('BIENVENIDA').querySelector('.badge')).toBeNull();
  });

  it('filtra por grupo', async () => {
    const select = vista.querySelector<HTMLSelectElement>('.filters select')!;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Todos',
      'AUTH_GROUP',
      'REPO_GROUP',
    ]);
    select.value = 'REPO_GROUP';
    select.dispatchEvent(new Event('change'));
    await render();
    expect(vista.querySelectorAll('tbody tr').length).toBe(1);
    expect(vista.querySelector('.grupo-parametros h2')?.textContent).toBe('REPO_GROUP');
  });

  it('alta: valida el código, lo pasa a MAYÚSCULAS y lleva los errores del servidor al campo', async () => {
    boton('Nuevo parámetro').click();
    await render();
    escribir('domainGroup', '1grupo');
    escribir('domainName', 'max-mb');
    boton('Guardar').click();
    await render();
    http.expectNone((r) => r.method === 'POST');
    expect(control('domainGroup').closest('label')!.textContent).toContain(
      'empezando por una letra',
    );
    expect(control('domainValue').closest('label')!.textContent).toContain('Ingrese el valor');

    escribir('domainGroup', 'repo_group');
    control('domainGroup').dispatchEvent(new Event('blur'));
    escribir('domainName', 'max_mb');
    escribir('domainValue', ' 20 ');
    escribir('description', 'Tamaño máximo de archivo');
    await render();
    expect(control('domainGroup').value).toBe('REPO_GROUP');
    boton('Guardar').click();

    const post = http.expectOne((r) => r.url === API && r.method === 'POST');
    expect(post.request.body).toEqual({
      domainGroup: 'REPO_GROUP',
      domainName: 'MAX_MB',
      domainValue: '20',
      description: 'Tamaño máximo de archivo',
    });
    post.flush(
      {
        status: 409,
        title: 'Conflicto',
        detail: 'Ya existe el parámetro REPO_GROUP / MAX_MB.',
        timestamp: new Date().toISOString(),
        errores: { domainName: 'ya existe en el grupo' },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await render();
    expect(vista.querySelector('.panel .alert-danger')?.textContent).toContain('Ya existe');
    expect(control('domainName').closest('label')!.textContent).toContain('ya existe en el grupo');
  });

  it('edición: grupo y nombre de solo lectura; solo envía valor y descripción', async () => {
    boton('Editar', fila('LOGIN_INTENTOS')).click();
    await render();
    expect(control('domainGroup').disabled).toBe(true);
    expect(control('domainName').disabled).toBe(true);
    expect(vista.querySelector('.panel')?.textContent).toContain('no se puede eliminar');

    escribir('domainValue', '5');
    boton('Guardar').click();
    const put = http.expectOne(`${API}/1`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      domainValue: '5',
      description: DOMINIO_LOGIN_INTENTOS.description,
    });
    put.flush(respuesta({ ...DOMINIO_LOGIN_INTENTOS, domainValue: '5', lastUser: 'admin' }));
    listado([PROPIO, LOGIN_ESPERA, { ...DOMINIO_LOGIN_INTENTOS, domainValue: '5' }]);
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain(
      'ya rige en todo el sistema',
    );
    expect(vista.querySelector('form')).toBeNull();
  });

  it('edición: el 400 del servidor (valor inválido) se muestra en el campo valor', async () => {
    boton('Editar', fila('LOGIN_INTENTOS')).click();
    await render();
    escribir('domainValue', 'muchos');
    boton('Guardar').click();
    http.expectOne(`${API}/1`).flush(
      {
        status: 400,
        title: 'Datos inválidos',
        detail: 'Revise los datos.',
        timestamp: new Date().toISOString(),
        errores: { domainValue: 'debe ser un entero entre 1 y 1000' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await render();
    expect(control('domainValue').closest('label')!.textContent).toContain('entero entre 1 y 1000');
  });

  it('elimina con confirmación', async () => {
    const confirmar = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    boton('Eliminar', fila('BIENVENIDA')).click();
    expect(confirmar).toHaveBeenCalledTimes(1);
    http.expectNone((r) => r.method === 'DELETE');

    boton('Eliminar', fila('BIENVENIDA')).click();
    const del = http.expectOne(`${API}/3`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta(null));
    listado([LOGIN_ESPERA, DOMINIO_LOGIN_INTENTOS]);
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('eliminado');
    expect(
      Array.from(vista.querySelectorAll('.grupo-parametros h2')).map((h) => h.textContent),
    ).toEqual(['AUTH_GROUP']);
  });
});
