# 社区 API（`https://api.mfuns.net`）

下列接口均相对主机 `api.mfuns.net`。除非注明「公开」，默认需要登录（`Authorization`）。

---

## 认证与用户

### `POST /v1/auth/login`

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body:** `account`, `password`
- **响应 `data`:** 含 `access_token` 或 `token`；客户端随后请求 `/v1/user/info` 补全资料

### `POST /v1/auth/send_login_code`

- **Body (JSON):** `phone` (string)
- **需登录:** 否

### `POST /v1/auth/login_by_sms`

- **Body (JSON):** `phone` (string), `code` (number)
- **响应:** 同密码登录

### `GET /v1/user/info`

- **需登录:** 是
- **响应 `data`（客户端解析）:**
  - `login`: boolean，须为 `true` 才视为有效会话
  - `user` / `user_info` / 根对象：用户字段
  - 用户字段别名：`id` / `user_id`，`name` / `username`，`avatar` / `user_avatar`
  - `level_id` / `level_badge`，`exp`，`neko_coin`（喵币）

### `GET /v1/user/get_user`

- **Query:** `id` — 用户 ID
- **公开:** 是（资料页）

### `GET /v1/user/level_section`

- **公开:** 是
- **响应:** 等级经验区间列表（或 `data.list`）

### `GET /v1/user/get_user_backpack`

- **需登录:** 是（改名卡、补签卡等）

### `POST /v1/user/set_name`

- **Body:** `{ "name": string }`

### `POST /v1/user/set_bio`

- **Body:** `{ "bio": string }`

### `POST /v1/user/set_gender`

- **Body:** `{ "gender": number }`

### `POST /v1/user/set_avatar`

- **Body:** `{ "avatar": string }` — 上传后的相对路径，如 `/static/xxx.jpg`

---

## 推荐、搜索、分类、标签

### `GET /v1/recommend/get`

- **Query:**
  - `category`: number（`-1` 表示混合推荐首页）
  - `size`: number（如 10、20）

### `GET /v1/recommend/related`

- **Query:** `resource_id`, `resource_type`, `type`, `size`（客户端默认 6）

### `GET /v1/search/resource`

- **Query:** `text`, `type`（`-1` 表示不限）, `page`, `size`, `sort`（客户端固定传 `all`）
- **响应:** `data.list` 为结果列表；分页与 Flutter `SubmissionItemsPage` 一致：只读 `total` / `total_count`（少数响应用 `pages` 表示总条数），客户端用 `ceil(total / size)` 算总页数、`page * size < total` 判断下一页；勿将 `total_page`、`num`、`all_count`、`page_num`、`count` 当作总条数或总页数

### `GET /v1/search/user`

- **Query:** `user`（关键词）, `page`, `size`
- **响应:** 数组或 `data.list` → 用户列表；分页字段同上

### `GET /v1/category/all`

- **公开:** 是（分类树；网络诊断亦用此接口探活）

### `GET /v1/tag/article_list`

- **Query:** `tag`

### `GET /v1/leaderboards/hot`

- **公开:** 是（热榜）

---

## 文章与视频

### `GET /v1/article/get`

- **Query:** `id`, `html`（客户端 `1`）
- **响应:** 文章详情；正文在 `data.article`；评论区 `comment_area_id`

### `GET /v1/video/get`

- **Query:** `id`, `html`（`1`）
- **响应:** 视频详情；评论数可能在 `comments.floor_count`

### `GET /v1/video/getPlayAddress`

- **Query:** `id` — 视频 ID
- **响应 `data.videos`:** 分 P 列表，每 P 含 `video_url[]`（`url`、清晰度等）；用于播放与下载

### `GET /v1/article/user_list`

- **Query:** `user_id`, `aid`（游标，首页 `0`）, `type`（客户端 `pass`）

### `GET /v1/video/user_list`

- **Query:** `user_id`, `vid`（游标）, `type`（`pass`）

---

## 动态（Feeds）

### `GET /v1/feeds/list`

- **Query:**
  - `start_id`: 游标（首页通常 `0`）
  - `html`: `1`
  - `follow`: `1`（可选，关注流）
  - `user_id`:（可选，某用户动态）

