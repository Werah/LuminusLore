// As seções do site. Para mudar categorias ou os campos da ficha de cada uma, é só mexer aqui.
// Os campos extras ficam guardados na coluna "detalhes" de cada texto.
//   chave:  nome interno (não mude depois que já tiver texto com ele)
//   opcoes: vira uma lista de escolha; o primeiro campo com opções vira filtro na página da seção
//   dica:   texto de exemplo que aparece no campo vazio
//   longo:  campo de várias linhas (aparece como um bloco no texto, não na ficha ao lado)
//   depois: campo longo que aparece depois do texto principal (senão, antes)
//   numero: só aceita número
//   soSe:   só aparece quando outro campo tem certo valor, ex.: { tipo: 'Personagem de jogador' }
// Nos campos da ficha também dá para usar [[links]] para outros textos.
// Opcionais da seção: rotuloPais (nome do campo de país), rotuloTexto (título do texto principal)
// e linhaDoTempo (a lista vira uma linha do tempo, ordenada pelos campos era e ano),
// filtroPais (botão para filtrar a lista pelo país / nacionalidade),
// introducao (abas: um texto de apresentação da seção | a lista).
// No campo de filtro, "abas" troca os botões de filtro por abas: { valor: 'Nome da aba' }.

// Campo com "soSe" só aparece (e só é guardado) quando os outros campos têm os valores pedidos
function campoVisivel(campo, detalhes) {
  return !campo.soSe || Object.entries(campo.soSe).every(([chave, valor]) => (detalhes[chave] || '') === valor);
}

// Os formatos (largura / altura) em que a imagem de um texto aparece no site. O popup de escolher a
// imagem mostra um quadro de cada (o primeiro, maior), para arrastar e escolher a parte à vista.
// Precisam bater com o CSS (aspect-ratio de .capa, .ficha img, .capa-pais, .imagem-intro, .evento-cartao img).
function moldurasDaImagem(a) {
  if (a.id?.startsWith('intro-')) return [{ nome: 'Topo da página', proporcao: 5 / 2 }];
  if (a.secao === 'personagens') {
    return [{ nome: 'Retrato (página do personagem)', proporcao: 3 / 4 }, { nome: 'Card da lista', proporcao: 8 / 5 }];
  }
  if (a.secao === 'historia') {
    return [{ nome: 'Página do evento', proporcao: 4 / 3 }, { nome: 'Linha do tempo', proporcao: 1 }];
  }
  if (a.secao === 'mundo' && a.mapaIcone === 'estrela') {
    return [{ nome: 'Capa da ficha do país', proporcao: 3 }, { nome: 'Página do país', proporcao: 4 / 3 }];
  }
  return [{ nome: 'Card da lista', proporcao: 2 }, { nome: 'Página', proporcao: 4 / 3 }];
}

// Quem pode ter um líder (um personagem) e o nome do cargo; '' = não tem cargo.
// O personagem mostra "Regente de" / "Líder de" com tudo o que aponta para ele.
function cargoDeLider(a) {
  const d = a.detalhes || {};
  if (a.secao === 'organizacoes') return 'Líder';
  if (a.secao !== 'mundo') return '';
  if (a.mapaIcone === 'estrela') return 'Regente'; // país
  if (['Cidade', 'Vilarejo'].includes(d.categoria) || ['cidade', 'vila'].includes(a.mapaIcone)) return 'Regente';
  return '';
}

const SECOES = {
  mundo: {
    nome: 'Mundo',
    pagina: 'mundo.html',
    icone: '🗺',
    cor: '#5fb88a',
    descricao: 'Terras, povos, eras e lugares do cenário',
    novo: 'Novo ponto de interesse',
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
  historia: {
    nome: 'História',
    pagina: 'historia.html',
    icone: '⏳︎', // ︎: versão "texto" do símbolo (pega a cor da seção, em vez de emoji colorido)
    cor: '#d98c5f',
    descricao: 'Os grandes eventos do mundo, em linha do tempo',
    novo: 'Novo evento',
    subtitulo: { rotulo: 'Resumo em uma linha', dica: 'Ex.: A queda da capital e o fim do império' },
    rotuloPais: 'País envolvido',
    linhaDoTempo: true,
    campos: [
      // A ordem das eras aqui é a ordem na linha do tempo
      { chave: 'era', rotulo: 'Era', opcoes: ['Era Antiga', 'Primeira Era', 'Segunda Era', 'Era Atual'] },
      { chave: 'ano', rotulo: 'Ano', numero: true, dica: 'Ex.: 312 (negativo = antes do marco zero)' },
      { chave: 'fim', rotulo: 'Até o ano', numero: true, dica: 'Se durou mais de um ano' },
      { chave: 'local', rotulo: 'Onde', dica: 'Ex.: [[Solarium]]' },
    ],
  },
  personagens: {
    nome: 'Personagens',
    pagina: 'personagens.html',
    icone: '♞',
    cor: '#e06c75',
    descricao: 'NPCs e personagens dos jogadores',
    novo: 'Novo personagem',
    subtitulo: { rotulo: 'Alcunha', dica: 'Ex.: O Lobo de Azraq' },
    rotuloPais: 'Nacionalidade',
    rotuloTexto: 'História',
    filtroPais: true, // botão para filtrar pela nacionalidade
    campos: [
      // "abas": na lista, o filtro vira abas (uma sempre escolhida) com estes nomes
      { chave: 'tipo', rotulo: 'Tipo', opcoes: ['NPC', 'Personagem de jogador'], abas: { 'NPC': 'NPCs', 'Personagem de jogador': 'Personagens' } },
      { chave: 'jogador', rotulo: 'Jogador', dica: 'Quem joga com ele', soSe: { tipo: 'Personagem de jogador' } },
      { chave: 'raca', rotulo: 'Raça', soSe: { tipo: 'Personagem de jogador' } },
      { chave: 'classe', rotulo: 'Classe', soSe: { tipo: 'Personagem de jogador' } },
      { chave: 'descricao', rotulo: 'Descrição', longo: true, dica: 'Aparência, personalidade, jeito de falar…' },
      {
        chave: 'inventario', rotulo: 'Inventário', longo: true, depois: true,
        dica: 'Um item por linha. Ex.:\n- Espada longa\n- 3 poções de cura', soSe: { tipo: 'Personagem de jogador' },
      },
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
    // A página abre em abas: um texto de apresentação e a lista. O texto é um texto normal do site
    // (com editor, links e histórico), guardado com o endereço fixo "intro-panteao".
    introducao: { titulo: 'Como os Deuses e a Fé são?', lista: 'Divindades' },
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
      { chave: 'tipo', rotulo: 'Tipo', opcoes: ['Culto', 'Bando Mercenário', 'Guilda', 'Milicia', 'Organização Criminosa', 'Cabala', 'Outro'] },
      { chave: 'sede', rotulo: 'Sede' },
      { chave: 'lideranca', rotulo: 'Liderança' },
      { chave: 'divindade', rotulo: 'Divindade ligada', dica: 'Ex.: [[Nome do deus]]' },
    ],
  },
};
