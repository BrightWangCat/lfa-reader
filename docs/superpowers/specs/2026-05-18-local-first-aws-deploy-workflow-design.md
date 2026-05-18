# 本地优先与 AWS 部署工作流调整设计

## 背景

由于当前无法使用 VS Code Remote SSH 访问 AWS，但仍可通过普通 SSH 执行命令，后续需要把 backend 和 web 的开发工作明确收敛到本机仓库完成，再通过 Git 同步到 AWS 进行部署与验证。iOS 工作流保持不变，仍完全在本机开发，并通过同一个 Git 仓库同步代码；AWS 不参与 iOS 开发或验证。

## 目标

1. 让仓库内部说明准确反映当前可执行的工作流。
2. 消除“backend 和 web 在 AWS 开发”与“本机修改后再同步到 AWS”之间的文档冲突。
3. 保持现有 Git 仓库结构、部署命令和备份策略不变。

## 非目标

1. 不调整 AWS 端的 checkout 方式。
2. 不引入 sparse checkout、独立 deploy repo 或新的发布脚本。
3. 不修改公开 `README.md`，避免把内部部署细节重新放回对外文档。

## 方案

采用最小文档改动方案，只修改内部 `AGENTS.md`：

1. 在项目结构中把 backend 和 web 的描述改为“本机开发，在 AWS Linux 运行或部署”。
2. 在开发环境约定中明确：
   - 当前会话中的代码开发默认全部在本机仓库完成。
   - backend 和 web 需要上线或环境验证时，先由用户完成 `git push`，再通过普通 SSH 在 AWS 端执行 `git pull`、build、restart 和 verification。
   - iOS 仍只在本机开发，虽然代码随 Git 同步，但 AWS 端不参与 iOS 开发、构建或验证。
3. 在完成验证与服务重启章节中补足“本机先完成修改，再 SSH 到 AWS 部署验证”的语义。

## 影响面

仅涉及内部工作流文档：

- `AGENTS.md`

不涉及：

- 应用源码
- `scripts/*.sh`
- 公开 `README.md`
- 数据库、上传文件或 `.env`

## 验证

1. 检查 `AGENTS.md` 中是否还残留“backend/web 在 AWS 开发”这类过期表述。
2. 通读 `AGENTS.md` 的项目结构、开发环境、完成验证、服务重启四个章节，确认语义一致。
3. 运行 `git diff --check`，确认文档修改没有格式错误。

## 风险与边界

1. 这次调整只改变文档表达，不改变实际部署脚本和 AWS 主机行为。
2. AWS 仍会通过普通 `git pull` 获得完整仓库副本，其中包含 iOS 目录；“AWS 不需要下载 iOS”在本设计中表示 AWS 不参与 iOS 开发和验证，而不是修改 Git checkout 内容。
