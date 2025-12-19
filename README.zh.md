# XKCD Serverless API

一个基于 Cloudflare Workers 的 XKCD 漫画 Serverless API 服务，提供完整的 XKCD 漫画和 What If 文章数据接口，支持多语言翻译版本，并包含自动爬虫和推送通知功能。

## ✨ 功能特性

### 核心功能
- 📚 **XKCD 漫画 API** - 搜索、列表、点赞、排行、随机获取
- 📖 **What If 文章 API** - 完整的 What If 系列文章接口
- 🌍 **多语言支持** - 支持中文简体、繁体、法语、俄语、德语、西班牙语翻译版本
- 🤖 **自动爬虫** - 定时抓取最新漫画和文章
- 🔔 **推送通知** - 通过 FCM 推送新漫画通知（基于 AWS Lambda）
- ⚡ **高性能** - 基于 Cloudflare Workers 边缘计算，全球低延迟
- 💾 **数据持久化** - 使用 Cloudflare D1 数据库和 KV 存储

### API 端点

#### XKCD 漫画
- `GET /xkcd-list` - 获取漫画列表（支持分页）
- `GET /xkcd-suggest?q={query}` - 搜索漫画
- `GET /xkcd-top?sortby=thumb-up` - 获取热门漫画
- `GET /xkcd-random` - 获取随机漫画
- `POST /xkcd-thumb-up` - 点赞漫画

#### What If 文章
- `GET /what-if-list` - 获取文章列表（支持分页）
- `GET /what-if-suggest?q={query}` - 搜索文章
- `GET /what-if-top?sortby=thumb-up` - 获取热门文章
- `GET /what-if-random` - 获取随机文章
- `POST /what-if-thumb-up` - 点赞文章

#### 多语言漫画
- `GET /{comicId}/info.0.json` - 获取特定漫画的 JSON 数据
- `GET /{comicId}` - 显示特定漫画页面
- `GET /archive` - 显示本地化漫画存档

#### 系统
- `GET /ping` - 健康检查

## 🛠️ 技术栈

- **运行时**: Cloudflare Workers
- **语言**: TypeScript
- **数据库**: Cloudflare D1 (SQLite)
- **缓存**: Cloudflare KV
- **工作流**: Cloudflare Workflows
- **路由**: itty-router
- **测试**: Vitest
- **部署**: Wrangler CLI
- **推送服务**: AWS Lambda + Firebase Cloud Messaging

## 📁 项目结构

```
xkcd-serverless/
├── src/
│   ├── crawlers/          # 爬虫模块
│   │   ├── xkcd.ts        # XKCD 主站爬虫
│   │   ├── whatif.ts      # What If 爬虫
│   │   └── base.ts        # 基础爬虫类
│   ├── routes/            # API 路由
│   │   ├── xkcd.ts        # XKCD 路由
│   │   ├── whatif.ts      # What If 路由
│   │   ├── localized.ts   # 多语言路由
│   │   ├── admin.ts       # 管理路由
│   │   └── health.ts      # 健康检查
│   ├── workflows/         # Cloudflare Workflows
│   │   ├── base_localized_crawler.ts
│   │   ├── zh_cn_crawler.ts
│   │   ├── zh_tw_crawler.ts
│   │   ├── fr_crawler.ts
│   │   ├── de_crawler.ts
│   │   ├── es_crawler.ts
│   │   └── ru_crawler.ts
│   ├── strategies/        # 多语言解析策略
│   ├── utils/             # 工具函数
│   ├── database.ts        # 数据库操作
│   └── index.ts           # 入口文件
├── lambda/                # AWS Lambda FCM 推送服务
├── tests/                 # 测试文件
├── scripts/               # 工具脚本
├── public/                # 静态资源
└── schema.sql             # 数据库架构

```

## 🚀 快速开始

### 前置要求

- Node.js 18+ 
- npm 或 yarn
- Cloudflare 账户
- Wrangler CLI

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd xkcd-serverless

# 安装依赖
npm install

# 安装 Wrangler CLI（如果未安装）
npm install -g wrangler
```

### 配置

1. **登录 Cloudflare**

```bash
wrangler login
```

2. **配置环境变量**

编辑 `wrangler.toml` 或使用 `wrangler secret` 设置以下变量：

```bash
# 必需的环境变量
wrangler secret put LAMBDA_FCM_URL      # AWS Lambda Function URL
wrangler secret put LAMBDA_API_KEY      # Lambda API 密钥
wrangler secret put FCM_TEST_TOKEN      # FCM 测试设备令牌（可选）
```

3. **初始化数据库**

```bash
# 创建 D1 数据库（如果尚未创建）
wrangler d1 create xkcd

