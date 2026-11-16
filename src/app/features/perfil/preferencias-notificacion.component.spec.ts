import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApi } from '../../core/api/api.providers';
import { PaginaVacia, respuesta } from '../../core/auth/testing';
import { PreferenciasNotificacionComponent } from './preferencias-notificacion.component';

const URL = '/api/v1/perfil/preferencias';

describe('PreferenciasNotificacionComponent', () => {
  let fixture: ComponentFixture<PreferenciasNotificacionComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const sw = () => vista.querySelector<HTMLInputElement>('input[role=switch]')!;

  beforeEach(async () => {
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
    fixture = TestBed.createComponent(PreferenciasNotificacionComponent);
    vista = fixture.nativeElement;
    await render();
    const get = http.expectOne(URL);
    expect(get.request.method).toBe('GET');
    get.flush(respuesta({ notificarCorreo: false }));
    await render();
  });

  afterEach(() => http.verify());

  it('muestra el valor actual y la nota sobre el correo saliente', () => {
    expect(sw().checked).toBe(false);
    expect(vista.textContent).toContain('Recibir también por correo');
    expect(vista.textContent).toContain('administrador activó el correo saliente');
  });

  it('guarda el cambio con PUT', async () => {
    sw().click();
    await render();
    expect(sw().disabled).toBe(true);
    const put = http.expectOne(URL);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ notificarCorreo: true });
    put.flush(respuesta({ notificarCorreo: true }));
    await render();
    expect(sw().checked).toBe(true);
    expect(sw().disabled).toBe(false);
    expect(vista.querySelector('.alert-success')?.textContent).toContain('por correo');
  });

  it('si falla vuelve al valor anterior y muestra el error', async () => {
    sw().click();
    await render();
    http
      .expectOne(URL)
      .flush(
        { status: 503, title: 'No disponible', timestamp: new Date().toISOString() },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await render();
    expect(sw().checked).toBe(false);
    expect(vista.querySelector('.alert-danger')?.textContent).toContain('no está disponible');
  });
});
