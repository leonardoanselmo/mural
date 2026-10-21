// Cloudflare Worker do Mural: GET /api/busca?q=... devolve as notícias dos
// últimos 7 dias juntando Bing Notícias e Google Notícias (RSS).
// É a mesma lógica do server.py, para o site no GitHub Pages poder buscar.

const DIAS = 7;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const ORIGENS = [/^https:\/\/leonardoanselmo\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function desescapar(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (todo, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTIDADES[e.toLowerCase()] ?? todo;
  });
}

function limpar(texto) {
  return desescapar((texto || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function campo(item, tag) {
  const m = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
}

function itens(xml) {
  return xml.match(/<item>[\s\S]*?<\/item>/g) || [];
}

function data(texto) {
  const d = new Date(texto);
  return isNaN(d) ? null : d;
}

function semWww(host) {
  return host.replace(/^www\./, "");
}

function lerBing(xml) {
  return itens(xml).map((item) => {
    const link = desescapar(campo(item, "link"));
    let destino = link;
    try { destino = new URL(link).searchParams.get("url") || link; } catch {}
    const imagem = desescapar(campo(item, "News:Image"));
    let fonte = limpar(campo(item, "News:Source"));
    if (!fonte) try { fonte = semWww(new URL(destino).hostname); } catch {}
    return {
      titulo: limpar(campo(item, "title")),
      resumo: limpar(campo(item, "description")),
      url: destino,
      fonte,
      imagem: imagem ? imagem.replace("http://", "https://") : null,
      data: data(campo(item, "pubDate")),
    };
  });
}

function lerGoogle(xml) {
  return itens(xml).map((item) => {
    let titulo = limpar(campo(item, "title"));
    const fonte = limpar(campo(item, "source"));
    if (fonte && titulo.endsWith(" - " + fonte)) titulo = titulo.slice(0, -(fonte.length + 3));
    return {
      titulo,
      resumo: "",
      url: desescapar(campo(item, "link")),
      fonte,
      imagem: null,
      data: data(campo(item, "pubDate")),
    };
  });
}

async function baixar(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  return r.text();
}

function bing(termo, inicio) {
  const url = "https://www.bing.com/news/search?format=rss&setlang=pt-br&cc=BR"
    + `&qft=interval%3d%227%22&first=${inicio}&q=${encodeURIComponent(termo)}`;
  return baixar(url).then(lerBing);
}

function google(termo) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${termo} when:${DIAS}d`)}`
    + "&hl=pt-BR&gl=BR&ceid=BR:pt-419";
  return baixar(url).then(lerGoogle);
}

function chave(titulo) {
  return titulo.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
}

async function buscar(termo) {
  // Uma fonte fora do ar não derruba a busca.
  const listas = await Promise.all(
    [bing(termo, 1), bing(termo, 11), bing(termo, 21), google(termo)].map((p) => p.catch(() => [])),
  );
  const lista_google = listas.pop();

  // Bing primeiro (traz imagem e já vem por relevância); Google completa.
  const limite = Date.now() - DIAS * 864e5;
  const vistos = new Set();
  const resultado = [];
  [...listas.flat(), ...lista_google.slice(0, 40)].forEach((item, pos) => {
    const k = chave(item.titulo);
    if (!item.titulo || vistos.has(k) || (item.data && item.data < limite)) return;
    vistos.add(k);
    resultado.push({ ...item, relevancia: pos, data: item.data ? item.data.toISOString() : null });
  });
  return resultado;
}

function cabecalhosCors(origem) {
  const permitida = ORIGENS.some((r) => r.test(origem || ""));
  return permitida ? { "Access-Control-Allow-Origin": origem, Vary: "Origin" } : {};
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cors = cabecalhosCors(request.headers.get("Origin"));
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (url.pathname !== "/api/busca") return new Response("Mural: use /api/busca?q=termo", { status: 404, headers: cors });

    const termo = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const noticias = termo ? await buscar(termo) : [];
    return new Response(JSON.stringify({ termo, noticias }), {
      headers: {
        ...cors,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  },

  // Exposto só para os testes locais do leitor de RSS.
  _testes: { lerBing, lerGoogle },
};
