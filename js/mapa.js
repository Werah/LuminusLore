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

// O zoom mínimo é o que mostra o mapa inteiro, e depende do tamanho do lado do mapa.
// Por isso é recalculado sempre que esse lado muda (inclusive quando estava escondido e volta).
let vistaEscolhida = false; // já mostrou alguma coisa (mapa inteiro ou um ponto)
function ajustarTamanho() {
  mapa.invalidateSize({ pan: false });
  if (!mapa.getSize().x || !mapa.getSize().y) return; // lado do mapa escondido
  mapa.setMinZoom(mapa.getBoundsZoom(limites) - 0.5);
  if (!vistaEscolhida) {
    mapa.fitBounds(limites);
    vistaEscolhida = true;
  }
}
new ResizeObserver(ajustarTamanho).observe(document.getElementById('mapa'));

const camadaPontos = L.layerGroup().addTo(mapa);

// No banco a posição é fração da imagem (0 a 1, a partir do canto de cima à esquerda)
const paraMapa = (x, y) => L.latLng((1 - y) * MAPA.altura, x * MAPA.largura);
const paraFracao = ll => ({ x: ll.lng / MAPA.largura, y: 1 - ll.lat / MAPA.altura });

// Ícones que dá para escolher para um ponto (desenhos 24x24). '' = só o ponto redondo.
// Para adicionar um: chave só com letras minúsculas, um rótulo e o desenho em SVG.
const ICONES_MAPA = {
  '': { rotulo: 'Ponto', svg: '' },
  cidade: { rotulo: 'Cidade', svg: '<path d="M2 22V12h4V8h3v14zm8 0V3h6v19zm7 0V10h5v12z"/>' },
  vila: { rotulo: 'Vila', svg: '<path d="M12 3 2 11h3v10h5v-6h4v6h5V11h3z"/>' },
  castelo: { rotulo: 'Castelo', svg: '<path d="M3 21V7h3v2h2V7h3v2h2V7h3v2h2V7h3v14h-7v-5a2 2 0 0 0-4 0v5z"/>' },
  caveira: {
    rotulo: 'Caveira',
    svg: '<path fill-rule="evenodd" d="M12 2C7 2 3.5 5.6 3.5 10c0 2.6 1.2 4.6 3 5.8V19a1 1 0 0 0 1 1H9v-2h2v2h2v-2h2v2h1.5a1 1 0 0 0 1-1v-3.2c1.8-1.2 3-3.2 3-5.8C20.5 5.6 17 2 12 2zM8.5 13.5a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4zm7 0a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4zM12 13.5l-1.2 2.3h2.4z"/>',
  },
  floresta: { rotulo: 'Floresta', svg: '<path d="M8 2 3 10h3l-4 6h5v5h2v-5h5l-4-6h3zm9 4-3.5 5.5H16L13 16h3v5h2v-5h3l-3-4.5h2.5z"/>' },
  espadas: {
    rotulo: 'Espadas cruzadas',
    // Uma espada em pé (lâmina, guarda, cabo, pomo) desenhada duas vezes, girada para cada lado
    svg: ['45', '-45'].map(giro => `<g transform="rotate(${giro} 12 12)">`
      + '<path d="M12 1.5 13.4 4v11h-2.8V4z"/><rect x="7.5" y="15" width="9" height="2" rx="1"/>'
      + '<rect x="11" y="17" width="2" height="4"/><circle cx="12" cy="22" r="1.4"/></g>').join(''),
  },
  montanha: { rotulo: 'Montanha', svg: '<path d="M1 20 9 6l4.5 7 2.5-3.5L23 20z"/>' },
  templo: { rotulo: 'Templo', svg: '<path d="M12 2 2 7v2h20V7zM4 10h3v8H4zm6.5 0h3v8h-3zM17 10h3v8h-3zM2 19h20v3H2z"/>' },
  porto: {
    rotulo: 'Porto',
    svg: '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 6.5V21M8 10h8M4 13a8 8 0 0 0 16 0"/></g>',
  },
  estrela: { rotulo: 'Estrela', svg: '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3l-6.2 3.6 1.6-7L2 9.2l7.1-.6z"/>' },
};

const desenhoSvg = d => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;

// Cor clara pede ícone escuro (senão o ícone branco some)
function corClara(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.62;
}

// Cor do ponto: a escolhida ou, se não tiver, a da seção
const corDoPonto = p => p.mapaCor || SECOES[p.secao].cor;

