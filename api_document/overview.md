# 通用约定

## 社区 API

| 项 | 值 |
|----|-----|
| 协议 | HTTPS |
| 主机 | `api.mfuns.net` |
| 路径前缀 | `/v1/` |
| 客户端实现 | `MfunsApiClient`（`local/.../lib/core/network/mfuns_api_client.dart`） |

### 请求头

| Header | 说明 |
|--------|------|
| `User-Agent` | `AppConfig.userAgent`（默认 Mobile Chrome；可用 `MFUNS_USER_AGENT` 编译覆盖） |
| `Accept` | `application/json` |
| `Authorization` | 登录后的 **社区 access token**，**不要**加 `Bearer` 前缀 |
| `Content-Type` | JSON：`application/json`；表单：`application/x-www-form-urlencoded`；上传：`multipart/form-data` |

未登录接口可不携带 `Authorization`；写操作与个人信息一般需要登录。

### 响应信封

HTTP 200 时 body 为 JSON 对象：

```json
{
  "code": 1,
  "msg": "成功",
  "data": {}
}
```

- 业务成功：`code == 1`（客户端以此为准，不仅看 HTTP 状态码）
- 失败：`code != 1` 或 HTTP ≥ 400 → 客户端抛出 `MfunsApiException`，文案来自 `msg`

### 资源类型 `type` / `resource_type`

客户端约定（见 Flutter `AGENTS.md` 与业务代码）：

| 值 | 含义 |
|----|------|
| `0` | 文章 |
| `1` | 视频 |
| `3` | 动态（Feed） |
| `4` | 评论 |

点赞、收藏、投币、相关推荐等接口中的 `type` 多指上述资源类型。

### 内容格式

- 评论、私信、动态正文：多为 **Quill Delta JSON 字符串**（客户端 `commentQuillJson` / `messageQuillJson`）
- 文章投稿：`content_format: markdown`
- 视频投稿简介：`content` 为 Quill JSON 字符串

### 静态资源 / CDN

头像、封面等相对路径常见规则（客户端拼接）：

- 以 `/` 或 `static/` 开头 → `https://cdn2.mfuns.net` + 路径
- 协议相对 `//` → 补 `https:`

### 分页模式（常见）

| 模式 | 参数 | 用途示例 |
|------|------|----------|
| 页码 | `page`, `size` | 搜索、通知、投稿列表 |
| 游标 | `start_id`, `aid`, `vid`, `last_id`, `start_time` | 动态流、用户稿件、收藏夹、历史 |

---

## 错误与重试（客户端行为）

- 网络：`SocketException` / `HttpException` → 统一友好文案
- 视频上传完成：`POST /v1/contribute/video/upload_complete` 在返回「视频上传未完成」时会 **最多 12 次、间隔 5s** 重试（见 `home_repository.dart`）
