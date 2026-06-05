# GCS Windows 快速安装

## 3 步启动

### 第 1 步：安装

首次只需要执行一次：

```text
双击：windows/GCS-智能安装.bat
等待：安装完成（通常 1-3 分钟）
```

安装器会自动完成这些事情：

- 自动检查并修复 Python
- 自动修复或重建 `.venv`
- 自动安装 `requirements.txt` 里的依赖
- 自动创建桌面、开始菜单、开机预热快捷方式
- 自动写安装日志到 `windows/logs/`

### 第 2 步：启动

```text
双击：桌面 GCS 图标
或：windows/GCS.cmd
```

### 第 3 步：使用

```text
浏览器会自动打开 GCS Web 界面
```

## 系统要求

- Windows 10 / 11
- 首次安装需要联网
- 建议至少 1 GB 可用磁盘空间

## 常见问题

**Q: 安装器一闪而过怎么办？**  
A: 现在安装日志会写到 `windows/logs/`，把最新日志发出来即可定位。

**Q: 安装很慢？**  
A: 首次可能需要下载官方 Python 和安装依赖，速度取决于网络。

**Q: 出现 Python / 依赖错误？**  
A: 重新运行 `windows/GCS-智能安装.bat`。安装器会自动修复 Python、`.venv` 和依赖。

## 相关文档

- [`docs/WINDOWS-INSTALL-DETAILED.md`](../docs/WINDOWS-INSTALL-DETAILED.md)
- [`docs/FILE-CALL-FLOW.md`](../docs/FILE-CALL-FLOW.md)
- [`docs/INSTALLATION-IMPROVEMENTS.md`](../docs/INSTALLATION-IMPROVEMENTS.md)
- [`README.md`](../README.md)
