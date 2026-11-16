import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Dominio } from '../../../api/user';
import { provideApi } from '../../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../../core/auth/testing';
import { dominiosSmtp } from '../../../core/services/testing';
import { ConfigSmtpComponent } from './config-smtp.component';

const API = '/api/v1/dominios';
const PRUEBA = '/api/v1/config/smtp/prueba';

describe('ConfigSmtpComponent', () => {
  let fixture: ComponentFixture<ConfigSmtpComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;
  let guardados: Dominio[];

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function campo<T extends HTMLElement = HTMLInputElement>(nombre: string): T {
    return vista.querySelector<T>(`[formcontrolname=${nombre}]`)!;
  }

  function escribir(nombre: string, valor: string): void {
    const input = campo(nombre);
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  }

  function boton(texto: string): HTMLButtonElement {
    const b = Array.from(vista.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  /** Responde el PUT de un parametro devolviendo el parametro con el valor nuevo. */
  function responderPut(id: number): Record<string, unknown> {
    const put = http.expectOne(`${API}/${id}`);
    expect(put.request.method).toBe('PUT');
    const original = guardados.find((d) => d.domainId === id)!;
    const body = put.request.body as { domainValue: string; description: string };
    put.flush(
      respuesta({
        ...original,
        domainValue: original.secreto ? '' : body.domainValue,
        configurado: original.secreto ? body.domainValue !== '' : true,
      }),
    );
    return body;
  }

  async function montar(lista: Dominio[]): Promise<void> {
    guardados = lista;
    fixture = TestBed.createComponent(ConfigSmtpComponent);
    vista = fixture.nativeElement;
    await render();
    const req = http.expectOne((r) => r.url === API);
    expect(req.request.params.get('domainGroup')).toBe('SMTP_GROUP');
    req.flush(respuesta(lista));
    await render();
  }

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      'repositorio.sesion',
      JSON.stringify(tokensDePrueba('ADMIN', { correo: 'admin@uagrm.edu.bo' })),
    );
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

  afterEach(() => http.verify());

  it('carga SMTP_GROUP en el formulario; la contraseña nunca se muestra', async () => {
    await montar(dominiosSmtp());
    expect(campo('host').value).toBe('smtp.gmail.com');
    expect(campo('puerto').value).toBe('587');
    expect(campo('correo').value).toBe('repositorio@uagrm.edu.bo');
    expect(campo<HTMLSelectElement>('seguridad').value).toBe('STARTTLS');
    expect(campo('activo').checked).toBe(false);
    expect(campo('password').type).toBe('password');
    expect(campo('password').value).toBe('');
    expect(campo('password').placeholder).toBe('•••••• (configurada, dejar vacío para no cambiar)');
    expect(campo('borrarPassword')).not.toBeNull();
    expect(campo('destinatario').value).toBe('admin@uagrm.edu.bo');
  });

  it('guarda solo los parámetros modificados, conserva la descripción y no envía la contraseña vacía', async () => {
    await montar(dominiosSmtp());
    escribir('host', ' smtp.uagrm.edu.bo ');
    escribir('puerto', '465');
    await render();
    // 465 con STARTTLS: sugiere SSL (sin bloquear)
    expect(campo('seguridad').closest('label')!.textContent).toContain('normalmente se usa SSL');
    const seguridad = campo<HTMLSelectElement>('seguridad');
    seguridad.value = 'SSL';
    seguridad.dispatchEvent(new Event('change'));
    await render();
    expect(vista.querySelector('.alert-warn')?.textContent).toContain('cambios sin guardar');

    boton('Guardar').click();
    // Orden de los campos: host, puerto, correo, seguridad, activo (la contraseña no se toca).
    expect(responderPut(22)).toEqual({
      domainValue: 'smtp.uagrm.edu.bo',
      description: 'Servidor SMTP.',
    });
    expect(responderPut(24)).toEqual({
      domainValue: '465',
      description: 'Puerto del servidor SMTP.',
    });
    expect(responderPut(25)).toEqual({
      domainValue: 'SSL',
      description: 'SSL, STARTTLS o NINGUNA.',
    });
    http.expectNone(`${API}/23`);
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('guardada');
    expect(vista.querySelector('.alert-warn')).toBeNull();

    // Sin cambios no se envía nada
    boton('Guardar').click();
    await render();
    http.expectNone((r) => r.method === 'PUT');
    expect(vista.querySelector('.alert-success')?.textContent).toContain('No hay cambios');
  });

  it('envía la contraseña solo si se escribe una, o vacía si se elige «Borrar contraseña»', async () => {
    await montar(dominiosSmtp());
    escribir('password', 'app pass 123');
    campo('activo').click();
    boton('Guardar').click();
    expect(responderPut(20)).toEqual({
      domainValue: 'true',
      description: 'Si el sistema envia correos.',
    });
    // La contraseña se envía tal cual (sin recortar).
    expect(responderPut(23)).toEqual({
      domainValue: 'app pass 123',
      description: 'Contraseña de la cuenta de correo.',
    });
    await render();
    expect(campo('password').value).toBe('');

    campo('borrarPassword').click();
    await render();
    expect(campo('password').disabled).toBe(true);
    boton('Guardar').click();
    expect(responderPut(23)).toEqual({
      domainValue: '',
      description: 'Contraseña de la cuenta de correo.',
    });
    await render();
    expect(campo('password').placeholder).toBe('Sin configurar');
    expect(campo('borrarPassword')).toBeNull();
  });

  it('con el envío activado exige servidor, puerto y remitente válidos', async () => {
    await montar(dominiosSmtp({ HOST: { domainValue: '' }, PUERTO: { domainValue: '' } }));
    campo('activo').click();
    escribir('correo', 'no-es-correo');
    boton('Guardar').click();
    await render();
    http.expectNone((r) => r.method === 'PUT');
    expect(campo('host').closest('label')!.textContent).toContain('Ingrese el servidor');
    expect(campo('puerto').closest('label')!.textContent).toContain('entre 1 y 65535');
    expect(campo('correo').closest('label')!.textContent).toContain('correo válido');
  });

  it('el 400 de un parámetro se muestra en su campo', async () => {
    await montar(dominiosSmtp());
    escribir('puerto', '2525');
    boton('Guardar').click();
    http.expectOne(`${API}/24`).flush(
      {
        status: 400,
        title: 'Datos inválidos',
        detail: 'Revise los datos.',
        timestamp: new Date().toISOString(),
        errores: { domainValue: 'puerto no permitido' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await render();
    expect(vista.querySelector('.alert-danger')?.textContent).toContain(
      'No se pudo guardar PUERTO',
    );
    expect(campo('puerto').closest('label')!.textContent).toContain('puerto no permitido');
  });

  it('correo de prueba: 200 muestra éxito', async () => {
    await montar(dominiosSmtp());
    escribir('destinatario', 'otro@uagrm.edu.bo');
    boton('Enviar correo de prueba').click();
    await render();
    expect(boton('Enviando').disabled).toBe(true);
    const req = http.expectOne(PRUEBA);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ destinatario: 'otro@uagrm.edu.bo' });
    req.flush({ data: null, message: 'ok', status: 200, timestamp: new Date().toISOString() });
    await render();
    expect(vista.querySelector('.panel .alert-success')?.textContent).toContain(
      'enviado a otro@uagrm.edu.bo',
    );
  });

  it('correo de prueba: el 502 muestra el detail del servidor de correo', async () => {
    await montar(dominiosSmtp());
    expect(vista.querySelector('.panel')?.textContent).toContain('guarde los cambios antes');
    boton('Enviar correo de prueba').click();
    http.expectOne(PRUEBA).flush(
      {
        status: 502,
        title: 'Error del servidor de correo',
        detail: 'No se pudo autenticar en smtp.gmail.com:587: credenciales rechazadas.',
        timestamp: new Date().toISOString(),
      },
      { status: 502, statusText: 'Bad Gateway' },
    );
    await render();
    expect(vista.querySelector('.panel .alert-danger')?.textContent).toContain(
      'credenciales rechazadas',
    );
  });

  it('avisa si falta algún parámetro del grupo y deshabilita su campo', async () => {
    await montar(dominiosSmtp().filter((d) => d.domainName !== 'SEGURIDAD'));
    expect(vista.querySelector('.alert-warn')?.textContent).toContain('SEGURIDAD');
    expect(campo<HTMLSelectElement>('seguridad').disabled).toBe(true);
  });
});
