import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApi } from '../../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../../core/auth/testing';
import { pagina } from '../../../core/services/testing';
import { resumenDePrueba } from '../../../core/services/testing-trabajos';
import { MisTrabajosComponent } from './mis-trabajos.component';

const API = '/api/v1';

describe('MisTrabajosComponent', () => {
  let fixture: ComponentFixture<MisTrabajosComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    sessionStorage.clear();
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba('ESTUDIANTE')));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MisTrabajosComponent);
    vista = fixture.nativeElement;
    await render();
  });

  afterEach(() => http.verify());

  it('lista con badge de estado, enlace al detalle y botón "Nuevo trabajo"', async () => {
    http
      .expectOne((r) => r.url === `${API}/trabajos/mios`)
      .flush(respuesta(pagina([resumenDePrueba({ estado: 'APROBADO_CON_OBSERVACIONES' })])));
    await render();
    expect(vista.querySelector('a.btn-primary')?.getAttribute('href')).toBe(
      '/estudiante/trabajos/nuevo',
    );
    const fila = vista.querySelector('tbody tr')!;
    expect(fila.querySelector('a')?.getAttribute('href')).toBe('/trabajos/7');
    expect(fila.querySelector('.estado-aprobado-con-observaciones')?.textContent).toBe(
      'Aprobado con observaciones',
    );
  });

  it('filtra por estado y muestra el vacío correspondiente', async () => {
    http.expectOne((r) => r.url === `${API}/trabajos/mios`).flush(respuesta(pagina([])));
    await render();
    expect(vista.querySelector('.estado-vacio')?.textContent).toContain('Aún no tienes trabajos');

    const select = vista.querySelector('select')!;
    select.selectedIndex = 6; // Rechazado
    select.dispatchEvent(new Event('change'));
    await render();
    const req = http.expectOne((r) => r.url === `${API}/trabajos/mios`);
    expect(req.request.params.get('estado')).toBe('RECHAZADO');
    req.flush(respuesta(pagina([])));
    await render();
    expect(vista.querySelector('.estado-vacio')?.textContent).toContain('en este estado');
  });
});
