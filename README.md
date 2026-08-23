# Bilin / Aside 发行仓库

本仓库是 [比邻·Aside](https://github.com/forrany/Aider)（私有）的公开发布渠道：
桌面安装包与自动更新源均由 CI 在本仓库发布。

## 下载

到 [Releases](https://github.com/forrany/bilin-releases/releases) 页面下载：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `*_aarch64.dmg` |
| macOS (Intel) | `*_x64.dmg` |
| Windows | `*_x64-setup.exe` |
| Linux | `*.deb` / `*.rpm` |

安装前可对照 release 说明里的 SHA-256 校验和。

## 自动更新

应用内置更新检查（启动后约 5 秒一次，之后每 4 小时），更新源：

- Aside：`releases/latest/download/latest-aside.json`
- Bilin：`releases/latest/download/latest-bilin.json`

只有**已 Publish**（非 draft）的 release 对外可见；draft 阶段用户不会收到更新。

## 运维注意事项

- 同一个 tag 不能重发：先删除旧 release 与 tag 再重新触发；
- `SOURCE_REPO_PAT` 为 fine-grained PAT（最长一年有效期），到期需续期；
- 私有仓库打 tag 会自动触发构建；也可在本仓库 Actions 页手动 dispatch。
