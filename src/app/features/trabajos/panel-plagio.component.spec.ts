import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Analisis } from '../../api/plagio';
import { provideApi } from '../../core/api/api.providers';
import { PaginaVacia, respuesta } from '../../core/auth/testing';
import {
  analisisDePrueba,
  analisisEnProceso,
  estadoDePrueba,
  problema,
} from '../../core/services/testing-plagio';
import { PanelPlagioComponent, porcentajePlagio } from './panel-plagio.component';

const BASE = '/api/v1/plagio/trabajos/7';

describe('PanelPlagioComponent', () => {
  let fixture: ComponentFixture<PanelPlagioComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  /** Sin whenStable: algunas pruebas usan timers falsos y el repintado se fuerza a mano. */
  function render(): void {
    fixture.detectChanges();
  }

  function boton(texto: string): HTMLButtonElement {
    const b = Array.from(vista.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  function texto(selector: string): string {
    return vista.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  /** Abre el panel y responde el ultimo analisis (o un error). */
  function abrir(ultimo: Analisis | { status: number; detail: string }): void {
    fixture = TestBed.createComponent(PanelPlagioComponent);
    vista = fixture.nativeElement;
    fixture.componentRef.setInput('idTrabajo', 7);
    render();
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    if ('idAnalisis' in ultimo) {
      req.flush(respuesta(ultimo));
    } else {
      req.flush(problema(ultimo.status, ultimo.detail), {
        status: ultimo.status,
        statusText: 'Error',
      });
    }
    render();
  }

  beforeEach(() => {
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
    fixture?.destroy();
    http.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('formatea el porcentaje con un decimal', () => {
    expect(porcentajePlagio(34.25)).toMatch(/^34[,.]3 %$/);
    expect(porcentajePlagio(8)).toMatch(/^8[,.]0 %$/);
    expect(porcentajePlagio(null)).toBe('—');
  });

  it('sin análisis (404): explica y permite iniciar uno, que queda en proceso', () => {
    abrir({ status: 404, detail: 'No existe' });
    expect(texto('.plagio')).toContain('aún no tiene análisis de plagio');
    expect(vista.querySelector('.alert-danger')).toBeNull();

    boton('Analizar plagio').click();
    render();
    expect(boton('Iniciando').disabled).toBe(true);
    const post = http.expectOne(BASE);
    expect(post.request.method).toBe('POST');
    post.flush(respuesta(analisisEnProceso()), { status: 202, statusText: 'Accepted' });
    render();

    expect(vista.querySelector('[role=progressbar]')).not.toBeNull();
    expect(texto('[role=status]')).toContain('puede tardar varios minutos');
    expect(texto('[role=status]')).toContain('te avisaremos con una notificación');
    expect(boton('Volver a analizar').disabled).toBe(true);
  });

  it('en proceso: consulta cada 5 s y al completar muestra el semáforo sin recargar', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    abrir(analisisEnProceso());
    expect(vista.querySelector('.progreso-indeterminado')).not.toBeNull();

    vi.advanceTimersByTime(5_000);
    http.expectOne(`${BASE}/estado`).flush(respuesta(estadoDePrueba('EN_PROCESO')));
    vi.advanceTimersByTime(5_000);
    http.expectOne(`${BASE}/estado`).flush(respuesta(estadoDePrueba('COMPLETADO')));
    http.expectOne(BASE).flush(respuesta(analisisDePrueba({ idAnalisis: 4 })));
    render();

    expect(vista.querySelector('.progreso-indeterminado')).toBeNull();
    expect(vista.querySelector('.semaforo-plagio')).not.toBeNull();
    expect(boton('Volver a analizar').disabled).toBe(false);
    vi.advanceTimersByTime(60_000);
    http.expectNone(`${BASE}/estado`);
  });

  it('completado: semáforo con texto, umbrales, datos del análisis y fuentes con enlaces seguros', () => {
    abrir(analisisDePrueba());
    const semaforo = vista.querySelector('.semaforo-plagio')!;
    expect(semaforo.classList).toContain('nivel-amarillo');
    expect(semaforo.querySelector('.luz-amarillo')!.classList).toContain('encendida');
    expect(semaforo.querySelector('.luz-rojo')!.classList).not.toContain('encendida');
    expect(texto('.plagio-nivel')).toBe('Similitud media');
    expect(texto('.plagio-porcentaje')).toMatch(/^34[,.]3 %$/);
    expect(texto('.semaforo-plagio')).toContain('Medio desde 30 %, alto desde 50 %');

    const datos = texto('.plagio-datos');
    expect(datos).toContain('Copyleaks');
    expect(datos).toContain('Repositorio e internet');
    expect(datos).toMatch(/Documentos analizados\s*2/);
    expect(datos).toContain('María López');
    expect(vista.querySelector('.plagio-datos .badge')).toBeNull();

    const filas = Array.from(vista.querySelectorAll('.tabla-fuentes tbody tr'));
    expect(filas).toHaveLength(3);
    // Interna: ficha del repositorio.
    const interna = filas[0].querySelector('a')!;
    expect(interna.getAttribute('href')).toBe('/repositorio/12');
    expect(filas[0].textContent).toContain('Repositorio');
    expect(filas[0].querySelector<HTMLElement>('.barra-fuente > span')!.style.width).toBe('21.5%');
    // Internet https: pestaña nueva sin acceso a window.opener.
    const externa = filas[1].querySelector('a')!;
    expect(externa.href).toBe('https://es.wikipedia.org/wiki/Inventario');
    expect(externa.target).toBe('_blank');
    expect(externa.rel).toBe('noopener noreferrer');
    // Una URL que no es https nunca se convierte en enlace.
    expect(filas[2].querySelector('a')).toBeNull();
    expect(filas[2].textContent).toContain('Sitio sin https');
  });

  it('niveles OK y ALTO, motor simulado y sin internet', () => {
    abrir(
      analisisDePrueba({
        nivel: 'ALTO',
        porcentajeSimilitud: 61,
        motor: 'SIMULADO',
        comparacionInternet: false,
        fuentes: [],
      }),
    );
    expect(vista.querySelector('.semaforo-plagio')!.classList).toContain('nivel-rojo');
    expect(texto('.plagio-nivel')).toBe('Similitud alta');
    expect(texto('.plagio-datos .badge')).toBe('Simulado');
    expect(texto('.plagio-datos')).toContain('resultado de prueba');
    expect(texto('.plagio-datos')).toContain('Solo el repositorio');
    expect(texto('.plagio')).toContain('No se encontraron coincidencias');
    fixture.destroy();

    abrir(analisisDePrueba({ nivel: 'OK', porcentajeSimilitud: 3 }));
    expect(vista.querySelector('.semaforo-plagio')!.classList).toContain('nivel-verde');
    expect(texto('.plagio-nivel')).toBe('Similitud baja');
  });

  it('error: muestra el motivo y "Reintentar" inicia otro análisis', () => {
    abrir(analisisEnProceso({ estado: 'ERROR', mensajeError: 'El documento no tiene texto.' }));
    expect(texto('.plagio-error')).toContain('El documento no tiene texto.');
    expect(vista.querySelector('.semaforo-plagio')).toBeNull();

    boton('Reintentar').click();
    http
      .expectOne((r) => r.method === 'POST' && r.url === BASE)
      .flush(respuesta(analisisEnProceso({ idAnalisis: 5 })), { status: 202, statusText: 'A' });
    render();
    expect(vista.querySelector('.plagio-error')).toBeNull();
    expect(vista.querySelector('[role=progressbar]')).not.toBeNull();
  });

  it('"Volver a analizar" pide confirmación; un 409 muestra el detalle y recarga el análisis en curso', () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    abrir(analisisDePrueba());
    boton('Volver a analizar').click();
    expect(confirmar).toHaveBeenCalled();
    http.expectNone(BASE);

    confirmar.mockReturnValue(true);
    boton('Volver a analizar').click();
    http
      .expectOne((r) => r.method === 'POST' && r.url === BASE)
      .flush(problema(409, 'Ya hay un analisis de plagio en curso para este trabajo.'), {
        status: 409,
        statusText: 'Conflict',
      });
    // Otro docente lo inicio: se muestra el que esta en curso.
    http
      .expectOne((r) => r.method === 'GET' && r.url === BASE)
      .flush(respuesta(analisisEnProceso()));
    render();
    expect(texto('.alert-danger')).toContain('Ya hay un analisis de plagio en curso');
    expect(vista.querySelector('[role=progressbar]')).not.toBeNull();
    expect(boton('Volver a analizar').disabled).toBe(true);
  });

  it('un 400 (sin archivos analizables) muestra el detalle', () => {
    abrir({ status: 404, detail: 'No existe' });
    boton('Analizar plagio').click();
    http
      .expectOne(BASE)
      .flush(problema(400, 'El trabajo no tiene archivos PDF, DOCX u ODT para analizar.'), {
        status: 400,
        statusText: 'Bad Request',
      });
    render();
    expect(texto('.alert-danger')).toContain('no tiene archivos PDF, DOCX u ODT');
    expect(boton('Analizar plagio').disabled).toBe(false);
  });

  it('"Ver análisis anteriores" despliega el historial sin el actual', () => {
    abrir(analisisDePrueba({ idAnalisis: 9 }));
    const alternar = boton('Ver análisis anteriores');
    expect(alternar.getAttribute('aria-expanded')).toBe('false');
    alternar.click();
    render();
    http
      .expectOne(`${BASE}/historial`)
      .flush(
        respuesta([
          analisisDePrueba({ idAnalisis: 9 }),
          analisisDePrueba({
            idAnalisis: 8,
            nivel: 'ALTO',
            porcentajeSimilitud: 55,
            motor: 'SIMULADO',
          }),
          analisisEnProceso({ idAnalisis: 7, estado: 'ERROR' }),
        ]),
      );
    render();
    expect(boton('Ocultar análisis anteriores').getAttribute('aria-expanded')).toBe('true');
    const filas = Array.from(vista.querySelectorAll('#historial-plagio tbody tr'));
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toMatch(/55[,.]0 %/);
    expect(filas[0].textContent).toContain('Similitud alta');
    expect(filas[0].textContent).toContain('Simulado');
    expect(filas[1].textContent).toContain('Error');

    boton('Ocultar análisis anteriores').click();
    render();
    expect(vista.querySelector('#historial-plagio')).toBeNull();
  });

  it('403 (p. ej. estudiante): no muestra nada', () => {
    abrir({ status: 403, detail: 'Prohibido' });
    expect(vista.querySelector('.plagio')).toBeNull();
  });

  it('si el servicio no responde, avisa y permite reintentar la consulta', () => {
    abrir({ status: 503, detail: 'Caído' });
    expect(texto('.alert-danger')).toContain('no está disponible');
    boton('Reintentar consulta').click();
    http.expectOne(BASE).flush(respuesta(analisisDePrueba()));
    render();
    expect(vista.querySelector('.alert-danger')).toBeNull();
    expect(vista.querySelector('.semaforo-plagio')).not.toBeNull();
  });
});
