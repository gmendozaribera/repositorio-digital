import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Dominio } from '../../../api/user';
import { provideApi } from '../../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../../core/auth/testing';
import { ParametrosComponent } from './parametros.component';

const API = '/api/v1/dominios';
/** Secreto configurado: el backend nunca devuelve su valor. */
const SMTP_PASSWORD: Dominio = {
  domainId: 4,
  domainGroup: 'SMTP_GROUP',
  domainName: 'PASSWORD',
  domainValue: '',
  description: 'Contraseña de la cuenta de correo.',
  lastUser: 'admin',
  lastTime: '2026-11-15T10:30:00Z',
  sistema: true,
  secreto: true,
  configurado: true,
};
/** Secreto aun sin valor. */
const API_KEY: Dominio = {
  ...SMTP_PASSWORD,
  domainId: 5,
  domainGroup: 'IA_GROUP',
  domainName: 'API_KEY',
  description: 'Clave del proveedor de IA.',
  sistema: false,
  configurado: false,
};

describe('ParametrosComponent (parámetros secretos)', () => {
  let fixture: ComponentFixture<ParametrosComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function fila(nombre: string): HTMLTableRowElement {
    const f = Array.from(vista.querySelectorAll<HTMLTableRowElement>('tbody tr')).find((x) =>
      x.textContent?.includes(nombre),
    );
    if (!f) throw new Error(`No hay fila ${nombre}`);
    return f;
  }

  function boton(texto: string, raiz: ParentNode = vista): HTMLButtonElement {
    const b = Array.from(raiz.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  function valor(): HTMLInputElement {
    return vista.querySelector<HTMLInputElement>('form [formcontrolname=domainValue]')!;
  }

  beforeEach(async () => {
    sessionStorage.clear();
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba('ADMIN')));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ParametrosComponent);
    vista = fixture.nativeElement;
    await render();
    http.expectOne((r) => r.url === API).flush(respuesta([SMTP_PASSWORD, API_KEY]));
    await render();
  });

  afterEach(() => http.verify());

  it('nunca muestra el valor: «configurado» o «Sin configurar», con badge Secreto', () => {
    const pass = fila('PASSWORD');
    expect(pass.querySelector('[data-label=Valor]')?.textContent).toContain('••••••');
    expect(pass.querySelector('[data-label=Valor]')?.textContent).toContain('(configurado)');
    expect(Array.from(pass.querySelectorAll('.badge')).map((b) => b.textContent)).toContain(
      'Secreto',
    );
    expect(fila('API_KEY').querySelector('[data-label=Valor]')?.textContent?.trim()).toBe(
      'Sin configurar',
    );
  });

  it('al editar usa un campo password vacío; vacío = no cambiar (PUT sin domainValue)', async () => {
    boton('Editar', fila('PASSWORD')).click();
    await render();
    expect(valor().type).toBe('password');
    expect(valor().value).toBe('');
    expect(valor().placeholder).toContain('dejar vacío para no cambiar');

    boton('Guardar').click();
    const put = http.expectOne(`${API}/4`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ description: SMTP_PASSWORD.description });
    expect('domainValue' in put.request.body).toBe(false);
    put.flush(respuesta(SMTP_PASSWORD));
    http.expectOne((r) => r.url === API).flush(respuesta([SMTP_PASSWORD, API_KEY]));
    await render();
    expect(vista.querySelector('form')).toBeNull();
  });

  it('envía el valor nuevo tal cual (sin recortar espacios)', async () => {
    boton('Editar', fila('PASSWORD')).click();
    await render();
    valor().value = ' clave nueva ';
    valor().dispatchEvent(new Event('input'));
    boton('Guardar').click();

    const put = http.expectOne(`${API}/4`);
    expect(put.request.body).toEqual({
      domainValue: ' clave nueva ',
      description: SMTP_PASSWORD.description,
    });
    put.flush(respuesta(SMTP_PASSWORD));
    http.expectOne((r) => r.url === API).flush(respuesta([SMTP_PASSWORD, API_KEY]));
    await render();
  });

  it('«Borrar el valor guardado» envía domainValue vacío', async () => {
    boton('Editar', fila('PASSWORD')).click();
    await render();
    const borrar = vista.querySelector<HTMLInputElement>('[formcontrolname=borrarValor]')!;
    borrar.click();
    await render();
    expect(valor().disabled).toBe(true);
    boton('Guardar').click();

    const put = http.expectOne(`${API}/4`);
    expect(put.request.body).toEqual({ domainValue: '', description: SMTP_PASSWORD.description });
    put.flush(respuesta({ ...SMTP_PASSWORD, configurado: false }));
    http
      .expectOne((r) => r.url === API)
      .flush(respuesta([{ ...SMTP_PASSWORD, configurado: false }, API_KEY]));
    await render();
    expect(fila('PASSWORD').querySelector('[data-label=Valor]')?.textContent?.trim()).toBe(
      'Sin configurar',
    );
  });

  it('un secreto sin configurar no ofrece «Borrar» y permite cambiar solo la descripción', async () => {
    boton('Editar', fila('API_KEY')).click();
    await render();
    expect(vista.querySelector('[formcontrolname=borrarValor]')).toBeNull();
    expect(valor().placeholder).toBe('Sin configurar');

    const descripcion = vista.querySelector<HTMLTextAreaElement>(
      'form [formcontrolname=description]',
    )!;
    descripcion.value = 'Otra descripción';
    descripcion.dispatchEvent(new Event('input'));
    boton('Guardar').click();
    const put = http.expectOne(`${API}/5`);
    expect(put.request.body).toEqual({ description: 'Otra descripción' });
    put.flush(respuesta({ ...API_KEY, description: 'Otra descripción' }));
    http.expectOne((r) => r.url === API).flush(respuesta([SMTP_PASSWORD, API_KEY]));
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('actualizado');
  });
});
