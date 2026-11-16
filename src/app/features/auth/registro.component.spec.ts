import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApi } from '../../core/api/api.providers';
import { PaginaVacia } from '../../core/auth/testing';
import { RegistroComponent } from './registro.component';

const URL_REGISTRO = '/api/v1/auth/register';

function problema(status: number, detail: string, errores?: Record<string, string>) {
  return {
    status,
    title: 'Error',
    detail,
    timestamp: new Date().toISOString(),
    ...(errores ? { errores } : {}),
  };
}

describe('RegistroComponent', () => {
  let fixture: ComponentFixture<RegistroComponent>;
  let http: HttpTestingController;
  let pagina: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function escribir(nombre: string, valor: string): void {
    const input = pagina.querySelector<HTMLInputElement>(`input[formcontrolname=${nombre}]`)!;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  }

  async function enviar(ci: string, registro: string): Promise<void> {
    escribir('ci', ci);
    escribir('registro', registro);
    pagina.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await render();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RegistroComponent);
    pagina = fixture.nativeElement;
    await render();
  });

  afterEach(() => http.verify());

  it('exige CI y registro numericos antes de llamar al backend', async () => {
    await enviar('12a', '');
    http.expectNone(URL_REGISTRO);
    const errores = Array.from(pagina.querySelectorAll('.field-error')).map((e) =>
      e.textContent?.trim(),
    );
    expect(errores).toEqual([
      'Ingresa tu CI (solo números).',
      'Ingresa tu número de registro (solo números).',
    ]);
  });

  it('crea la cuenta y ofrece ir al login con el usuario prellenado', async () => {
    await enviar('7654321', '219012345');

    const req = http.expectOne(URL_REGISTRO);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ci: 7654321, registro: 219012345 });
    req.flush(
      {
        data: { usuario: '219012345' },
        message: 'Cuenta creada',
        status: 201,
        timestamp: new Date().toISOString(),
      },
      { status: 201, statusText: 'Created' },
    );
    await render();

    expect(pagina.querySelector('.alert-success')?.textContent).toContain(
      'Cuenta creada. Tu usuario es 219012345.',
    );
    expect(pagina.querySelector('form')).toBeNull();
    const enlace = pagina.querySelector<HTMLAnchorElement>('a.btn-primary')!;
    expect(enlace.getAttribute('href')).toBe('/login?usuario=219012345');
  });

  it('404: muestra el mensaje del servidor (no esta en el padron)', async () => {
    await enviar('1', '2');
    http
      .expectOne(URL_REGISTRO)
      .flush(problema(404, 'No encontrado en el padron institucional. Contacte a su facultad.'), {
        status: 404,
        statusText: 'Not Found',
      });
    await render();
    expect(pagina.querySelector('.alert-danger')?.textContent).toContain(
      'No encontrado en el padron institucional',
    );
  });

  it('409: avisa que la cuenta ya existe y sugiere contactar a la facultad', async () => {
    await enviar('1', '2');
    http
      .expectOne(URL_REGISTRO)
      .flush(problema(409, 'Ya tiene una cuenta'), { status: 409, statusText: 'Conflict' });
    await render();
    const texto = pagina.querySelector('.alert-danger')?.textContent ?? '';
    expect(texto).toContain('Ya existe una cuenta');
    expect(texto).toContain('contacta a tu facultad');
  });

  it('400: muestra los errores del servidor en cada campo', async () => {
    await enviar('1', '2');
    http
      .expectOne(URL_REGISTRO)
      .flush(problema(400, 'Datos inválidos', { registro: 'debe ser mayor que 0' }), {
        status: 400,
        statusText: 'Bad Request',
      });
    await render();
    expect(pagina.querySelector('.field-error')?.textContent?.trim()).toBe('debe ser mayor que 0');
  });
});
