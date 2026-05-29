# 参数说明（d 字段）AI 翻译 使用与维护指南

> 本文档面向 GCS 开发者/维护者，说明如何正确使用、验证、回滚本次 AI 翻译的参数长描述（d 字段）。

## 1. 这是什么？

- 本项目对 ArduPilot 参数数据库中的 **长描述字段（`d`）** 进行了 AI 精翻。
- 翻译仅针对 `d`（说明）字段，不影响短显示名 `n` 和其他元数据（如 `grp`、`grpBySrc`）。
- 使用 DeepSeek `deepseek-v4-flash` 模型 + 项目术语表（glossary）+ 强 Prompt 完成。
- 翻译过程支持两种模式：
  - **Review 模式**（推荐用于质量把控）：先生成 review JSON 文件，人工确认后再合并。
  - **直接模式**：跳过人工，直接写入数据库（本次全量运行采用此模式）。

## 2. 重要备份位置（翻译前）

本次全量翻译前已创建以下备份（时间戳示例：20260529-0103）：

| 文件 | 位置 | 说明 |
|------|------|------|
| 完整数据库备份 | `JS/data/backups/apm-param-db.full-before-ai-20260529-010349.json` | 翻译前完整 `apm-param-db.json` |
| 纯说明备份（推荐用于对比） | `JS/data/backups/说明-d-当前状态备份-20260529-010352.json` | 只包含 6616 个参数的英文 `d` 原文 |
| AI 缓存备份 | `JS/data/backups/apm-param-translate-cache.ai-before-ai-*.json` | 翻译前的 AI 缓存状态 |

**强烈建议**：任何时候想对比翻译前后效果，都用 `说明-d-当前状态备份-*.json` 这个文件最方便。

## 3. 翻译结果存放在哪里？

翻译完成后，数据会直接写入：

- `JS/data/apm-param-db.json`（GCS 实际使用的参数数据库）
- `JS/data/apm-param-translate-cache.ai.json`（AI 翻译缓存，避免重复调用）

运行脚本时会自动创建备份：
`JS/data/apm-param-db.pre-ai-backup.json`

## 4. 如何在 GCS 中查看/验证翻译效果？

1. 硬刷新浏览器（Windows: `Ctrl + Shift + R`，Mac: `Cmd + Shift + R`）
2. 打开 **配置调试** 标签页
3. 左侧参数树中选择任意分组
4. 右侧表格查看 **说明** 列
5. 点击参数行可展开完整描述

推荐重点检查：
- 安全相关参数（FS_*、ARMING_*、RTL_*、BATT_*）
- 位掩码参数的位定义说明
- 取值列表的翻译

## 5. 如何恢复到翻译前的状态？（回滚）

### 最快回滚（推荐）

```bash
# 恢复完整数据库（包含所有字段和 grp）
cp JS/data/backups/apm-param-db.full-before-ai-20260529-010349.json JS/data/apm-param-db.json
```

### 只回滚说明（d 字段）

如果只想把 `d` 字段恢复成英文原文，其他保持最新，可以使用下面的 Python 脚本（需要时再运行）：

```python
# 脚本位置建议：tools/rollback_d_translations.py
# 内容示例（未来需要时我可以提供完整脚本）
```

## 6. 如何继续或恢复未完成的翻译？

翻译脚本支持**断点续传**：

```bash
# 只要用同样的命令再次执行，它会自动跳过已翻译并缓存的条目
python3 translate_params_ai.py \
  --api-key-env DEEPSEEK_API_KEY \
  --provider deepseek \
  --model deepseek-v4-flash \
  --fields d
```

## 7. 推荐的日常维护流程

### 以后新增参数或官方更新说明时：

1. 先运行 `python tools/fetch_apm_param_db.py` 获取最新英文数据
2. 再运行翻译脚本（会自动只翻译新增的未缓存说明）
3. 建议使用 Review 模式先小批量检查质量：
   ```bash
   python3 translate_params_ai.py --review --limit 100 --provider deepseek ...
   ```
4. Review 完成后使用 apply 工具合并。

### 想人工干预某一批翻译：

- 使用 `--review` 模式生成 `tools/translation-review/translations.review.*.json`
- 编辑 `proposed` 字段或修改 `status`
- 运行 `python tools/apply-reviewed-translations.py <review文件路径>`

## 8. 注意事项

- **不要手动编辑** `apm-param-db.json` 中的 `d` 字段，建议都通过脚本走缓存。
- DeepSeek / OpenAI / xAI 的 key 建议分别使用独立环境变量（`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`XAI_API_KEY`）。
- 翻译质量主要由以下因素决定：
  - 术语表 `tools/glossary-param-translation.json`
  - Prompt 模板（脚本内置）
  - 模型选择
- 建议定期把 `JS/data/backups/` 下的备份提交到 git（或至少保留最近 3 次）。

## 9. 相关文件速查

- 翻译脚本：`translate_params_ai.py`
- Review 模式生成的文件目录：`tools/translation-review/`
- 应用 review 结果的工具：`tools/apply-reviewed-translations.py`
- 术语表：`tools/glossary-param-translation.json`
- 英文工作流文档（英文）：`docs/parameter-translation-workflow.md`
- 本指南（中文）：`docs/参数说明-AI翻译-使用与维护指南.md`

---

**最后更新**：2026-05-29  
**维护者**：chenlu210cl

如有疑问或需要回滚/对比脚本，随时联系。