### `GET /v1/feeds/new_reply_list`

- **Query:** `page`, `size`, `html`: `1`（全站时间线，页码分页）

### `GET /v1/feeds/get`

- **Query:** `id`, `html`: `1`

### `POST /v1/feeds/create`

- **Body:** `content`（Quill JSON）, `images`（JSON 字符串数组）, `tags`（可选，逗号分隔）

### `POST /v1/feeds/forward`

- **Body:** `content`（Quill JSON）, `resource_type`（0/1/3）, `resource_id`

### `POST /v1/feeds/delete`

- **Body:** `{ "id": feedId }`

---

## 评论

### `GET /v1/comment/list`

- **Query:** `area_id`, `page`, `order`（`desc`）, `html`（`0`）

### `GET /v1/comment/reply_list`

- **Query:** `comment_id`, `page`, `html`（`0`）

### `GET /v1/comment/get`

- **Query:** `id`, `html`（`0`）
- **用途:** 由评论 ID 解析 `comment_area_id`

### `GET /v1/comment/get_resource`

- **Query:** `id` — 评论 ID
- **响应:** `resource_id`, `resource_type`

### `GET /v1/comment/area_info`

- **Query:** `area_id`
- **响应:** `resource_id`, `resource_type`

### `POST /v1/comment/create`

- **Body:** `area_id`, `content`（Quill JSON）, `images`（JSON 字符串）, `html`: `1`

### `POST /v1/comment/create_reply`

- **Body:** `comment_id`, `content`, `images`: `"[]"`

### `POST /v1/comment/delete`

- **Body:** `{ "comment_id": number }`

---

## 点赞、点踩、投币

### `GET /v1/like/status`

- **Query:** `id`, `type`（资源类型）
- **响应 `data.status`:** `like` / `dislike` 含 `is_active`, `count`

### `POST /v1/like/{action}`

- **Path `action`:** `like` | `cancel` | `dislike`（客户端切换赞/踩）
- **Body:** `id`, `type`

### `POST /v1/like/like` / `POST /v1/like/cancel`

- **Body:** `id`, `type`（评论点赞时 `type: 4`）

### `POST /v1/reward/reward`

- **Body:** `id`, `type`（0 文章 / 1 视频）, `count`（投币数，默认 1）

---

## 收藏与历史

### `GET /v1/favorite/get_favorite_list`

- **Query:** `user_id`

### `GET /v1/favorite/get_favorite_item`

- **Query:** `favorite_id`, `last_id`（分页游标）

### `GET /v1/favorite/is_favorite`

- **Query:** `resource_id`, `resource_type`

### `POST /v1/favorite/add_favorite`

- **Body:** `list_id`, `resource_id`, `type`

### `POST /v1/favorite/remove_favorite_by_resource`

- **Body:** `list_id`, `resource_id`, `type`

### `POST /v1/favorite/create_favorite_list`

- **需登录:** 是
- **Body:** `name`（必填）, `desc`（可选）, `info`（简介；服务端校验字段，无简介时可与 `name` 相同）, `status`（必填：`1` 公开 / `0` 私密 / `2` 隐藏）
- **说明:** 开源 Flutter 客户端未调用；Electron 客户端用于新建收藏夹。仅传 `name`/`desc` 时可能返回「信息不能为空」，需带 `info`；未传 `status` 时可能无法创建。

### `POST /v1/favorite/update_favorite_list`

- **需登录:** 是
- **Body:** `list_id` / `favorite_id`, `name`, `desc`（可选）, `info`（同 create）, `status`（同 create）
- **说明:** Electron 客户端用于编辑收藏夹名称与简介；路径以实际抓包为准。

### `POST /v1/favorite/delete_favorite_list`

- **需登录:** 是
- **Body:** `list_id` / `favorite_id`
- **说明:** Electron 客户端用于删除收藏夹；路径以实际抓包为准。

### `GET /v1/history/get`

- **Query:** `start_time`（可选，分页游标）

---

## 关注

### `GET /v1/follow/count`

- **Query:** `user_id`
- **响应:** `follow`, `fans`

### `GET /v1/follow/status`

