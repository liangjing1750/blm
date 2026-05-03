#!/bin/bash

# 配置区域
SCRIPT_NAME="blm.py"
LOG_FILE="blm.log"
PID_FILE="blm.pid"
PYTHON_CMD="python3" # 建议指定 python3，如果环境只有 python 请改为 python

# 获取脚本当前所在目录，确保路径正确
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 函数：检查进程是否正在运行
is_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# 函数：启动服务
start_service() {
    if is_running; then
        echo "❌ 服务已经在运行中 (PID: $(cat $PID_FILE))"
        return 1
    fi

    echo "🚀 正在启动服务..."
    
    # 使用 nohup 启动，重定向输出到日志文件，并后台运行 &
    nohup $PYTHON_CMD $SCRIPT_NAME > $LOG_FILE 2>&1 &
    
    # 获取后台进程的 PID 并保存
    PID=$!
    echo $PID > $PID_FILE
    
    echo "✅ 服务启动成功！"
    echo "   PID: $PID"
    echo "   日志文件: $SCRIPT_DIR/$LOG_FILE"
}

# 函数：停止服务
stop_service() {
    if ! is_running; then
        echo "⚠️ 服务当前未运行。"
        return 0
    fi

    PID=$(cat "$PID_FILE")
    echo "🛑 正在停止服务 (PID: $PID)..."
    
    # 发送 SIGTERM 信号优雅停止
    kill $PID 2>/dev/null
    
    # 等待几秒看是否停止，如果没停止则强制杀死
    sleep 2
    if kill -0 $PID 2>/dev/null; then
        echo "⚠️ 进程未正常退出，强制杀死..."
        kill -9 $PID
    fi

    # 清理 PID 文件
    rm -f "$PID_FILE"
    echo "✅ 服务已停止。"
}

# 函数：查看状态
status_service() {
    if is_running; then
        echo "✅ 服务正在运行 (PID: $(cat $PID_FILE))"
        echo "   最新日志:"
        tail -n 5 $LOG_FILE
    else
        echo "❌ 服务未运行"
        if [ -f "$PID_FILE" ]; then
            echo "   检测到残留的 PID 文件，正在清理..."
            rm -f "$PID_FILE"
        fi
    fi
}

# 主逻辑：根据参数执行
case "$1" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        stop_service
        sleep 2
        start_service
        ;;
    status)
        status_service
        ;;
    logs)
        if [ -f "$LOG_FILE" ]; then
            echo "查看日志 (按 Ctrl+C 退出):"
            tail -f $LOG_FILE
        else
            echo "日志文件不存在"
        fi
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs}"
        echo "示例:"
        echo "  $0 start   - 启动服务"
        echo "  $0 stop    - 停止服务"
        echo "  $0 restart - 重启服务"
        echo "  $0 status  - 查看状态"
        echo "  $0 logs    - 实时查看日志"
        exit 1
        ;;
esac
