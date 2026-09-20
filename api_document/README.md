# Mfuns API 文档（客户端逆向）

本目录仅收录 **官方社区 API**（`https://api.mfuns.net`）。内容由 `local/Mfuns_Flutter-main` 中对该主机的调用扫描整理，并非官方 OpenAPI；若与线上行为不一致，以服务端为准。

| 文件 | 说明 |
|------|------|
| [COMPLETENESS.md](./COMPLETENESS.md) | **接口/返回值是否扫全**（相对 Flutter 客户端） |
| [overview.md](./overview.md) | 主机、鉴权、响应信封、资源类型、CDN |
| [community-api.md](./community-api.md) | 路径、方法、请求参数 |
| [endpoint-responses.md](./endpoint-responses.md) | **每个接口的 `data` 形态与解析器** |
| [response-schemas.md](./response-schemas.md) | **模型字段与 JSON 别名全集** |
| [video-upload.md](./video-upload.md) | 视频投稿：VOD 凭证 + OSS PUT 流程 |
| [endpoints.json](./endpoints.json) | 端点清单（机器可读） |

**扫描来源（主要）：**

- `lib/core/network/mfuns_api_client.dart`
- `lib/features/auth/auth_repository.dart`
- `lib/features/home/home_repository.dart`
- `lib/core/emoji/emoji_pack_store.dart`

（不含 Flutter 客户端使用的第三方聚合源等非 `api.mfuns.net` 接口。）

**生成说明：** 路径、方法、query/body 字段来自仓库中的 `get` / `postForm` / `postJson` / `postMultipart` 调用；响应字段见各 Repository 的 `fromJson` 与注释。
