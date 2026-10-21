const $ = (id) => document.getElementById(id);
const SUGESTOES = ["Flamengo futebol", "Inteligência artificial", "Economia Brasil", "Fórmula 1", "Cinema", "Saúde", "Tecnologia", "Recife"];
const TONS = ["#f3e3d3", "#dfe9e1", "#e3e4f2", "#f2e0e4", "#e8e6d6", "#dbe8ee"];
const POR_PAGINA = 24;

let noticias = [];
let termoAtual = "";
let ordem = "relevancia";
let mostrando = POR_PAGINA;
let busca = 0; // descarta respostas de buscas antigas

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

function imagem(n, aoFalhar) {
  const img = el("img", { src: n.imagem, alt: "", loading: "lazy" });
  img.onerror = aoFalhar;
  return img;
}

// Notícia principal: grande, com foto, título e um resumo curto.
function criarDestaque(n) {
  const card = link(n, "destaque");
  card.append(
    el("div", { class: "destaque-img" }, imagem(n, () => card.classList.add("sem-img"))),
    el("div", { class: "destaque-texto" },
      el("span", { class: "selo" }, "Em destaque"),
      el("h2", {}, n.titulo),
      n.resumo ? el("p", {}, n.resumo) : null,
      meta(n),
    ),
  );
  return card;
}

// Demais notícias: só imagem, título e fonte.
function criarCard(n, i) {
  const card = link(n, "card");
  card.style.animationDelay = `${Math.min(i * 25, 350)}ms`;
  const virarTexto = () => {
    card.classList.add("texto");
    card.style.setProperty("--tom", tom(n));
    card.querySelector(".card-img")?.remove();
  };
  if (n.imagem) card.append(el("div", { class: "card-img" }, imagem(n, virarTexto)));
  card.append(el("h3", {}, n.titulo), meta(n));
  if (!n.imagem) virarTexto();
  return card;
}

function numColunas() {
  const w = $("mural").clientWidth;
  return w < 560 ? 1 : w < 900 ? 2 : w < 1250 ? 3 : 4;
}

// Distribui na coluna mais "baixa" usando uma altura estimada, mantendo a ordem de leitura.
function montar(elementos, alturas) {
  const n = numColunas();
  const colunas = Array.from({ length: n }, () => el("div", { class: "coluna" }));
  const soma = new Array(n).fill(0);
  elementos.forEach((e, i) => {
    const alvo = soma.indexOf(Math.min(...soma));
    colunas[alvo].append(e);
    soma[alvo] += alturas[i];
  });
  $("mural").replaceChildren(...colunas);
}

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
  const resto = lista.filter((n) => n !== principal).slice(0, mostrando);

  $("topo-destaque").replaceChildren(criarDestaque(principal));
  montar(resto.map(criarCard), resto.map((n) => (n.imagem ? 1 : 0.45 + n.titulo.length / 120)));
  $("mais").hidden = lista.length - 1 <= mostrando;
}

function esqueletos() {
  $("topo-destaque").replaceChildren(el("div", { class: "esqueleto", style: "height:360px" }));
  const alturas = Array.from({ length: 8 }, (_, i) => [300, 240, 280, 220][i % 4]);
  montar(alturas.map((h) => el("div", { class: "esqueleto", style: `height:${h}px` })), alturas);
}

async function buscar(termo, { historico = true } = {}) {
  termo = termo.trim();
  termoAtual = termo;
  mostrando = POR_PAGINA;
  $("campo").value = termo;
  if (historico) history.pushState({}, "", termo ? `?q=${encodeURIComponent(termo)}` : "/");
  document.title = termo ? `${termo} · Mural` : "Mural de Notícias";

  $("boas-vindas").hidden = Boolean(termo);
  $("vazio").hidden = true;
  $("mais").hidden = true;
  if (!termo) {
    $("barra").hidden = true;
    $("topo-destaque").replaceChildren();
    $("mural").replaceChildren();
    return;
  }

  const id = ++busca;
  $("barra").hidden = false;
  $("resumo").textContent = `Buscando “${termo}”…`;
  esqueletos();

  try {
    const r = await fetch(`/api/busca?q=${encodeURIComponent(termo)}`);
    const dados = await r.json();
    if (id !== busca) return;
    noticias = dados.noticias;
  } catch {
    if (id !== busca) return;
    noticias = [];
  }

  if (!noticias.length) {
    $("topo-destaque").replaceChildren();
    $("mural").replaceChildren();
    $("barra").hidden = true;
    $("vazio").hidden = false;
    $("vazio").textContent = `Nada encontrado sobre “${termo}” nos últimos 7 dias. Tente outras palavras.`;
    return;
  }
  $("resumo").replaceChildren(el("strong", {}, termo), ` · últimos 7 dias`);
  render();
}

// Eventos
$("busca").addEventListener("submit", (e) => { e.preventDefault(); buscar($("campo").value); $("campo").blur(); });

document.querySelectorAll(".ordem button").forEach((b) => b.addEventListener("click", () => {
  ordem = b.dataset.ordem;
  document.querySelectorAll(".ordem button").forEach((x) => x.setAttribute("aria-selected", x === b));
  render();
}));

$("mais").addEventListener("click", () => { mostrando += POR_PAGINA; render(); });

$("sugestoes").append(...SUGESTOES.map((s) => {
  const b = el("button", { type: "button" }, s);
  b.onclick = () => buscar(s);
  return b;
}));

let colunasAtuais = 0;
window.addEventListener("resize", () => {
  if (noticias.length && numColunas() !== colunasAtuais) { colunasAtuais = numColunas(); render(); }
});

window.addEventListener("popstate", () => buscar(new URLSearchParams(location.search).get("q") || "", { historico: false }));

buscar(new URLSearchParams(location.search).get("q") || "", { historico: false });
colunasAtuais = numColunas();
