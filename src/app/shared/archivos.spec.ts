import { archivoDePrueba, REGLAS } from '../core/services/testing-trabajos';
import {
  categoriaSugerida,
  esEnlaceSeguro,
  extensionDe,
  nombreDeContentDisposition,
  validarArchivo,
  validarEnlace,
} from './archivos';

describe('archivos', () => {
  it('lee el nombre de Content-Disposition (RFC 5987 primero, luego el clásico)', () => {
    expect(nombreDeContentDisposition('attachment; filename="informe.pdf"', 'x')).toBe(
      'informe.pdf',
    );
    expect(nombreDeContentDisposition("attachment; filename*=UTF-8''tesis%20final.pdf", 'x')).toBe(
      'tesis final.pdf',
    );
    expect(nombreDeContentDisposition('attachment; filename=codigo.zip', 'x')).toBe('codigo.zip');
    // Sin cabecera o con un nombre que intenta salir de la carpeta.
    expect(nombreDeContentDisposition(null, 'defecto.pdf')).toBe('defecto.pdf');
    expect(nombreDeContentDisposition('attachment; filename="../../etc/passwd"', 'x')).toBe(
      'passwd',
    );
    expect(nombreDeContentDisposition('attachment', 'defecto.pdf')).toBe('defecto.pdf');
  });

  it('sugiere la categoría por extensión (un PDF es DOCUMENTO)', () => {
    expect(extensionDe('Informe.Final.PDF')).toBe('pdf');
    expect(extensionDe('sin-extension')).toBe('');
    expect(categoriaSugerida(REGLAS, 'informe.pdf')).toBe('DOCUMENTO');
    expect(categoriaSugerida(REGLAS, 'demo.mp4')).toBe('VIDEO');
    expect(categoriaSugerida(REGLAS, 'virus.exe')).toBeNull();
  });

  it('valida extensión y tamaño según la categoría', () => {
    expect(validarArchivo(REGLAS, 'DOCUMENTO', archivoDePrueba('a.pdf', 9))).toBeNull();
    expect(validarArchivo(REGLAS, 'DOCUMENTO', archivoDePrueba('a.pdf', 11))).toContain(
      'tamaño máximo de 10 MB',
    );
    expect(validarArchivo(REGLAS, 'VIDEO', archivoDePrueba('a.mp4', 90))).toBeNull();
    expect(validarArchivo(REGLAS, 'DOCUMENTO', archivoDePrueba('a.exe'))).toContain(
      '.pdf, .docx, .odt',
    );
    expect(validarArchivo(REGLAS, null, archivoDePrueba('a.exe'))).toBe(
      'Elige la categoría del archivo.',
    );
  });

  it('valida enlaces: https y hosts permitidos (con subdominios)', () => {
    expect(validarEnlace(REGLAS, 'CODIGO', 'https://github.com/u/p')).toBeNull();
    expect(validarEnlace(REGLAS, 'VIDEO', 'https://www.youtube.com/watch?v=1')).toBeNull();
    expect(validarEnlace(REGLAS, 'CODIGO', 'http://github.com/u/p')).toContain('https://');
    expect(validarEnlace(REGLAS, 'CODIGO', 'https://github.com.evil.io/p')).toContain(
      'github.com, gitlab.com',
    );
    expect(validarEnlace(REGLAS, 'DOCUMENTO', 'https://github.com/u/p')).toContain('no admite');
    expect(esEnlaceSeguro('javascript:alert(1)')).toBe(false);
    expect(esEnlaceSeguro('https://vimeo.com/1')).toBe(true);
  });
});
