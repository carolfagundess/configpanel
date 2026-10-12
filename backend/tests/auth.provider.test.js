import jwt from 'jsonwebtoken';

describe('auth.provider - validade do token (JWT_EXPIRES_IN)', () => {
  let generateToken;
  let originalSecret;
  let originalExpiresIn;

  beforeAll(async () => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = originalSecret || 'segredo-apenas-para-teste';
    ({ generateToken } = await import('../src/providers/auth.provider.js'));
  });

  beforeEach(() => {
    originalExpiresIn = process.env.JWT_EXPIRES_IN;
  });

  afterEach(() => {
    if (originalExpiresIn === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = originalExpiresIn;
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  const duracao = (token) => {
    const { exp, iat } = jwt.decode(token);
    return exp - iat;
  };

  it('com JWT_EXPIRES_IN=8h, exp - iat deve ser 28800 segundos', () => {
    process.env.JWT_EXPIRES_IN = '8h';

    expect(duracao(generateToken({ userId: 'u1' }))).toBe(28800);
  });

  it('sem JWT_EXPIRES_IN, o padrão também deve dar 28800 segundos (8h)', () => {
    delete process.env.JWT_EXPIRES_IN;

    expect(duracao(generateToken({ userId: 'u1' }))).toBe(28800);
  });

  it('com JWT_EXPIRES_IN=1h, deve respeitar a variável (3600 segundos)', () => {
    process.env.JWT_EXPIRES_IN = '1h';

    expect(duracao(generateToken({ userId: 'u1' }))).toBe(3600);
  });

  it('com JWT_EXPIRES_IN vazia, deve usar o padrão de 8h', () => {
    process.env.JWT_EXPIRES_IN = '';

    expect(duracao(generateToken({ userId: 'u1' }))).toBe(28800);
  });
});
