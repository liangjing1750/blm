# Linux Python 3.11 离线依赖

适用环境：

- Linux x86_64
- Python 3.11.x

安装命令：

```bash
PYTHON_VERSION=py311 bash vendor/install-offline-linux.sh
```

或手动执行：

```bash
python3.11 -m pip install --no-index --find-links vendor/linux-py311 -r vendor/requirements-runtime.txt
```

这是历史兼容目录。当前内网部署优先使用 `vendor/linux-py312/`。
