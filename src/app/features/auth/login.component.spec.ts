import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApi } from '../../core/api/api.providers';
import { PaginaVacia, respuesta } from '../../core/auth/testing';
import { LoginComponent } from './login.component';

const URL_LOGIN = '/api/v1/auth/login';
const URL_ESTADO = '/api/v1/publico/estado';

function problema(status: number, detail: string) {
  return { status, title: 'Error', detail, timestamp: new Date().toISOString() };
}

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let http: HttpTestingController;
  let pagina: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function boton(): HTMLButtonElement {
    return pagina.querySelector<HTMLButtonElement>('button[type=submit]')!;
  }

  async function ingresar(): Promise<void> {
    for (const [nombre, valor] of [
      ['usuario', 'jperez'],
      ['password', 'Incorrecta1'],
    ]) {
      const input = pagina.querySelector<HTMLInputElement>(`input[formcontrolname=${nombre}]`)!;
      input.value = valor;
      input.dispatchEvent(new Event('input'));
    }
    boton().click();
    await render();
  }

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
    await abrir(false);
  });

  /** Crea el login y responde el estado del repositorio publico. */
  async function abrir(publicoHabilitado: boolean): Promise<void> {
    fixture?.destroy();
    fixture = TestBed.createComponent(LoginComponent);
    pagina = fixture.nativeElement;
    await render();
    const estado = http.expectOne(URL_ESTADO);
    estado.flush(
      respuesta({ habilitado: publicoHabilitado, facultades: publicoHabilitado ? [1] : [] }),
    );
    await render();
  }

  function enlaceExplorar(): HTMLAnchorElement | undefined {
    return Array.from(pagina.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Explorar el repositorio sin iniciar sesión'),
    );
  }

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('sin acceso público habilitado no ofrece explorar el repositorio', () => {
    expect(enlaceExplorar()).toBeUndefined();
  });

  it('con acceso público habilitado ofrece explorar el repositorio sin sesión', async () => {
    await abrir(true);
    expect(enlaceExplorar()?.getAttribute('href')).toBe('/explorar');
  });

  it('si el estado del acceso público falla, no muestra el enlace ni un error', async () => {
    fixture.destroy();
    fixture = TestBed.createComponent(LoginComponent);
    pagina = fixture.nativeElement;
    await render();
    http.expectOne(URL_ESTADO).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await render();
    expect(enlaceExplorar()).toBeUndefined();
    expect(pagina.querySelector('.alert-danger')).toBeNull();
  });

  it('401: muestra el mensaje del servidor y deja reintentar', async () => {
    await ingresar();
    http.expectOne(URL_LOGIN).flush(problema(401, 'Usuario o contraseña incorrectos.'), {
      status: 401,
      statusText: 'Unauthorized',
    });
    await render();
    expect(pagina.querySelector('.alert-danger')?.textContent).toContain('incorrectos');
    expect(boton().disabled).toBe(false);
  });

  it('429 con Retry-After: minutos redondeados hacia arriba y botón bloqueado', async () => {
    await ingresar();
    http.expectOne(URL_LOGIN).flush(problema(429, 'Demasiados intentos.'), {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '840' },
    });
    await render();

    expect(pagina.querySelector('.alert-warn')?.textContent?.trim()).toBe(
      'Demasiados intentos fallidos. Podrás intentar de nuevo en 14 minutos.',
    );
    expect(pagina.querySelector('.alert-danger')).toBeNull();
    expect(boton().disabled).toBe(true);
    expect(boton().textContent).toContain('Reintentar en 14:00');

    pagina.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectNone(URL_LOGIN);
  });

  it('429 sin Retry-After: usa el detail del ProblemDetail y no bloquea', async () => {
    await ingresar();
    http
      .expectOne(URL_LOGIN)
      .flush(problema(429, 'Demasiados intentos fallidos. Intente de nuevo en 15 minutos.'), {
        status: 429,
        statusText: 'Too Many Requests',
      });
    await render();

    expect(pagina.querySelector('.alert-warn')?.textContent?.trim()).toBe(
      'Demasiados intentos fallidos. Intente de nuevo en 15 minutos.',
    );
    expect(boton().disabled).toBe(false);
  });
});