# 执行数据库迁移
wrangler d1 execute xkcd --file=./schema.sql
```

### 开发

```bash
# 启动开发服务器
npm run dev

# 类型检查
npm run type-check

# 运行测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration
```

### 构建

```bash
# 构建 TypeScript
npm run build
```

### 部署

```bash
# 部署到 Cloudflare Workers
npm run deploy

# 或使用 wrangler
wrangler deploy
```

## 🔧 环境配置

### Cloudflare Workers 环境变量

在 `wrangler.toml` 中配置：

```toml
[vars]
API_HOSTNAME = "{{ your hostname }}"
LOCALIZED_HOSTNAME = "{{ your hostname }}"
FCM_ENABLED = "true"
FCM_TEST_MODE = "true"
```

### 使用 Secret（敏感信息）

```bash
wrangler secret put LAMBDA_FCM_URL
wrangler secret put LAMBDA_API_KEY
wrangler secret put FCM_TEST_TOKEN
```

### 数据库配置

在 `wrangler.toml` 中配置 D1 数据库绑定：

```toml
[[d1_databases]]
binding = "DB"
database_name = "xkcd"
database_id = "your-database-id"
```

### KV 配置

```toml
[[kv_namespaces]]
binding = "CRAWLER_STATE"
id = "your-kv-namespace-id"
```

## 📖 API 文档

### 请求示例

```bash
# 获取漫画列表
curl "https://{{ your hostname }}/xkcd/xkcd-list?start=0&size=10"

# 搜索漫画
curl "https://{{ your hostname }}/xkcd/xkcd-suggest?q=programming"

# 获取热门漫画
curl "https://{{ your hostname }}/xkcd/xkcd-top?sortby=thumb-up&size=10"

# 点赞漫画
curl -X POST "https://{{ your hostname }}/xkcd/xkcd-thumb-up" \
  -H "Content-Type: application/json" \
  -d '{"id": 1234}'
```

### 响应格式

```json
{
  "num": 1234,
  "title": "Comic Title",
  "alt": "Alt text",
  "img": "https://imgs.xkcd.com/comics/...",
  "transcript": "...",
  "year": 2024,
  "month": 1,
  "day": 1,
  "width": 800,
  "height": 600
}
```

## 🔄 爬虫配置

项目使用 Cloudflare Cron Triggers 定时执行爬虫任务：

- **每分钟**: XKCD 主站爬虫（检查新漫画）
- **每 15 分钟**: 中文简体爬虫
- **每天 00:15 UTC**: What If 爬虫 + 所有多语言爬虫

配置在 `wrangler.toml` 中：

```toml
[triggers]
crons = [
  "*/1 * * * *",    # 每分钟
  "15 0 * * *"      # 每天 00:15 UTC
]
```

## 🔔 FCM 推送通知

项目使用 AWS Lambda 处理 FCM 推送通知。详细配置请参考 [lambda/README.md](./lambda/README.md)。

### 快速设置

1. 部署 Lambda 函数（参考 `lambda/README.md`）
2. 获取 Lambda Function URL 和 API Key
3. 在 Cloudflare Workers 中配置环境变量

```bash
wrangler secret put LAMBDA_FCM_URL
wrangler secret put LAMBDA_API_KEY
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行测试（监听模式）
npm run test -- --watch
```

## 📝 开发指南

### 添加新的多语言支持

1. 在 `src/strategies/` 中创建新的解析策略
2. 在 `src/workflows/` 中创建新的爬虫工作流
3. 在 `wrangler.toml` 中配置 Workflow 绑定
4. 在 `src/index.ts` 中注册 Workflow
5. 在 `schema.sql` 中添加对应的数据表

### 代码规范

- 使用 TypeScript 编写所有代码
- 遵循现有的代码风格
- 为新功能添加测试
- 使用有意义的变量和函数名

## 🤝 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

## 🙏 致谢

- [XKCD](https://xkcd.com/) - 漫画来源
- [xkcd.in](https://xkcd.in/) - 多语言翻译来源
- Cloudflare - 提供 Serverless 平台

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 Issue
- 开启 Pull Request

---

**注意**: 本项目仅用于学习和研究目的。请遵守 XKCD 网站的使用条款和 robots.txt 规则。

