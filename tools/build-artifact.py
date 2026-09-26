"""Prépare index.html pour une publication en artifact claude.ai.

L'hébergeur ajoute lui-même <!doctype>, <html>, <head> et <body> : on ne garde que
le titre, la feuille de style et le contenu du <body>. Les fichiers css/ et js/
sont publiés à côté, avec les mêmes chemins.

Usage : python3 tools/build-artifact.py <fichier de sortie>
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'index.html').read_text(encoding='utf-8')
title = re.search(r'<title>.*?</title>', src, re.S).group(0)
body = re.search(r'<body[^>]*>(.*)</body>', src, re.S).group(1)
out = pathlib.Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(f'{title}\n<link rel="stylesheet" href="css/style.css">\n{body.strip()}\n', encoding='utf-8')
print('Page écrite :', out)
