// As seções do site. Para mudar categorias ou os campos da ficha de cada uma, é só mexer aqui.
// Os campos extras ficam guardados na coluna "detalhes" de cada texto.
//   chave:  nome interno (não mude depois que já tiver texto com ele)
//   opcoes: vira uma lista de escolha; o primeiro campo com opções vira filtro na página da seção
//   dica:   texto de exemplo que aparece no campo vazio
// Nos campos da ficha também dá para usar [[links]] para outros textos.

const SECOES = {
  mundo: {
    nome: 'Mundo',
    pagina: 'mundo.html',
    icone: '🗺',
    cor: '#5fb88a',
    descricao: 'Terras, povos, eras e lugares do cenário',
    novo: 'Novo verbete',
    subtitulo: { rotulo: 'Resumo em uma linha', dica: 'Ex.: O reino das mil pontes' },
    // O Mundo abre no mapa: metade mapa, metade texto. As imagens são geradas por
    // ferramentas/preparar_mapa.py; largura/altura são as da imagem original (o script mostra).
    mapa: {
      pagina: 'mapa.html',
      imagem: 'mapa/mapa.webp',
      previa: 'mapa/mapa-previa.webp',
      largura: 5068,
      altura: 5635,
    },
    campos: [
      { chave: 'categoria', rotulo: 'Categoria', opcoes: ['País/Reino', 'Cidade', 'Vilarejo', 'Floresta', 'Perigo', 'Montanha', 'Outro'] },
      { chave: 'localizacao', rotulo: 'Fica em', dica: 'Ex.: [[Solarium]]' },
    ],
  },
  panteao: {
    nome: 'Panteão',
    pagina: 'panteao.html',
    icone: '☀',
    cor: '#e0ac4a',
    descricao: 'Deuses, primordiais e aquilo que regem',
    novo: 'Nova divindade',
    subtitulo: { rotulo: 'Epíteto', dica: 'Ex.: A Senhora das Marés' },
    campos: [
      { chave: 'hierarquia', rotulo: 'Hierarquia', opcoes: ['Deus maior', 'Deus menor', 'Aspecto', 'Outro'] },
      { chave: 'dominios', rotulo: 'Domínios', dica: 'Ex.: mar, tempestades, viagens' },
      { chave: 'simbolo', rotulo: 'Símbolo sagrado' },
      { chave: 'seguidores', rotulo: 'Seguidores' },
    ],
  },
  organizacoes: {
    nome: 'Organizações',
    pagina: 'organizacoes.html',
    icone: '⚜',
    cor: '#a77ee8',
    descricao: 'Ordens, guildas, cultos e governos',
    novo: 'Nova organização',
    subtitulo: { rotulo: 'Lema', dica: 'Ex.: Pela chama, até o fim' },
    campos: [
      { chave: 'tipo', rotulo: 'Tipo', opcoes: ['Culto', 'Bando Mercenário', 'Guilda', 'Milicia', 'Organização Criminosa', 'Cabala' 'Outro'] },
      { chave: 'sede', rotulo: 'Sede' },
      { chave: 'lideranca', rotulo: 'Liderança' },
      { chave: 'divindade', rotulo: 'Divindade ligada', dica: 'Ex.: [[Nome do deus]]' },
    ],
  },
};
