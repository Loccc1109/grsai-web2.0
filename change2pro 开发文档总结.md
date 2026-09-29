# change2pro 开发文档总结

> 来源：https://platform.forkc2p.com/docs/  
> 整理时间：2026-09-29

---

## 目录

- [一、开始使用 / 接入指南](#一开始使用--接入指南)
  - [1.1 从第一个请求开始（Quickstart）](#11-从第一个请求开始quickstart)
  - [1.2 鉴权与模型发现（Authentication）](#12-鉴权与模型发现authentication)
  - [1.3 查询余额（Usage）](#13-查询余额usage)
- [二、模型接入](#二模型接入)
  - [2.1 按模型能力选择接口（Groups）](#21-按模型能力选择接口groups)
- [三、图像接口](#三图像接口)
  - [3.1 OpenAI 图像生成（Images）](#31-openai-图像生成images)
  - [3.2 Chat 格式接入（Chat-Images）](#32-chat-格式接入chat-images)
  - [3.3 Gemini 原生接口（Gemini）](#33-gemini-原生接口gemini)
  - [3.4 异步图像任务（Async-Images）](#34-异步图像任务async-images)
- [四、视频接口](#四视频接口)
  - [4.1 Seedance 视频（Seedance）](#41-seedance-视频seedance)
  - [4.2 MiniMax 视频（MiniMax）](#42-minimax-视频minimax)
  - [4.3 Grok 视频（Grok-Video）](#43-grok-视频grok-video)
- [五、任务与错误](#五任务与错误)
  - [5.1 视频任务与下载（Video-Tasks）](#51-视频任务与下载video-tasks)
  - [5.2 错误处理与排查（Errors）](#52-错误处理与排查errors)
- [总结](#总结)

---

## 一、开始使用 / 接入指南

### 1.1 从第一个请求开始（Quickstart）

change2pro 提供一个统一的 API 地址，开发者可在几分钟内完成接入。

**准备连接**

- 在控制台创建 API 密钥。
- 使用 `GET /v1/models` 查询可用模型。
- 将返回的模型 ID 填入请求的 `model` 字段。
- 基础地址为：

```text
https://gateway.change2pro.com
```

- 密钥建议通过环境变量或密钥管理工具设置，切勿提交到代码仓库。

**查询可用模型**

```bash
curl -fsS "$GATEWAY_BASE/v1/models" \
  -H "Authorization: Bearer $GATEWAY_KEY"
```

从响应 `data[]` 中读取 `id` 填入请求的 `model`。  
不同密钥的可用模型可能不同，应使用当前密钥返回的目录。

**发起生成**

- 图像接口适用于支持 Images 的模型。
- 替换 `YOUR_IMAGE_MODEL` 为模型目录中的图像模型。
- 图片读取响应 `data[]`。
- 视频则先创建任务，再查询状态和下载成片。
- 使用 OpenAI 客户端时，`base_url` 通常设置为：

```text
https://gateway.change2pro.com/v1
```

- 直接拼接 `/v1/...` 路径时，基础地址不要重复附加 `/v1`。

---

### 1.2 鉴权与模型发现（Authentication）

**Bearer 鉴权**

- OpenAI 兼容接口与视频任务接口使用：

```http
Authorization: Bearer YOUR_API_KEY
```

- Gemini 原生接口也支持：

```http
x-goog-api-key: YOUR_API_KEY
```

- 不要将真实密钥放进 URL 查询参数。

**查询可用模型**

携带 API 密钥调用：

```http
GET /v1/models
```

查看可用模型，并使用响应中的 `id` 创建请求。

**请求与任务的归属**

- 创建和查询任务使用同一把密钥。
- 不要把任务 ID 当作请求日志 ID。
- 视频内容下载地址具有访问凭据的性质，请妥善保管，不要公开分享私人素材。

**常见客户端设置**

| 配置项 | 值 |
|---|---|
| API 基础地址 | `https://gateway.change2pro.com` |
| OpenAI SDK base_url | `https://gateway.change2pro.com/v1` |
| API Key | 控制台创建的密钥 |
| model | `GET /v1/models` 返回的 id |

---

### 1.3 查询余额（Usage）

携带账户密钥调用：

```http
GET /v1/usage
```

即可读到该账户当前余额。该接口是只读的，不会创建任务、不会消耗额度、也不会产生调用记录。

```bash
curl -s https://gateway.change2pro.com/v1/usage \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**响应字段**

| 字段 | 类型 | 含义 |
|---|---|---|
| `remaining` | number | 账户当前余额 |
| `unit` | string | 金额单位，恒为 USD |
| `is_active` | boolean | 该密钥当前是否可用 |

**注意事项**

- 只有属于某个账户的密钥能查到余额。
- 用于对接下游、本身不代表任何账户的密钥调用这个接口会得到 `403`，响应里不会出现 `remaining` 字段。
- 支持用量查询的客户端可将本接口配成供应商的额度来源，从响应里取 `remaining` 显示在供应商条目上。

---

## 二、模型接入

### 2.1 按模型能力选择接口（Groups）

该页面涉及创建密钥、查询模型能力、发起请求等流程。

模型的能力通过 `capability_profiles` 声明，每条档案是一套完整的请求组合。

**注意事项**

- 不要把不同档案的素材角色、画幅、档位和选项混合使用。
- 空数组表示当前没有已声明可用的统一请求组合。

---

## 三、图像接口

### 3.1 OpenAI 图像生成（Images）

文档中提及该接口适用于支持 Images 的模型。

基础请求流程：

1. 将模型目录中的图像模型填入 `model` 字段。
2. 调用图像生成端点。
3. 图片读取响应 `data[]`。

> 该页面内容因 JavaScript 动态加载，未获取到完整细节。

---

### 3.2 Chat 格式接入（Chat-Images）

使用 `messages` 结构提交文本或图片输入。

```bash
curl -fsS "$GATEWAY_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "YOUR_CHAT_IMAGE_MODEL",
    "messages": [{"role": "user", "content": "生成一张安静书房的图片"}],
    "stream": false
  }'
```

该示例用于支持 Chat 图像生成的模型，不代表 Images 模型都支持此入口。  
请按模型支持的接口选择请求格式。

**带图片的消息**

在 `messages` 数组中放入包含 `text` 和 `image_url` 类型的 content 对象。  
素材 URL 必须替换为真实可读取地址，素材格式和数量以模型支持范围为准。

**处理响应**

- 普通文本按 `choices[].message.content` 读取。
- 包含图像的响应会将图片地址归一为本站资产，并可能提供 `data[]` 图片列表。
- 客户端应区分文本回复和实际图片结果。

---

### 3.3 Gemini 原生接口（Gemini）

保留 `contents` 与 `parts` 结构，适配原生客户端。

**查询模型**

```bash
curl -fsS "$GATEWAY_BASE/v1beta/models" \
  -H "x-goog-api-key: $GATEWAY_KEY"
```

**生成内容**

```bash
curl -fsS "$GATEWAY_BASE/v1beta/models/YOUR_GEMINI_MODEL:generateContent" \
  -H "x-goog-api-key: $GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {"text": "生成一张清晨山谷的图片"}
        ]
      }
    ]
  }'
```

**输入要求**

- 请求至少提供文本或图片。
- 图片使用 `parts[].inlineData`，包含 `mimeType` 和不带 data URL 前缀的 Base64 data。

**流式返回**

将 `:generateContent` 换成 `:streamGenerateContent` 即得到事件流（`text/event-stream`）。  
查询模型时 `supportedGenerationMethods` 会同时列出这两个方法。

**输出与选项**

- 读取 `candidates[].content.parts[]`。
- 文本位于 `text`。
- 图片位于 `inlineData`。
- `generationConfig` 仅传当前模型支持的选项。
- 不要把 OpenAI 的 `size`、`n` 字段直接套用到 Gemini 请求。

---

### 3.4 异步图像任务（Async-Images）

该页面标题为“异步图像任务”。  
内容因 JavaScript 动态加载，未获取到完整细节，属于图像接口下的异步处理方式。

---

## 四、视频接口

### 4.1 Seedance 视频（Seedance）

统一 `content[]` 请求，支持文本与已开放的多模态素材。

**先查看可用能力**

在 `GET /v1/models` 中查找此模型，读取 `capability_profiles`。

- 每条档案是一套完整组合。
- 不要把不同档案的素材角色、画幅、档位和选项混合。
- 空数组表示当前没有已声明可用的统一请求组合。

**创建视频**

```json
{
  "model": "seedance-2.5",
  "content": [
    {
      "type": "text",
      "text": "海边日落，镜头缓慢推进"
    }
  ],
  "duration": 5,
  "resolution": "720p",
  "ratio": "16:9"
}
```

请求头携带：

```http
Authorization: Bearer <YOUR_API_KEY>
Content-Type: application/json
```

成功返回任务 `id`，请保存并继续查询。

**参数说明**

| 字段 | 类型 | 说明 |
|---|---|---|
| `model` | string | `seedance-2.5` |
| `content` | array | 文本与媒体输入；至多一个 text 项 |
| `duration` | integer | 4–30 秒；省略为 `-1` 自动时长（需要能力支持） |
| `resolution` | string | `480p` / `720p` / `1080p`；省略为 `720p` |
| `ratio` | string | 具体比例或 `adaptive`；省略为 `adaptive` |
| `generate_audio` | boolean | 默认 `true`；`false` 请求无声，需当前能力支持 |

**可选字段**

- `watermark`
- `output_format`
- `draft`
- `omni_reference_task_type`

这些字段也须在档案 `options` 中声明。

**限制与组合**

- `draft=true` 需要明确 `480p`。
- `edit` / `extend` 需要参考视频及 `adaptive`。
- `edit` 还需要 `duration=-1`。
- 首帧/尾帧与参考素材是不同玩法，不能在同一请求中混用。
- 文本中的 `@` 编号不是网关独立参数，网关不展开或校验它。

**已有 Ark 客户端**

- 创建：`POST /api/v3/contents/generations/tasks`
- 查询：`GET /api/v3/contents/generations/tasks/{id}`
- 请求体使用上述 `content[]` 格式。
- 状态为：`queued`、`running`、`succeeded`、`failed`。
- 完成后从 `content.video_url` 获取成片。

---

### 4.2 MiniMax 视频（MiniMax）

该页面内容因 JavaScript 动态加载，未获取到完整细节，属于视频接口下的独立接入方式。

---

### 4.3 Grok 视频（Grok-Video）

使用 `prompt` 兼容格式，不与 `content[]` 请求混用。

**创建任务**

```json
{
  "model": "grok-imagine-video-1.5",
  "prompt": "海边日落，镜头缓慢推进",
  "duration": 4,
  "resolution": "720p",
  "aspect_ratio": "16:9"
}
```

**注意事项**

- `model` 必须是当前密钥目录中的 Grok 视频模型。
- 参考图与视频编辑能力按具体模型支持范围使用。
- 不能直接套用 Seedance / MiniMax 的 `content[]` 素材角色。

**查询与下载**

- 查询：`GET /v1/videos/generations/{id}`
- 下载：`GET /v1/videos/generations/{id}/content`
- 兼容查询使用：`pending` / `done` / `failed` / `expired`
- 下载路径支持成片读取。
- 提交与查询使用同一密钥。

---

## 五、任务与错误

### 5.1 视频任务与下载（Video-Tasks）

**流程**

1. 提交
2. 保存任务 ID
3. 查询状态
4. 下载

**查询同一个任务**

```bash
TASK_ID="<创建响应中的 id>"
curl -fsS "$GATEWAY_BASE/v1/videos/$TASK_ID" \
  -H "Authorization: Bearer $GATEWAY_KEY"
```

**轮询建议**

- 建议每 5–10 秒查询。
- 关闭本地连接或停止轮询不会取消已提交任务。
- 不要因一次查询失败就重新提交。

**状态对照**

| 入口 | 等待状态 | 成功状态 | 失败终态 |
|---|---|---|---|
| `/v1/videos` | `queued` / `in_progress` | `completed` | `failed` / `expired` |
| `/v1/videos/generations` | `pending` | `done` | `failed` / `expired` |
| Ark 任务入口 | `queued` / `running` | `succeeded` | `failed` |

**保存成片**

- 统一入口完成后读取 `video.url`。
- Ark 格式读取 `content.video_url`。
- 下载路径支持 HEAD 与 HTTP Range。
- 请使用实际返回的任务 ID，不要使用调用日志的请求 ID。

**读取产物事实**

| 字段 | 含义 |
|---|---|
| `video.url` / `video_url` | 成片地址；前者是任务自身的下载端点，后者是可直接取用的资产地址 |
| `duration_seconds` | 成片实际时长，整数秒 |
| `seconds` | 请求时给定的秒数（字符串） |
| `resolution` | 产物分辨率档位；短边恰为 480/720/1080/1440/2160 时分别为 480p/720p/1080p/1440p/4K |
| `size` | 产物尺寸，形如 `1280x720` |
| `progress` | 等待中为 0–100，完成恒为 100 |

**长时间等待**

- 在客户端保存任务 ID、提交时间与模型。
- 给轮询设置退避和本地等待上限。
- 停止本地等待后，稍后仍可用原任务 ID 查询。
- 错误终态应记录 `error` 并停止轮询。

---

### 5.2 错误处理与排查（Errors）

**错误响应格式**

```json
{
  "error": {
    "message": "model is not available",
    "type": "invalid_request_error",
    "code": "unsupported_model"
  }
}
```

以 HTTP 状态和 `error.code` 分支处理，不依赖完整英文 message。

生成任务也可能在 HTTP 200 的查询响应中返回失败状态；HTTP 请求成功不代表视频生成成功。

**常见状态与处理建议**

| HTTP | 处理建议 |
|---|---|
| 400 | 检查参数类型、素材角色及完整能力组合 |
| 401 | 检查密钥、请求头与有效状态 |
| 402 | 检查账户可用余额 |
| 404 | 检查模型、任务 ID 和访问归属 |
| 413 | 请求体过大，检查素材编码与服务限制 |
| 429 | 按提示退避，避免并发重复请求 |
| 5xx | 保存任务 ID；先查询已有任务，再决定是否重试 |

**请求体大小**

- 视频请求体超过服务限制时会返回 `413`。
- 网关返回的错误码为 `invalid_body`。
- 入口代理也可能独立返回 `413`。
- Base64 通常约为原始文件大小的 4/3，JSON 还有额外开销。
- 11 MB 图片编码后约 14.7 MB。
- 这不意味着每个模型都接受 Base64，请遵循对应接口的素材形状。

**提交问题时带上什么**

- 调用时间
- 公开模型 ID
- 请求 ID 或任务 ID
- HTTP 状态
- 错误码
- 已去掉密钥和私人素材的请求结构

不要粘贴 `Authorization` 请求头。

---

## 总结

change2pro 开发文档围绕统一网关：

```text
https://gateway.change2pro.com
```

展开，核心特点：

- **接入简单**：用控制台创建的密钥，通过 `GET /v1/models` 发现模型，即可调用图像、视频等能力。
- **接口多样**：支持 OpenAI 兼容格式（Chat Completions、Images）、Gemini 原生格式（`contents/parts`），以及 Seedance / Grok 等视频专用格式。
- **任务化管理视频生成**：视频采用“提交任务 → 轮询状态 → 下载成片”的异步模式，文档详细定义了各入口的状态机、产物字段和下载方式。
- **余额查询只读**：`GET /v1/usage` 可用于客户端展示额度，且不消耗额度。
- **错误处理规范**：按 HTTP 状态 + `error.code` 分支处理，生成任务需注意 HTTP 200 也可能返回失败状态。