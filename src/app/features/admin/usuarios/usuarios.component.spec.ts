import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApi } from '../../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../../core/auth/testing';
import { pagina, USUARIO_DOCENTE } from '../../../core/services/testing';
import { UsuariosComponent } from './usuarios.component';

const API = '/api/v1';
const CARRERAS = [
  { idCarrera: 7, nombre: 'Informática', sigla: 'INF', idFacultad: 1, estado: 1 },
  { idCarrera: 8, nombre: 'Cerrada', sigla: 'OLD', idFacultad: 1, estado: 0 },
];
/** El administrador de la sesion (idUsuario 1 en tokensDePrueba). */
const ADMIN = {
  ...USUARIO_DOCENTE,
  idUsuario: 1,
  usuario: 'admin',
  rol: 'ADMIN' as const,
  twoFactorEnabled: true,
};
const ESTUDIANTE = {
  ...USUARIO_DOCENTE,
  idUsuario: 20,
  usuario: '219012345',
  rol: 'ESTUDIANTE' as const,
  requiereCambioPassword: true,
  registro: 219012345,
  idCarrera: 7,
  siglaCarrera: 'INF',
};

describe('UsuariosComponent', () => {
  let fixture: ComponentFixture<UsuariosComponent>;
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

  function elegir(nombre: string, indice: number): void {
    const select = control<HTMLSelectElement>(nombre);
    select.selectedIndex = indice;
    select.dispatchEvent(new Event('change'));
  }

  function listado(contenido: unknown[]) {
    const req = http.expectOne((r) => r.url === `${API}/usuarios` && r.method === 'GET');
    req.flush(respuesta(pagina(contenido)));
    return req.request;
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
    fixture = TestBed.createComponent(UsuariosComponent);
    vista = fixture.nativeElement;
    await render();
    http.expectOne((r) => r.url === `${API}/carreras`).flush(respuesta(CARRERAS));
    const req = listado([ADMIN, USUARIO_DOCENTE, ESTUDIANTE]);
    expect(req.params.get('pagina')).toBe('0');
    expect(req.params.get('tamano')).toBe('20');
    expect(req.params.get('incluirInactivos')).toBe('false');
    await render();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('muestra badges de rol, 2FA y cambio de contraseña pendiente', () => {
    const filas = Array.from(vista.querySelectorAll('tbody tr')).map((f) => f.textContent!);
    expect(filas[0]).toContain('Administrador');
    expect(filas[0]).toContain('2FA');
    expect(filas[2]).toContain('Estudiante');
    expect(filas[2]).toContain('INF');
    expect(filas[2]).toContain('Debe cambiar contraseña');
    expect(vista.querySelector('.paginador')?.textContent).toContain('1–3 de 3');
  });

  it('el administrador no puede desactivarse a sí mismo', () => {
    const [propia, otra] = Array.from(vista.querySelectorAll('tbody tr'));
    expect(propia.textContent).not.toContain('Desactivar');
    expect(otra.textContent).toContain('Desactivar');
  });

  it('busca con debounce y vuelve a la primera página', async () => {
    const q = vista.querySelector<HTMLInputElement>('.filters input[type=search]')!;
    q.value = 'mar';
    q.dispatchEvent(new Event('input'));
    http.expectNone((r) => r.url === `${API}/usuarios`);

    await new Promise((r) => setTimeout(r, 350));
    const req = listado([USUARIO_DOCENTE]);
    expect(req.params.get('q')).toBe('mar');
    expect(req.params.get('pagina')).toBe('0');
  });

  it('registro y carrera solo aparecen (y son obligatorios) para ESTUDIANTE', async () => {
    boton('Nuevo usuario').click();
    await render();
    expect(control('registro')).toBeNull();

    elegir('rol', 3); // Estudiante
    await render();
    expect(control('registro')).not.toBeNull();
    // Solo carreras activas en el formulario.
    expect(
      Array.from(control<HTMLSelectElement>('idCarrera').options).map((o) => o.textContent?.trim()),
    ).toEqual(['Seleccione…', 'INF — Informática']);

    escribir('usuario', 'est.nuevo');
    escribir('passwordInicial', 'Temporal123');
    escribir('nombre', 'Ana');
    escribir('apellidos', 'Rojas');
    escribir('ci', '1234567');
    escribir('correo', 'ana@uagrm.edu.bo');
    boton('Guardar').click();
    await render();
    http.expectNone((r) => r.method === 'POST');
    expect(vista.querySelector('form')!.textContent).toContain('Seleccione la carrera.');

    escribir('registro', '219000111');
    elegir('idCarrera', 1);
    boton('Guardar').click();

    const post = http.expectOne((r) => r.url === `${API}/usuarios` && r.method === 'POST');
    expect(post.request.body).toEqual({
      usuario: 'est.nuevo',
      passwordInicial: 'Temporal123',
      rol: 'ESTUDIANTE',
      nombre: 'Ana',
      apellidos: 'Rojas',
      ci: 1234567,
      correo: 'ana@uagrm.edu.bo',
      celular: null,
      fechaNac: null,
      registro: 219000111,
      idCarrera: 7,
    });
    post.flush(respuesta({ ...ESTUDIANTE, usuario: 'est.nuevo' }), {
      status: 201,
      statusText: 'Created',
    });
    listado([]);
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('«est.nuevo» creado');
  });

  it('lleva los errores del servidor a los campos (409 / 400)', async () => {
    boton('Nuevo usuario').click();
    await render();
    elegir('rol', 2); // Docente
    escribir('usuario', 'doc.nuevo');
    escribir('passwordInicial', 'Temporal123');
    escribir('nombre', 'Ana');
    escribir('apellidos', 'Rojas');
    escribir('ci', '7654321');
    escribir('correo', 'ana@uagrm.edu.bo');
    boton('Guardar').click();

    http
      .expectOne((r) => r.method === 'POST')
      .flush(
        {
          status: 409,
          title: 'Conflicto',
          detail: 'Ya existe una persona con el CI 7654321.',
          timestamp: new Date().toISOString(),
          errores: { ci: 'ya está registrado' },
        },
        { status: 409, statusText: 'Conflict' },
      );
    await render();
    expect(vista.querySelector('.panel .alert-danger')?.textContent).toContain('CI 7654321');
    expect(control('ci').closest('label')!.textContent).toContain('ya está registrado');
  });

  it('al editar, el login no se puede cambiar y no se envía estado', async () => {
    boton('Editar', vista.querySelectorAll('tbody tr')[1]).click();
    await render();
    expect(control('usuario').disabled).toBe(true);
    expect(control('passwordInicial')).toBeNull();

    escribir('nombre', 'María José');
    boton('Guardar').click();
    const put = http.expectOne(`${API}/usuarios/12`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.nombre).toBe('María José');
    expect(put.request.body).not.toHaveProperty('usuario');
    expect(put.request.body).not.toHaveProperty('estado');
    put.flush(respuesta({ ...USUARIO_DOCENTE, nombre: 'María José' }));
    listado([]);
  });

  it('desactiva con confirmación', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    boton('Desactivar', vista.querySelectorAll('tbody tr')[1]).click();
    expect(confirmar).toHaveBeenCalled();
    const del = http.expectOne(`${API}/usuarios/12`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta({ ...USUARIO_DOCENTE, estado: 0 }));
    listado([]);
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('desactivado');
  });

  it('restablece la contraseña con una temporal generada y explica las consecuencias', async () => {
    boton('Restablecer contraseña', vista.querySelectorAll('tbody tr')[1]).click();
    await render();
    const dialogo = vista.querySelector('[role=dialog]')!;
    expect(dialogo.textContent).toContain('se le pedirá cambiarla');
    expect(dialogo.textContent).toContain('se cerrarán todas sus sesiones');
    const temporal = dialogo.querySelector<HTMLInputElement>('input')!.value;
    expect(temporal).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/);

    boton('Restablecer contraseña', dialogo).click();
    const req = http.expectOne(`${API}/usuarios/12/password/reset`);
    expect(req.request.body).toEqual({ passwordNueva: temporal });
    req.flush(respuesta(null));
    listado([USUARIO_DOCENTE]);
    await render();
    expect(vista.querySelector('[role=dialog]')).toBeNull();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('restablecida');
  });
});
