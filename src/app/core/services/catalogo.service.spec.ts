import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApi } from '../api/api.providers';
import { respuesta } from '../auth/testing';
import { CatalogoService } from './catalogo.service';

const API = '/api/v1';

describe('CatalogoService', () => {
  let servicio: CatalogoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi()],
    });
    servicio = TestBed.inject(CatalogoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista facultades por la URL relativa y desenvuelve data', () => {
    let nombres: string[] = [];
    servicio.facultades.listar({ incluirInactivos: true }).subscribe((f) => {
      nombres = f.map((x) => x.sigla);
    });

    const req = http.expectOne((r) => r.url === `${API}/facultades`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('incluirInactivos')).toBe('true');
    req.flush(respuesta([{ idFacultad: 1, nombre: 'Computación', sigla: 'FICCT', estado: 1 }]));

    expect(nombres).toEqual(['FICCT']);
  });

  it('no envia filtros vacios', () => {
    servicio.carreras.listar({ idFacultad: undefined, incluirInactivos: false }).subscribe();
    const req = http.expectOne((r) => r.url === `${API}/carreras`);
    expect(req.request.params.has('idFacultad')).toBe(false);
    expect(req.request.params.get('incluirInactivos')).toBe('false');
    req.flush(respuesta([]));
  });

  it('filtra materias por facultad', () => {
    servicio.materias.listar({ idFacultad: 3 }).subscribe();
    const req = http.expectOne((r) => r.url === `${API}/materias`);
    expect(req.request.params.get('idFacultad')).toBe('3');
    req.flush(respuesta([]));
  });

  it('crea, actualiza y desactiva con POST, PUT y DELETE', () => {
    const body = { nombre: 'Informática', sigla: 'INF', idFacultad: 1 };
    const carrera = { ...body, idCarrera: 7, estado: 1 };

    servicio.carreras.crear(body).subscribe();
    const post = http.expectOne(`${API}/carreras`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(body);
    post.flush(respuesta(carrera), { status: 201, statusText: 'Created' });

    servicio.carreras.actualizar(7, { ...body, estado: 1 }).subscribe();
    const put = http.expectOne(`${API}/carreras/7`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ ...body, estado: 1 });
    put.flush(respuesta(carrera));

    let desactivada: number | undefined;
    servicio.carreras.desactivar(7).subscribe((c) => (desactivada = c.estado));
    const del = http.expectOne(`${API}/carreras/7`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta({ ...carrera, estado: 0 }));
    expect(desactivada).toBe(0);
  });

  it('lista grupos por materia y semestre', () => {
    servicio.grupos.listar({ idMateria: 4, idSemestre: 9 }).subscribe();
    const req = http.expectOne((r) => r.url === `${API}/grupos`);
    expect(req.request.params.get('idMateria')).toBe('4');
    expect(req.request.params.get('idSemestre')).toBe('9');
    req.flush(respuesta([]));
  });

  it('gestiona los docentes de un grupo con el flag esAdminCurso', () => {
    servicio.docentesDeGrupo(5).subscribe();
    http.expectOne(`${API}/grupos/5/docentes`).flush(respuesta([]));

    servicio.asignarDocente(5, { idUsuario: 12, esAdminCurso: true }).subscribe();
    const post = http.expectOne(`${API}/grupos/5/docentes`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ idUsuario: 12, esAdminCurso: true });
    post.flush(
      respuesta({
        idGrupo: 5,
        idUsuario: 12,
        usuario: 'doc.maria',
        nombre: 'María',
        apellidos: 'López',
        esAdminCurso: true,
      }),
    );

    servicio.actualizarDocente(5, 12, { esAdminCurso: false }).subscribe();
    const patch = http.expectOne(`${API}/grupos/5/docentes/12`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ esAdminCurso: false });
    patch.flush(
      respuesta({
        idGrupo: 5,
        idUsuario: 12,
        usuario: 'doc.maria',
        nombre: 'María',
        apellidos: 'López',
        esAdminCurso: false,
      }),
    );

    let quitado = false;
    servicio.quitarDocente(5, 12).subscribe(() => (quitado = true));
    const del = http.expectOne(`${API}/grupos/5/docentes/12`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta(null));
    expect(quitado).toBe(true);
  });
});
