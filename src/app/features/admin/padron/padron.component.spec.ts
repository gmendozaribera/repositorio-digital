import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApi } from '../../../core/api/api.providers';
import { respuesta } from '../../../core/auth/testing';
import { pagina } from '../../../core/services/testing';
import {
  MAX_BYTES_PADRON,
  PadronComponent,
  plantillaCsvPadron,
  validarArchivoPadron,
} from './padron.component';

const API = '/api/v1';
const CARRERAS = [{ idCarrera: 7, nombre: 'Informática', sigla: 'INF', idFacultad: 1, estado: 1 }];
const JUAN = {
  id: 4,
  registro: 219012345,
  ci: 7654321,
  correo: 'juan.perez@uagrm.edu.bo',
  nombres: 'Juan Carlos',
  apellidos: 'Perez Lopez',
  idCarrera: 7,
  siglaCarrera: 'INF',
  habilitado: true,
  registrado: false,
};

function archivo(nombre: string, bytes = 10): File {
  return new File(['x'.repeat(bytes)], nombre);
}

describe('validarArchivoPadron', () => {
  it('acepta .csv, .xlsx y .xls (sin distinguir mayúsculas)', () => {
    expect(validarArchivoPadron(archivo('padron.csv'))).toBeNull();
    expect(validarArchivoPadron(archivo('PADRON.XLSX'))).toBeNull();
    expect(validarArchivoPadron(archivo('viejo.xls'))).toBeNull();
  });

  it('rechaza otras extensiones, archivos vacíos y de más de 5 MB', () => {
    expect(validarArchivoPadron(archivo('padron.pdf'))).toContain('Formato no permitido');
    expect(validarArchivoPadron(archivo('padron.csv', 0))).toContain('vacío');
    const grande = archivo('padron.csv');
    Object.defineProperty(grande, 'size', { value: MAX_BYTES_PADRON + 1 });
    expect(validarArchivoPadron(grande)).toContain('5 MB');
  });

  it('la plantilla CSV trae la cabecera esperada y una fila de ejemplo', () => {
    const [cabecera, ejemplo] = plantillaCsvPadron().trim().split('\n');
    expect(cabecera).toBe('registro,ci,correo,password_default,nombres,apellidos,sigla_carrera');
    expect(ejemplo.split(',')).toHaveLength(7);
  });
});

describe('PadronComponent', () => {
  let fixture: ComponentFixture<PadronComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function boton(texto: string): HTMLButtonElement {
    const b = Array.from(vista.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  async function elegirArchivo(f: File): Promise<void> {
    const input = vista.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: { 0: f, length: 1, item: () => f },
    });
    input.dispatchEvent(new Event('change'));
    await render();
  }

  function listadoPadron(contenido: unknown[]): void {
    http.expectOne((r) => r.url === `${API}/padron`).flush(respuesta(pagina(contenido)));
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PadronComponent);
    vista = fixture.nativeElement;
    await render();
    http.expectOne((r) => r.url === `${API}/carreras`).flush(respuesta(CARRERAS));
    listadoPadron([JUAN]);
    await render();
  });

  afterEach(() => http.verify());

  it('lista el padrón sin mostrar contraseñas', () => {
    const tabla = vista.querySelector('.tabla-padron')!.textContent!;
    expect(tabla).toContain('Perez Lopez, Juan Carlos');
    expect(tabla).toContain('Sin cuenta');
    expect(tabla).not.toMatch(/password|contraseña/i);
  });

  it('no deja subir un archivo con extensión no permitida', async () => {
    await elegirArchivo(archivo('padron.pdf'));
    expect(vista.querySelector('.importar .field-error')?.textContent).toContain(
      'Formato no permitido',
    );
    expect(boton('Importar').disabled).toBe(true);
    http.expectNone(`${API}/padron/import`);
  });

  it('importa el archivo, muestra el resumen y los errores por fila, y recarga el listado', async () => {
    await elegirArchivo(archivo('padron.csv'));
    expect(boton('Importar').disabled).toBe(false);
    boton('Importar').click();

    const req = http.expectOne(`${API}/padron/import`);
    expect((req.request.body as FormData).get('archivo')).toBeInstanceOf(File);
    req.flush(
      respuesta({
        totalFilas: 3,
        insertados: 1,
        actualizados: 1,
        conErrores: 1,
        errores: [{ fila: 4, columna: 'sigla_carrera', mensaje: 'No existe la carrera XYZ' }],
      }),
    );
    listadoPadron([JUAN]);
    await render();

    expect(vista.querySelector('.alert-warn')?.textContent).toContain(
      '3 filas leídas, 1 insertadas',
    );
    const error = vista.querySelector('.tabla-errores tbody tr')!.textContent!;
    expect(error).toContain('4');
    expect(error).toContain('sigla_carrera');
    expect(error).toContain('No existe la carrera XYZ');
  });

  it('muestra el error del servidor si rechaza el archivo', async () => {
    await elegirArchivo(archivo('padron.xlsx'));
    boton('Importar').click();
    http.expectOne(`${API}/padron/import`).flush(
      {
        status: 400,
        title: 'Datos invalidos',
        detail: 'Falta la columna ci en la cabecera.',
        timestamp: new Date().toISOString(),
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await render();
    expect(vista.querySelector('.panel .alert-danger')?.textContent).toContain(
      'Falta la columna ci',
    );
  });

  it('el switch inhabilita al estudiante con PATCH', async () => {
    const sw = vista.querySelector<HTMLInputElement>('input[role=switch]')!;
    sw.click();
    const req = http.expectOne(`${API}/padron/4`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ habilitado: false });
    req.flush(respuesta({ ...JUAN, habilitado: false }));
    await render();

    expect(vista.querySelector('.alert-success')?.textContent).toContain('inhabilitado');
    expect(vista.querySelector<HTMLInputElement>('input[role=switch]')!.checked).toBe(false);
  });

  it('filtra por cuenta creada', async () => {
    const select = vista.querySelectorAll<HTMLSelectElement>('.filters select')[1];
    select.value = 'no';
    select.dispatchEvent(new Event('change'));
    const req = http.expectOne((r) => r.url === `${API}/padron`);
    expect(req.request.params.get('registrado')).toBe('false');
    expect(req.request.params.has('habilitado')).toBe(false);
    req.flush(respuesta(pagina([])));
    await render();
    expect(vista.querySelector('.estado-vacio')).not.toBeNull();
  });
});
