"""Servidor do Mural de Notícias.

Serve o front-end em ./docs e expõe /api/busca?q=..., que junta notícias
do Bing Notícias e do Google Notícias (RSS) dos últimos dias.
Só usa a biblioteca padrão do Python: rode com `python server.py`.
"""

import json
import os
import re
import html
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, quote_plus
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

PORTA = int(os.environ.get("PORT", 8765))
DIAS = 7
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
PASTA_STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")


def baixar(url):
    with urlopen(Request(url, headers={"User-Agent": UA}), timeout=10) as r:
        return r.read()


def limpar(texto):
    texto = html.unescape(re.sub(r"<[^>]+>", " ", texto or ""))
    return re.sub(r"\s+", " ", texto).strip()


def data_iso(texto):
    try:
        return parsedate_to_datetime(texto).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def bing(termo, inicio):
    url = (
        "https://www.bing.com/news/search?format=rss&setlang=pt-br&cc=BR"
        f"&qft=interval%3d%227%22&first={inicio}&q={quote_plus(termo)}"
    )
    raiz = ET.fromstring(baixar(url))
    ns = {"News": raiz.tag[1:].split("}")[0]} if raiz.tag.startswith("{") else {}
    itens = []
    for item in raiz.iter("item"):
        link = item.findtext("link") or ""
        destino = parse_qs(urlparse(link).query).get("url", [link])[0]
        imagem = None
        for filho in item:
            nome = filho.tag.split("}")[-1]
            if nome == "Image" and filho.text:
                imagem = filho.text.replace("http://", "https://", 1)
        fonte = next((f.text for f in item if f.tag.split("}")[-1] == "Source"), None)
        itens.append({
            "titulo": limpar(item.findtext("title")),
            "resumo": limpar(item.findtext("description")),
            "url": destino,
            "fonte": fonte or urlparse(destino).netloc.replace("www.", ""),
            "imagem": imagem,
            "data": data_iso(item.findtext("pubDate")),
        })
    return itens


def google(termo):
    url = (
        f"https://news.google.com/rss/search?q={quote_plus(termo + f' when:{DIAS}d')}"
        "&hl=pt-BR&gl=BR&ceid=BR:pt-419"
    )
    raiz = ET.fromstring(baixar(url))
    itens = []
    for item in raiz.iter("item"):
        titulo = limpar(item.findtext("title"))
        fonte = item.findtext("source") or ""
        if fonte and titulo.endswith(" - " + fonte):
            titulo = titulo[: -len(fonte) - 3]
        itens.append({
            "titulo": titulo,
            "resumo": "",
            "url": item.findtext("link") or "",
            "fonte": fonte,
            "imagem": None,
            "data": data_iso(item.findtext("pubDate")),
        })
    return itens


def chave(titulo):
    return re.sub(r"[^a-z0-9]", "", titulo.lower())[:60]


def buscar(termo):
    tarefas = [lambda: bing(termo, 1), lambda: bing(termo, 11), lambda: bing(termo, 21), lambda: google(termo)]
    with ThreadPoolExecutor(len(tarefas)) as ex:
        futuros = [ex.submit(t) for t in tarefas]
        listas = []
        for f in futuros:
            try:
                listas.append(f.result())
            except Exception as erro:  # uma fonte fora do ar não derruba a busca
                print("fonte falhou:", erro)
                listas.append([])

    # Bing primeiro (traz imagem e já vem por relevância); Google completa.
    *paginas_bing, lista_google = listas
    limite = datetime.now(timezone.utc) - timedelta(days=DIAS)
    vistos, resultado = set(), []
    for pos, item in enumerate([i for p in paginas_bing for i in p] + lista_google[:40]):
        k = chave(item["titulo"])
        if not item["titulo"] or k in vistos or (item["data"] and item["data"] < limite):
            continue
        vistos.add(k)
        item["relevancia"] = pos
        item["data"] = item["data"].isoformat() if item["data"] else None
        resultado.append(item)
    return resultado


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PASTA_STATIC, **kwargs)

    def do_GET(self):
        partes = urlparse(self.path)
        if partes.path != "/api/busca":
            return super().do_GET()
        termo = parse_qs(partes.query).get("q", [""])[0].strip()
        corpo = json.dumps({"termo": termo, "noticias": buscar(termo) if termo else []}, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)


if __name__ == "__main__":
    print(f"Mural de Notícias em http://localhost:{PORTA}")
    ThreadingHTTPServer(("", PORTA), Handler).serve_forever()
