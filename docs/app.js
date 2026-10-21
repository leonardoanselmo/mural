const $ = (id) => document.getElementById(id);
// Rodando local, a busca vem do server.py; publicado no GitHub Pages, do Cloudflare Worker.
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const API = LOCAL ? "" : "https://mural.leonardo-anselmo.workers.dev";
const SUGESTOES = ["Flamengo futebol", "Inteligência artificial", "Economia Brasil", "Fórmula 1", "Cinema", "Saúde", "Tecnologia", "Recife"];
const TONS = ["#f3e3d3", "#dfe9e1", "#e3e4f2", "#f2e0e4", "#e8e6d6", "#dbe8ee"];
const POR_PAGINA = 24;
const MAX_RECENTES = 8;
// Formatos (largura, altura) sorteados por notícia para o mural ter alturas variadas.
const FORMATOS = [[3, 4], [2, 3], [4, 5], [1, 1], [3, 4], [9, 14], [4, 5], [5, 4], [2, 3]];
const ICONE_COMPARTILHAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/></svg>';

let noticias = [];
let termoAtual = "";
let ordem = "relevancia";
let busca = 0; // descarta respostas de buscas antigas

// Estado do mural: notícias que vão para as colunas e quantas já foram mostradas.
let restantes = [];
let mostrando = 0;
let colunas = [];
let alturas = [];

function hash(texto) {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function tom(n) {
  return TONS[hash(n.fonte || n.titulo) % TONS.length];
}

function tempoAtras(iso) {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function dominio(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function normalizar(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "style") n.style.cssText = v;
    else n.setAttribute(k, v);
  }
  n.append(...filhos.filter(Boolean));
  return n;
}

function link(n, classe) {
  return el("a", { class: classe, href: n.url, target: "_blank", rel: "noopener noreferrer" });
}

function meta(n) {
  const dom = dominio(n.url);
  const favicon = dom && !dom.includes("news.google")
    ? el("img", { src: `https://www.google.com/s2/favicons?domain=${dom}&sz=32`, alt: "" })
    : null;
  return el("div", { class: "meta" },
    favicon,
    el("span", { class: "meta-fonte" }, (n.fonte || dom).replace(/ on MSN$/i, "")),
    n.data ? el("span", { class: "meta-tempo" }, tempoAtras(n.data)) : null,
  );
}

/* ---------- Temas salvos e buscas recentes (ficam no navegador) ---------- */

function ler(chave) {
  try { return JSON.parse(localStorage.getItem(chave)) || []; } catch { return []; }
}

function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
}

const mesmo = (a, b) => normalizar(a) === normalizar(b);

function temaSalvo(termo) {
  return ler("mural:temas").some((t) => mesmo(t, termo));
}

function alternarTema() {
  const temas = ler("mural:temas");
  if (temaSalvo(termoAtual)) gravar("mural:temas", temas.filter((t) => !mesmo(t, termoAtual)));
  else gravar("mural:temas", [...temas, termoAtual]);
  avisar(temaSalvo(termoAtual) ? "Tema salvo" : "Tema removido");
  desenharTemas();
}

function lembrarBusca(termo) {
  const recentes = ler("mural:recentes").filter((t) => !mesmo(t, termo));
  gravar("mural:recentes", [termo, ...recentes].slice(0, MAX_RECENTES));
}

function chip(termo, classe) {
  const b = el("button", { type: "button", class: `chip ${classe}` }, termo);
  if (termoAtual && mesmo(termo, termoAtual)) b.setAttribute("aria-current", "true");
  b.onclick = () => buscar(termo);
  return b;
}

function desenharTemas() {
  const temas = ler("mural:temas");
  const recentes = ler("mural:recentes").filter((r) => !temas.some((t) => mesmo(t, r)));

  const itens = [];
  if (temas.length) itens.push(el("span", { class: "temas-rotulo" }, "Seus temas"), ...temas.map((t) => chip(t, "salvo")));
  if (recentes.length) {
    const limpar = el("button", { type: "button", class: "temas-limpar" }, "Limpar");
    limpar.onclick = () => { gravar("mural:recentes", []); desenharTemas(); };
    itens.push(el("span", { class: "temas-rotulo" }, "Recentes"), ...recentes.map((t) => chip(t, "recente")), limpar);
  }
  $("temas").replaceChildren(...itens);
  $("temas").hidden = !itens.length;

  const salvo = termoAtual && temaSalvo(termoAtual);
  $("salvar").setAttribute("aria-pressed", Boolean(salvo));
  $("salvar-texto").textContent = salvo ? "Tema salvo" : "Salvar tema";
}

