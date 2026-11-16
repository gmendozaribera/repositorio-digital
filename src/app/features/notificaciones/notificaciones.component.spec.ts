import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Notificacion } from '../../api/user';
import { provideApi } from '../../core/api/api.providers';
import { PaginaVacia, respuesta } from '../../core/auth/testing';
import { NOTIFICACION, pagina } from '../../core/services/testing';
import { fechaRelativa } from '../../shared/fecha-relativa';
import { NotificacionesComponent } from './notificaciones.component';

const API = '/api/v1';
const LEIDA: Notificacion = { ...NOTIFICACION, idNotificacion: 6, enlace: null, leida: true };

describe('fechaRelativa', () => {
  const ahora = Date.parse('2026-11-16T14:00:00Z');
  it('da textos en español', () => {
    expect(fechaRelativa('2026-11-16T13:59:40Z', ahora)).toBe('hace un momento');
    expect(fechaRelativa('2026-11-16T13:55:00Z', ahora)).toBe('hace 5 minutos');
    expect(fechaRelativa('2026-11-16T11:00:00Z', ahora)).toBe('hace 3 horas');
    expect(fechaRelativa('2026-11-15T14:00:00Z', ahora)).toBe('ayer');
    expect(fechaRelativa('no-es-fecha', ahora)).toBe('');
  });
});

describe('NotificacionesComponent', () => {
  let fixture: ComponentFixture<NotificacionesComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function listado(contenido: Notificacion[]) {
    const req = http.expectOne((r) => r.url === `${API}/notificaciones`);
    req.flush(respuesta(pagina(contenido)));
    return req;
  }

  function boton(texto: string): HTMLButtonElement {
    const b = Array.from(vista.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  beforeEach(async () => {
    // Sin sesion: el polling de la campana no interfiere con estas peticiones.
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
    fixture = TestBed.createComponent(NotificacionesComponent);
    vista = fixture.nativeElement;
    await render();
  });

  afterEach(() => http.verify());

  it('lista la primera página con las no leídas resaltadas y enlace solo si es interno', async () => {
    const req = listado([NOTIFICACION, LEIDA]);
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.get('tamano')).toBe('20');
    expect(req.request.params.has('soloNoLeidas')).toBe(false);
    await render();

    const lis = vista.querySelectorAll('.lista-notificaciones li');
    expect(lis).toHaveLength(2);
    expect(lis[0].classList.contains('no-leida')).toBe(true);
    expect(lis[0].querySelector('a')?.getAttribute('href')).toBe('/perfil/seguridad');
    expect(lis[1].querySelector('a')).toBeNull();
    expect(lis[1].textContent).not.toContain('Marcar como leída');
  });

  it('filtra solo las no leídas', async () => {
    listado([NOTIFICACION, LEIDA]);
    await render();
    const check = vista.querySelector<HTMLInputElement>('.filters input[type=checkbox]')!;
    check.click();
    const req = listado([]);
    expect(req.request.params.get('soloNoLeidas')).toBe('true');
    await render();
    expect(vista.querySelector('.estado-vacio')?.textContent).toContain(
      'No tienes notificaciones sin leer',
    );
  });

  it('marca una como leída con PATCH sin recargar', async () => {
    listado([NOTIFICACION]);
    await render();
    boton('Marcar como leída').click();
    const patch = http.expectOne(`${API}/notificaciones/5/leida`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush(respuesta({ ...NOTIFICACION, leida: true }));
    await render();
    expect(vista.querySelector('.lista-notificaciones li.no-leida')).toBeNull();
  });

  it('marca todas como leídas y recarga desde la primera página', async () => {
    listado([NOTIFICACION]);
    await render();
    boton('Marcar todas como leídas').click();
    const post = http.expectOne(`${API}/notificaciones/leidas`);
    expect(post.request.method).toBe('POST');
    post.flush(respuesta(null));
    listado([{ ...NOTIFICACION, leida: true }]);
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('marcadas como leídas');
    expect(boton('Marcar todas como leídas').disabled).toBe(true);
  });
});
