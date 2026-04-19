# AGENTS.md

本仓库为 LFA Reader 项目,围绕 FeLV/FIV 试纸图像识别提供后端、Web、iOS 三端。本文件指导所有 Codex 会话在本仓库内的行为。

## 项目结构

```
lfa-reader/
├── apps/
│   ├── backend/      FastAPI + SQLAlchemy + OpenCV,Python 3.12,在 AWS Linux 开发与运行
│   ├── web/          React 19 + Vite + Ant Design,在 AWS Linux 开发
│   └── ios/          SwiftUI,iOS 17+,Xcode 工程 apps/ios/LFAReader.xcodeproj,仅在 macOS 开发
├── shared/data/      跨端共享资源,web 通过 Vite alias @shared 引用
└── tasks/            本地任务跟踪,不入库
```

入口:后端 `apps/backend/app/main.py`,Web `apps/web/src/main.jsx`,iOS `apps/ios/LFAReader/LFAReaderApp.swift`。

## 开发环境

| 节点 | 持有代码 | 持有用户数据 |
|------|---------|------------|
| AWS Linux 服务器 | apps/backend, apps/web, shared/ 的运行副本 | uploads/, *.db, .env |
| 当前本机仓库(当前会话所在机器) | 全部代码,含 apps/backend, apps/web, apps/ios, shared/, tasks/ | 无 |
| Git 远程仓库 | 全部代码 | 不入库 |

约定:
- 当前会话默认在本机仓库工作;调整后端或 Web 代码时,必须先 SSH 到 AWS 主机 `/home/ubuntu/lfa-reader` 上修改。
- iOS 代码在本机仓库 `apps/ios/` 下开发与修改,不得在 AWS 主机上编辑 iOS 代码。
- 本机仓库与 Git 远程仓库共同构成所有代码的全量备份,不得把 AWS 主机视为唯一代码来源。
- 后端与 Web 在 AWS Linux 主机开发与运行,后端服务也在 AWS 主机上运行。
- 用户数据(uploads, SQLite 数据库,.env)无论来自 web 或 iOS 上传,均落在 AWS Linux 本机,不入库,不同步到 macOS。

## 数据安全(最高优先级)

在任何修改和操作情况下严格保护数据安全。本节优先级高于本文件其它所有条款,出现冲突以本节为准。

1. 用户数据范围:`uploads/` 下所有上传文件、所有 `*.db` SQLite 数据库及其 WAL/SHM、`.env` 及任何凭证文件、服务运行日志中可能包含的用户信息。
2. 破坏性操作(`rm`、`rm -rf`、`truncate`、`DROP`、`DELETE` 全表、迁移回滚、覆盖写入数据库或 `.env`、重置 uploads 目录等)执行前必须:
   - 2.1 列出具体目标路径或数据范围、预计影响的记录数;
   - 2.2 征得用户明确同意,不得以"默认安全"或"只是清理"为由省略确认;
   - 2.3 能备份的先备份。统一调用 `scripts/backup.sh manual`,产物落 `/home/ubuntu/backups/lfa-reader/manual/`,严禁绕过此脚本自己拼 `cp`。
3. 严禁把用户数据、数据库内容、`.env`、凭证、上传文件内容贴入对话、commit message、日志、issue、第三方服务或任何会离开本机的通道。
4. 调试时如需查看用户数据,只读取必要的最小字段,严禁全表导出或打印。
5. 数据库 schema 变更必须走迁移脚本,严禁直接在生产数据库上手改表结构;迁移前先 `scripts/backup.sh manual`,执行后确认快照可恢复。
6. 发现任何可能已造成数据损坏或泄露的操作,立即停下并如实告知用户,严禁隐瞒或自行尝试覆盖恢复。回退用 `scripts/restore.sh`,严禁手工 `cp` 覆盖。
7. 不确定某操作是否会影响用户数据时,默认视为会影响,按本节规则请求确认。
8. 自动备份机制:宿主机已装 systemd timer(hourly/daily/weekly),产物在 `/home/ubuntu/backups/lfa-reader/`。运维细节见 `scripts/README.md`。timer 与 unit 文件不在仓库内,机器重做时需重新装。

