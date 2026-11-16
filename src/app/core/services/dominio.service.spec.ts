import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApi } from '../api/api.providers';
import { respuesta } from '../auth/testing';
import { DominioService } from './dominio.service';
import { DOMINIO_LOGIN_INTENTOS } from './testing';

const API = '/api/v1/dominios';

describe('DominioService', () => {
  let servicio: DominioService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi()],
    });
    servicio = TestBed.inject(DominioService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista todos o solo un grupo (sin mandar un grupo vacío)', () => {
    let nombres: string[] = [];
    servicio.listar().subscribe((l) => (nombres = l.map((d) => d.domainName)));
    const todos = http.expectOne((r) => r.url === API);
    expect(todos.request.method).toBe('GET');
    expect(todos.request.params.has('domainGroup')).toBe(false);
    todos.flush(respuesta([DOMINIO_LOGIN_INTENTOS]));
    expect(nombres).toEqual(['LOGIN_INTENTOS']);

    servicio.listar('  ').subscribe();
    expect(http.expectOne((r) => r.url === API).request.params.has('domainGroup')).toBe(false);

    servicio.listar('AUTH_GROUP').subscribe();
    const grupo = http.expectOne((r) => r.url === API);
    expect(grupo.request.params.get('domainGroup')).toBe('AUTH_GROUP');
    grupo.flush(respuesta([]));
  });

  it('crea con POST y actualiza solo valor y descripción con PUT', () => {
    const alta = {
      domainGroup: 'REPO_GROUP',
      domainName: 'MAX_MB',
      domainValue: '20',
      description: 'Tamaño máximo de archivo',
    };
    servicio.crear(alta).subscribe();
    const post = http.expectOne(API);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(alta);
    post.flush(respuesta({ ...DOMINIO_LOGIN_INTENTOS, ...alta, domainId: 9 }), {
      status: 201,
      statusText: 'Created',
    });

    let valor = '';
    servicio
      .actualizar(1, { domainValue: '5', description: 'Intentos' })
      .subscribe((d) => (valor = d.domainValue));
    const put = http.expectOne(`${API}/1`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ domainValue: '5', description: 'Intentos' });
    put.flush(respuesta({ ...DOMINIO_LOGIN_INTENTOS, domainValue: '5' }));
    expect(valor).toBe('5');
  });

  it('elimina con DELETE y propaga el 409 de los parámetros del sistema', () => {
    let eliminado = false;
    servicio.eliminar(9).subscribe(() => (eliminado = true));
    const del = http.expectOne(`${API}/9`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta(null));
    expect(eliminado).toBe(true);

    let status = 0;
    servicio.eliminar(1).subscribe({ error: (e: { status: number }) => (status = e.status) });
    http
      .expectOne(`${API}/1`)
      .flush(
        { status: 409, title: 'Conflicto', detail: 'Lo usa el sistema', timestamp: '' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(status).toBe(409);
  });

  it('prueba SMTP: POST /config/smtp/prueba y propaga el 502 con su detail', () => {
    let enviado = false;
    servicio.probarSmtp('admin@uagrm.edu.bo').subscribe(() => (enviado = true));
    const post = http.expectOne('/api/v1/config/smtp/prueba');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ destinatario: 'admin@uagrm.edu.bo' });
    post.flush(respuesta(null));
    expect(enviado).toBe(true);

    let detalle = '';
    servicio
      .probarSmtp('admin@uagrm.edu.bo')
      .subscribe({ error: (e: { error: { detail: string } }) => (detalle = e.error.detail) });
    http.expectOne('/api/v1/config/smtp/prueba').flush(
      {
        status: 502,
        title: 'Error del servidor de correo',
        detail: 'Conexión rechazada',
        timestamp: '',
      },
      { status: 502, statusText: 'Bad Gateway' },
    );
    expect(detalle).toBe('Conexión rechazada');
  });
});
