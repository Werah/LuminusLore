// Mapa do Mundo: metade mapa (Leaflet), metade texto (as páginas normais do site, num iframe).
//   mapa.html          mapa + lista do Mundo no painel
//   mapa.html?id=...   mapa + esse texto no painel, centralizado no ponto dele
// O painel avisa qual texto está mostrando (avisarMapa em api.js) e o mapa destaca e centraliza o ponto.
// Por isso clicar num [[link]] dentro do texto também move o mapa.

exigirLogin();
montarTopo('Mundo');

const MAPA = SECOES.mundo.mapa;
const ZOOM_FOCO = -1; // zoom mínimo ao centralizar num ponto (0 = imagem no tamanho original)
const painel = document.getElementById('painel');
const barra = document.getElementById('barra-mapa');
const caixaEstilo = document.getElementById('estilo-ponto');

let pontos = new Map();  // id do texto -> { ponto, marcador }
let atual = null;        // texto aberto no painel: { id, titulo, secao }, ou null
let marcando = false;    // esperando o clique no mapa para pôr o ponto do texto atual
let editandoEstilo = false; // caixa de cor e ícone aberta (mostra o ponto do texto atual)
let provisorio = null;   // marcador do texto novo que está sendo escrito (ainda sem salvar)
let carregamento = 0;    // para ignorar respostas atrasadas de carregarPontos()

// ---------- Mapa ----------

// Coordenadas em pixels da imagem: [0, 0] é o canto de baixo à esquerda e
// [altura, largura] o de cima à direita (no Leaflet o "y" cresce para cima).
const limites = L.latLngBounds([0, 0], [MAPA.altura, MAPA.largura]);

const mapa = L.map('mapa', {
  crs: L.CRS.Simple,
  minZoom: -6,
  maxZoom: 2,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelPxPerZoomLevel: 100,
  attributionControl: false,
  maxBounds: limites.pad(0.25),
  maxBoundsViscosity: 0.9,
});

// A prévia leve aparece na hora; a imagem grande aparece por cima quando termina de carregar
L.imageOverlay(MAPA.previa, limites).addTo(mapa);
const completa = L.imageOverlay(MAPA.imagem, limites, { opacity: 0, className: 'mapa-completo' }).addTo(mapa);
completa.on('load', () => completa.setOpacity(1));

// Dois níveis de detalhe: com o mapa afastado só aparecem os países (ehPais, em api.js);
// chegando mais perto, os países somem e aparecem todos os outros pontos.
const camadaPaises = L.layerGroup();
const camadaLocais = L.layerGroup();
let zoomDetalhe = -2; // a partir deste zoom aparecem os pontos locais (recalculado em ajustarTamanho)

function mostrarCamadaCerta() {
  const longe = mapa.getZoom() < zoomDetalhe;
  (longe ? camadaLocais : camadaPaises).remove();
  (longe ? camadaPaises : camadaLocais).addTo(mapa);
  destacar();
}
mapa.on('zoomend', mostrarCamadaCerta);

// O zoom mínimo é o que mostra o mapa inteiro, e depende do tamanho do lado do mapa.
// Por isso é recalculado sempre que esse lado muda (inclusive quando estava escondido e volta).
// O detalhe começa um nível de zoom (2x) mais perto que o mapa inteiro.
let vistaEscolhida = false; // já mostrou alguma coisa (mapa inteiro ou um ponto)
function ajustarTamanho() {
  mapa.invalidateSize({ pan: false });
  if (!mapa.getSize().x || !mapa.getSize().y) return; // lado do mapa escondido
  const zoomInteiro = mapa.getBoundsZoom(limites);
  mapa.setMinZoom(zoomInteiro - 0.5);
  zoomDetalhe = zoomInteiro + 1;
  if (!vistaEscolhida) {
    mapa.fitBounds(limites);
    vistaEscolhida = true;
  }
  mostrarCamadaCerta();
}
new ResizeObserver(ajustarTamanho).observe(document.getElementById('mapa'));