function icone(p) {
  const cor = corDoPonto(p);
  const desenho = ICONES_MAPA[p.mapaIcone]?.svg;
  if (!desenho) {
    return L.divIcon({ className: 'ponto-mapa', html: `<span style="--cor: ${cor}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] });
  }
  return L.divIcon({
    className: 'ponto-mapa com-icone',
    html: `<span style="--cor: ${cor}; color: ${corClara(cor) ? '#1b1408' : '#fff'}">${desenhoSvg(desenho)}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

// ---------- Pontos ----------

async function carregarPontos() {
  const meu = ++carregamento;
  const lista = await banco.pontosDoMapa();
  if (meu !== carregamento) return; // já pediram de novo enquanto este carregava
  camadaPontos.clearLayers();
  pontos = new Map();
  for (const p of lista) {
    const marcador = L.marker(paraMapa(p.mapaX, p.mapaY), { icon: icone(p), riseOnHover: true })
      .bindTooltip(
        `<strong>${esc(p.titulo)}</strong>${p.subtitulo ? `<br><small>${esc(p.subtitulo)}</small>` : ''}`,
        { direction: 'top', offset: [0, -12], className: 'dica-ponto' },
      )
      .on('click', () => abrir(p.id))
      .addTo(camadaPontos);
    pontos.set(p.id, { ponto: p, marcador });
  }
  destacar();
  desenharEstilo();
}

function destacar() {
  for (const [id, { marcador }] of pontos) {
    const ativo = id === atual?.id;
    marcador.getElement()?.classList.toggle('ativo', ativo);
    marcador.setZIndexOffset(ativo ? 1000 : 0);
  }
}

function centralizar(id) {
  const { marcador } = pontos.get(id);
  const zoom = Math.max(mapa.getZoom(), ZOOM_FOCO);
  vistaEscolhida = true;
  // Com o lado do mapa escondido não dá para animar: só deixa centralizado para quando ele voltar
  if (!mapa.getSize().x || !mapa.getSize().y) mapa.setView(marcador.getLatLng(), zoom, { animate: false });
  else mapa.flyTo(marcador.getLatLng(), zoom, { duration: 0.8 });
}

function abrir(id) {
  painel.src = `artigo.html?id=${encodeURIComponent(id)}`;
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
  caixaEstilo.innerHTML = `
    <div class="linha-estilo">
      <label class="campo-cor">Cor <input type="color" value="${cor}"></label>
      <button class="pequeno" data-acao="cor-secao"${p.mapaCor ? '' : ' disabled'}>Usar cor da seção</button>
      <button class="pequeno fechar-estilo" data-acao="fechar" title="Fechar">✕</button>
    </div>
    <div class="icones-ponto" style="--cor: ${cor}">
      ${Object.entries(ICONES_MAPA).map(([chave, i]) => `
        <button class="${chave === (p.mapaIcone || '') ? 'ativo' : ''}" data-icone="${chave}" title="${i.rotulo}" aria-label="${i.rotulo}">
          ${i.svg ? desenhoSvg(i.svg) : '<span class="gema"></span>'}
        </button>
      `).join('')}
    </div>
  `;
}

// Troca a aparência na tela na hora; "salvar" grava no banco
async function mudarEstilo(mudanca, salvar = true) {
  const info = atual && pontos.get(atual.id);
  if (!info) return;
  Object.assign(info.ponto, mudanca);
  info.marcador.setIcon(icone(info.ponto));
  destacar();
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
  caixaEstilo.querySelector('[data-acao="cor-secao"]').disabled = false;
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
  if (botao.dataset.acao === 'cor-secao') mudarEstilo({ mapaCor: '' });
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
      <span class="dica-mapa">Clique num ponto para abrir o texto · Botão direito no mapa (ou toque longo) cria um verbete ali</span>
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

mapa.on('click', e => {
  if (!marcando || !atual || !limites.contains(e.latlng)) return;
  marcando = false;
  const { x, y } = paraFracao(e.latlng);
  posicionar(atual.id, x, y);
});

// Botão direito (ou toque longo): criar um verbete ali, ou pôr ali o texto aberto
mapa.on('contextmenu', e => {
  if (!limites.contains(e.latlng)) return;
  const { x, y } = paraFracao(e.latlng);
  const menu = document.createElement('div');
  menu.className = 'menu-mapa';
  menu.innerHTML = `
    <button class="pequeno primario" data-acao="novo">+ Novo verbete aqui</button>
    ${atual ? `<button class="pequeno" data-acao="mover">📍 Pôr “${esc(atual.titulo)}” aqui</button>` : ''}
  `;
  menu.addEventListener('click', ev => {
    const acao = ev.target.closest('button')?.dataset.acao;
    if (!acao) return;
    mapa.closePopup();
    if (acao === 'mover') {
      marcando = false;
      posicionar(atual.id, x, y);
      return;
    }
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
