// Marcador neutro da série 2 da PoC: nenhum módulo importa este arquivo.
// Muda só nas entregas com gatilho "marcador" (scripts/serie2-preparar.ps1):
// 1 linha, sempre do mesmo tamanho (serie2-XXXX). Fica dentro de backend/ para entrar no COPY . . do Dockerfile.
export const MARCADOR_DEPLOY = 'serie2-C003';
