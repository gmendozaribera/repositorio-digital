import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApi } from '../api/api.providers';
import { respuesta } from '../auth/testing';
import { pagina, USUARIO_DOCENTE } from './testing';
import { UsuarioService } from './usuario.service';

const API = '/api/v1';

describe('UsuarioService', () => {
  let servicio: UsuarioService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi()],
    });
    servicio = TestBed.inject(UsuarioService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista usuarios paginados sin enviar filtros vacios', () => {
    let total = 0;
    servicio
      .listar({ q: '  ', rol: 'DOCENTE', idCarrera: undefined, pagina: 2, tamano: 10 })
      .subscribe((p) => (total = p.totalElementos));

    const req = http.expectOne((r) => r.url === `${API}/usuarios`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.has('idCarrera')).toBe(false);
    expect(req.request.params.get('rol')).toBe('DOCENTE');
    expect(req.request.params.get('pagina')).toBe('2');
    expect(req.request.params.get('tamano')).toBe('10');
    req.flush(respuesta(pagina([USUARIO_DOCENTE], 2, 10, 21)));
    expect(total).toBe(21);
  });

  it('busca docentes por texto y devuelve solo el contenido', () => {
    let usuarios: string[] = [];
    servicio.buscarDocentes('mar').subscribe((l) => (usuarios = l.map((u) => u.usuario)));

    const req = http.expectOne((r) => r.url === `${API}/usuarios`);
    expect(req.request.params.get('q')).toBe('mar');
    expect(req.request.params.get('rol')).toBe('DOCENTE');
    req.flush(respuesta(pagina([USUARIO_DOCENTE])));
    expect(usuarios).toEqual(['doc.maria']);
  });

  it('crea, actualiza, desactiva y restablece la contraseña', () => {
    const alta = {
      usuario: 'doc.maria',
      passwordInicial: 'Temporal123',
      rol: 'DOCENTE' as const,
      nombre: 'María',
      apellidos: 'López',
      ci: '7654321',
      correo: 'maria.lopez@uagrm.edu.bo',
    };
    servicio.crear(alta).subscribe();
    const post = http.expectOne(`${API}/usuarios`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(alta);
    post.flush(respuesta(USUARIO_DOCENTE), { status: 201, statusText: 'Created' });

    servicio.actualizar(12, { ...alta, estado: 1 }).subscribe();
    const put = http.expectOne(`${API}/usuarios/12`);
    expect(put.request.method).toBe('PUT');
    put.flush(respuesta(USUARIO_DOCENTE));

    let estado: number | undefined;
    servicio.desactivar(12).subscribe((u) => (estado = u.estado));
    const del = http.expectOne(`${API}/usuarios/12`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta({ ...USUARIO_DOCENTE, estado: 0 }));
    expect(estado).toBe(0);

    let reseteado = false;
    servicio.restablecerPassword(12, 'Nueva1234').subscribe(() => (reseteado = true));
    const reset = http.expectOne(`${API}/usuarios/12/password/reset`);
    expect(reset.request.method).toBe('POST');
    expect(reset.request.body).toEqual({ passwordNueva: 'Nueva1234' });
    reset.flush(respuesta(null));
    expect(reseteado).toBe(true);
  });

  it('lista los tipos de usuario', () => {
    let roles: string[] = [];
    servicio.tiposUsuario().subscribe((t) => (roles = t.map((x) => x.nombre)));
    http
      .expectOne(`${API}/tipos-usuario`)
      .flush(respuesta([{ idTipoUsuario: 1, nombre: 'ADMIN', descripcion: null, estado: 1 }]));
    expect(roles).toEqual(['ADMIN']);
  });

  it('filtra el padron por registrado y habilitado', () => {
    servicio.listarPadron({ registrado: false, habilitado: true, q: '' }).subscribe();
    const req = http.expectOne((r) => r.url === `${API}/padron`);
    expect(req.request.params.get('registrado')).toBe('false');
    expect(req.request.params.get('habilitado')).toBe('true');
    expect(req.request.params.has('q')).toBe(false);
    req.flush(respuesta(pagina([])));
  });

  it('importa el padron como multipart con el campo archivo', () => {
    const archivo = new File(['registro,ci\n1,2\n'], 'padron.csv', { type: 'text/csv' });
    let insertados = -1;
    servicio.importarPadron(archivo).subscribe((r) => (insertados = r.insertados));

    const req = http.expectOne(`${API}/padron/import`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('archivo') as File).name).toBe('padron.csv');
    req.flush(
      respuesta({ totalFilas: 1, insertados: 1, actualizados: 0, conErrores: 0, errores: [] }),
    );
    expect(insertados).toBe(1);
  });

  it('habilita o inhabilita con PATCH', () => {
    servicio.cambiarHabilitado(4, false).subscribe();
    const req = http.expectOne(`${API}/padron/4`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ habilitado: false });
    req.flush(respuesta({}));
  });
});
