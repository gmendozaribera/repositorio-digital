import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApi } from '../../../core/api/api.providers';
import { respuesta } from '../../../core/auth/testing';
import { CarrerasComponent } from './carreras-materias.component';

const API = '/api/v1';
const FACULTADES = [
  { idFacultad: 1, nombre: 'Computación', sigla: 'FICCT', estado: 1 },
  { idFacultad: 2, nombre: 'Tecnología', sigla: 'FCYT', estado: 1 },
  { idFacultad: 3, nombre: 'Cerrada', sigla: 'OLD', estado: 0 },
];
const INF = {
  idCarrera: 7,
  nombre: 'Ingeniería Informática',
  sigla: 'INF',
  idFacultad: 1,
  estado: 1,
};

describe('CarrerasComponent', () => {
  let fixture: ComponentFixture<CarrerasComponent>;
  let http: HttpTestingController;
  let pagina: HTMLElement;

  function boton(texto: string): HTMLButtonElement {
    const b = Array.from(pagina.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  function escribir(selector: string, valor: string): void {
    const input = pagina.querySelector<HTMLInputElement>(selector)!;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  }

  function elegir(selector: string, indice: number): void {
    const select = pagina.querySelector<HTMLSelectElement>(selector)!;
    select.selectedIndex = indice;
    select.dispatchEvent(new Event('change'));
  }

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function listado(items: unknown[], idFacultad?: number): void {
    const req = http.expectOne((r) => r.url === `${API}/carreras`);
    expect(req.request.params.get('idFacultad')).toBe(idFacultad ? String(idFacultad) : null);
    expect(req.request.params.get('incluirInactivos')).toBe('true');
    req.flush(respuesta(items));
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CarrerasComponent);
    pagina = fixture.nativeElement;
    await render();
    http.expectOne((r) => r.url === `${API}/facultades`).flush(respuesta(FACULTADES));
    listado([INF]);
    await render();
  });

  afterEach(() => http.verify());

  it('lista las carreras con la sigla de su facultad', () => {
    const fila = pagina.querySelector('tbody tr')!;
    expect(fila.textContent).toContain('INF');
    expect(fila.textContent).toContain('FICCT');
    expect(fila.textContent).toContain('Activa');
  });

  it('muestra el estado vacio', async () => {
    elegir('.filters select', 2); // FCYT
    await render();
    listado([], 2);
    await render();
    expect(pagina.querySelector('.estado-vacio')?.textContent).toContain('No hay carreras');
  });

  it('no envia el formulario invalido y marca los campos', async () => {
    boton('Nueva carrera').click();
    await render();
    pagina.querySelector('form')!.dispatchEvent(new Event('submit'));
    await render();

    expect(pagina.querySelectorAll('.field-error').length).toBe(3);
    http.expectNone(`${API}/carreras`);
  });

  it('solo ofrece facultades activas en el formulario', async () => {
    boton('Nueva carrera').click();
    await render();
    const opciones = Array.from(pagina.querySelectorAll('form select option')).map((o) =>
      o.textContent?.trim(),
    );
    expect(opciones).toEqual(['Seleccione…', 'FICCT — Computación', 'FCYT — Tecnología']);
  });

  it('crea la carrera y recarga el listado', async () => {
    boton('Nueva carrera').click();
    await render();
    elegir('form select', 1);
    escribir('input[formcontrolname=sigla]', ' SIS ');
    escribir('input[formcontrolname=nombre]', 'Ingeniería de Sistemas');
    pagina.querySelector('form')!.dispatchEvent(new Event('submit'));

    const post = http.expectOne(`${API}/carreras`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      idFacultad: 1,
      sigla: 'SIS',
      nombre: 'Ingeniería de Sistemas',
    });
    post.flush(respuesta({ ...post.request.body, idCarrera: 8, estado: 1 }));
    listado([INF]);
    await render();

    expect(pagina.querySelector('form')).toBeNull();
    expect(pagina.querySelector('[role=status]')?.textContent).toContain('Carrera «SIS» creada.');
  });

  it('muestra bajo cada campo los errores de validacion del backend', async () => {
    boton('Nueva carrera').click();
    await render();
    elegir('form select', 1);
    escribir('input[formcontrolname=sigla]', 'INF');
    escribir('input[formcontrolname=nombre]', 'Repetida');
    pagina.querySelector('form')!.dispatchEvent(new Event('submit'));

    http.expectOne(`${API}/carreras`).flush(
      {
        status: 400,
        title: 'Datos invalidos',
        detail: 'Uno o mas campos no son validos.',
        timestamp: '2026-11-12T14:00:00Z',
        errores: { sigla: 'ya esta en uso' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await render();

    expect(pagina.querySelector('.panel [role=alert]')?.textContent).toContain(
      'Uno o mas campos no son validos.',
    );
    expect(pagina.querySelector('.field-error')?.textContent).toContain('ya esta en uso');
  });

  it('edita con PUT y desactiva con DELETE', async () => {
    boton('Editar').click();
    await render();
    expect(pagina.querySelector<HTMLInputElement>('input[formcontrolname=sigla]')!.value).toBe(
      'INF',
    );
    escribir('input[formcontrolname=nombre]', 'Informática');
    pagina.querySelector('form')!.dispatchEvent(new Event('submit'));

    const put = http.expectOne(`${API}/carreras/7`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ idFacultad: 1, sigla: 'INF', nombre: 'Informática' });
    put.flush(respuesta({ ...INF, nombre: 'Informática' }));
    listado([INF]);
    await render();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    boton('Desactivar').click();
    const del = http.expectOne(`${API}/carreras/7`);
    expect(del.request.method).toBe('DELETE');
    del.flush(respuesta({ ...INF, estado: 0 }));
    listado([{ ...INF, estado: 0 }]);
    await render();

    expect(pagina.querySelector('tbody tr')?.textContent).toContain('Desactivada');
    expect(boton('Reactivar')).toBeTruthy();
  });

  it('reactiva enviando estado 1 sin perder los datos', async () => {
    listadoInactivo();
    await render();
    boton('Reactivar').click();
    const put = http.expectOne(`${API}/carreras/7`);
    expect(put.request.body).toEqual({
      idFacultad: 1,
      sigla: 'INF',
      nombre: INF.nombre,
      estado: 1,
    });
    put.flush(respuesta(INF));
    listado([INF]);
  });

  function listadoInactivo(): void {
    // Recarga desde el checkbox para tener la carrera desactivada en pantalla.
    const check = pagina.querySelector<HTMLInputElement>('.check input')!;
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    listado([{ ...INF, estado: 0 }]);
  }
});