## 行为准则

1. 不基于猜测回答。信息不足时主动询问用户或联网查证。
2. 未经明确指示不替用户做决策。
   - 2.1 用户要求修改 A 时,严禁顺手改 B。
   - 2.2 多轮对话中用户已确认或未反对的内容必须逐字保留,不得自行精修。
   - 2.3 修 bug 若与原设计冲突,先与用户确认再改。
3. 引用案例与文献必须联网获取最新信息,严禁依赖陈旧知识库。
4. 需求确认协议
   - 4.1 需求未确认前严禁给方案。
   - 4.2 确认后分阶段推进,严禁一次性甩完整方案。
   - 4.3 用户未明确说"该部分确认"前不进入下一阶段。
5. 保持专业客观,严禁盲从与奉承。
6. 排版:严禁 emoji,避免破折号与括号;代码注释和文档不得提及 "Codex",不留 AI 撰写痕迹。
7. 关键代码必须有清晰注释,说明逻辑与目的。
8. 代码与对外文档(如 README)用英文,内部文档(AGENTS.md、tasks/、解释性文字)用中文。专有名词保留原语言。

## 工作流

### 计划与执行
- 3 步以上或涉及架构决策的任务先出计划,写入 `tasks/todo.md`,使用复选框格式。
- 用户确认前严禁执行;执行偏离计划立即停下重做计划。
- 新任务开始前,把上一份 `tasks/todo.md` 重命名为 `tasks/todo-YYYYMMDD-<task-slug>.md` 归档。

### 完成验证
- 通过运行检查、查看日志、演示功能证明可用,再标记完成。
- 自问:资深工程师是否会签字通过?
- 重大更改完成后,检查 `README.md` 是否需要同步(项目结构、启动命令、依赖、对外接口等);如需则一并更新再提交。

### 改动哲学
- 简单优先:每次改动尽可能小,只触动必要部分。
- 不糊弄:找根因,严禁临时绕过和 hack。简单明显的修复不必过度设计。
- 用户每次纠正后,把模式与预防规则追加到 `tasks/lessons.md`(本地保存,不入库,不存在则创建);会话开始若文件存在则先阅读。

## 开发约定

### 服务重启
修改后端 Python 代码(router、service、model 等)后立即重启后端;修改前端代码后重启前端 dev server(若运行中)。在 AWS 主机 `/home/ubuntu/lfa-reader` 仓库根目录执行:

- 后端:`kill $(pgrep -f "uvicorn app.main:app") 2>/dev/null; cd apps/backend && nohup venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 > uvicorn.log 2>&1 & disown`
- 前端:`kill $(pgrep -f "vite") 2>/dev/null; cd apps/web && nohup npm run dev > vite.log 2>&1 & disown`
- 查进程:`ps aux | grep -E "uvicorn|vite" | grep -v grep`

### iOS 端
- iOS 代码在本机会话的本地仓库 `apps/ios/` 下修改,不在 AWS 主机上编辑。
- 用户提出的 iOS 改动需求时,Swift 源码、资源文件与普通配置优先在本机仓库完成;涉及 Xcode GUI 的工程项调整时,在本机 Xcode 中完成并回写到本机仓库。
- 严禁手工编辑 `apps/ios/LFAReader.xcodeproj/project.pbxproj` 的资源引用、Build Phase、Target 配置;此类改动必须在 Xcode GUI 完成。

### Git 提交
- 完成主要功能后立即 `git add` 并 `git commit`,commit message 由 Codex 撰写,简洁聚焦"为什么"。
- **严禁自己执行 `git push` / `git push --force`**。推送到远程一律由用户亲自完成。
- 提交前确认 `.gitignore` 已排除敏感文件:数据库、.env、上传目录、凭证。
