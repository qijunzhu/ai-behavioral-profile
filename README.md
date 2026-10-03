# AI Behavioral Profile

[English](README.md) | [简体中文](README.zh-CN.md)

**More than a tool. Know your AI.**

**Status:** first release in preparation. The site has been reviewed locally; it is not yet online, and the form for sharing experiences and questions is not open yet.

## What this is

We turn to AI for help with work, advice, and everyday conversation. AI is becoming part of more and more of our lives. While many benchmarks focus on AI’s capabilities, this site looks beyond those scores: how do different AIs make choices, share, cooperate, and respond to your needs?

The site presents my comparison of eight AI models on 30 measures in six categories: Sharing and cooperation, Responding to others, Risk and waiting, How choices fit together, How it describes itself, and What conversation feels like. Separately, I also check whether the results stay stable when the question is asked differently.

Each measure shows an average and two ranges: one from asking the question differently, and one after further checks, that is, after further changes to details such as the layout of the question or how the options are presented.

The site shows saved research results only: nothing is recalculated in the browser, and there is no overall score or ranking of models. Every page is available in English and Chinese.

The **Methods** page explains, for each measure, the task design, the input rules, the scoring formula, a worked example and the sources, so that readers can trace the results; to recompute them with the same rules, you are welcome to e-mail me for the materials.

## What is in this repository

| Path | Contents |
|---|---|
| `build.py` | The generator: turns the content and the saved results into the static site. |
| `config.json` | Site settings: the results release shown, the contact address, the visitor-form switches, and where the formula library is. |
| `templates/`, `static/` | Page templates, styles, the in-browser behaviour, and the site's own copies of its fonts and of the KaTeX formula library. |
| `content/` | Page text and the Methods text in both languages. |
| `data/releases/<release>/` | The results the pages display (`results.json`), the answer-format summary (`gr-format.json`) and the release record with checksums (`RELEASE.json`). |
| `functions/api/ideas.js`, `receiver/ideas_schema.sql` | The receiver for the visitor form (a Cloudflare Pages Function with a private D1 table). It is not in use yet. |

## Building the site

Python 3.13 with the packages in `requirements.txt`:

```
pip install -r requirements.txt
python build.py --out dist
python -m http.server 8000 --directory dist
```

Then open http://localhost:8000/. The build checks `results.json` byte for byte against the checksum in `RELEASE.json`.

On Cloudflare Pages: build command `python build.py --out dist`, output directory `dist`, and `PYTHON_VERSION` set to 3.13. The `functions/` folder is deployed with the pages.

## License

The code and configuration are under the MIT License; see [LICENSE](LICENSE). The page text, the Methods text, the results data and this documentation are under CC BY 4.0, except third-party material that keeps its own terms; see [LICENSE-docs.md](LICENSE-docs.md).

## Citation

See [CITATION.cff](CITATION.cff). Each archived release will have its own DOI; when citing a specific result, please give the model, the measure and the results version shown on the site.

## Contact

Raw model responses, research records and the full research materials are not stored in this repository. To request them, please e-mail zqj0966522453@gmail.com. Feedback, suggestions and research conversations are also welcome by e-mail.
