# 视频投稿上传流程

社区 API 只负责 **凭证与登记**；视频二进制通过 **阿里云 OSS** 直传（客户端 `uploadVideoToOss`，纯 Dart 签名 PUT）。

---

## 1. 获取上传凭证

**`POST /v1/contribute/video/get_upload_auth`**

```json
{
  "file_name": "example.mp4",
  "file_size": 12345678
}
```

**响应 `data`（客户端 `VideoUploadAuth`）需包含：**

- `videoId`（或等价字段，用于 upload_complete）
- `accessKeyId`, `accessKeySecret`
- `securityToken`（STS，可为空）
- `bucket`, `endpoint`, `objectKey`

缺任一必要字段则客户端报错「未获取到有效的上传凭证」。

---

## 2. OSS 直传（非 api.mfuns.net）

- **方法:** `PUT`
- **URL:** `https://{bucket}.{endpoint}/{objectKey}`
- **Headers:**
  - `Content-Type: application/octet-stream`
  - `Date`: HTTP 日期（UTC）
  - `Authorization`: `OSS {accessKeyId}:{signature}`（HMAC-SHA1，规范串与 MCP 参考实现一致）
  - 若有 STS：`x-oss-security-token`

实现见 `local/.../lib/core/network/vod_uploader.dart`。

---

## 3. 通知上传完成

**`POST /v1/contribute/video/upload_complete`**

```json
{
  "videoId": "<来自 get_upload_auth>"
}
```

- VOD 异步校验：可能返回「视频上传未完成」
- 客户端对该文案 **最多重试 12 次，间隔 5 秒**
- 成功时 `data.id` 为 **视频库 ID**，用于投稿 create/update 的 `video` JSON

---

## 4. 创建/更新视频投稿

**`POST /v1/contribute/video/create`** 或 **`/v1/contribute/video/update`**

- `video`: JSON 字符串，分 P 结构（含上一步得到的库 ID 等，见 `SubmissionVideoPart.toJson()`）
- `content`: Quill Delta JSON 字符串
- 其余字段见 [community-api.md](./community-api.md) 投稿章节
