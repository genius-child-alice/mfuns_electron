# 响应数据模型（解析全集）

以下与 Flutter `home_repository.dart` / `auth_repository.dart` / `emoji_pack_store.dart` 保持一致。所有成功响应先包在统一信封内，`data` 才是本节内容。

## 统一信封

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | number | `1` 为成功 |
| `msg` | string | 提示文案 |
| `data` | any | 业务载荷 |

---

## 列表归一化（多接口共用）

许多 GET 的 `data` 可能是 **数组**，或 **对象内的 list**，解析器如下：

| Helper | 接受的 `data` 形态 | 元素模型 |
|--------|-------------------|----------|
| `_toPreviewList` | `[]` 或 `{ list: [] }` | ContentPreview |
| `_toTimelineFeeds` | `[]` 或 `{ list \| feeds \| data: [] }` | TimelineFeed |
| `_toComments` | `[]` 或 `{ list: [] }` | CommunityComment |
| `_toMessageConversations` | `[]` 或 `{ list: [] }` | MessageConversation |
| `_toNotifyItems` | `[]` 或 `{ list \| items \| data \| notifications: [] }` | NotifyItem |
| `_collectCategories` | 树形数组或 `{ children \| list }` 递归 | CategoryNode |

---

## ContentPreview

**用于：** 推荐、搜索、热榜、标签文、用户稿件、收藏夹项、历史等。

| 输出字段 | JSON 来源（优先级从左到右） |
|----------|---------------------------|
| `id` | `resource_info` 与根合并后：`id`, `resource_id` |
| `title` | `title`（默认「未命名内容」） |
| `summary` | `summary`, `content` |
| `cover` | `cover` → `_coverUrl` |
| `author` | `user.name`, `user.username`, `user_name` |
| `authorId` | `user.id`, `user.user_id`, `user_id` |
| `authorAvatar` | `user.avatar`, `user.face` |
| `category` | `category.name`, `category_name`, `tag` |
| `type` | `type`, `resource_type`（字符串含 video→1，否则 0） |
| `likes` | `like_count` |
| `comments` | `comment_count` |
| `views` | `view_count` |
| `createdAt` | `created_at`, `time`, `createdAt` |

`type === 1` 为视频；`type === 3` 为动态（客户端 `isFeed`）。

---

## TimelineFeed

**用于：** `/v1/feeds/list`, `/v1/feeds/new_reply_list`, `/v1/feeds/get`（外层再包 FeedDetail）。

| 输出字段 | JSON 来源 |
|----------|-----------|
| 根对象 | `feed` 对象与根合并 |
| `id` | `id`, `feed_id` |
| `author` / `authorId` / `avatar` | `user` / `user_info` / 顶层别名 |
| `content` | Quill/HTML：`content`, `text`, `summary`, `extra.resource.*` → 纯文本 |
| `spans` | 由 raw content 解析 Quill/HTML 贴纸 |
| `likes` / `comments` / `views` | 顶层或 `like_status.like.count`, `resource.*` |
| `images` | `images`, `image_list`, `pictures`, `extra.images`（字符串 JSON 或 URL 数组） |
| `resource` | 见 `_feedResource`：`extra.resource` 或 `is_auto_sync` + `resource_id`/`resource_type` |
| `isAutoSync` | `is_auto_sync` 为 true 或 1 |

### FeedDetail（`/v1/feeds/get`）

在 `TimelineFeed` 之外额外读取根级：

| 字段 | JSON |
|------|------|
| `rawContent` | `content` |
| `tags` | `tags` → `_toTags` |
| `commentAreaId` | `comment_area_id` |

---

## UserProfile

**用于：** `/v1/user/get_user`, `/v1/search/user`, `/v1/follow/list`；`/v1/user/info` 经 Auth 层简化。

