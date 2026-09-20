# 接口 ↔ 响应解析对照表

`data` 指成功时信封内的 `data` 字段。解析器名称对应 [response-schemas.md](./response-schemas.md)。

## 认证与用户

| 方法 | 路径 | data 形态 | 解析器 / 说明 |
|------|------|-----------|----------------|
| POST | `/v1/auth/login` | object | `access_token` / `token` → 再 GET `/v1/user/info` |
| POST | `/v1/auth/send_login_code` | null 或任意 | 使用顶层 `msg` |
| POST | `/v1/auth/login_by_sms` | object | 同 login |
| GET | `/v1/user/info` | object | UserSession：`login`, `user`/`user_info` |
| GET | `/v1/user/get_user` | object | UserProfile.fromJson |
| GET | `/v1/user/level_section` | array 或 `{list}` | LevelSection[] |
| GET | `/v1/user/get_user_backpack` | `{list:[]}` | BackpackItem[] |
| POST | `/v1/user/set_name` 等 set_* | — | 不解析 data |
| POST | `/v1/user/set_avatar` | — | body 的 avatar 来自 upload_image |

## 推荐、搜索、分类

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/recommend/get` | list 或 `{list}` | ContentPreview[] |
| GET | `/v1/recommend/related` | 同上 | ContentPreview[] |
| GET | `/v1/search/resource` | 同上 | ContentPreview[] |
| GET | `/v1/search/user` | list 或 `{list}` | UserProfile[] |
| GET | `/v1/category/all` | 树 | CategoryNode 递归 |
| GET | `/v1/tag/article_list` | list | ContentPreview[] |
| GET | `/v1/leaderboards/hot` | list | ContentPreview[] |

## 文章、视频、播放

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/article/get` | object + `article` | ContentDetail |
| GET | `/v1/video/get` | object | ContentDetail |
| GET | `/v1/video/getPlayAddress` | `{videos:[{video_url:[]}]}` | VideoQuality[] |
| GET | `/v1/article/user_list` | list | ContentPreview[]，游标 `aid` |
| GET | `/v1/video/user_list` | list | ContentPreview[]，游标 `vid` |

## 动态

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/feeds/list` | list / `{list\|feeds}` | TimelineFeed[] |
| GET | `/v1/feeds/new_reply_list` | 同上 | TimelineFeed[] |
| GET | `/v1/feeds/get` | object | FeedDetail |
| POST | `/v1/feeds/create` | — | 不解析 |
| POST | `/v1/feeds/forward` | — | 不解析 |
| POST | `/v1/feeds/delete` | — | 不解析 |

## 评论

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/comment/list` | list | CommunityComment[] |
| GET | `/v1/comment/reply_list` | list | CommunityComment[] |
| GET | `/v1/comment/get` | `{comment:{}}` | `comment_area_id` |
| GET | `/v1/comment/get_resource` | object | `resource_id`, `resource_type` |
| GET | `/v1/comment/area_info` | object | 同上 |
| POST | `/v1/comment/create` 等 | — | 不解析 |

## 点赞、投币

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/like/status` | `{status:{like,dislike}}` | ResourceReactionStatus |
| POST | `/v1/like/like` | — | 不解析 |
| POST | `/v1/like/cancel` | — | 不解析 |
| POST | `/v1/like/dislike` | — | 不解析 |
| POST | `/v1/reward/reward` | — | 使用 `msg` |

## 收藏、历史

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/favorite/get_favorite_list` | `{list}` | FavoriteFolder[] |
| GET | `/v1/favorite/get_favorite_item` | list + `last_id` | FavoriteItemsPage |
| GET | `/v1/favorite/is_favorite` | object | `is_favorite` |
| POST | favorite add/remove | — | 不解析 |
| GET | `/v1/history/get` | 多种 | HistoryPage |

## 关注

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/follow/count` | object | `follow`, `fans` |
| GET | `/v1/follow/status` | object | `status` |
| POST | `/v1/follow/follow` | — | 不解析 |
| GET | `/v1/follow/list` | `{list}` | UserProfile[] |

## 私信

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/message/list` | list | MessageConversation[] |
| GET | `/v1/message/record` | 多种 | MessageRecordsPage |
| POST | `/v1/message/send` | — | 不解析 |

## 通知、签到

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/notify/count` | object | NotifyCounts |
| GET | `/v1/notify/get` | list | NotifyItem[] |
| GET | `/v1/notify/site` | list | NotifyItem[]（HTML→纯文本） |
| GET | `/v1/sign/sign` | — | 仅用 `msg` |
| GET | `/v1/sign/sign_list` | object | SignInfo |
| POST | `/v1/sign/sign_again` | — | 不解析 |
| GET | `/v1/sign/sign_rank_today` | list | SignRankEntry[] |
| GET | `/v1/sign/accumulated_awards` | map | `Map<day, SignAward[]>` |

## 弹幕、表情、媒体

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/danmaku/get_normal` | `{list:[[...]]}` | DanmakuItem[] |
| POST | `/v1/danmaku/send_normal` | — | 不解析 |
| GET | `/v1/emoji_pack/list` | map | EmojiData.packs |
| GET | `/v1/emoji_pack/face_text` | string[] | EmojiData.faceTexts |
| POST | `/v1/media/upload_image` | `{file:{file_path}}` | 字符串路径 |

## 投稿

| 方法 | 路径 | data 形态 | 解析器 |
|------|------|-----------|--------|
| GET | `/v1/contribute/list` | list + `total` | SubmissionItemsPage |
| GET | `/v1/contribute/get` | object | SubmissionDetail |
| POST | article/video create/update/delete | — | 一般不解析 data |
| POST | `/v1/contribute/video/get_upload_auth` | object | VideoUploadAuth |
| POST | `/v1/contribute/video/upload_complete` | `{id, status}` | 视频库 id (int) |
