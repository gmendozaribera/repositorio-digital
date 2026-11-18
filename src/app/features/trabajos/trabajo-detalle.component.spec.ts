import { HttpEventType, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { Trabajo } from '../../api/work';
import type { Rol } from '../../api/auth';
import { provideApi } from '../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../core/auth/testing';
import {
  ACCIONES_ADMIN_CURSO_APROBADO,
  ACCIONES_DOCENTE_PENDIENTE,
  archivoDePrueba,
  DOCUMENTO_PDF,
  ENLACE_GITHUB,
  FASES,
  REGLAS,
  SIN_ACCIONES,
  trabajoDePrueba,
} from '../../core/services/testing-trabajos';
import { TrabajoDetalleComponent } from './trabajo-detalle.component';

const API = '/api/v1';

describe('TrabajoDetalleComponent', () => {
  let fixture: ComponentFixture<TrabajoDetalleComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function botones(raiz: ParentNode = vista): string[] {
    return Array.from(raiz.querySelectorAll('button, a.btn')).map((b) =>
      b.textContent!.replace(/\s+/g, ' ').trim(),
    );
  }

  function boton(texto: string, raiz: ParentNode = vista): HTMLButtonElement {
    const b = Array.from(raiz.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  function flushTrabajo(t: Trabajo): void {
    http.expectOne(`${API}/trabajos/7`).flush(respuesta(t));
  }

  /** Abre el detalle con la sesion del rol y responde trabajo, fases y (si puede editar) reglas. */
  async function abrir(t: Trabajo, rol: Rol = 'ESTUDIANTE'): Promise<void> {
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba(rol)));
    fixture = TestBed.createComponent(TrabajoDetalleComponent);
    vista = fixture.nativeElement;
    fixture.componentRef.setInput('id', '7');
    await render();
    flushTrabajo(t);
    const fases = http.expectOne((r) => r.url === `${API}/fases`);
    expect(fases.request.params.get('idFacultad')).toBe('1');
    expect(fases.request.params.get('incluirInactivos')).toBe('true');
    fases.flush(respuesta(FASES));
    if (t.acciones.editar) {
      http
        .expectOne(
          (r) => r.url === `${API}/documentos/reglas` && r.params.get('idFacultad') === '1',
        )
        .flush(respuesta(REGLAS));
    }
    await render();
  }

  async function elegirArchivos(fase: string, archivos: File[]): Promise<HTMLElement> {
    boton(`Subir archivos a ${fase}`).click();
    await render();
    const panel = vista.querySelector<HTMLElement>('app-subida-archivos')!;
    const input = panel.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: archivos, configurable: true });
    input.dispatchEvent(new Event('change'));
    await render();
    return panel;
  }

  beforeEach(() => {
    sessionStorage.clear();
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('autor en BORRADOR: editar, enviar (requiere PDF) y eliminar; sin botones de docente', async () => {
    await abrir(trabajoDePrueba());
    const texto = botones();
    expect(texto).toContain('Editar datos');
    expect(texto).toContain('Eliminar borrador');
    expect(texto).not.toContain('Tomar en revisión');
    expect(texto.some((b) => b.startsWith('Aprobar'))).toBe(false);
    expect(boton('Enviar a revisión').disabled).toBe(true);
    expect(vista.querySelector('#ayuda-enviar')?.textContent).toContain(
      'se requiere al menos un documento PDF',
    );
    // Fases activas de la facultad; la inactiva sin documentos no aparece.
    expect(Array.from(vista.querySelectorAll('.fase h3')).map((h) => h.textContent)).toEqual([
      'Perfil',
      'Final',
    ]);
    expect(vista.querySelector('.linea-tiempo')?.textContent).toContain('Creación');
  });

  it('con un PDF puede enviar a revisión y luego recarga el detalle', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await abrir(trabajoDePrueba({ documentos: [DOCUMENTO_PDF] }));
    const enviar = boton('Enviar a revisión');
    expect(enviar.disabled).toBe(false);
    enviar.click();
    const patch = http.expectOne(`${API}/trabajos/7/enviar`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush(respuesta(trabajoDePrueba({ estado: 'PENDIENTE' })));
    flushTrabajo(
      trabajoDePrueba({ estado: 'PENDIENTE', documentos: [DOCUMENTO_PDF], acciones: SIN_ACCIONES }),
    );
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('enviado a revisión');
    expect(vista.querySelector('.estado-trabajo')?.textContent).toBe('Pendiente');
    expect(vista.querySelector('.barra-acciones')).toBeNull();
  });

  it('docente: tomar en revisión, aprobar con observaciones y rechazar con motivo', async () => {
    await abrir(
      trabajoDePrueba({ estado: 'PENDIENTE', acciones: ACCIONES_DOCENTE_PENDIENTE }),
      'DOCENTE',
    );
    const texto = botones();
    expect(texto).not.toContain('Editar datos');
    expect(texto.some((b) => b.startsWith('Subir archivos'))).toBe(false);
    expect(vista.querySelector('.volver a')?.getAttribute('href')).toBe('/docente/revision');

    boton('Tomar en revisión').click();
    http.expectOne(`${API}/trabajos/7/revisar`).flush(respuesta(trabajoDePrueba()));
    flushTrabajo(trabajoDePrueba({ estado: 'EN_REVISION', acciones: ACCIONES_DOCENTE_PENDIENTE }));
    await render();

    boton('Aprobar…').click();
    await render();
    expect(vista.querySelector('#ayuda-aprobar')?.textContent).toContain('deberá corregir');
    const obs = vista.querySelector<HTMLTextAreaElement>(
      'textarea[formcontrolname=observaciones]',
    )!;
    obs.value = 'Corregir la bibliografía';
    obs.dispatchEvent(new Event('input'));
    await render();
    const aprobar = boton('Aprobar con observaciones');
    aprobar.click();
    const patch = http.expectOne(`${API}/trabajos/7/aprobar`);
    expect(patch.request.body).toEqual({ observaciones: 'Corregir la bibliografía' });
    patch.flush(respuesta(trabajoDePrueba()));
    flushTrabajo(
      trabajoDePrueba({
        estado: 'APROBADO_CON_OBSERVACIONES',
        observaciones: 'Corregir la bibliografía',
        acciones: SIN_ACCIONES,
      }),
    );
    await render();
    const nota = vista.querySelector('.observaciones');
    expect(nota?.textContent).toContain('Observaciones del docente');
    expect(nota?.textContent).toContain('Corregir la bibliografía');
  });

  it('rechazar exige un motivo de al menos 10 caracteres', async () => {
    await abrir(
      trabajoDePrueba({ estado: 'EN_REVISION', acciones: ACCIONES_DOCENTE_PENDIENTE }),
      'DOCENTE',
    );
    boton('Rechazar…').click();
    await render();
    const motivo = vista.querySelector<HTMLTextAreaElement>('textarea[formcontrolname=motivo]')!;
    motivo.value = 'Corto';
    motivo.dispatchEvent(new Event('input'));
    boton('Rechazar', vista.querySelector('[role=dialog]')!).click();
    await render();
    http.expectNone(`${API}/trabajos/7/rechazar`);
    expect(vista.querySelector('[role=dialog] .field-error')?.textContent).toContain('mínimo 10');

    motivo.value = 'No corresponde al tema asignado.';
    motivo.dispatchEvent(new Event('input'));
    boton('Rechazar', vista.querySelector('[role=dialog]')!).click();
    const patch = http.expectOne(`${API}/trabajos/7/rechazar`);
    expect(patch.request.body).toEqual({ motivo: 'No corresponde al tema asignado.' });
    patch.flush(respuesta(trabajoDePrueba()));
    flushTrabajo(
      trabajoDePrueba({
        estado: 'RECHAZADO',
        observaciones: 'No corresponde al tema asignado.',
        acciones: SIN_ACCIONES,
      }),
    );
    await render();
    expect(vista.querySelector('.observaciones-rechazo')?.textContent).toContain(
      'Motivo del rechazo',
    );
  });

  // ------------------------------------------------------------------ Calificar (Sprint 4)

  function campoNota(): HTMLInputElement {
    return vista.querySelector<HTMLInputElement>('input[formcontrolname=calificacion]')!;
  }

  async function escribirNota(valor: string): Promise<void> {
    campoNota().value = valor;
    campoNota().dispatchEvent(new Event('input'));
    await render();
  }

  function enviarNota(): void {
    boton('Calificar y publicar', vista.querySelector('[role=dialog]')!).click();
  }

  it('el botón "Calificar y publicar" solo aparece si acciones.calificar', async () => {
    await abrir(
      trabajoDePrueba({ estado: 'APROBADO', acciones: ACCIONES_DOCENTE_PENDIENTE }),
      'DOCENTE',
    );
    expect(botones().some((b) => b.startsWith('Calificar'))).toBe(false);
    fixture.destroy();

    await abrir(
      trabajoDePrueba({ estado: 'APROBADO', acciones: ACCIONES_ADMIN_CURSO_APROBADO }),
      'DOCENTE',
    );
    expect(botones()).toContain('Calificar y publicar…');
    // Sin calificacion todavia: no se muestra el dato.
    expect(vista.querySelector('.ficha')?.textContent).not.toContain('Calificación');
  });

  it('calificar valida el rango 0..escalaCalifMax y enteros antes de enviar', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await abrir(
      trabajoDePrueba({
        estado: 'APROBADO',
        escalaCalifMax: 70,
        acciones: ACCIONES_ADMIN_CURSO_APROBADO,
      }),
      'DOCENTE',
    );
    boton('Calificar y publicar…').click();
    await render();
    const dialogo = vista.querySelector('[role=dialog]')!;
    expect(dialogo.textContent).toContain('pasará a Evaluado');
    expect(dialogo.textContent).toContain('visible en el repositorio');
    expect(dialogo.textContent).toContain('de 0 a 70');
    expect(campoNota().getAttribute('max')).toBe('70');

    // Vacio, fuera de rango (por arriba y por abajo) y con decimales: no se envia.
    for (const valor of ['', '71', '-1', '50.5']) {
      await escribirNota(valor);
      enviarNota();
      await render();
      http.expectNone(`${API}/trabajos/7/calificar`);
      expect(vista.querySelector('[role=dialog] .field-error')?.textContent).toContain(
        'entre 0 y 70',
      );
    }
    expect(confirmar).not.toHaveBeenCalled();

    // El extremo superior es valido.
    await escribirNota('70');
    enviarNota();
    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('70 / 70'));
    http.expectOne(`${API}/trabajos/7/calificar`).flush(respuesta(trabajoDePrueba()));
    flushTrabajo(
      trabajoDePrueba({
        estado: 'EVALUADO',
        calificacion: 70,
        escalaCalifMax: 70,
        acciones: SIN_ACCIONES,
      }),
    );
    await render();
  });

  it('calificar pide confirmación, envía la nota, recarga y muestra la calificación', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await abrir(
      trabajoDePrueba({ estado: 'APROBADO', acciones: ACCIONES_ADMIN_CURSO_APROBADO }),
      'DOCENTE',
    );
    boton('Calificar y publicar…').click();
    await render();
    await escribirNota('85');

    // Si cancela la confirmacion no se envia nada.
    enviarNota();
    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('85 / 100'));
    http.expectNone(`${API}/trabajos/7/calificar`);

    confirmar.mockReturnValue(true);
    enviarNota();
    const patch = http.expectOne(`${API}/trabajos/7/calificar`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ calificacion: 85 });
    patch.flush(respuesta(trabajoDePrueba({ estado: 'EVALUADO', calificacion: 85 })));
    flushTrabajo(trabajoDePrueba({ estado: 'EVALUADO', calificacion: 85, acciones: SIN_ACCIONES }));
    await render();

    expect(vista.querySelector('.alert-success')?.textContent).toContain('calificado y publicado');
    expect(vista.querySelector('[role=dialog]')).toBeNull();
    expect(vista.querySelector('.estado-trabajo')?.textContent).toBe('Evaluado');
    expect(vista.querySelector('.calificacion')?.textContent?.trim()).toBe('85 / 100');
  });

  it('un 400 del servidor al calificar se muestra en el campo', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await abrir(
      trabajoDePrueba({ estado: 'APROBADO', acciones: ACCIONES_ADMIN_CURSO_APROBADO }),
      'DOCENTE',
    );
    boton('Calificar y publicar…').click();
    await render();
    await escribirNota('90');
    enviarNota();
    http.expectOne(`${API}/trabajos/7/calificar`).flush(
      {
        status: 400,
        title: 'Datos inválidos',
        detail: 'Datos inválidos',
        errores: { calificacion: 'La calificación debe estar entre 0 y 80.' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await render();
    expect(vista.querySelector('[role=dialog] .field-error')?.textContent).toContain(
      'entre 0 y 80',
    );
  });

  it('agrupa documentos por fase, descarga con el nombre del servidor y abre enlaces aparte', async () => {
    const crearUrl = vi.fn(() => 'blob:prueba');
    Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: vi.fn() });
    let descargado = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      descargado = this.download;
    });

    await abrir(
      trabajoDePrueba({
        estado: 'APROBADO',
        documentos: [
          DOCUMENTO_PDF,
          ENLACE_GITHUB,
          { ...DOCUMENTO_PDF, idDocumento: 43, idFase: 3, nombreFase: 'Antigua' },
        ],
        acciones: SIN_ACCIONES,
      }),
      'ADMIN',
    );
    // La fase inactiva aparece porque tiene documentos.
    const fases = Array.from(vista.querySelectorAll('.fase'));
    expect(fases.map((f) => f.querySelector('h3')!.textContent)).toEqual([
      'Perfil',
      'Final',
      'Antigua',
    ]);
    expect(fases[0].textContent).toContain('Sin documentos en esta fase.');
    expect(fases[1].querySelectorAll('.lista-documentos li').length).toBe(2);

    const enlace = fases[1].querySelector<HTMLAnchorElement>('a[target=_blank]')!;
    expect(enlace.href).toBe('https://github.com/usuario/proyecto');
    expect(enlace.rel).toBe('noopener noreferrer');

    boton('Descargar', fases[1]).click();
    await render();
    const req = http.expectOne(`${API}/documentos/41/descarga`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF']), {
      headers: new HttpHeaders({
        'Content-Disposition': 'attachment; filename="Informe final v2.pdf"',
      }),
    });
    await render();
    expect(crearUrl).toHaveBeenCalled();
    expect(descargado).toBe('Informe final v2.pdf');
  });

  it('valida los archivos con las reglas antes de subir y sube uno por uno con progreso', async () => {
    await abrir(trabajoDePrueba());
    const panel = await elegirArchivos('Perfil', [
      archivoDePrueba('informe.pdf', 2),
      archivoDePrueba('programa.exe', 1),
      archivoDePrueba('enorme.docx', 15),
    ]);
    const items = Array.from(panel.querySelectorAll('.item-subida'));
    expect(items).toHaveLength(3);
    expect(items[0].querySelector('.field-error')).toBeNull();
    expect(items[0].querySelector<HTMLInputElement>('input:not([type=file])')!.value).toBe(
      'informe',
    );
    expect(items[1].querySelector('.field-error')?.textContent).toContain('Elige la categoría');
    expect(items[2].querySelector('.field-error')?.textContent).toContain('tamaño máximo de 10 MB');

    boton('Subir 3 archivos', panel).click();
    await render();
    http.expectNone(`${API}/trabajos/7/documentos`);
    expect(panel.querySelector('.alert-danger')?.textContent).toContain('Corrige los archivos');

    // Se quitan los invalidos y se sube el PDF.
    boton('Quitar programa.exe', panel).click();
    boton('Quitar enorme.docx', panel).click();
    await render();
    boton('Subir 1 archivo', panel).click();
    await render();
    const post = http.expectOne(`${API}/trabajos/7/documentos`);
    expect((post.request.body as FormData).get('idFase')).toBe('1');
    expect((post.request.body as FormData).get('categoria')).toBe('DOCUMENTO');
    post.event({ type: HttpEventType.UploadProgress, loaded: 40, total: 100 });
    await render();
    expect(panel.querySelector('progress')?.getAttribute('value')).toBe('40');
    expect(panel.textContent).toContain('40 %');

    post.flush(respuesta(DOCUMENTO_PDF), { status: 201, statusText: 'Created' });
    flushTrabajo(trabajoDePrueba({ documentos: [{ ...DOCUMENTO_PDF, idFase: 1 }] }));
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('Se subió 1 archivo.');
    expect(vista.querySelector('app-subida-archivos')).toBeNull();
    expect(boton('Enviar a revisión').disabled).toBe(false);
  });

  it('ante un 429 pausa la cola durante Retry-After y continúa sola', async () => {
    await abrir(trabajoDePrueba());
    const panel = await elegirArchivos('Final', [archivoDePrueba('informe.pdf', 1)]);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    boton('Subir 1 archivo', panel).click();
    http.expectOne(`${API}/trabajos/7/documentos`).flush(
      { status: 429, title: 'Demasiadas subidas', timestamp: '2026-11-17T14:00:00Z' },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: new HttpHeaders({ 'Retry-After': '30' }),
      },
    );
    await render();
    expect(panel.querySelector('.alert-warn')?.textContent).toContain('10 subidas por minuto');
    expect(panel.querySelector('.alert-warn')?.textContent).toContain('0:30');
    http.expectNone(`${API}/trabajos/7/documentos`);

    vi.advanceTimersByTime(30_000);
    await render();
    const reintento = http.expectOne(`${API}/trabajos/7/documentos`);
    reintento.flush(respuesta(DOCUMENTO_PDF), { status: 201, statusText: 'Created' });
    flushTrabajo(trabajoDePrueba({ documentos: [DOCUMENTO_PDF] }));
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('Se subió 1 archivo.');
  });

  it('agrega un enlace validando https y hosts permitidos', async () => {
    await abrir(trabajoDePrueba());
    boton('Agregar enlace a Final').click();
    await render();
    const url = vista.querySelector<HTMLInputElement>('input[formcontrolname=url]')!;
    const titulo = vista.querySelector<HTMLInputElement>('input[formcontrolname=titulo]')!;
    titulo.value = 'Repositorio';
    titulo.dispatchEvent(new Event('input'));
    url.value = 'https://bitbucket.org/u/p';
    url.dispatchEvent(new Event('input'));
    boton('Agregar enlace', vista.querySelector('form')!).click();
    await render();
    http.expectNone(`${API}/trabajos/7/enlaces`);
    expect(vista.textContent).toContain('Solo se aceptan enlaces de github.com, gitlab.com.');

    url.value = 'https://github.com/u/p';
    url.dispatchEvent(new Event('input'));
    boton('Agregar enlace', vista.querySelector('form')!).click();
    const post = http.expectOne(`${API}/trabajos/7/enlaces`);
    expect(post.request.body).toEqual({
      titulo: 'Repositorio',
      url: 'https://github.com/u/p',
      categoria: 'CODIGO',
      idFase: 2,
    });
    post.flush(respuesta(ENLACE_GITHUB), { status: 201, statusText: 'Created' });
    flushTrabajo(trabajoDePrueba({ documentos: [ENLACE_GITHUB] }));
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('Enlace agregado.');
  });

  it('eliminar el borrador pide confirmación y vuelve a Mis trabajos', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');
    await abrir(trabajoDePrueba());
    boton('Eliminar borrador').click();
    http.expectNone(`${API}/trabajos/7`);

    confirmar.mockReturnValue(true);
    boton('Eliminar borrador').click();
    const del = http.expectOne(`${API}/trabajos/7`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta(null));
    expect(navegar).toHaveBeenCalledWith(['/estudiante/trabajos']);
  });

  it('un 404 se muestra sin revelar si el trabajo existe', async () => {
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba('DOCENTE')));
    fixture = TestBed.createComponent(TrabajoDetalleComponent);
    vista = fixture.nativeElement;
    fixture.componentRef.setInput('id', '7');
    await render();
    http
      .expectOne(`${API}/trabajos/7`)
      .flush({ status: 404, title: 'No encontrado' }, { status: 404, statusText: 'Not Found' });
    await render();
    expect(vista.querySelector('.alert-danger')?.textContent).toContain(
      'no existe o no tienes permiso',
    );
  });
});
