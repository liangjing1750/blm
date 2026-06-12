# BLM Linux 离线运行依赖

本目录存放离线安装脚本、运行依赖清单和不同 Python 版本的 wheel 包，用于内网部署。

目录约定：

- `requirements-runtime.txt`：运行依赖清单。
- `install-offline-linux.sh`：Linux 内网一键安装脚本。
- `linux-py312/`：Linux x86_64 / Python 3.12.x，按内网 Python 3.12.1 准备。
- `linux-py311/`：Linux x86_64 / Python 3.11.x，历史兼容包。

安装命令：

```bash
bash vendor/install-offline-linux.sh
```

脚本会执行：

```bash
python3 -m pip install --no-index --find-links vendor/linux-py312 -r vendor/requirements-runtime.txt
```

如果需要安装 Python 3.11 包：

```bash
PYTHON_VERSION=py311 bash vendor/install-offline-linux.sh
```

如服务器上 `python3` 不是目标版本，可指定：

```bash
PYTHON_BIN=/path/to/python3.12 bash vendor/install-offline-linux.sh
```

当前运行依赖：

- `openai`
- `python-dotenv`
- `PyYAML`

注意：`pydantic_core`、`jiter`、`PyYAML` 这类带 ABI 的 wheel 和 Python 版本相关。不要混放到同一个目录；新增版本时按 `linux-py313/` 这样的目录单独管理。