| 输出字段 | JSON 来源 |
|----------|-----------|
| 根 | 若有 `user` 键则取其，否则根对象 |
| `id` | `id`, `user_id` |
| `name` | `name`, `username` |
| `avatar` / `banner` | `avatar`/`face`, `banner_image`/`banner` |
| `avatarFrame` | `avatar_frame.image` 或字符串 |
| `bio` | `bio`, `signature`, 或 `info` 为 string |
| `gender` | `gender`, `info.gender` |
| `level` | `level_id`, `info.level_id`, 或 `badges` 中 badge_id 1–10 |
| `exp` | `exp`, `experience`, `info.exp` |
| `fans` / `follows` | 多别名；**`/v1/user/get_user` 与 `/v1/follow/count` 合并**后覆盖 `follow`, `fans` |
| `totalLikes` | `total_likes_count`, `info.total_likes_count` |

### Auth：`UserSession`（`/v1/user/info`）

| 字段 | JSON |
|------|------|
| `login` | 须为 true |
| token | 来自登录 `access_token` 或 `token` |
| 用户 | `user` / `user_info` / 根：`id`, `name`, `avatar`, `level_id`, `exp`, `neko_coin` |

---

## CategoryNode

**用于：** `/v1/category/all`

| 字段 | JSON |
|------|------|
| `id`, `name`, `parentId` | `id`, `name`, `parent_id` |
| 子节点 | `children`, `list` 递归 |

---

## SignInfo / SignRankEntry / SignAward

| 模型 | 接口 | 要点 |
|------|------|------|
| SignInfo | `/v1/sign/sign_list` | `list`→当月已签日（见 `_signDays` 三种格式）, `month_times`, `all_times` |
| SignRankEntry | `/v1/sign/sign_rank_today` | `user.*`, `count`, `time` |
| SignAward | `/v1/sign/accumulated_awards` | `data` 为 **map**：键=累计天数，值=奖励对象数组 `{ desc, type }` |

`/v1/sign/sign`：仅使用 `msg`，不解析 `data`。

---

## HistoryPage

**用于：** `/v1/history/get`

| 字段 | 来源 |
|------|------|
| `items` | 数组或 `list`/`items`/`history`（含嵌套 `data.*`）→ ContentPreview |
| `nextStartTime` | `next_start_time`, `next_cursor`, … 或最后一条的 `time`/`start_time`/`view_time`/`created_at` |
| `hasMore` | `has_more` 等，或推断 |
| `total` | `total`, `total_count` |

---

## BackpackItem / LevelSection

| 模型 | 字段 |
|------|------|
| BackpackItem | `id`, `name`, `tag`, `description`, `icon`, `count`（`/v1/user/get_user_backpack` → `data.list`） |
| LevelSection | `level_id`/`id`, `experience`（数组或 `list`） |

---

## FavoriteFolder / FavoriteItemsPage

| 模型 | 接口 | 要点 |
|------|------|------|
| FavoriteFolder | `get_favorite_list` | `data.list`：`id`, `name`, `desc`, `count` |
| FavoriteItemsPage | `get_favorite_item` | 项→ContentPreview；`nextLastId`←`last_id` 或最后一项 id |

---

## ResourceReactionStatus

**用于：** `/v1/like/status`

| 字段 | JSON |
|------|------|
| `data.status.like` / `dislike` | `is_active`（bool/1）, `count` |

---

## CommunityComment

**用于：** `comment/list`, `reply_list`

| 字段 | JSON |
|------|------|
| `id`, `user_id` | 根 + `user` / `user_info` |
| 作者名/头像 | 多别名 `name`, `username`, `nickname`, … |
| `content` / `spans` | `content` Quill 或 HTML（`html=1` 时贴纸为 img） |
| `images` | `content_ext.images`, `images` |
| `likes` / `liked` | `like_status.like`, `like_count` |
| `replyCount` | `reply_count` |
| `createdAt` | `created_at` |

---

## 评论/区域解析（单对象）

| 接口 | 读取字段 |
|------|----------|
| `/v1/comment/get` | `data.comment.comment_area_id` |
| `/v1/comment/get_resource` | `resource_id`, `resource_type` |
| `/v1/comment/area_info` | 同上 |

---

## MessageConversation / MessageRecord / MessageRecordsPage

