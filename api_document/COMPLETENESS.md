# 文档完备性说明

## 接口是否「全」？

| 范围 | 结论 |
|------|------|
| **`api.mfuns.net` + Flutter 已调用** | **是**。`local/Mfuns_Flutter-main/lib` 内凡通过 `MfunsApiClient` 发起的 `/v1/*` 均已列入 [endpoints.json](./endpoints.json) 与 [endpoint-responses.md](./endpoint-responses.md)（共 **78** 条路径级条目；`/v1/like/{action}` 计为 like / cancel / dislike）。 |
| **官方服务端全部接口** | **无法保证**。仓库无 OpenAPI；Flutter 未使用的端点不会出现在本扫描中。 |
| **非官方主机** | **已排除**（如 `wgen.top` 聚合源）。 |

扫描命令（可复验）：

```bash
rg -o "/v1/[a-zA-Z0-9_/]+" local/Mfuns_Flutter-main/lib -g "*.dart" --no-filename | sort -u
```

并与 `MfunsApiClient` 的 `get` / `postForm` / `postJson` / `postMultipart` 调用交叉核对。

## 返回值解析是否「全」？

| 范围 | 结论 |
|------|------|
| **Flutter 实际解析逻辑** | **是**。[response-schemas.md](./response-schemas.md) 收录 `home_repository.dart`、`auth_repository.dart`、`emoji_pack_store.dart` 中全部 `fromJson` / `fromData` 及列表归一化 helper（`_toPreviewList`、`_toTimelineFeeds` 等）。 |
| **字段级兼容别名** | 文档按源码列出主要 JSON 键与别名；实现里仍有更多边缘分支，以 Dart 源码为准。 |
| **未走结构化解析的接口** | 仅写操作且客户端不读 `data` 的接口（如部分 `set_*`、`delete`）在 [endpoint-responses.md](./endpoint-responses.md) 中标为「无业务 data 解析」。 |

## 文档文件分工

| 文件 | 用途 |
|------|------|
| [community-api.md](./community-api.md) | 人类可读：路径、方法、参数说明 |
| [endpoint-responses.md](./endpoint-responses.md) | **每接口 → `data` 形态 + 解析器** |
| [response-schemas.md](./response-schemas.md) | **模型/字段/别名** 全集 |
| [endpoints.json](./endpoints.json) | 机器可读端点 + `response` 引用 |
