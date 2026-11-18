import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideApi } from '../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../core/auth/testing';
import { pagina } from '../../core/services/testing';
import { resumenDePrueba } from '../../core/services/testing-trabajos';
import { BandejaRevisionComponent } from './bandeja-revision.component';

const API = '/api/v1';

describe('BandejaRevisionComponent', () => {
  let fixture: ComponentFixture<BandejaRevisionComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function bandeja(contenido: unknown[]) {
    const req = http.expectOne((r) => r.url === `${API}/trabajos/revision`);
    req.flush(respuesta(pagina(contenido)));
    return req.request;
  }

  async function elegir(nombre: string, indice: number): Promise<void> {
    const s = vista.querySelector<HTMLSelectElement>(`select[formcontrolname=${nombre}]`)!;
    s.selectedIndex = indice;
    s.dispatchEvent(new Event('change'));
    await render();
  }

  beforeEach(async () => {
    sessionStorage.clear();
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba('DOCENTE')));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BandejaRevisionComponent);
    vista = fixture.nativeElement;
    await render();
  });

  afterEach(() => http.verify());

  it('sin trabajos por revisar muestra "Sin trabajos pendientes"', async () => {
    const req = bandeja([]);
    // Sin filtro de estado: el backend devuelve PENDIENTE y EN_REVISION, los mas antiguos primero.
    expect(req.params.has('estado')).toBe(false);
    expect(req.params.has('idGrupo')).toBe(false);
    await render();
    expect(vista.querySelector('.estado-vacio')?.textContent?.trim()).toBe(
      'Sin trabajos pendientes.',
    );

    await elegir('estado', 3); // Aprobado (la lista no incluye Borrador)
    const conEstado = bandeja([]);
    expect(conEstado.params.get('estado')).toBe('APROBADO');
    await render();
    expect(vista.querySelector('.estado-vacio')?.textContent).toContain('filtro elegido');
  });

  it('arma el filtro de grupo con los grupos de los resultados y abre el detalle', async () => {
    bandeja([
      resumenDePrueba(),
      resumenDePrueba({
        idTrabajo: 8,
        titulo: 'App móvil',
        idGrupo: 9,
        grupo: 'SB',
        siglaMateria: 'INF513',
        estado: 'EN_REVISION',
      }),
    ]);
    await render();
    const filas = Array.from(vista.querySelectorAll('tbody tr'));
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Juan Perez');
    expect(filas[0].querySelector('.estado-pendiente')?.textContent).toBe('Pendiente');
    expect(filas[1].querySelector('.estado-en-revision')?.textContent).toBe('En revisión');
    expect(
      Array.from(vista.querySelectorAll('select[formcontrolname=idGrupo] option')).map((o) =>
        o.textContent!.trim(),
      ),
    ).toEqual(['Todos los grupos', 'INF412 · Grupo SA · 2-2026', 'INF513 · Grupo SB · 2-2026']);

    await elegir('idGrupo', 2);
    const req = bandeja([resumenDePrueba({ idTrabajo: 8, idGrupo: 9 })]);
    expect(req.params.get('idGrupo')).toBe('9');
    expect(req.params.get('pagina')).toBe('0');
    await render();

    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');
    (vista.querySelector('tbody tr') as HTMLElement).click();
    expect(navegar).toHaveBeenCalledWith(['/trabajos', 8]);
  });
});
