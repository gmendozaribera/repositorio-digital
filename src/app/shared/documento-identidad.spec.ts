import { FormControl } from '@angular/forms';
import { normalizarCelular, normalizarCi, validarCelular, validarCi } from './documento-identidad';

describe('CI y celular como texto', () => {
  it.each([
    '1234',
    '7654321',
    '123456789012',
    '1234567-1A',
    '1234567-1a',
    '12345671A',
    ' 1234567 1A ',
  ])('acepta el CI «%s»', (ci) => expect(validarCi(new FormControl(ci))).toBeNull());

  it.each([
    '123',
    '1234567890123456',
    '1234567-ABCD',
    'A1234567',
    '1234567--1',
    '12.345',
    '1234567-',
  ])('rechaza el CI «%s»', (ci) => expect(validarCi(new FormControl(ci))).toEqual({ ci: true }));

  it('normaliza el CI: sin espacios y en mayúsculas', () => {
    expect(normalizarCi('  7654321-1a ')).toBe('7654321-1A');
    expect(normalizarCi('7654321 1a')).toBe('76543211A');
    expect(normalizarCi(null)).toBe('');
  });

  it('el celular es opcional, admite prefijo + y 7 a 15 dígitos', () => {
    for (const ok of ['', '70012345', '+59170012345', '+591 700 12345', '1234567']) {
      expect(validarCelular(new FormControl(ok))).toBeNull();
    }
    for (const mal of ['123456', '7001-2345', '++59170012345', '1234567890123456', 'abc1234567']) {
      expect(validarCelular(new FormControl(mal))).toEqual({ celular: true });
    }
    expect(normalizarCelular(' +591 70012345 ')).toBe('+59170012345');
    expect(normalizarCelular('   ')).toBeNull();
  });
});
