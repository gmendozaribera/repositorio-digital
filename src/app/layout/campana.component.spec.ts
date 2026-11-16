import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import type { Notificacion } from '../api/user';
import { PaginaVacia } from '../core/auth/testing';
import { NotificacionService } from '../core/services/notificacion.service';
import { NOTIFICACION, pagina } from '../core/services/testing';
import { esRutaInterna } from '../shared/ruta-interna';
import { CampanaComponent, textoBadge } from './campana.component';

const LEIDA: Notificacion = {
  ...NOTIFICACION,
  idNotificacion: 6,
  titulo: 'Contraseña restablecida',
  enlace: null,
  leida: true,
};
const EXTERNA: Notificacion = {
  ...NOTIFICACION,
  idNotificacion: 7,
  titulo: 'Enlace externo',
  enlace: '//sitio-malicioso.com',
};

describe('textoBadge y esRutaInterna', () => {
  it('el badge se oculta en 0 y muestra 99+ desde 100', () => {
    expect(textoBadge(0)).toBe('');
    expect(textoBadge(1)).toBe('1');
    expect(textoBadge(99)).toBe('99');
    expect(textoBadge(100)).toBe('99+');
  });

  it('solo acepta rutas internas', () => {
    expect(esRutaInterna('/perfil/seguridad')).toBe(true);
    expect(esRutaInterna('https://sitio.com')).toBe(false);
    expect(esRutaInterna('//sitio.com')).toBe(false);
    expect(esRutaInterna('/\\sitio.com')).toBe(false);
    expect(esRutaInterna('javascript:alert(1)')).toBe(false);
    expect(esRutaInterna(null)).toBe(false);
    expect(esRutaInterna('')).toBe(false);
  });
});

describe('CampanaComponent', () => {
  let fixture: ComponentFixture<CampanaComponent>;
  let vista: HTMLElement;
  let router: Router;
  const pendientes = signal(0);
  const servicio = {
    pendientes: pendientes.asReadonly(),
    listar: vi.fn(() => of(pagina([NOTIFICACION, LEIDA, EXTERNA]))),
    marcarLeida: vi.fn((n: Notificacion) => of({ ...n, leida: true })),
    marcarTodas: vi.fn(() => of(undefined)),
  };

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const boton = () => vista.querySelector<HTMLButtonElement>('.campana-boton')!;
  const badge = () => vista.querySelector('.campana-badge')?.textContent?.trim() ?? null;
  const panel = () => vista.querySelector('.campana-panel');
  const items = () => Array.from(vista.querySelectorAll<HTMLButtonElement>('.notificacion-item'));

  async function abrir(): Promise<void> {
    boton().click();
    await render();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    pendientes.set(0);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: PaginaVacia }]),
        { provide: NotificacionService, useValue: servicio },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(CampanaComponent);
    vista = fixture.nativeElement;
    document.body.appendChild(vista);
    await render();
  });

  afterEach(() => vista.remove());

  it('oculta el badge sin pendientes y lo muestra con la cantidad (99+ si pasa de 99)', async () => {
    expect(badge()).toBeNull();
    expect(boton().getAttribute('aria-label')).toBe('Notificaciones: ninguna sin leer');

    pendientes.set(3);
    await render();
    expect(badge()).toBe('3');
    expect(boton().getAttribute('aria-label')).toBe('Notificaciones: 3 sin leer');
    expect(vista.querySelector('[aria-live=polite]')?.textContent).toContain(
      'Tienes 3 notificaciones sin leer',
    );

    pendientes.set(150);
    await render();
    expect(badge()).toBe('99+');
    expect(boton().getAttribute('aria-label')).toBe('Notificaciones: 150 sin leer');
  });

  it('al abrir pide las últimas 10 y resalta las no leídas', async () => {
    await abrir();
    expect(servicio.listar).toHaveBeenCalledWith({ tamano: 10 });
    expect(boton().getAttribute('aria-expanded')).toBe('true');
    const lis = Array.from(vista.querySelectorAll('.lista-notificaciones li'));
    expect(lis).toHaveLength(3);
    expect(lis.map((li) => li.classList.contains('no-leida'))).toEqual([true, false, true]);
    expect(vista.querySelector('time')?.textContent?.trim()).not.toBe('');
    expect(vista.querySelector('a[href="/notificaciones"]')?.textContent).toContain('Ver todas');
  });

  it('marca todas como leídas', async () => {
    pendientes.set(2);
    await abrir();
    const marcar = Array.from(vista.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Marcar todas como leídas'),
    )!;
    marcar.click();
    await render();
    expect(servicio.marcarTodas).toHaveBeenCalledTimes(1);
    expect(vista.querySelectorAll('.lista-notificaciones li.no-leida')).toHaveLength(0);
  });

  it('clic en una notificación: la marca leída y navega a su enlace interno', async () => {
    await abrir();
    items()[0].click();
    await render();
    expect(servicio.marcarLeida).toHaveBeenCalledWith(NOTIFICACION);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/perfil/seguridad');
    expect(panel()).toBeNull();
  });

  it('no navega a enlaces externos ni marca de nuevo las ya leídas', async () => {
    await abrir();
    items()[2].click();
    await render();
    expect(servicio.marcarLeida).toHaveBeenCalledWith(EXTERNA);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(panel()).not.toBeNull();

    items()[1].click();
    await render();
    expect(servicio.marcarLeida).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('se cierra con Escape (devolviendo el foco) y con un clic afuera', async () => {
    await abrir();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await render();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(boton());

    await abrir();
    panel()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await render();
    expect(panel()).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await render();
    expect(panel()).toBeNull();
  });
});