// No banco a posição é fração da imagem (0 a 1, a partir do canto de cima à esquerda)
const paraMapa = (x, y) => L.latLng((1 - y) * MAPA.altura, x * MAPA.largura);
const paraFracao = ll => ({ x: ll.lng / MAPA.largura, y: 1 - ll.lat / MAPA.altura });


// Cor do ponto: a escolhida; se não tiver, a do país dele; se não tiver país, a da seção
function corDoPonto(p, profundidade = 0) {
  if (p.mapaCor) return p.mapaCor;
  const pais = p.paisId && profundidade < 3 && pontos.get(p.paisId)?.ponto;
  return pais ? corDoPonto(pais, profundidade + 1) : SECOES[p.secao].cor;
}

function icone(p) {
  const cor = corDoPonto(p);
  const desenho = ICONES_MAPA[p.mapaIcone]?.svg;
  if (!desenho) {
    return L.divIcon({ className: 'ponto-mapa', html: `<span style="--cor: ${cor}"></span>`, iconSize: [16, 16], iconAnchor: [8, 8] });
  }
  return L.divIcon({
    className: 'ponto-mapa com-icone',
    html: `<span style="--cor: ${cor}; color: ${corClara(cor) ? '#1b1408' : '#fff'}">${desenhoSvg(desenho)}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// ---------- Pontos ----------

async function carregarPontos() {
  const meu = ++carregamento;
  const lista = await banco.pontosDoMapa();
  if (meu !== carregamento) return; // já pediram de novo enquanto este carregava
  camadaPaises.clearLayers();
  camadaLocais.clearLayers();
  pontos = new Map(lista.map(p => [p.id, { ponto: p }]));
  // Os ícones são feitos depois de juntar todos, porque a cor pode vir do país
  for (const info of pontos.values()) {
    const p = info.ponto;
    info.marcador = L.marker(paraMapa(p.mapaX, p.mapaY), { icon: icone(p), riseOnHover: true })
      .bindTooltip(() => dicaDoPonto(p), { direction: 'top', offset: [0, -9], className: 'dica-ponto' })
      .on('click', () => abrir(p.id));
    (ehPais(p) ? camadaPaises : camadaLocais).addLayer(info.marcador);
  }
  mostrarCamadaCerta();
  desenharEstilo();
}

function dicaDoPonto(p) {
  return `<strong>${esc(p.titulo)}</strong>${p.subtitulo ? `<br><small>${esc(p.subtitulo)}</small>` : ''}`
    + (ehPais(p) ? '<br><small>Clique para aproximar</small>' : '');
}

// Depois de mudar cor ou ícone: refaz todos os ícones (a cor de um país passa para os pontos dele)
// e põe cada ponto na camada certa (virar ou deixar de ser país muda quando ele aparece)
function redesenharPontos() {
  for (const { ponto, marcador } of pontos.values()) {
    marcador.setIcon(icone(ponto));
    camadaPaises.removeLayer(marcador);
    camadaLocais.removeLayer(marcador);
    (ehPais(ponto) ? camadaPaises : camadaLocais).addLayer(marcador);
  }
  destacar();
}

function destacar() {
  for (const [id, { marcador }] of pontos) {
    const ativo = id === atual?.id;
    marcador.getElement()?.classList.toggle('ativo', ativo);
    marcador.setZIndexOffset(ativo ? 1000 : 0);
  }
}

// Leva o mapa até o ponto, perto o bastante para ele aparecer.
// País: aproxima até a área dele (o país e os pontos que pertencem a ele), já no nível de detalhe.
function centralizar(id) {
  const { ponto, marcador } = pontos.get(id);
  const escondido = !mapa.getSize().x || !mapa.getSize().y;
  let centro = marcador.getLatLng();
  let zoom = Math.max(mapa.getZoom(), ZOOM_FOCO, zoomDetalhe);
  if (ehPais(ponto)) {
    const membros = [...pontos.values()].filter(i => i.ponto.paisId === id).map(i => i.marcador.getLatLng());
    zoom = zoomDetalhe + 0.5;
    if (membros.length && !escondido) {
      const area = L.latLngBounds([centro, ...membros]).pad(0.15);
      centro = area.getCenter();
      zoom = Math.max(Math.min(mapa.getBoundsZoom(area), ZOOM_FOCO), zoomDetalhe + 0.25);
    }
  }
  vistaEscolhida = true;
  // Com o lado do mapa escondido não dá para animar: só deixa centralizado para quando ele voltar
  if (escondido) mapa.setView(centro, zoom, { animate: false });
  else mapa.flyTo(centro, zoom, { duration: 0.8 });
}

// Se o painel estiver no editor, grava antes de trocar o texto. Devolve false se não deu para gravar
// (aí o painel continua no editor, mostrando o erro).
async function salvarPainel() {
  const salvar = painel.contentWindow?.salvarAlteracoes;
  return !salvar || (await salvar()) === true;
}

async function abrir(id) {
  if (!(await salvarPainel())) return;
  painel.src = `artigo.html?id=${encodeURIComponent(id)}`;
}

// Clique no mapa fora dos pontos: grava o que estiver sendo editado e solta o texto selecionado
async function soltarSelecao() {
  if (!atual && !painel.contentWindow?.salvarAlteracoes) return; // nada selecionado
  if (!(await salvarPainel())) return;
  atual = null;
  editandoEstilo = false;
  destacar();
  desenharEstilo();
  desenharBarra();
  painel.src = SECOES.mundo.pagina;
}

// Põe, move ou tira o ponto. Quando o texto ganha um ponto pela primeira vez, já abre a escolha de cor e ícone.
async function posicionar(id, x, y) {
  const primeiraVez = x !== null && !pontos.has(id);
  try {
    await banco.posicionar(id, x, y);
    if (primeiraVez) editandoEstilo = true;
    await carregarPontos();
  } catch (e) {
    alert(e.message);
  }
  desenharBarra();
}

// ---------- Cor e ícone do ponto ----------

function desenharEstilo() {
  const info = editandoEstilo && atual && pontos.get(atual.id);
  caixaEstilo.hidden = !info;
  if (!info) return;
  const p = info.ponto;
  const cor = corDoPonto(p);
  const temPais = p.paisId && pontos.has(p.paisId);
  caixaEstilo.innerHTML = `
    <div class="linha-estilo">
      <label class="campo-cor">Cor <input type="color" value="${cor}"></label>
      <button class="pequeno" data-acao="cor-padrao"${p.mapaCor ? '' : ' disabled'}>${temPais ? 'Usar cor do país' : 'Usar cor da seção'}</button>
      <button class="pequeno fechar-estilo" data-acao="fechar" title="Fechar">✕</button>
    </div>
    <div class="icones-ponto" style="--cor: ${cor}">${botoesIcones(p.mapaIcone)}</div>
    <p class="dica-estilo">A estrela marca um <strong>país</strong>: aparece só com o mapa afastado, e os outros textos podem escolher pertencer a ele (e herdam a cor).</p>
  `;
}

// Troca a aparência na tela na hora; "salvar" grava no banco
async function mudarEstilo(mudanca, salvar = true) {
  const info = atual && pontos.get(atual.id);
  if (!info) return;
  Object.assign(info.ponto, mudanca);
  redesenharPontos();
  caixaEstilo.querySelector('.icones-ponto')?.style.setProperty('--cor', corDoPonto(info.ponto));
  if (!salvar) return;
  try {
    await banco.estilizarPonto(info.ponto.id, info.ponto.mapaCor, info.ponto.mapaIcone);
  } catch (e) {
    alert(e.message);
  }
}

// Enquanto arrasta no seletor de cor só muda na tela; grava quando solta
caixaEstilo.addEventListener('input', e => {
  if (e.target.type === 'color') mudarEstilo({ mapaCor: e.target.value }, false);
});
caixaEstilo.addEventListener('change', e => {
  if (e.target.type !== 'color') return;
  mudarEstilo({ mapaCor: e.target.value });
  caixaEstilo.querySelector('[data-acao="cor-padrao"]').disabled = false;
});
caixaEstilo.addEventListener('click', e => {
  const botao = e.target.closest('button');
  if (!botao) return;
  if (botao.dataset.acao === 'fechar') {
    editandoEstilo = false;
    desenharEstilo();
    desenharBarra();
    return;
  }
  if (botao.dataset.acao === 'cor-padrao') mudarEstilo({ mapaCor: '' });
  if (botao.dataset.icone !== undefined) mudarEstilo({ mapaIcone: botao.dataset.icone });
  desenharEstilo();
});

// ---------- Barra de ações (embaixo do mapa) ----------

function desenharBarra() {
  mapa.getContainer().classList.toggle('marcando', marcando);

  if (marcando) {
    barra.innerHTML = `
      <span>Clique no mapa onde fica <strong>${esc(atual.titulo)}</strong></span>
      <button class="pequeno" data-acao="cancelar">Cancelar</button>
    `;
  } else if (!atual) {
    barra.innerHTML = `
      <span class="dica-mapa">Clique num ponto para abrir o texto · Botão direito no mapa (ou toque longo) cria um ponto de interesse ali</span>
    `;
  } else if (pontos.has(atual.id)) {
    barra.innerHTML = `
      <span class="nome-atual">${esc(atual.titulo)}</span>
      <button class="pequeno" data-acao="centralizar">Centralizar</button>
      <button class="pequeno${editandoEstilo ? ' ativo' : ''}" data-acao="estilo">🎨 Cor e ícone</button>
      <button class="pequeno" data-acao="marcar">Mover ponto</button>
      <button class="pequeno perigo" data-acao="tirar">Tirar do mapa</button>
    `;
  } else {
    barra.innerHTML = `
      <span class="nome-atual">${esc(atual.titulo)}</span>
      <button class="pequeno primario" data-acao="marcar">📍 Marcar no mapa</button>
    `;
  }
}

barra.addEventListener('click', e => {
  const acao = e.target.closest('button')?.dataset.acao;
  if (!acao) return;
  if (acao === 'centralizar') centralizar(atual.id);
  if (acao === 'estilo') {
    editandoEstilo = !editandoEstilo;
    desenharEstilo();
  }
  if (acao === 'marcar') marcando = true;
  if (acao === 'cancelar') marcando = false;
  if (acao === 'tirar') {
    if (confirm(`Tirar “${atual.titulo}” do mapa? O texto continua existindo.`)) posicionar(atual.id, null, null);
    return;
  }
  desenharBarra();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && marcando) {
    marcando = false;
    desenharBarra();
  }
});

// Clique no mapa (fora dos pontos): no modo de marcar, põe o ponto ali; senão, solta a seleção
mapa.on('click', e => {
  if (!marcando) {
    soltarSelecao();
    return;
  }
  if (!atual || !limites.contains(e.latlng)) return;
  marcando = false;
  const { x, y } = paraFracao(e.latlng);
  posicionar(atual.id, x, y);
});

// Botão direito (ou toque longo): criar um ponto de interesse ali, ou pôr ali o texto aberto
mapa.on('contextmenu', e => {
  if (!limites.contains(e.latlng)) return;
  const { x, y } = paraFracao(e.latlng);
  const menu = document.createElement('div');
  menu.className = 'menu-mapa';
  menu.innerHTML = `
    <button class="pequeno primario" data-acao="novo">+ Novo ponto de interesse aqui</button>
    ${atual ? `<button class="pequeno" data-acao="mover">📍 Pôr “${esc(atual.titulo)}” aqui</button>` : ''}
  `;
  menu.addEventListener('click', async ev => {
    const acao = ev.target.closest('button')?.dataset.acao;
    if (!acao) return;
    mapa.closePopup();
    if (acao === 'mover') {
      marcando = false;
      posicionar(atual.id, x, y);
      return;
    }
    if (!(await salvarPainel())) return;
    if (provisorio) provisorio.remove();
    provisorio = L.marker(e.latlng, { icon: icone({ secao: 'mundo' }), interactive: false }).addTo(mapa);
    provisorio.getElement()?.classList.add('provisorio');
    painel.src = `artigo.html?secao=mundo&x=${x.toFixed(5)}&y=${y.toFixed(5)}`;
  });
  L.popup({ closeButton: false, className: 'popup-mapa' }).setLatLng(e.latlng).setContent(menu).openOn(mapa);
});

// ---------- Divisão entre mapa e texto ----------

// "parte" é quanto da tela fica com o mapa: 0 = só o texto, 1 = só o mapa. Fica guardada no navegador.
const tela = document.getElementById('tela-mapa');
const divisor = document.getElementById('divisor');
const empilhado = matchMedia('(max-width: 800px)'); // celular: mapa em cima, texto embaixo
const PARADAS = [0, 0.5, 1];                          // aonde as setas do divisor levam
const CHAVE_PARTE = 'luminus-parte-mapa';
let parte = 0.5;

function aplicarParte(nova, guardar = true) {
  parte = Math.min(1, Math.max(0, nova));
  // Arrastou até perto da borda: esconde o lado inteiro
  if (parte < 0.06) parte = 0;
  if (parte > 0.94) parte = 1;
  tela.style.setProperty('--parte-mapa', parte);
  tela.classList.toggle('sem-mapa', parte === 0);
  tela.classList.toggle('sem-texto', parte === 1);
  divisor.setAttribute('aria-valuenow', Math.round(parte * 100));
  divisor.querySelector('[data-passo="-1"]').disabled = parte === 0;
  divisor.querySelector('[data-passo="1"]').disabled = parte === 1;
  if (!guardar) return;
  try {
    localStorage.setItem(CHAVE_PARTE, String(parte));
  } catch {
    // Sem armazenamento (janela anônima etc.): só não lembra da próxima vez
  }
}

function ajustarOrientacao() {
  divisor.setAttribute('aria-orientation', empilhado.matches ? 'horizontal' : 'vertical');
}

// Arrastar o divisor
divisor.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  e.preventDefault();
  divisor.setPointerCapture(e.pointerId);
  tela.classList.add('arrastando'); // o iframe para de "roubar" o mouse enquanto arrasta
});
divisor.addEventListener('pointermove', e => {
  if (!tela.classList.contains('arrastando')) return;
  const r = tela.getBoundingClientRect();
  aplicarParte(empilhado.matches ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width, false);
});
function soltar() {
  if (!tela.classList.contains('arrastando')) return;
  tela.classList.remove('arrastando');
  aplicarParte(parte);
}
divisor.addEventListener('pointerup', soltar);
divisor.addEventListener('lostpointercapture', soltar);

// Setas: vão para a próxima parada (só texto, metade, só mapa). Duplo clique volta para a metade.
divisor.addEventListener('click', e => {
  const passo = Number(e.target.closest('button')?.dataset.passo);
  if (passo === -1) aplicarParte([...PARADAS].reverse().find(p => p < parte - 0.01) ?? 0);
  if (passo === 1) aplicarParte(PARADAS.find(p => p > parte + 0.01) ?? 1);
});
divisor.addEventListener('dblclick', e => {
  if (!e.target.closest('button')) aplicarParte(0.5);
});
divisor.addEventListener('keydown', e => {
  const passo = { ArrowLeft: -0.05, ArrowUp: -0.05, ArrowRight: 0.05, ArrowDown: 0.05 }[e.key];
  if (passo === undefined) return;
  e.preventDefault();
  aplicarParte(parte + passo);
});

empilhado.addEventListener('change', ajustarOrientacao);
divisor.setAttribute('aria-valuemin', '0');
divisor.setAttribute('aria-valuemax', '100');
ajustarOrientacao();
try {
  const salva = parseFloat(localStorage.getItem(CHAVE_PARTE));
  if (salva >= 0 && salva <= 1) parte = salva;
} catch {
  // Sem armazenamento: começa na metade
}
aplicarParte(parte, false);
ajustarTamanho(); // primeira vista do mapa, já com o tamanho certo do lado dele

// ---------- Ficha do país (por cima do mapa) ----------

// Aberta pelo ícone ⓘ das pastas de país na lista do Mundo. É a página do país (artigo.html)
// no modo de destaque; os links dela abrem no painel de texto.
const sobreMapa = document.getElementById('sobre-mapa');
const janelaFicha = () => sobreMapa.querySelector('iframe')?.contentWindow;

function abrirFichaPais(id) {
  if (parte < 0.3) aplicarParte(0.5); // com o mapa escondido, a ficha não teria onde aparecer
  sobreMapa.innerHTML = `
    <button type="button" class="fechar-sobre" title="Fechar (Esc)">✕</button>
    <iframe title="Ficha do país" src="artigo.html?id=${encodeURIComponent(id)}&modo=pais"></iframe>
  `;
  sobreMapa.querySelector('.fechar-sobre').addEventListener('click', fecharFichaPais);
  sobreMapa.hidden = false;
}

// Fecha a ficha (gravando antes, se o editor estiver aberto com mudanças) e atualiza o mapa
// e a lista, porque a cor, o ícone ou o nome do país podem ter mudado
async function fecharFichaPais() {
  const salvar = janelaFicha()?.salvarAlteracoes;
  if (salvar && (await salvar()) !== true) return;
  sobreMapa.hidden = true;
  sobreMapa.innerHTML = '';
  carregarPontos().catch(() => {});
  if (painel.contentWindow.location.pathname.endsWith(SECOES.mundo.pagina)) painel.contentWindow.location.reload();
}

window.addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  if (e.source === painel.contentWindow && e.data?.tipo === 'abrir-pais') abrirFichaPais(e.data.id);
  if (e.source === janelaFicha() && e.data?.tipo === 'fechar-pais') fecharFichaPais();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !sobreMapa.hidden && !marcando) fecharFichaPais();
});

// ---------- Conversa com o painel de texto ----------

window.addEventListener('message', async e => {
  if (e.origin !== location.origin || e.source !== painel.contentWindow || e.data?.tipo !== 'artigo') return;
  atual = e.data.artigo;
  marcando = false;

  // O marcador provisório só fica enquanto o painel está no editor do texto novo
  const urlPainel = new URL(painel.contentWindow.location.href);
  if (provisorio && !urlPainel.searchParams.has('x')) {
    provisorio.remove();
    provisorio = null;
  }

  // O endereço da página acompanha o texto aberto (dá para recarregar ou mandar o link)
  history.replaceState(null, '', atual ? `mapa.html?id=${encodeURIComponent(atual.id)}` : 'mapa.html');
  document.title = `${atual ? atual.titulo : 'Mundo'} - LuminusLore`;

  desenharBarra();
  try {
    await carregarPontos();
  } catch {
    return; // sem os pontos, só não centraliza
  }
  if (atual && pontos.has(atual.id)) centralizar(atual.id);
  desenharBarra();
});

const idInicial = new URLSearchParams(location.search).get('id');
painel.src = idInicial ? `artigo.html?id=${encodeURIComponent(idInicial)}` : SECOES.mundo.pagina;
desenharBarra();
carregarPontos().catch(e => {
  barra.innerHTML = `<span class="erro">${esc(e.message)}</span>`;
});
