"""
Gera as imagens do mapa usadas pelo site a partir da imagem original.

    python ferramentas/preparar_mapa.py "mapa/Artia Mapa Mundi.png"

Cria em mapa/:
  mapa.webp         tamanho original, comprimida (é a que aparece com zoom)
  mapa-previa.webp  versão pequena, que aparece na hora enquanto a grande carrega

A original (PNG) não precisa ir para o GitHub: é pesada demais para o site.
Precisa do Pillow:  pip install pillow
"""

import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # o mapa é maior que o limite padrão de segurança do Pillow

PASTA = Path(__file__).resolve().parent.parent / 'mapa'


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    original = Image.open(sys.argv[1]).convert('RGB')
    print(f'Original: {original.width} x {original.height}')

    original.save(PASTA / 'mapa.webp', quality=82, method=6)

    previa = original.copy()
    previa.thumbnail((1400, 1400), Image.LANCZOS)
    previa.save(PASTA / 'mapa-previa.webp', quality=75, method=6)

    for nome in ('mapa.webp', 'mapa-previa.webp'):
        print(f'{nome}: {(PASTA / nome).stat().st_size / 1024 / 1024:.1f} MB')


if __name__ == '__main__':
    main()