| 模型 | 要点 |
|------|------|
| MessageConversation | `user`, `last_msg`/`last_message`.data, `no_read`/`unread` |
| MessageRecord | `id`/`msg_id`, `uid`, Quill `message`/`msg`, 内嵌图片 |
| MessageRecordsPage | 兼容 Redis stream `[id,data]`、多种 list 键；`next_msg_id` 等 → 翻页 `msg_id` |

---

## NotifyCounts / NotifyItem

| 模型 | 接口 |
|------|------|
| NotifyCounts | `/v1/notify/count` → `like`, `comment`, `mention`, `system`, **`message`**（私信未读） |
| NotifyItem | `/v1/notify/get`, `/v1/notify/site` → `notify_params`/`params`, `sender`, `reply_text`/`text`, 资源 id/type |

通知 type（请求参数）：`1`赞 `2`评论 `3`提及 `4`系统（站点公告用 `/v1/notify/site`）。

---

## DanmakuItem

**用于：** `/v1/danmaku/get_normal` → `data.list` 每项为 **数组**：

`[timeSec, type, color, ?, content, size]`（索引 0–5）

---

## ContentDetail（文章/视频详情）

**接口：** `/v1/article/get`, `/v1/video/get`

| 部分 | 解析 |
|------|------|
| 视频 | `data` 根即 resource |
| 文章 | `data.article` 为 resource |
| `preview` | `_detailPreview`：合并 `user`, `category`, `like_status`, 评论数（`comments.floor_count`, `floor_num`, `comment_count`） |
| `rawContent` | resource `content`/`summary` |
| `tags` | 根或 resource 的 `tags`/`tag` |
| `commentAreaId` | resource 或根 `comment_area_id`, `commentId` |

---

## VideoQuality（播放地址）

**接口：** `/v1/video/getPlayAddress`

```
data.videos[] → 每个 part:
  video_url[] → { url, name, label }
```

客户端 `part` = 数组下标 + 1。

---

## VideoUploadAuth

**接口：** `/v1/contribute/video/get_upload_auth`

| 字段 | 说明 |
|------|------|
| `VideoId` | 字符串 |
| `UploadAuth` | Base64 → JSON：AccessKeyId, AccessKeySecret, SecurityToken |
| `UploadAddress` | Base64 → JSON：Endpoint, Bucket, FileName/ObjectName |

---

## SubmissionItem / SubmissionItemsPage / SubmissionDetail

| 模型 | 要点 |
|------|------|
| SubmissionItemsPage | `list`/`items`, `total`, 分页 hasMore |
| SubmissionItem | `id`, `resource_id`, `title`, `status`, `created_at`, `cover`, `resource.*` |
| SubmissionDetail | `contribute` 或根：`cid`/`category_id`, `content`, `content_format`, `videos`/`video`（JSON 字符串或数组） |
| status 文案 | 0草稿 1已发布 2审核中 3驳回 4驳回修改 5定时 |

**upload_complete `data`：** `id`（视频库 ID）, `status`（1 表示完成）

---

## 投稿 create/update Body（响应）

客户端通常不解析 `data`，成功以 `code==1` 为准。

---

## 媒体上传

**POST `/v1/media/upload_image`**

```
data.file.file_path  → 相对路径 /static/...
```

---

## EmojiData

| 接口 | `data` 形态 |
|------|-------------|
| `/v1/emoji_pack/list` | **Map**：键=packKey，值 `{ name, list: { stickerId: { url, size } } }` |
| `/v1/emoji_pack/face_text` | string 数组 |

---

## 关注 / 收藏 / 投币（简单标量）

| 接口 | 解析 |
|------|------|
| `/v1/follow/status` | `data.status` bool/1 |
| `/v1/favorite/is_favorite` | `data.is_favorite` |
| `/v1/reward/reward` | 仅用 `msg` |

---

## 登录

| 接口 | `data` |
|------|--------|
| `/v1/auth/login` 等 | `access_token` 或 `token` |
| `/v1/auth/send_login_code` | 通常 null，看 `msg` |

---

## 辅助：URL 与时间

- `_coverUrl`：`/`, `static/` → `https://cdn2.mfuns.net/...`；`//` → `https:`
- `_asDateTime`：ISO 字符串或 Unix 秒/毫秒时间戳
