// Página de uma seção (mundo.html, panteao.html, organizacoes.html).
// Qual seção é vem do <body data-secao="...">.

exigirLogin();

const chave = document.body.dataset.secao;
const SECAO = SECOES[chave];
// Seção com mapa (Mundo): a lista aparece no painel de texto do mapa
if (SECAO.mapa && !embutido) location.replace(SECAO.mapa.pagina);
montarTopo(SECAO.nome);
avisarMapa(null);

const lista = document.getElementById('lista');
const filtros = document.getElementById('filtros');
const busca = document.getElementById('busca');
const ordem = document.getElementById('ordem');

// O primeiro campo com opções (categoria, hierarquia, tipo) vira filtro
const campoFiltro = SECAO.campos.find(c => c.opcoes);

let artigos = [];
let nomes = new Map();
let filtro = ''; // valor escolhido no filtro ('' = todos)

document.documentElement.style.setProperty('--cor-secao', SECAO.cor);
document.getElementById('titulo-secao').innerHTML = `<span class="icone-secao">${SECAO.icone}</span> ${esc(SECAO.nome)}`;
document.getElementById('descricao-secao').textContent = SECAO.descricao;
const btnNovo = document.getElementById('btn-novo');
btnNovo.textContent = `+ ${SECAO.novo}`;
btnNovo.href = `artigo.html?secao=${chave}`;

async function carregar() {
  try {
    [artigos, nomes] = await Promise.all([banco.listarArtigos(chave), banco.nomes()]);
    desenharFiltros();
    desenhar();
  } catch (e) {
    lista.innerHTML = `<p class="vazio">${esc(e.message)}</p>`;
  }
}

function valorFiltro(a) {
  return campoFiltro ? a.detalhes[campoFiltro.chave] || '' : '';
}

function desenharFiltros() {
  if (!campoFiltro) return;
  const contagem = new Map();
  for (const a of artigos) {
    const v = valorFiltro(a);
    if (v) contagem.set(v, (contagem.get(v) || 0) + 1);
  }
  // Na ordem das opções; valores antigos que não estão mais nas opções vão pro fim
  const posicao = v => (campoFiltro.opcoes.includes(v) ? campoFiltro.opcoes.indexOf(v) : Infinity);
  const valores = [...contagem.keys()].sort((a, b) => posicao(a) - posicao(b) || a.localeCompare(b));
  if (!valores.length) {
    filtros.innerHTML = '';
    return;
  }
  filtros.innerHTML = [['', 'Todos', artigos.length], ...valores.map(v => [v, v, contagem.get(v)])]
    .map(([v, rotulo, n]) => `
      <button class="${v === filtro ? 'ativo' : ''}" data-valor="${esc(v)}">${esc(rotulo)} <span class="qtd">${n}</span></button>
    `).join('');
}

function desenhar() {
  const termo = normalizar(busca.value.trim());
  const visiveis = artigos.filter(a => {
    if (filtro && valorFiltro(a) !== filtro) return false;
    if (!termo) return true;
    return normalizar(`${a.titulo} ${a.subtitulo} ${Object.values(a.detalhes).join(' ')} ${a.conteudo}`).includes(termo);
  });
  if (ordem.value === 'recentes') visiveis.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));

  if (!visiveis.length) {
    lista.innerHTML = artigos.length
      ? '<p class="vazio">Nada encontrado.</p>'
      : `<p class="vazio">Nenhum texto ainda. Que tal começar com <strong>${esc(SECAO.novo)}</strong>?</p>`;
    return;
  }

  lista.innerHTML = visiveis.map(a => `
    <a class="card clicavel artigo-card" href="artigo.html?id=${encodeURIComponent(a.id)}" style="--cor: ${SECAO.cor}">
      ${capaArtigo(a)}
      <div class="corpo-card">
        <div class="linha-titulo">
          <h3>${esc(a.titulo)}</h3>
          ${valorFiltro(a) ? `<span class="selo">${esc(valorFiltro(a))}</span>` : ''}
        </div>
        ${a.subtitulo ? `<p class="subtitulo">${esc(a.subtitulo)}</p>` : ''}
        ${a.conteudo ? `<p class="descricao">${esc(resumoTexto(a.conteudo))}</p>` : ''}
        <p class="info rodape-card">✎ ${esc(nomeDe(a.editadoPor, nomes))} · ${formatarData(a.atualizadoEm)}</p>
      </div>
    </a>
  `).join('');
}

filtros.addEventListener('click', e => {
  const botao = e.target.closest('button');
  if (!botao) return;
  filtro = botao.dataset.valor;
  desenharFiltros();
  desenhar();
});
busca.addEventListener('input', desenhar);
ordem.addEventListener('change', desenhar);

carregar();