- **Query:** `user_id`

### `POST /v1/follow/follow`

- **Body:** `user_id`；取消关注时额外 `unfollow: 1`

### `GET /v1/follow/list`

- **Query:** `user_id`, `type`（`follow` | `fans`）, `last_id`（首页 `-1`）

---

## 私信

### `GET /v1/message/list`

- **Query:** `page`

### `GET /v1/message/record`

- **Query:** `uid`, `msg_id`（可选，向上翻页）, `html`: `1`

### `POST /v1/message/send`

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body:** `to_uid`, `msg`（Quill JSON 字符串，含图片信息）

---

## 通知

### `GET /v1/notify/count`

- **响应:** 未读计数；含私信字段 `message`（与通知同源）

### `GET /v1/notify/get`

- **Query:** `type`, `page`
- **`type`（客户端 Tab）:** `1` 赞, `2` 评论, `3` 提及, `4` 系统（UI 标签；站点公告不走此接口）

### `GET /v1/notify/site`

- **Query:** `page`, `html`: `1`（站点公告，HTML 正文）

---

## 签到

### `GET /v1/sign/sign`

- **需登录:** 是（执行签到；成功文案在 `msg`）

### `GET /v1/sign/sign_list`

- **需登录:** 是（本月签到日历）

### `POST /v1/sign/sign_again`

- **Body:** `{ "day": number }`（补签，消耗补签卡）

### `GET /v1/sign/sign_rank_today`

- **公开:** 是

### `GET /v1/sign/accumulated_awards`

- **公开:** 是（累计天数 → 奖励 map）

---

## 弹幕

### `GET /v1/danmaku/get_normal`

- **Query:** `id`（视频 ID）, `part`（分 P，从 1 起）

### `POST /v1/danmaku/send_normal`

- **Body:** `video_id`, `part`, `time`（秒）, `content`, `color`, `size`, `type`

---

## 表情包与媒体

### `GET /v1/emoji_pack/list`

- **Query:** `with_vip`: `1`

### `GET /v1/emoji_pack/face_text`

- 文字表情列表

### `POST /v1/media/upload_image`

- **Content-Type:** `multipart/form-data`
- **字段:** `file`（二进制）
- **响应 `data.file.file_path`:** 相对路径，用于评论/头像

---

## 投稿（Contribute）

### `GET /v1/contribute/list`

- **Query:** `type`（`0` 文章 / `1` 视频）, `page`, `size`, `status`（可选）
- **响应:** 含 `list`, `total`

### `GET /v1/contribute/get`

- **Query:** `contribute_id`

### `POST /v1/contribute/article/create`

- **Body:** `cid`, `title`, `content`, `content_format`: `markdown`, `copyright`, `draft`, 可选 `tags`, `cover`

### `POST /v1/contribute/article/update`

- **Body:** 同上 + `contribute_id`

### `POST /v1/contribute/article/delete`

- **Body:** `{ "contribute_id": number }`

### `POST /v1/contribute/video/create`

- **Body:** `cid`, `title`, `content`（Quill JSON）, `cover`, `video`（JSON 字符串，分 P 信息）, `copyright`, 可选 `tags`

### `POST /v1/contribute/video/update`

- **Body:** 同 create + `contribute_id`

### `POST /v1/contribute/video/delete`

- **Body:** `{ "contribute_id": number }`

### `POST /v1/contribute/video/get_upload_auth`

- **Body:** `file_name`, `file_size`
- **响应:** OSS/VOD 凭证（见 [video-upload.md](./video-upload.md)）

### `POST /v1/contribute/video/upload_complete`

- **Body:** `{ "videoId": string }`
- **响应:** `status`, `id`（视频库 ID，用于 create）

视频本地上传完整流程见 [video-upload.md](./video-upload.md)。

---

## 列表项通用字段（预览）

`ContentPreview.fromJson` 等会从 `resource_info` 或根对象读取，常见字段：

`id`, `title`, `summary`/`content`, `cover`, `type`/`resource_type`, `like_count`, `comment_count`, `view_count`, `user`, `category`, `created_at`/`time`

具体形态因接口而异，客户端对多种历史字段做了兼容。
