import { HttpEventType, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApi } from '../api/api.providers';
import { respuesta } from '../auth/testing';
import { pagina } from './testing';
import {
  archivoDePrueba,
  DOCUMENTO_PDF,
  publicoDePrueba,
  resultadoRepositorioDePrueba,
  REGLAS,
  resumenDePrueba,
  trabajoDePrueba,
} from './testing-trabajos';
import { EventoSubida, TrabajoService } from './trabajo.service';

const API = '/api/v1';

describe('TrabajoService', () => {
  let servicio: TrabajoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi()],
    });
    servicio = TestBed.inject(TrabajoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista mis trabajos sin mandar filtros vacíos', () => {
    let total = 0;
    servicio
      .misTrabajos({ estado: undefined, pagina: 1, tamano: 10 })
      .subscribe((p) => (total = p.totalElementos));
    const req = http.expectOne((r) => r.url === `${API}/trabajos/mios`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('estado')).toBe(false);
    expect(req.request.params.get('pagina')).toBe('1');
    expect(req.request.params.get('tamano')).toBe('10');
    req.flush(respuesta(pagina([resumenDePrueba()], 1, 10, 11)));
    expect(total).toBe(11);
  });

  it('lista la bandeja de revisión filtrando por estado y grupo', () => {
    servicio.bandeja({ estado: 'EN_REVISION', idGrupo: 3 }).subscribe();
    const req = http.expectOne((r) => r.url === `${API}/trabajos/revision`);
    expect(req.request.params.get('estado')).toBe('EN_REVISION');
    expect(req.request.params.get('idGrupo')).toBe('3');
    req.flush(respuesta(pagina([])));
  });

  it('crea, obtiene, actualiza, envía y elimina un trabajo', () => {
    const body = {
      titulo: 'Sistema de inventarios',
      resumen: 'Un resumen de al menos veinte caracteres.',
      idGrupo: 3,
      idTipoTrabajo: 4,
      hashtags: ['springboot'],
      registrosCoautores: [219012346],
    };
    let creado = 0;
    servicio.crear(body).subscribe((t) => (creado = t.idTrabajo));
    const post = http.expectOne(`${API}/trabajos`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(body);
    post.flush(respuesta(trabajoDePrueba()), { status: 201, statusText: 'Created' });
    expect(creado).toBe(7);

    servicio.obtener(7).subscribe();
    http.expectOne(`${API}/trabajos/7`).flush(respuesta(trabajoDePrueba()));

    servicio.actualizar(7, body).subscribe();
    const put = http.expectOne(`${API}/trabajos/7`);
    expect(put.request.method).toBe('PUT');
    put.flush(respuesta(trabajoDePrueba()));

    servicio.enviar(7).subscribe();
    const enviar = http.expectOne(`${API}/trabajos/7/enviar`);
    expect(enviar.request.method).toBe('PATCH');
    enviar.flush(respuesta(trabajoDePrueba({ estado: 'PENDIENTE' })));

    let eliminado = false;
    servicio.eliminar(7).subscribe(() => (eliminado = true));
    const del = http.expectOne(`${API}/trabajos/7`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta(null));
    expect(eliminado).toBe(true);
  });

  it('aprobar manda observaciones null si están en blanco y rechazar recorta el motivo', () => {
    servicio.tomarRevision(7).subscribe();
    const revisar = http.expectOne(`${API}/trabajos/7/revisar`);
    expect(revisar.request.method).toBe('PATCH');
    revisar.flush(respuesta(trabajoDePrueba({ estado: 'EN_REVISION' })));

    servicio.aprobar(7, '   ').subscribe();
    const aprobar = http.expectOne(`${API}/trabajos/7/aprobar`);
    expect(aprobar.request.body).toEqual({ observaciones: null });
    aprobar.flush(respuesta(trabajoDePrueba({ estado: 'APROBADO' })));

    servicio.aprobar(7, ' Corregir la bibliografía ').subscribe();
    const conObs = http.expectOne(`${API}/trabajos/7/aprobar`);
    expect(conObs.request.body).toEqual({ observaciones: 'Corregir la bibliografía' });
    conObs.flush(respuesta(trabajoDePrueba({ estado: 'APROBADO_CON_OBSERVACIONES' })));

    servicio.rechazar(7, '  No corresponde al tema.  ').subscribe();
    const rechazar = http.expectOne(`${API}/trabajos/7/rechazar`);
    expect(rechazar.request.method).toBe('PATCH');
    expect(rechazar.request.body).toEqual({ motivo: 'No corresponde al tema.' });
    rechazar.flush(respuesta(trabajoDePrueba({ estado: 'RECHAZADO' })));
  });

  it('pide las reglas de documentos de la facultad', () => {
    let maximo = 0;
    servicio.reglas(1).subscribe((r) => (maximo = r.formatos[3].tamanoMaxMB));
    const req = http.expectOne((r) => r.url === `${API}/documentos/reglas`);
    expect(req.request.params.get('idFacultad')).toBe('1');
    req.flush(respuesta(REGLAS));
    expect(maximo).toBe(100);
  });

  it('sube un archivo como multipart informando el progreso', () => {
    const archivo = archivoDePrueba('informe.pdf', 1);
    const eventos: EventoSubida[] = [];
    servicio
      .subir(7, { archivo, titulo: ' Informe ', categoria: 'DOCUMENTO', idFase: 2 })
      .subscribe((e) => eventos.push(e));

    const req = http.expectOne(`${API}/trabajos/7/documentos`);
    expect(req.request.method).toBe('POST');
    expect(req.request.reportProgress).toBe(true);
    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('archivo') as File).name).toBe('informe.pdf');
    expect(body.get('titulo')).toBe('Informe');
    expect(body.get('categoria')).toBe('DOCUMENTO');
    expect(body.get('idFase')).toBe('2');
    expect(body.has('descripcion')).toBe(false);

    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 200 });
    req.flush(respuesta(DOCUMENTO_PDF), { status: 201, statusText: 'Created' });

    expect(eventos).toEqual([
      { tipo: 'progreso', porcentaje: 25 },
      { tipo: 'completo', documento: DOCUMENTO_PDF },
    ]);
  });

  it('descarga como blob y toma el nombre de Content-Disposition', () => {
    let nombre = '';
    let tamano = 0;
    servicio.descargar(DOCUMENTO_PDF).subscribe((d) => {
      nombre = d.nombre;
      tamano = d.blob.size;
    });
    const req = http.expectOne(`${API}/documentos/41/descarga`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF-1.7']), {
      headers: new HttpHeaders({
        'Content-Disposition': `attachment; filename="informe.pdf"; filename*=UTF-8''informe%20versi%C3%B3n%202.pdf`,
      }),
    });
    expect(nombre).toBe('informe versión 2.pdf');
    expect(tamano).toBe(8);
  });

  it('sin Content-Disposition usa el nombre original del documento', () => {
    let nombre = '';
    servicio.descargar(DOCUMENTO_PDF).subscribe((d) => (nombre = d.nombre));
    http.expectOne(`${API}/documentos/41/descarga`).flush(new Blob(['x']));
    expect(nombre).toBe('informe-final.pdf');
  });

  it('agrega un enlace y quita un documento', () => {
    const enlace = {
      titulo: 'Repo',
      url: 'https://github.com/u/p',
      categoria: 'CODIGO' as const,
      idFase: 2,
    };
    servicio.agregarEnlace(7, enlace).subscribe();
    const post = http.expectOne(`${API}/trabajos/7/enlaces`);
    expect(post.request.body).toEqual(enlace);
    post.flush(respuesta(DOCUMENTO_PDF), { status: 201, statusText: 'Created' });

    servicio.eliminarDocumento(41).subscribe();
    const del = http.expectOne(`${API}/documentos/41`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta(null));
  });

  it('busca en el repositorio sin mandar filtros vacíos y normaliza texto y hashtag', () => {
    let total = 0;
    servicio
      .buscarEnRepositorio({
        q: '  inventarios ',
        hashtag: ' #SpringBoot',
        idFacultad: 1,
        idCarrera: undefined,
        idMateria: undefined,
        pagina: 0,
        tamano: 10,
      })
      .subscribe((p) => (total = p.totalElementos));
    const req = http.expectOne((r) => r.url === `${API}/repositorio`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().sort()).toEqual([
      'hashtag',
      'idFacultad',
      'pagina',
      'q',
      'tamano',
    ]);
    expect(req.request.params.get('q')).toBe('inventarios');
    expect(req.request.params.get('hashtag')).toBe('SpringBoot');
    expect(req.request.params.get('idFacultad')).toBe('1');
    req.flush(respuesta(pagina([resultadoRepositorioDePrueba()])));
    expect(total).toBe(1);

    // Texto en blanco = sin filtro (no `?q=`).
    servicio.buscarEnRepositorio({ q: '   ', hashtag: '#' }).subscribe();
    const vacio = http.expectOne((r) => r.url === `${API}/repositorio`);
    expect(vacio.request.params.keys()).toEqual([]);
    vacio.flush(respuesta(pagina([])));
  });

  it('obtiene la ficha pública de un trabajo evaluado', () => {
    let titulo = '';
    servicio.obtenerPublico(7).subscribe((t) => (titulo = t.titulo));
    const req = http.expectOne(`${API}/repositorio/7`);
    expect(req.request.method).toBe('GET');
    req.flush(respuesta(publicoDePrueba()));
    expect(titulo).toBe('Sistema de inventarios');
  });
});
