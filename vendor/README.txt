BLM AI 离线依赖安装说明 (OpenAI 原生)
============================================

本目录包含 Linux x86_64 Python 3.11 的所有 wheel 包。

内网部署:
  将 vendor/ 拷贝到服务器，执行:
  pip install --no-index --find-links=. openai python-dotenv

依赖树 (18 个包):
  openai (2.41.0)          — OpenAI SDK
  python-dotenv (1.2.2)    — .env 加载
  ├─ httpx + httpcore + h11 + certifi + idna
  ├─ pydantic + pydantic-core + annotated-types + typing-inspection
  ├─ anyio + sniffio
  ├─ tqdm + colorama
  ├─ jiter + distro
  └─ typing-extensions

已移除: anthropic (OpenAI 原生化后不再需要)
