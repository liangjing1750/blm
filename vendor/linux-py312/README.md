# Linux Python 3.12 离线依赖

适用环境：

- Linux x86_64
- Python 3.12.x，当前按内网 Python 3.12.1 准备

安装命令：

```bash
bash vendor/install-offline-linux.sh
```

或手动执行：

```bash
python3 -m pip install --no-index --find-links vendor/linux-py312 -r vendor/requirements-runtime.txt
```

如服务器上 `python3` 不是 3.12，可指定：

```bash
PYTHON_BIN=/path/to/python3.12 bash vendor/install-offline-linux.sh
```