/* ---------- Compartilhar ---------- */

let avisoTimer;
function avisar(texto) {
  $("aviso").textContent = texto;
  $("aviso").classList.add("visivel");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => $("aviso").classList.remove("visivel"), 2200);
}

async function compartilhar(n) {
  if (navigator.share) {
    try { await navigator.share({ title: n.titulo, url: n.url }); } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(n.url);
    avisar("Link copiado");
  } catch {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${n.titulo} ${n.url}`)}`, "_blank", "noopener");
  }
}

function botaoCompartilhar(n) {
  const b = el("button", { type: "button", class: "compartilhar", "aria-label": "Compartilhar notícia", title: "Compartilhar" });
  b.innerHTML = ICONE_COMPARTILHAR;
  b.onclick = () => compartilhar(n);
  return b;
}

/* ---------- Cards ---------- */

function formato(n) {
  return FORMATOS[hash(n.titulo) % FORMATOS.length];
}

// As miniaturas do Bing aceitam a largura na URL. Não pedimos recorte ao Bing
// (acima do tamanho original ele preenche com branco); o CSS recorta com object-fit.
function urlImagem(url, w) {
  return url.includes("bing.com/th") ? `${url}&w=${w}` : url;
}

function imagem(n, aoFalhar, w = 640) {
  const img = el("img", { src: urlImagem(n.imagem, w), alt: "", loading: "lazy" });
  img.onerror = aoFalhar;
  return img;
}

// Notícia principal: grande, com foto, título e um resumo curto.
function criarDestaque(n) {
  const card = link(n, "destaque");
  const caixa = el("div", { class: "caixa caixa-destaque" }, card, botaoCompartilhar(n));
  card.append(
    el("div", { class: "destaque-img" }, imagem(n, () => caixa.classList.add("sem-img"), 1000)),
    el("div", { class: "destaque-texto" },
      el("span", { class: "selo" }, "Em destaque"),
      el("h2", {}, n.titulo),
      n.resumo ? el("p", {}, n.resumo) : null,
      meta(n),
    ),
  );
  return caixa;
}

// Demais notícias: foto em formato variado, com título e fonte por cima.
function criarCard(n, atraso) {
  const card = link(n, "card");
  const caixa = el("div", { class: "caixa" }, card, botaoCompartilhar(n));
  caixa.style.animationDelay = `${Math.min(atraso * 25, 350)}ms`;
  const virarTexto = () => {
    card.className = "card texto";
    card.style.aspectRatio = "";
    card.style.setProperty("--tom", tom(n));
    card.querySelector("img")?.remove();
  };
  if (n.imagem) {
    const [w, h] = formato(n);
    card.classList.add("foto");
    card.style.aspectRatio = `${w} / ${h}`;
    // Formatos em retrato pedem mais resolução, porque o recorte usa só o miolo da foto.
    card.append(imagem(n, virarTexto, h > w ? 900 : 640));
  }
  card.append(el("div", { class: "card-sobre" }, el("h3", {}, n.titulo), meta(n)));
  if (!n.imagem) virarTexto();
  return caixa;
}

function alturaEstimada(n) {
  if (!n.imagem) return 0.5 + n.titulo.length / 130;
  const [w, h] = formato(n);
  return h / w;
}

/* ---------- Mural (masonry) e rolagem infinita ---------- */

function numColunas() {
  const w = $("mural").clientWidth;
  return w < 900 ? 2 : w < 1250 ? 3 : w < 1600 ? 4 : 5;
}

function iniciarColunas() {
  const n = numColunas();
  colunas = Array.from({ length: n }, () => el("div", { class: "coluna" }));
  alturas = new Array(n).fill(0);
  $("mural").replaceChildren(...colunas);
}

// Põe cada elemento na coluna mais "baixa" (altura estimada), mantendo a ordem de leitura.
function encaixar(elemento, altura) {
  const alvo = alturas.indexOf(Math.min(...alturas));
  colunas[alvo].append(elemento);
  alturas[alvo] += altura;
}

function carregarMais() {
  if (mostrando >= restantes.length) return;
  const novos = restantes.slice(mostrando, mostrando + POR_PAGINA);
  novos.forEach((n, i) => encaixar(criarCard(n, i), alturaEstimada(n)));
  mostrando += novos.length;
  $("fim").hidden = mostrando < restantes.length;
  // Se a página ainda não encheu a tela, já carrega o próximo bloco.
  requestAnimationFrame(verificarFim);
}

function verificarFim() {
  if ($("sentinela").getBoundingClientRect().top < innerHeight + 800) carregarMais();
}

