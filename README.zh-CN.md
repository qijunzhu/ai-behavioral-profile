# AI Behavioral Profile

[English](README.md) | [简体中文](README.zh-CN.md)

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23150529.svg)](https://doi.org/10.5281/zenodo.23150529)

**不止是工具，读懂你的 AI。**

**状态：**网站已于 2026 年 10 月 4 日上线：https://aibehavioralprofile.com 。分享经历与问题的表单已开放，投稿私下保存，不会显示在网站上。

## 这是什么

我们让 AI 帮忙工作、出主意，也和它聊日常生活。AI 正逐渐融入我们生活的方方面面。众多评测关注 AI 的能力，这个网站则关注分数之外的另一面：不同 AI 如何选择、分享、合作，又如何回应你的需求。

网站展示了我对 10 个 AI 模型的对照研究，共包括 6 类、30 项指标：分享与合作、对他人行为的反应、风险与等待、选择是否前后一致、AI 如何描述自己，以及与你交流时的表现。此外，我还单独检查了模型在换种问法后，结果是否仍然稳定。

每项指标都会展示一个平均结果和两层范围：换种问法后的范围，以及进一步检查后的范围，即进一步改变题目排版、选项呈现方式等之后得到的范围。

网站只展示已经保存的研究结果，不会在浏览器中重新计算，也不提供总分或模型排名。所有页面均提供中文和英文版本。

**“研究方法”**页面会逐项说明任务设计、输入规则、计分公式、算例和文献依据，方便读者追溯结果；如需按相同规则复算，欢迎通过邮件联系我获取相关材料。

## 仓库里有什么

| 路径 | 内容 |
|---|---|
| `build.py` | 生成程序：把内容和已保存的结果生成静态网站。 |
| `config.json` | 网站设置：显示哪个结果版本、联系邮箱、访客表单的开关，以及公式库文件的位置。 |
| `templates/`、`static/` | 页面模板、样式、浏览器端的交互，以及网站自带的字体和 KaTeX 公式库。 |
| `content/` | 中英文页面文字和研究方法正文。 |
| `data/releases/<版本>/` | 页面显示的结果（`results.json`）、回答格式汇总（`gr-format.json`），以及带校验值的版本记录（`RELEASE.json`）。 |
| `functions/api/ideas.js`、`receiver/ideas_schema.sql` | 访客表单的接收程序（Cloudflare Pages Function 加私有 D1 数据表），2026 年 10 月 4 日起启用。 |

## 生成网站

需要 Python 3.13，以及 `requirements.txt` 里的库：

```
pip install -r requirements.txt
python build.py --out dist
python -m http.server 8000 --directory dist
```

然后打开 http://localhost:8000/ 。生成时会把 `results.json` 与 `RELEASE.json` 中的校验值逐字节核对。

在 Cloudflare Pages 上：构建命令 `python build.py --out dist`，输出目录 `dist`，`PYTHON_VERSION` 设为 3.13；`functions/` 文件夹会和页面一起部署。

## 许可

代码和配置采用 MIT 许可，见 [LICENSE](LICENSE)。页面文字、研究方法正文、结果数据和这些说明文档采用 CC BY 4.0；第三方材料保留其原有条款，见 [LICENSE-docs.md](LICENSE-docs.md)。

## 引用

每个 release 都由 Zenodo 存档：上方徽章和下面引用里的 DOI 永远指向最新版本，每一版在 Zenodo 上也有自己的 DOI。引用具体结果时，还请注明模型、指标，以及网站上显示的结果版本。GitHub 页面上的“Cite this repository”按钮给出同一条引用的其他格式；它读取的是 [CITATION.cff](CITATION.cff)。

> Zhu, Qijun. 2026. AI Behavioral Profile. https://aibehavioralprofile.com/. https://doi.org/10.5281/zenodo.23150529

## 联系

完整的模型原始回答、研究记录和全部研究材料未存放在本仓库中。如需获取相关材料，请发送邮件至 zqj0966522453@gmail.com。也欢迎通过邮件反馈问题、提出建议或一起交流相关研究。
