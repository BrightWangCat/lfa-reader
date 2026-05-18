# Local-First AWS Deployment Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the internal repository workflow so backend and web development are documented as local-first, with AWS used only for SSH-based deployment and verification.

**Architecture:** This is a documentation-only change. `AGENTS.md` remains the single internal source of truth for development and deployment workflow, while public documentation and operational scripts stay unchanged.

**Tech Stack:** Markdown, Git

---

### Task 1: Update the Internal Workflow Documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Capture the current outdated statements**

Run:

```bash
rg -n '在 AWS Linux 开发|VS Code Remote SSH|AWS 不参与 iOS|普通 SSH' AGENTS.md
```

Expected:

- The command finds the outdated `backend` and `web` lines that still say they are developed on AWS.
- The command does not yet find the new `普通 SSH` or `AWS 不参与 iOS` wording.

- [ ] **Step 2: Update the relevant workflow sections**

Edit `AGENTS.md` so it states:

```markdown
│   ├── backend/      FastAPI + SQLAlchemy + OpenCV,Python 3.12,在本机开发,在 AWS Linux 运行
│   ├── web/          React 19 + Vite + Ant Design,在本机开发,在 AWS Linux 部署
```

Add or revise workflow bullets so they explicitly state:

```markdown
- 由于当前无法使用 VS Code Remote SSH,backend 与 web 的代码修改、测试准备和 Git 提交默认都在本机仓库完成。
- 需要测试 Web 或 backend 的 AWS 环境时,先由用户把本机代码推送到 Git 远程仓库,再通过普通 SSH 到 AWS 主机 `/home/ubuntu/lfa-reader` 执行 `git pull`、构建、重启服务并验证。
- iOS 代码在本机仓库 `apps/ios/` 下开发与修改,随 Git 一同同步,但 AWS 主机不参与 iOS 的开发、构建或验证。
```

Revise the validation and deployment wording so it keeps the same meaning:

```markdown
- 涉及 Web 或 backend 的联调与环境测试时,默认先在本机完成代码修改,再在用户完成 `git push` 后通过普通 SSH 到 AWS 主机 `git pull` 并重启相关服务验证。
```

```markdown
本机修改代码后,需要在 AWS 环境验证 Web 或 backend 时,先确认用户已把最新代码推送到 Git 远程仓库,再通过普通 SSH 到 AWS 主机 `/home/ubuntu/lfa-reader` 拉取并重启服务。
```

- [ ] **Step 3: Verify that the outdated wording is gone**

Run:

```bash
rg -n '在 AWS Linux 开发|backend 与 web 的代码修改、测试准备和 Git 提交默认都在本机仓库完成|通过普通 SSH|AWS 主机不参与 iOS' AGENTS.md
```

Expected:

- No match remains for `在 AWS Linux 开发`.
- New local-first and SSH-based workflow statements are present.

- [ ] **Step 4: Check Markdown formatting**

Run:

```bash
git diff --check
```

Expected:

- Exit code `0`
- No whitespace errors

- [ ] **Step 5: Commit the documentation update**

```bash
git add AGENTS.md
git commit -m "docs: clarify local-first deployment workflow"
```

### Task 2: Verify the Final Documentation State

**Files:**
- Verify: `AGENTS.md`
- Verify: `README.md`
- Verify: `scripts/README.md`

- [ ] **Step 1: Re-read the affected workflow sections**

Run:

```bash
sed -n '1,220p' AGENTS.md
```

Expected:

- Project structure, development environment, completion verification, and service restart sections all describe the same local-first workflow.

- [ ] **Step 2: Confirm no public-doc spillover is required**

Run:

```bash
rg -n 'AWS|deploy|deployment|SSH' README.md scripts/README.md
```

Expected:

- `README.md` remains focused on public-facing usage and does not need internal workflow additions.
- `scripts/README.md` still documents AWS backup and restore operations accurately without needing changes.

- [ ] **Step 3: Review the final diff**

Run:

```bash
git diff HEAD~1 -- AGENTS.md
```

Expected:

- Only the approved workflow wording changed.
- No unrelated sections were edited.