new IntersectionObserver((e) => { if (e[0].isIntersecting) carregarMais(); }, { rootMargin: "800px" })
  .observe($("sentinela"));

// Escolhe para destaque a primeira notícia com foto que cite o termo buscado.
function escolherDestaque(lista) {
  const palavras = normalizar(termoAtual).split(/\s+/).filter((p) => p.length > 2);
  const cita = (n) => palavras.some((p) => normalizar(n.titulo).includes(p));
  return lista.slice(0, 10).find((n) => n.imagem && cita(n)) || lista.find((n) => n.imagem) || lista[0];
}

function render() {
  const lista = [...noticias].sort((a, b) =>
    ordem === "data" ? new Date(b.data || 0) - new Date(a.data || 0) : a.relevancia - b.relevancia);
  const principal = escolherDestaque(lista);
  const jaVistos = Math.max(mostrando, POR_PAGINA);
  restantes = lista.filter((n) => n !== principal);
  mostrando = 0;

  $("topo-destaque").replaceChildren(criarDestaque(principal));
  iniciarColunas();
  // Ao reordenar ou redimensionar, mantém quantos cards já estavam na tela.
  const primeiros = restantes.slice(0, jaVistos);
  primeiros.forEach((n, i) => encaixar(criarCard(n, i), alturaEstimada(n)));
  mostrando = primeiros.length;
  $("fim").hidden = mostrando < restantes.length;
  requestAnimationFrame(verificarFim);
}

function esqueletos() {
  $("topo-destaque").replaceChildren(el("div", { class: "esqueleto", style: "height:360px" }));
  iniciarColunas();
  [380, 280, 440, 320, 260, 340, 300, 420, 260, 360].forEach((h) =>
    encaixar(el("div", { class: "esqueleto", style: `height:${h}px` }), h));
}

/* ---------- Busca ---------- */

function limparMural() {
  restantes = [];
  mostrando = 0;
  $("topo-destaque").replaceChildren();
  $("mural").replaceChildren();
  $("fim").hidden = true;
}

async function buscar(termo, { historico = true } = {}) {
  termo = termo.trim();
  termoAtual = termo;
  mostrando = 0;
  $("campo").value = termo;
  if (historico) history.pushState({}, "", termo ? `?q=${encodeURIComponent(termo)}` : location.pathname);
  document.title = termo ? `${termo} · Mural` : "Mural de Notícias";
  scrollTo(0, 0);

  $("boas-vindas").hidden = Boolean(termo);
  $("vazio").hidden = true;
  desenharTemas();
  if (!termo) {
    $("barra").hidden = true;
    limparMural();
    return;
  }

  const id = ++busca;
  $("barra").hidden = false;
  $("fim").hidden = true;
  $("resumo").textContent = `Buscando “${termo}”…`;
  esqueletos();

  try {
    const r = await fetch(`${API}/api/busca?q=${encodeURIComponent(termo)}`);
    const dados = await r.json();
    if (id !== busca) return;
    noticias = dados.noticias;
  } catch {
    if (id !== busca) return;
    noticias = [];
  }

  if (!noticias.length) {
    limparMural();
    $("barra").hidden = true;
    $("vazio").hidden = false;
    $("vazio").textContent = `Nada encontrado sobre “${termo}” nos últimos 7 dias. Tente outras palavras.`;
    return;
  }
  lembrarBusca(termo);
  desenharTemas();
  $("resumo").replaceChildren(el("strong", {}, termo), ` · últimos 7 dias`);
  render();
}

/* ---------- Eventos ---------- */

$("busca").addEventListener("submit", (e) => { e.preventDefault(); buscar($("campo").value); $("campo").blur(); });

document.querySelectorAll(".ordem button").forEach((b) => b.addEventListener("click", () => {
  ordem = b.dataset.ordem;
  document.querySelectorAll(".ordem button").forEach((x) => x.setAttribute("aria-selected", x === b));
  render();
}));

$("salvar").addEventListener("click", alternarTema);

$("sugestoes").append(...SUGESTOES.map((s) => {
  const b = el("button", { type: "button" }, s);
  b.onclick = () => buscar(s);
  return b;
}));

let colunasAtuais = 0;
window.addEventListener("resize", () => {
  if (noticias.length && termoAtual && numColunas() !== colunasAtuais) { colunasAtuais = numColunas(); render(); }
});

window.addEventListener("popstate", () => buscar(new URLSearchParams(location.search).get("q") || "", { historico: false }));

buscar(new URLSearchParams(location.search).get("q") || "", { historico: false });
colunasAtuais = numColunas();
