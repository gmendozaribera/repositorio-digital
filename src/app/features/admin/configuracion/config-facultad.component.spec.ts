import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ConfigFacultad } from '../../../api/catalog';
import { provideApi } from '../../../core/api/api.providers';
import { respuesta } from '../../../core/auth/testing';
import { ConfigFacultadComponent } from './config-facultad.component';

const API = '/api/v1';
const FACULTADES = [
  { idFacultad: 1, nombre: 'Computación', sigla: 'FICCT', estado: 1 },
  { idFacultad: 2, nombre: 'Tecnología', sigla: 'FCYT', estado: 1 },
];
/** Valores por defecto del sistema (la facultad aun no guardo los suyos). */
const POR_DEFECTO: ConfigFacultad = {
  idFacultad: 1,
  personalizada: false,
  tamanoMaxArchivoMB: 10,
  umbralPlagioMedio: 30,
  umbralPlagioAlto: 50,
  comparacionInternet: false,
  accesoExterno: false,
  escalaCalifMax: 100,
  jwtExpiracionHoras: 1,
};

describe('ConfigFacultadComponent', () => {
  let fixture: ComponentFixture<ConfigFacultadComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function campo(nombre: string): HTMLInputElement {
    return vista.querySelector<HTMLInputElement>(`[formcontrolname=${nombre}]`)!;
  }

  function escribir(nombre: string, valor: string): void {
    const input = campo(nombre);
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  }

  function boton(texto: string): HTMLButtonElement {
    const b = Array.from(vista.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  async function elegirFacultad(id: number, config: ConfigFacultad): Promise<void> {
    const select = vista.querySelector<HTMLSelectElement>('.filters select')!;
    select.value = String(id);
    select.dispatchEvent(new Event('change'));
    const req = http.expectOne(`${API}/facultades/${id}/config`);
    expect(req.request.method).toBe('GET');
    req.flush(respuesta(config));
    await render();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ConfigFacultadComponent);
    vista = fixture.nativeElement;
    await render();
    http.expectOne((r) => r.url === `${API}/facultades`).flush(respuesta(FACULTADES));
    await render();
  });

  afterEach(() => http.verify());

  it('pide elegir facultad y carga sus valores por defecto con el aviso correspondiente', async () => {
    expect(vista.querySelector('.estado-vacio')?.textContent).toContain('Seleccione una facultad');
    await elegirFacultad(1, POR_DEFECTO);

    expect(vista.querySelector('.estado-config .badge')?.textContent).toBe(
      'Usando valores por defecto',
    );
    expect(campo('tamanoMaxArchivoMB').value).toBe('10');
    expect(campo('umbralPlagioMedio').value).toBe('30');
    expect(campo('umbralPlagioAlto').value).toBe('50');
    expect(campo('jwtExpiracionHoras').value).toBe('1');
    expect(vista.querySelector('.alert-info')?.textContent).toContain('al instante');
    expect(vista.querySelector('.alert-info')?.textContent).toContain('inicios de sesión');

    // Vista previa: verde < 30 <= amarillo < 50 <= rojo
    const leyenda = Array.from(vista.querySelectorAll('.semaforo-leyenda li')).map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(leyenda).toEqual([
      'Verde (bajo): menos de 30 %',
      'Amarillo (medio): desde 30 % hasta menos de 50 %',
      'Rojo (alto): desde 50 %',
    ]);
    const anchos = Array.from(vista.querySelectorAll<HTMLElement>('.semaforo-barra > div')).map(
      (d) => d.style.width,
    );
    expect(anchos).toEqual(['30%', '20%', '50%']);
  });

  it('una facultad con configuración propia muestra el badge «Configuración propia»', async () => {
    await elegirFacultad(2, { ...POR_DEFECTO, idFacultad: 2, personalizada: true });
    expect(vista.querySelector('.estado-config .badge')?.textContent).toBe('Configuración propia');
  });

  it('valida que el umbral medio sea menor que el alto y los rangos del contrato', async () => {
    await elegirFacultad(1, POR_DEFECTO);
    escribir('umbralPlagioMedio', '60');
    await render();
    expect(vista.querySelector('#error-umbrales')?.textContent).toContain(
      'debe ser menor que el de riesgo alto',
    );
    expect(vista.querySelector('.semaforo-barra')).toBeNull();
    expect(vista.querySelector('.semaforo')?.textContent).toContain('Corrija los umbrales');

    escribir('umbralPlagioMedio', '50');
    await render();
    expect(vista.querySelector('#error-umbrales')).not.toBeNull();

    escribir('jwtExpiracionHoras', '48');
    escribir('tamanoMaxArchivoMB', '2.5');
    boton('Guardar').click();
    await render();
    http.expectNone((r) => r.method === 'PUT');
    expect(campo('jwtExpiracionHoras').closest('label')!.textContent).toContain('de 1 a 24');
    expect(campo('tamanoMaxArchivoMB').closest('label')!.textContent).toContain('de 1 a 100');

    escribir('umbralPlagioMedio', '20');
    await render();
    expect(vista.querySelector('#error-umbrales')).toBeNull();
  });

  it('guarda con PUT, pasa a «Configuración propia» y lleva los errores del servidor al campo', async () => {
    await elegirFacultad(1, POR_DEFECTO);
    escribir('tamanoMaxArchivoMB', '25');
    escribir('umbralPlagioAlto', '70');
    escribir('escalaCalifMax', '7');
    campo('accesoExterno').click();
    boton('Guardar').click();

    const put = http.expectOne(`${API}/facultades/1/config`);
    expect(put.request.method).toBe('PUT');
    const enviado = {
      tamanoMaxArchivoMB: 25,
      umbralPlagioMedio: 30,
      umbralPlagioAlto: 70,
      comparacionInternet: false,
      accesoExterno: true,
      escalaCalifMax: 7,
      jwtExpiracionHoras: 1,
    };
    expect(put.request.body).toEqual(enviado);
    put.flush(respuesta({ ...enviado, idFacultad: 1, personalizada: true }));
    await render();
    expect(vista.querySelector('.alert-success')?.textContent).toContain('ya rigen');
    expect(vista.querySelector('.estado-config .badge')?.textContent).toBe('Configuración propia');

    escribir('umbralPlagioAlto', '35');
    boton('Guardar').click();
    http.expectOne(`${API}/facultades/1/config`).flush(
      {
        status: 400,
        title: 'Datos inválidos',
        detail: 'Revise los datos.',
        timestamp: new Date().toISOString(),
        errores: { umbralPlagioAlto: 'debe ser mayor que el umbral medio' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await render();
    expect(vista.querySelector('.alert-danger')?.textContent).toContain('Revise los datos');
    expect(campo('umbralPlagioAlto').closest('label')!.textContent).toContain(
      'mayor que el umbral medio',
    );
  });

  it('«Deshacer cambios» vuelve a los valores cargados', async () => {
    await elegirFacultad(1, POR_DEFECTO);
    escribir('escalaCalifMax', '20');
    await render();
    boton('Deshacer cambios').click();
    await render();
    expect(campo('escalaCalifMax').value).toBe('100');
  });
});
